/**
 * routes/teams.js
 * Gerenciamento de times Pokémon salvos no banco SQLite.
 * Suporta criar, editar, clonar e deletar times com até 6 membros.
 */

const express = require("express");
const router  = express.Router();
const upstreamError = require('../middleware/upstream-error');
const { getDb } = require("../database/db");
const { integerIn, text, statBlock, pagination } = require('../middleware/validation');
const { pokeFetch } = require('../middleware/cache');

const MODOS   = ["classic", "complete", "radical", "randomizer", "nuzlocke", "nuzlocke_assistido", "monotype"];
const { NATUREZAS, NATURE_MODIFIERS, calcStat } = require('../lib/stats');

router.use(pagination);
router.use((req, res, next) => {
  if (!['POST', 'PUT'].includes(req.method)) return next();
  const b = req.body;
  if (!b || typeof b !== 'object' || Array.isArray(b)) return res.status(400).json({ erro: 'Envie um objeto JSON.' });
  if ((b.nome !== undefined && !text(b.nome)) || (b.descricao !== undefined && b.descricao !== null && typeof b.descricao !== 'string')
      || (b.modo_anil !== undefined && !MODOS.includes(b.modo_anil))) {
    return res.status(400).json({ erro: 'Nome, descrição ou modo inválido.' });
  }
  if (req.path.endsWith('/members')) {
    if (!integerIn(b.slot, 1, 6) || (b.nivel !== undefined && !integerIn(b.nivel, 1, 100))
        || (b.natureza !== undefined && (typeof b.natureza !== 'string' || !NATUREZAS.includes(b.natureza.toLowerCase())))
        || (b.evs !== undefined && !statBlock(b.evs, 252, 510))
        || (b.ivs !== undefined && !statBlock(b.ivs, 31))
        || (b.moves !== undefined && (!Array.isArray(b.moves) || b.moves.length > 4 || !b.moves.every(text) || new Set(b.moves).size !== b.moves.length))
        || ['apelido', 'habilidade', 'item'].some(key => b[key] !== undefined && !text(b[key]))) {
      return res.status(400).json({ erro: 'Membro inválido: confira slot, nível, natureza, golpes, IVs e EVs (total máximo 510).' });
    }
    if (b.natureza) b.natureza = b.natureza.toLowerCase();
  }
  next();
});

// Bônus de natureza sobre stats

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
  const { modo, limit = 50, offset = 0 } = req.query;
  if (modo !== undefined && !MODOS.includes(modo)) return res.status(400).json({ erro: 'Modo inválido.' });

  let sql    = "SELECT * FROM teams";
  const params = [];
  if (modo) { sql += " WHERE modo_anil = ?"; params.push(modo); }
  const total = db.prepare(sql.replace('SELECT *', 'SELECT COUNT(*) AS n')).get(...params).n;
  sql = sql.replace('SELECT * FROM teams', 'SELECT teams.*, (SELECT COUNT(*) FROM team_members WHERE team_id = teams.id) AS total_membros FROM teams');
  sql += " ORDER BY atualizado_em DESC, id DESC LIMIT ? OFFSET ?";
  params.push(Number(limit), Number(offset));

  const teams = db.prepare(sql).all(...params).map((t) => ({
    ...t,
    criado_em:     new Date(t.criado_em * 1000).toISOString(),
    atualizado_em: new Date(t.atualizado_em * 1000).toISOString(),
  }));

  res.json({ total, total_pagina: teams.length, limit: Number(limit), offset: Number(offset), times: teams });
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
      const data = await pokeFetch(`pokemon/${m.pokemon_id}`);
      const baseStats = {};
      data.stats.forEach((s) => { baseStats[({ attack: 'atk', defense: 'def', 'special-attack': 'spa', 'special-defense': 'spd', speed: 'spe' })[s.stat.name] || s.stat.name] = s.base_stat; });

      const ivs  = JSON.parse(m.ivs  || "{}");
      const evs  = JSON.parse(m.evs  || "{}");
      const nat  = m.natureza || "hardy";
      const lvl  = m.nivel   || 50;

      const statKeys = ["hp","atk","def","spa","spd","spe"];
      const statsReais = {};
      for (const key of statKeys) {
        statsReais[key] = key === 'hp' && data.name === 'shedinja' ? 1 : calcStat(baseStats[key] ?? 0, ivs[key] ?? 31, evs[key] ?? 0, lvl, nat, key);
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

router.get('/:id/analysis', async (req, res) => {
  const db = getDb();
  const team = db.prepare('SELECT * FROM teams WHERE id = ?').get(req.params.id);
  if (!team) return res.status(404).json({ erro: 'Time não encontrado.' });
  const members = db.prepare('SELECT * FROM team_members WHERE team_id = ? ORDER BY slot').all(team.id);
  const { TYPE_CHART, getEffectiveness } = require('../lib/types');
  try {
    const pokemon = await Promise.all(members.map(async member => {
      const data = await pokeFetch(`pokemon/${member.pokemon_id}`);
      const tipos = data.types.map(t => t.type.name);
      return { slot: member.slot, pokemon: data.name, tipos, defesa: Object.fromEntries(Object.keys(TYPE_CHART).map(type => [type, getEffectiveness(type, tipos)])) };
    }));
    const defesa = Object.fromEntries(Object.keys(TYPE_CHART).map(type => [type, {
      fracos: pokemon.filter(p => p.defesa[type] > 1).map(p => p.slot),
      resistentes: pokemon.filter(p => p.defesa[type] > 0 && p.defesa[type] < 1).map(p => p.slot),
      imunes: pokemon.filter(p => p.defesa[type] === 0).map(p => p.slot)
    }]));
    res.json({ time: team.nome, fonte: 'PokeAPI', escopo: 'Defesa por tipos da série principal; não considera habilidades, itens, modo Inverso ou alterações do Añil.', membros: pokemon, defesa });
  } catch (error) { upstreamError(res, error, 'Pokémon do time não encontrado.'); }
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
      descricao     = ?,
      atualizado_em = unixepoch()
    WHERE id = ?
  `).run(nome || null, modo_anil || null, descricao !== undefined ? descricao : team.descricao, req.params.id);

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
    const data = await pokeFetch(`pokemon/${String(pokemon).toLowerCase()}`);
    pokemonId   = data.id;
    pokemonNome = data.name;
  } catch (error) {
    return upstreamError(res, error, `Pokémon '${pokemon}' não encontrado na PokeAPI.`);
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

  const members = db.prepare("SELECT * FROM team_members WHERE team_id = ?").all(team.id);
  const insertMember = db.prepare(`
    INSERT INTO team_members (team_id, slot, pokemon_id, pokemon_nome, apelido, nivel, natureza, habilidade, item, moves, evs, ivs)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertAll = db.transaction((mems) => {
    const result = db.prepare("INSERT INTO teams (nome, modo_anil, descricao) VALUES (?, ?, ?)").run(novoNome, team.modo_anil, team.descricao);
    const newId = result.lastInsertRowid;
    for (const m of mems) insertMember.run(newId, m.slot, m.pokemon_id, m.pokemon_nome, m.apelido, m.nivel, m.natureza, m.habilidade, m.item, m.moves, m.evs, m.ivs);
    return newId;
  });
  const newId = insertAll(members);

  const cloned      = db.prepare("SELECT * FROM teams WHERE id = ?").get(newId);
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
