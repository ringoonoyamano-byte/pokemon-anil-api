/**
 * routes/calculator.js
 * Calculadora de dano Pokémon (fórmula Gen 5+) com histórico salvo no banco.
 *
 * Fórmula: ((2*Nível/5 + 2) × Poder × (Atk/Def)) / 50 + 2) × Modificadores
 */

const express = require("express");
const router  = express.Router();
const { pokeFetch } = require('../middleware/cache');
const upstreamError = require('../middleware/upstream-error');
const { getDb } = require("../database/db");
const { NATUREZAS } = require('../lib/stats');
router.use(require('../middleware/validation').pagination);

// ─── Tabela de efetividade de tipos (Gen 6+) ─────────────────────────────────
const { getEffectiveness } = require('../lib/types');

function effectivenessLabel(mult) {
  if (mult === 0)    return "Não tem efeito (0×)";
  if (mult === 0.25) return "Não muito efetivo (0.25×)";
  if (mult === 0.5)  return "Não muito efetivo (0.5×)";
  if (mult === 1)    return "Dano normal (1×)";
  if (mult === 2)    return "Muito efetivo! (2×)";
  if (mult === 4)    return "Extremamente efetivo!! (4×)";
  return `${mult}×`;
}

// ─── Fórmula de dano Gen 5+ ───────────────────────────────────────────────────
function calcDamage({ nivel, poder, atk, def, stab, effectiveness, critico, burn, weather = 1 }) {
  if (!poder) return null;

  // Passo 1: base
  const base = Math.floor(Math.floor(Math.floor(2 * nivel / 5 + 2) * poder * atk / def) / 50) + 2;

  // Passo 2: multiplicadores fixos
  const stabMult   = stab    ? 1.5  : 1;
  const critMult   = critico ? 1.5  : 1;
  const burnMult   = burn    ? 0.5  : 1;
  // Modelo simplificado: clima e crítico precedem a variação, STAB e tipos a seguem.
  const fixed = Math.floor(Math.floor(base * weather) * critMult);
  const roll = (random) => effectiveness === 0 ? 0 : Math.max(1,
    Math.floor(Math.floor(Math.floor(Math.floor(fixed * random / 100) * stabMult) * effectiveness) * burnMult));
  const min = roll(85);
  const max = roll(100);
  const med = Math.round((min + max) / 2);

  return { min, max, med };
}

