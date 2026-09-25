/**
 * routes/teams.js
 * Gerenciamento de times Pokémon salvos no banco SQLite.
 * Suporta criar, editar, clonar e deletar times com até 6 membros.
 */

const express = require("express");
const router  = express.Router();
const axios   = require("axios");
const { getDb } = require("../database/db");

const MODOS   = ["classic", "complete", "radical", "randomizer", "nuzlocke", "nuzlocke_assistido", "monotype"];
const NATUREZAS = [
  "hardy","lonely","brave","adamant","naughty",
  "bold","docile","relaxed","impish","lax",
  "timid","hasty","serious","jolly","naive",
  "modest","mild","quiet","bashful","rash",
  "calm","gentle","sassy","careful","quirky"
];

// Bônus de natureza sobre stats
const NATURE_MODIFIERS = {
  lonely:  { up: "atk", down: "def"  },
  brave:   { up: "atk", down: "spe"  },
  adamant: { up: "atk", down: "spa"  },
  naughty: { up: "atk", down: "spd"  },
  bold:    { up: "def", down: "atk"  },
  relaxed: { up: "def", down: "spe"  },
  impish:  { up: "def", down: "spa"  },
  lax:     { up: "def", down: "spd"  },
  timid:   { up: "spe", down: "atk"  },
  hasty:   { up: "spe", down: "def"  },
  jolly:   { up: "spe", down: "spa"  },
  naive:   { up: "spe", down: "spd"  },
  modest:  { up: "spa", down: "atk"  },
  mild:    { up: "spa", down: "def"  },
  quiet:   { up: "spa", down: "spe"  },
  rash:    { up: "spa", down: "spd"  },
  calm:    { up: "spd", down: "atk"  },
  gentle:  { up: "spd", down: "def"  },
  sassy:   { up: "spd", down: "spe"  },
  careful: { up: "spd", down: "spa"  },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function calcStat(base, iv, ev, nivel, natureza, statKey) {
  const evBonus = Math.floor(ev / 4);
  let stat;
  if (statKey === "hp") {
    stat = Math.floor(((2 * base + iv + evBonus) * nivel) / 100) + nivel + 10;
  } else {
    stat = Math.floor(((2 * base + iv + evBonus) * nivel) / 100) + 5;
    const nat = NATURE_MODIFIERS[natureza];
    if (nat?.up   === statKey) stat = Math.floor(stat * 1.1);
    if (nat?.down === statKey) stat = Math.floor(stat * 0.9);
  }
  return stat;
}

function formatTeam(team, members) {
  return {
    ...team,
    criado_em:     new Date(team.criado_em * 1000).toISOString(),
    atualizado_em: new Date(team.atualizado_em * 1000).toISOString(),
    membros: members.map((m) => ({
      ...m,
      moves: JSON.parse(m.moves || "[]"),
      evs:   JSON.parse(m.evs   || "{}"),
      ivs:   JSON.parse(m.ivs   || "{}"),
    })),
  };
}

// ─── GET /teams ──────────────────────────────────────────────────────────────
router.get("/", (req, res) => {
  const db   = getDb();
  const { modo } = req.query;

  let sql    = "SELECT * FROM teams";
  const params = [];
  if (modo) { sql += " WHERE modo_anil = ?"; params.push(modo); }
  sql += " ORDER BY atualizado_em DESC";

  const teams = db.prepare(sql).all(...params).map((t) => ({
    ...t,
    criado_em:     new Date(t.criado_em * 1000).toISOString(),
    atualizado_em: new Date(t.atualizado_em * 1000).toISOString(),
    total_membros: db.prepare("SELECT COUNT(*) AS n FROM team_members WHERE team_id = ?").get(t.id).n,
  }));

  res.json({ total: teams.length, times: teams });
});

// ─── GET /teams/:id ──────────────────────────────────────────────────────────
router.get("/:id", (req, res) => {
  const db     = getDb();
  const team   = db.prepare("SELECT * FROM teams WHERE id = ?").get(req.params.id);
  if (!team) return res.status(404).json({ erro: "Time não encontrado." });

  const members = db.prepare("SELECT * FROM team_members WHERE team_id = ? ORDER BY slot").all(team.id);
  res.json(formatTeam(team, members));
});

// ─── GET /teams/:id/stats ─────────────────────────────────────────────────────
// Calcula os stats reais de todos os membros do time
router.get("/:id/stats", async (req, res) => {
  const db      = getDb();
  const team    = db.prepare("SELECT * FROM teams WHERE id = ?").get(req.params.id);
  if (!team) return res.status(404).json({ erro: "Time não encontrado." });

  const members = db.prepare("SELECT * FROM team_members WHERE team_id = ? ORDER BY slot").all(team.id);

  const statsPromises = members.map(async (m) => {
    try {
      const { data } = await axios.get(`https://pokeapi.co/api/v2/pokemon/${m.pokemon_id}`);
      const baseStats = {};
      data.stats.forEach((s) => { baseStats[s.stat.name.replace("special-attack","spa").replace("special-defense","spd")] = s.base_stat; });

      const ivs  = JSON.parse(m.ivs  || "{}");
      const evs  = JSON.parse(m.evs  || "{}");
      const nat  = m.natureza || "hardy";
      const lvl  = m.nivel   || 50;

      const statKeys = ["hp","atk","def","spa","spd","spe"];
      const statsReais = {};
      for (const key of statKeys) {
        statsReais[key] = calcStat(baseStats[key] || 0, ivs[key] || 31, evs[key] || 0, lvl, nat, key);
      }

      return {
        slot:      m.slot,
        pokemon:   m.pokemon_nome,
        apelido:   m.apelido,
        nivel:     lvl,
        natureza:  nat,
        natureza_efeito: NATURE_MODIFIERS[nat] || { up: null, down: null },
        stats_base: baseStats,
        stats_reais: statsReais,
        evs, ivs,
        item:  m.item,
        moves: JSON.parse(m.moves || "[]"),
      };
    } catch {
      return { slot: m.slot, pokemon: m.pokemon_nome, erro: "Falha ao buscar stats na PokeAPI." };
    }
  });

  const stats = await Promise.all(statsPromises);
  res.json({ time: team.nome, modo: team.modo_anil, membros: stats });
});

// ─── POST /teams ──────────────────────────────────────────────────────────────
router.post("/", (req, res) => {
  const { nome, modo_anil = "complete", descricao } = req.body;
  if (!nome) return res.status(400).json({ erro: "Campo 'nome' é obrigatório." });

  if (modo_anil && !MODOS.includes(modo_anil)) {
    return res.status(400).json({ erro: `Modo inválido. Válidos: ${MODOS.join(", ")}` });
  }

  const db     = getDb();
  const result = db.prepare(
    "INSERT INTO teams (nome, modo_anil, descricao) VALUES (?, ?, ?)"
  ).run(nome, modo_anil, descricao || null);

  const team = db.prepare("SELECT * FROM teams WHERE id = ?").get(result.lastInsertRowid);
  res.status(201).json({
    mensagem: "Time criado!",
    time: { ...team, criado_em: new Date(team.criado_em * 1000).toISOString(), membros: [] },
  });
});

// ─── PUT /teams/:id ───────────────────────────────────────────────────────────
router.put("/:id", (req, res) => {
  const db   = getDb();
  const team = db.prepare("SELECT * FROM teams WHERE id = ?").get(req.params.id);
  if (!team) return res.status(404).json({ erro: "Time não encontrado." });

  const { nome, modo_anil, descricao } = req.body;

  db.prepare(`
    UPDATE teams SET
      nome          = COALESCE(?, nome),
      modo_anil     = COALESCE(?, modo_anil),
      descricao     = COALESCE(?, descricao),
      atualizado_em = unixepoch()
    WHERE id = ?
  `).run(nome || null, modo_anil || null, descricao !== undefined ? descricao : null, req.params.id);

  const members = db.prepare("SELECT * FROM team_members WHERE team_id = ? ORDER BY slot").all(req.params.id);
  const updated = db.prepare("SELECT * FROM teams WHERE id = ?").get(req.params.id);
  res.json({ mensagem: "Time atualizado.", time: formatTeam(updated, members) });
});

// ─── POST /teams/:id/members ──────────────────────────────────────────────────
// Adicionar/substituir um Pokémon no time
router.post("/:id/members", async (req, res) => {
  const db   = getDb();
  const team = db.prepare("SELECT * FROM teams WHERE id = ?").get(req.params.id);
  if (!team) return res.status(404).json({ erro: "Time não encontrado." });

  const {
    slot, pokemon, apelido, nivel = 50,
    natureza = "hardy", habilidade, item,
    moves = [], evs = {}, ivs = {},
  } = req.body;

  if (!slot || !pokemon) {
    return res.status(400).json({ erro: "Campos obrigatórios: slot (1–6), pokemon (nome ou id)." });
  }
  if (slot < 1 || slot > 6) return res.status(400).json({ erro: "Slot deve ser entre 1 e 6." });
  if (!NATUREZAS.includes(natureza.toLowerCase())) {
    return res.status(400).json({ erro: `Natureza inválida. Use uma das ${NATUREZAS.length} naturezas válidas.` });
  }

  // Valida Pokémon na PokeAPI
  let pokemonId, pokemonNome;
  try {
    const { data } = await axios.get(`https://pokeapi.co/api/v2/pokemon/${String(pokemon).toLowerCase()}`);
    pokemonId   = data.id;
    pokemonNome = data.name;
  } catch {
    return res.status(404).json({ erro: `Pokémon '${pokemon}' não encontrado na PokeAPI.` });
  }

  const evsJson  = JSON.stringify({ hp:0, atk:0, def:0, spa:0, spd:0, spe:0, ...evs });
  const ivsJson  = JSON.stringify({ hp:31, atk:31, def:31, spa:31, spd:31, spe:31, ...ivs });
  const movesJson = JSON.stringify(moves.slice(0, 4));

  db.prepare(`
    INSERT INTO team_members (team_id, slot, pokemon_id, pokemon_nome, apelido, nivel, natureza, habilidade, item, moves, evs, ivs)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(team_id, slot) DO UPDATE SET
      pokemon_id   = excluded.pokemon_id,
      pokemon_nome = excluded.pokemon_nome,
      apelido      = excluded.apelido,
      nivel        = excluded.nivel,
      natureza     = excluded.natureza,
      habilidade   = excluded.habilidade,
      item         = excluded.item,
      moves        = excluded.moves,
      evs          = excluded.evs,
      ivs          = excluded.ivs
  `).run(team.id, slot, pokemonId, pokemonNome, apelido || null, nivel, natureza, habilidade || null, item || null, movesJson, evsJson, ivsJson);

  db.prepare("UPDATE teams SET atualizado_em = unixepoch() WHERE id = ?").run(team.id);

  const members = db.prepare("SELECT * FROM team_members WHERE team_id = ? ORDER BY slot").all(team.id);
  const updated = db.prepare("SELECT * FROM teams WHERE id = ?").get(team.id);
  res.status(201).json({ mensagem: `Slot ${slot} atualizado com ${pokemonNome}.`, time: formatTeam(updated, members) });
});

// ─── DELETE /teams/:id/members/:slot ─────────────────────────────────────────
router.delete("/:id/members/:slot", (req, res) => {
  const db = getDb();
  const { changes } = db.prepare(
    "DELETE FROM team_members WHERE team_id = ? AND slot = ?"
  ).run(req.params.id, req.params.slot);

  if (!changes) return res.status(404).json({ erro: "Membro/slot não encontrado." });
  db.prepare("UPDATE teams SET atualizado_em = unixepoch() WHERE id = ?").run(req.params.id);
  res.json({ mensagem: `Slot ${req.params.slot} removido.` });
});

// ─── POST /teams/:id/clone ────────────────────────────────────────────────────
router.post("/:id/clone", (req, res) => {
  const db   = getDb();
  const team = db.prepare("SELECT * FROM teams WHERE id = ?").get(req.params.id);
  if (!team) return res.status(404).json({ erro: "Time não encontrado." });

  const novoNome = req.body.nome || `${team.nome} (cópia)`;
  const res2     = db.prepare("INSERT INTO teams (nome, modo_anil, descricao) VALUES (?, ?, ?)").run(novoNome, team.modo_anil, team.descricao);

  const members = db.prepare("SELECT * FROM team_members WHERE team_id = ?").all(team.id);
  const insertMember = db.prepare(`
    INSERT INTO team_members (team_id, slot, pokemon_id, pokemon_nome, apelido, nivel, natureza, habilidade, item, moves, evs, ivs)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertAll = db.transaction((mems, newId) => {
    for (const m of mems) insertMember.run(newId, m.slot, m.pokemon_id, m.pokemon_nome, m.apelido, m.nivel, m.natureza, m.habilidade, m.item, m.moves, m.evs, m.ivs);
  });
  insertAll(members, res2.lastInsertRowid);

  const cloned      = db.prepare("SELECT * FROM teams WHERE id = ?").get(res2.lastInsertRowid);
  const newMembers  = db.prepare("SELECT * FROM team_members WHERE team_id = ? ORDER BY slot").all(cloned.id);
  res.status(201).json({ mensagem: "Time clonado!", time: formatTeam(cloned, newMembers) });
});

// ─── DELETE /teams/:id ───────────────────────────────────────────────────────
router.delete("/:id", (req, res) => {
  const db = getDb();
  const { changes } = db.prepare("DELETE FROM teams WHERE id = ?").run(req.params.id);
  if (!changes) return res.status(404).json({ erro: "Time não encontrado." });
  res.json({ mensagem: `Time #${req.params.id} e seus membros foram removidos.` });
});

module.exports = router;
