/**
 * routes/custom.js
 * CRUD completo para dados customizados do Pokémon Anil armazenados no banco.
 * Permite adicionar moves, itens, NPCs, mapas, eventos exclusivos do jogo.
 */

const express = require("express");
const router  = express.Router();
const { getDb } = require("../database/db");

const CATEGORIAS = ["modo", "mecanica", "evolucao", "item_chave", "starter", "npc", "mapa", "move", "evento", "outro"];

function formatRow(row) {
  if (!row) return null;
  return {
    ...row,
    dados: JSON.parse(row.dados),
    criado_em:     new Date(row.criado_em * 1000).toISOString(),
    atualizado_em: new Date(row.atualizado_em * 1000).toISOString(),
  };
}

// ─── GET /custom ─────────────────────────────────────────────────────────────
// Lista todos os registros com filtros opcionais
router.get("/", (req, res) => {
  const db = getDb();
  const { categoria, q, limit = 50, offset = 0 } = req.query;

  let sql    = "SELECT * FROM anil_custom WHERE 1=1";
  const params = [];

  if (categoria) {
    sql += " AND categoria = ?";
    params.push(categoria);
  }
  if (q) {
    sql += " AND (nome LIKE ? OR chave LIKE ?)";
    params.push(`%${q}%`, `%${q}%`);
  }

  const total = db.prepare(sql.replace("SELECT *", "SELECT COUNT(*) AS n")).get(...params).n;

  sql += " ORDER BY categoria, nome LIMIT ? OFFSET ?";
  params.push(Number(limit), Number(offset));

  const rows = db.prepare(sql).all(...params).map(formatRow);

  res.json({
    total,
    limit: Number(limit),
    offset: Number(offset),
    categorias_disponiveis: CATEGORIAS,
    dados: rows,
  });
});

// ─── GET /custom/categorias ──────────────────────────────────────────────────
router.get("/categorias", (req, res) => {
  const db = getDb();
  const rows = db.prepare(`
    SELECT categoria, COUNT(*) AS total
    FROM anil_custom
    GROUP BY categoria
    ORDER BY categoria
  `).all();
  res.json({ categorias: rows });
});

// ─── GET /custom/:chave ──────────────────────────────────────────────────────
router.get("/:chave", (req, res) => {
  const db  = getDb();
  const row = db.prepare("SELECT * FROM anil_custom WHERE chave = ?").get(req.params.chave);
  if (!row) return res.status(404).json({ erro: `Chave '${req.params.chave}' não encontrada.` });
  res.json(formatRow(row));
});

// ─── POST /custom ────────────────────────────────────────────────────────────
// Cria um novo registro
router.post("/", (req, res) => {
  const { categoria, chave, nome, dados, fonte } = req.body;

  if (!categoria || !chave || !nome || !dados) {
    return res.status(400).json({
      erro: "Campos obrigatórios: categoria, chave, nome, dados.",
      exemplo: {
        categoria: "move",
        chave: "move_anil_especial",
        nome: "Raio Anil",
        dados: { tipo: "electric", poder: 90, precisao: 100, pp: 15, descricao: "Move exclusivo" },
        fonte: "https://pkmnanil.com/moves",
      },
    });
  }

  if (!CATEGORIAS.includes(categoria)) {
    return res.status(400).json({
      erro: `Categoria inválida: '${categoria}'.`,
      categorias_validas: CATEGORIAS,
    });
  }

  const db = getDb();

  try {
    const result = db.prepare(`
      INSERT INTO anil_custom (categoria, chave, nome, dados, fonte)
      VALUES (?, ?, ?, ?, ?)
    `).run(categoria, chave, nome, JSON.stringify(dados), fonte || null);

    const row = db.prepare("SELECT * FROM anil_custom WHERE id = ?").get(result.lastInsertRowid);
    res.status(201).json({ mensagem: "Criado com sucesso.", registro: formatRow(row) });
  } catch (err) {
    if (err.message.includes("UNIQUE")) {
      return res.status(409).json({ erro: `A chave '${chave}' já existe. Use PUT para atualizar.` });
    }
    throw err;
  }
});

// ─── PUT /custom/:chave ──────────────────────────────────────────────────────
// Atualiza um registro existente
router.put("/:chave", (req, res) => {
  const db  = getDb();
  const old = db.prepare("SELECT * FROM anil_custom WHERE chave = ?").get(req.params.chave);
  if (!old) return res.status(404).json({ erro: `Chave '${req.params.chave}' não encontrada.` });

  const { nome, dados, fonte, categoria } = req.body;

  if (categoria && !CATEGORIAS.includes(categoria)) {
    return res.status(400).json({ erro: `Categoria inválida.`, categorias_validas: CATEGORIAS });
  }

  db.prepare(`
    UPDATE anil_custom
    SET
      nome          = COALESCE(?, nome),
      dados         = COALESCE(?, dados),
      fonte         = COALESCE(?, fonte),
      categoria     = COALESCE(?, categoria),
      atualizado_em = unixepoch()
    WHERE chave = ?
  `).run(
    nome || null,
    dados ? JSON.stringify(dados) : null,
    fonte || null,
    categoria || null,
    req.params.chave
  );

  const updated = db.prepare("SELECT * FROM anil_custom WHERE chave = ?").get(req.params.chave);
  res.json({ mensagem: "Atualizado com sucesso.", registro: formatRow(updated) });
});

// ─── DELETE /custom/:chave ───────────────────────────────────────────────────
router.delete("/:chave", (req, res) => {
  const db = getDb();
  const { changes } = db
    .prepare("DELETE FROM anil_custom WHERE chave = ?")
    .run(req.params.chave);

  if (!changes) return res.status(404).json({ erro: `Chave '${req.params.chave}' não encontrada.` });
  res.json({ mensagem: `Registro '${req.params.chave}' removido com sucesso.` });
});

module.exports = router;
