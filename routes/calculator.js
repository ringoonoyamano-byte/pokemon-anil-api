/**
 * routes/calculator.js
 * Calculadora de dano Pokémon (fórmula Gen 5+) com histórico salvo no banco.
 *
 * Fórmula: ((2*Nível/5 + 2) × Poder × (Atk/Def)) / 50 + 2) × Modificadores
 */

const express = require("express");
const router  = express.Router();
const axios   = require("axios");
const { getDb } = require("../database/db");

// ─── Tabela de efetividade de tipos (Gen 6+) ─────────────────────────────────
const TYPE_CHART = {
  normal:   { rock:0.5, ghost:0, steel:0.5 },
  fire:     { fire:0.5, water:0.5, grass:2, ice:2, bug:2, rock:0.5, dragon:0.5, steel:2 },
  water:    { fire:2, water:0.5, grass:0.5, ground:2, rock:2, dragon:0.5 },
  electric: { water:2, electric:0.5, grass:0.5, ground:0, flying:2, dragon:0.5 },
  grass:    { fire:0.5, water:2, grass:0.5, poison:0.5, ground:2, flying:0.5, bug:0.5, rock:2, dragon:0.5, steel:0.5 },
  ice:      { fire:0.5, water:0.5, grass:2, ice:0.5, ground:2, flying:2, dragon:2, steel:0.5 },
  fighting: { normal:2, ice:2, poison:0.5, flying:0.5, psychic:0.5, bug:0.5, rock:2, ghost:0, dark:2, steel:2, fairy:0.5 },
  poison:   { grass:2, poison:0.5, ground:0.5, rock:0.5, ghost:0.5, steel:0, fairy:2 },
  ground:   { fire:2, electric:2, grass:0.5, poison:2, flying:0, bug:0.5, rock:2, steel:2 },
  flying:   { electric:0.5, grass:2, fighting:2, bug:2, rock:0.5, steel:0.5 },
  psychic:  { fighting:2, poison:2, psychic:0.5, dark:0, steel:0.5 },
  bug:      { fire:0.5, grass:2, fighting:0.5, poison:0.5, flying:0.5, psychic:2, ghost:0.5, dark:2, steel:0.5, fairy:0.5 },
  rock:     { fire:2, ice:2, fighting:0.5, ground:0.5, flying:2, bug:2, steel:0.5 },
  ghost:    { normal:0, psychic:2, ghost:2, dark:0.5 },
  dragon:   { dragon:2, steel:0.5, fairy:0 },
  dark:     { fighting:0.5, psychic:2, ghost:2, dark:0.5, fairy:0.5 },
  steel:    { fire:0.5, water:0.5, electric:0.5, ice:2, rock:2, steel:0.5, fairy:2 },
  fairy:    { fire:0.5, fighting:2, poison:0.5, dragon:2, dark:2, steel:0.5 },
};

function getEffectiveness(moveType, defTypes) {
  let mult = 1;
  for (const defType of defTypes) {
    const matchup = TYPE_CHART[moveType];
    if (matchup && matchup[defType] !== undefined) mult *= matchup[defType];
  }
  return mult;
}

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
  const base = Math.floor(Math.floor((Math.floor(2 * nivel / 5 + 2) * poder * Math.floor(atk / def)) / 50) + 2);

  // Passo 2: multiplicadores fixos
  const stabMult   = stab    ? 1.5  : 1;
  const critMult   = critico ? 1.5  : 1;
  const burnMult   = burn    ? 0.5  : 1;
  const fixed = Math.floor(Math.floor(Math.floor(base * stabMult) * effectiveness) * critMult * burnMult * weather);

  // Passo 3: variação aleatória (0.85 – 1.00)
  const min = Math.floor(fixed * 0.85);
  const max = fixed;
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
  } = req.body;

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
    const [atkRes, defRes, moveRes] = await Promise.all([
      axios.get(`https://pokeapi.co/api/v2/pokemon/${String(atacante).toLowerCase()}`),
      axios.get(`https://pokeapi.co/api/v2/pokemon/${String(defensor).toLowerCase()}`),
      axios.get(`https://pokeapi.co/api/v2/move/${String(move).toLowerCase()}`),
    ]);

    const atkData  = atkRes.data;
    const defData  = defRes.data;
    const moveData = moveRes.data;

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
      const k = s.stat.name.replace("special-attack","spa").replace("special-defense","spd");
      statsAtk[k] = s.base_stat;
    });
    defData.stats.forEach((s) => {
      const k = s.stat.name.replace("special-attack","spa").replace("special-defense","spd");
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
      stab, effectiveness, critico, burn, weather,
    });

    // HP do defensor para % de dano
    const hpDef = Math.floor(((2 * (statsDef.hp || 45) + ivs_def + Math.floor(evs_def / 4)) * nivel) / 100) + nivel + 10;

    const resultado = {
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
    if (err.response?.status === 404) {
      return res.status(404).json({ erro: "Pokémon ou move não encontrado na PokeAPI.", detalhe: err.config?.url });
    }
    res.status(500).json({ erro: "Erro no cálculo.", detalhe: err.message });
  }
});

// ─── GET /calculator/history ──────────────────────────────────────────────────
router.get("/history", (req, res) => {
  const db = getDb();
  const { limit = 20, atacante, defensor } = req.query;

  let sql = "SELECT id, atacante, defensor, move, poder, tipo_move, stab, efetividade, critico, dano_min, dano_max, dano_medio, porcentagem_min, porcentagem_max, criado_em FROM damage_log WHERE 1=1";
  const params = [];

  if (atacante) { sql += " AND atacante = ?"; params.push(atacante); }
  if (defensor) { sql += " AND defensor = ?"; params.push(defensor); }
  sql += " ORDER BY criado_em DESC LIMIT ?";
  params.push(Number(limit));

  const rows = db.prepare(sql).all(...params).map((r) => ({
    ...r,
    stab: !!r.stab, critico: !!r.critico,
    criado_em: new Date(r.criado_em * 1000).toISOString(),
  }));

  res.json({ total: rows.length, historico: rows });
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