// ─── POST /calculator ─────────────────────────────────────────────────────────
router.post("/", async (req, res) => {
  const {
    atacante,          // nome/id do Pokémon atacante
    defensor,          // nome/id do Pokémon defensor
    move,              // nome do move
    nivel      = 50,
    critico    = false,
    burn       = false,
    weather    = 1,    // 1=normal, 1.5=chuva/sol favorável, 0.5=desfavorável
    // Override manual de stats (opcional)
    atk_override, def_override,
    natureza_atk = "hardy", natureza_def = "hardy",
    evs_atk = 0, evs_def = 0, ivs_atk = 31, ivs_def = 31,
  } = req.body || {};

  const integerIn = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;
  if (!integerIn(nivel, 1, 100) || !integerIn(evs_atk, 0, 252) || !integerIn(evs_def, 0, 252)
      || !integerIn(ivs_atk, 0, 31) || !integerIn(ivs_def, 0, 31)
      || ![0.5, 1, 1.5].includes(weather) || typeof burn !== 'boolean' || typeof critico !== 'boolean'
      || [atk_override, def_override].some(value => value !== undefined && (!Number.isFinite(value) || value <= 0))
      || typeof natureza_atk !== 'string' || typeof natureza_def !== 'string'
      || !NATUREZAS.includes(natureza_atk.toLowerCase()) || !NATUREZAS.includes(natureza_def.toLowerCase())) {
    return res.status(400).json({ erro: 'Parâmetros de cálculo inválidos. Confira nível, IVs, EVs e modificadores.' });
  }

  if (!atacante || !defensor || !move) {
    return res.status(400).json({
      erro: "Campos obrigatórios: atacante, defensor, move.",
      exemplo: {
        atacante: "charizard",
        defensor: "blastoise",
        move: "flamethrower",
        nivel: 50,
        critico: false,
      },
    });
  }

  try {
    // Busca os 3 em paralelo na PokeAPI
    const [atkData, defData, moveData] = await Promise.all([
      pokeFetch(`pokemon/${String(atacante).toLowerCase()}`),
      pokeFetch(`pokemon/${String(defensor).toLowerCase()}`),
      pokeFetch(`move/${String(move).toLowerCase()}`),
    ]);

    // Tipos
    const atkTypes  = atkData.types.map((t) => t.type.name);
    const defTypes  = defData.types.map((t) => t.type.name);
    const moveType  = moveData.type.name;
    const moveCat   = moveData.damage_class.name; // physical | special | status

    if (moveCat === "status") {
      return res.json({
        aviso: `'${moveData.name}' é um move de Status — não causa dano direto.`,
        move: moveData.name, tipo: moveType, categoria: moveCat,
      });
    }

    // Stats base
    const statsAtk = {};
    const statsDef = {};
    atkData.stats.forEach((s) => {
      const k = ({ attack: 'atk', defense: 'def', 'special-attack': 'spa', 'special-defense': 'spd', speed: 'spe' })[s.stat.name] || s.stat.name;
      statsAtk[k] = s.base_stat;
    });
    defData.stats.forEach((s) => {
      const k = ({ attack: 'atk', defense: 'def', 'special-attack': 'spa', 'special-defense': 'spd', speed: 'spe' })[s.stat.name] || s.stat.name;
      statsDef[k] = s.base_stat;
    });

    // Stat de ataque e defesa conforme categoria do move
    const isPhysical = moveCat === "physical";
    const atkStatKey = isPhysical ? "atk" : "spa";
    const defStatKey = isPhysical ? "def" : "spd";

    // Calcula stat real (fórmula de stat)
    function statReal(base, iv, ev, lvl, nat, key) {
      const evBonus = Math.floor(ev / 4);
      let stat = Math.floor(((2 * base + iv + evBonus) * lvl) / 100) + 5;
      const natMap = {
        lonely:{up:"atk",down:"def"}, brave:{up:"atk",down:"spe"}, adamant:{up:"atk",down:"spa"}, naughty:{up:"atk",down:"spd"},
        bold:{up:"def",down:"atk"}, relaxed:{up:"def",down:"spe"}, impish:{up:"def",down:"spa"}, lax:{up:"def",down:"spd"},
        timid:{up:"spe",down:"atk"}, hasty:{up:"spe",down:"def"}, jolly:{up:"spe",down:"spa"}, naive:{up:"spe",down:"spd"},
        modest:{up:"spa",down:"atk"}, mild:{up:"spa",down:"def"}, quiet:{up:"spa",down:"spe"}, rash:{up:"spa",down:"spd"},
        calm:{up:"spd",down:"atk"}, gentle:{up:"spd",down:"def"}, sassy:{up:"spd",down:"spe"}, careful:{up:"spd",down:"spa"},
      };
      const n = natMap[nat?.toLowerCase()];
      if (n?.up   === key) stat = Math.floor(stat * 1.1);
      if (n?.down === key) stat = Math.floor(stat * 0.9);
      return stat;
    }

    const atkStatVal = atk_override ?? statReal(statsAtk[atkStatKey], ivs_atk, evs_atk, nivel, natureza_atk, atkStatKey);
    const defStatVal = def_override ?? statReal(statsDef[defStatKey], ivs_def, evs_def, nivel, natureza_def, defStatKey);

    // Efetividade
    const effectiveness = getEffectiveness(moveType, defTypes);
    const stab = atkTypes.includes(moveType);

    // Calcula dano
    const dano = calcDamage({
      nivel, poder: moveData.power, atk: atkStatVal, def: defStatVal,
      stab, effectiveness, critico, burn: isPhysical && burn, weather,
    });

    // HP do defensor para % de dano
    const hpDef = Math.floor(((2 * (statsDef.hp || 45) + ivs_def + Math.floor(evs_def / 4)) * nivel) / 100) + nivel + 10;

    const resultado = {
      fonte: require('../lib/game-data').source,
      dataset_id: require('../lib/game-data').datasetId,
      modelo: 'Estimativa simplificada com stats, golpes e tipos do jogo; não inclui habilidades, itens ou todos os efeitos de scripts.',
      atacante: { nome: atkData.name, id: atkData.id, tipos: atkTypes },
      defensor: { nome: defData.name, id: defData.id, tipos: defTypes, hp_estimado: hpDef },
      move: {
        nome:      moveData.name,
        tipo:      moveType,
        categoria: moveCat,
        poder:     moveData.power,
        precisao:  moveData.accuracy,
        pp:        moveData.pp,
      },
      calculo: {
        nivel,
        stat_atk: { chave: atkStatKey, valor: atkStatVal },
        stat_def: { chave: defStatKey, valor: defStatVal },
        stab,
        efetividade: { multiplicador: effectiveness, descricao: effectivenessLabel(effectiveness) },
        critico,
        burn: isPhysical ? burn : false,
        weather,
      },
      dano: dano
        ? {
            minimo: dano.min,
            maximo: dano.max,
            medio:  dano.med,
            porcentagem_hp: {
              minima: `${((dano.min / hpDef) * 100).toFixed(1)}%`,
              maxima: `${((dano.max / hpDef) * 100).toFixed(1)}%`,
            },
            golpes_para_ko: {
              minimo: dano.max > 0 ? Math.ceil(hpDef / dano.max) : "∞",
              maximo: dano.min > 0 ? Math.ceil(hpDef / dano.min) : "∞",
            },
          }
        : null,
    };

    // Salva no banco
    if (dano) {
      const db = getDb();
      db.prepare(`
        INSERT INTO damage_log
          (atacante, defensor, move, poder, tipo_move, stab, efetividade, critico,
           dano_min, dano_max, dano_medio, porcentagem_min, porcentagem_max, resultado)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      `).run(
        atkData.name, defData.name, moveData.name,
        moveData.power, moveType, stab ? 1 : 0,
        effectiveness, critico ? 1 : 0,
        dano.min, dano.max, dano.med,
        (dano.min / hpDef) * 100, (dano.max / hpDef) * 100,
        JSON.stringify(resultado),
      );
    }

    res.json(resultado);
  } catch (err) {
    upstreamError(res, err, "Pokémon ou move não encontrado na PokeAPI.");
  }
});

// ─── GET /calculator/history ──────────────────────────────────────────────────
router.get("/history", (req, res) => {
  const db = getDb();
  const { limit = 20, offset = 0, atacante, defensor } = req.query;
  if ([atacante, defensor].some(value => value !== undefined && typeof value !== 'string')) return res.status(400).json({ erro: 'Filtros devem ser texto.' });

  let sql = "SELECT id, atacante, defensor, move, poder, tipo_move, stab, efetividade, critico, dano_min, dano_max, dano_medio, porcentagem_min, porcentagem_max, criado_em FROM damage_log WHERE 1=1";
  const params = [];

  if (atacante) { sql += " AND atacante = ?"; params.push(atacante); }
  if (defensor) { sql += " AND defensor = ?"; params.push(defensor); }
  sql += " ORDER BY criado_em DESC, id DESC LIMIT ? OFFSET ?";
  params.push(Number(limit), Number(offset));

  const rows = db.prepare(sql).all(...params).map((r) => ({
    ...r,
    stab: !!r.stab, critico: !!r.critico,
    criado_em: new Date(r.criado_em * 1000).toISOString(),
  }));

  res.json({ total: rows.length, limit: Number(limit), offset: Number(offset), historico: rows });
});

// ─── GET /calculator/history/:id ─────────────────────────────────────────────
router.get("/history/:id", (req, res) => {
  const db  = getDb();
  const row = db.prepare("SELECT * FROM damage_log WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ erro: "Registro não encontrado." });

  res.json({
    ...row,
    resultado: JSON.parse(row.resultado),
    criado_em: new Date(row.criado_em * 1000).toISOString(),
  });
});

// ─── DELETE /calculator/history ───────────────────────────────────────────────
router.delete("/history", (req, res) => {
  const db = getDb();
  const { changes } = db.prepare("DELETE FROM damage_log").run();
  res.json({ mensagem: `${changes} registros removidos do histórico.` });
});

module.exports = router;
