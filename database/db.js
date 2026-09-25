const Database = require("better-sqlite3");
const path     = require("path");

const DB_PATH = path.join(__dirname, "pokemon_anil.db");

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");   // gravações mais rápidas
    db.pragma("foreign_keys = ON");    // integridade referencial
  }
  return db;
}

// ─── Schema ─────────────────────────────────────────────────────────────────

function initDb() {
  const db = getDb();

  db.exec(`
    -- ─── Cache persistente da PokeAPI ──────────────────────────────────────
    CREATE TABLE IF NOT EXISTS pokeapi_cache (
      cache_key   TEXT    PRIMARY KEY,
      data        TEXT    NOT NULL,               -- JSON
      criado_em   INTEGER DEFAULT (unixepoch()),
      expira_em   INTEGER NOT NULL               -- unix timestamp
    );

    -- ─── Dados customizados do Anil (CRUD via API) ──────────────────────────
    CREATE TABLE IF NOT EXISTS anil_custom (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      categoria   TEXT    NOT NULL,               -- move | item | evento | npc | mapa
      chave       TEXT    NOT NULL UNIQUE,
      nome        TEXT    NOT NULL,
      dados       TEXT    NOT NULL,               -- JSON livre
      fonte       TEXT,                           -- URL da fonte
      criado_em   INTEGER DEFAULT (unixepoch()),
      atualizado_em INTEGER DEFAULT (unixepoch())
    );

    -- ─── Times de Pokémon ──────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS teams (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      nome        TEXT    NOT NULL,
      modo_anil   TEXT    DEFAULT 'complete',     -- classic | complete | radical
      descricao   TEXT,
      criado_em   INTEGER DEFAULT (unixepoch()),
      atualizado_em INTEGER DEFAULT (unixepoch())
    );

    -- ─── Membros do time (até 6 slots) ────────────────────────────────────
    CREATE TABLE IF NOT EXISTS team_members (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      team_id     INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      slot        INTEGER NOT NULL CHECK(slot BETWEEN 1 AND 6),
      pokemon_id  INTEGER NOT NULL,
      pokemon_nome TEXT   NOT NULL,
      apelido     TEXT,
      nivel       INTEGER DEFAULT 50 CHECK(nivel BETWEEN 1 AND 100),
      natureza    TEXT    DEFAULT 'hardy',
      habilidade  TEXT,
      item        TEXT,
      moves       TEXT    DEFAULT '[]',           -- JSON: array de até 4 moves
      evs         TEXT    DEFAULT '{"hp":0,"atk":0,"def":0,"spa":0,"spd":0,"spe":0}',
      ivs         TEXT    DEFAULT '{"hp":31,"atk":31,"def":31,"spa":31,"spd":31,"spe":31}',
      UNIQUE(team_id, slot)
    );

    -- ─── Histórico de cálculos de dano ────────────────────────────────────
    CREATE TABLE IF NOT EXISTS damage_log (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      atacante    TEXT    NOT NULL,
      defensor    TEXT    NOT NULL,
      move        TEXT    NOT NULL,
      poder       INTEGER,
      tipo_move   TEXT,
      stab        INTEGER DEFAULT 0,              -- 0 ou 1
      efetividade REAL    DEFAULT 1.0,
      critico     INTEGER DEFAULT 0,
      dano_min    INTEGER,
      dano_max    INTEGER,
      dano_medio  REAL,
      porcentagem_min REAL,
      porcentagem_max REAL,
      resultado   TEXT,                           -- JSON completo
      criado_em   INTEGER DEFAULT (unixepoch())
    );

    -- ─── Índices ────────────────────────────────────────────────────────────
    CREATE INDEX IF NOT EXISTS idx_cache_expira    ON pokeapi_cache(expira_em);
    CREATE INDEX IF NOT EXISTS idx_custom_cat      ON anil_custom(categoria);
    CREATE INDEX IF NOT EXISTS idx_team_members    ON team_members(team_id);
    CREATE INDEX IF NOT EXISTS idx_damage_log_atk  ON damage_log(atacante);
  `);

  console.log(`✅ Banco de dados inicializado: ${DB_PATH}`);
  return db;
}

// ─── Cache helpers ───────────────────────────────────────────────────────────

const TTL = 60 * 60; // 1 hora em segundos

function cacheGet(key) {
  const db  = getDb();
  const now = Math.floor(Date.now() / 1000);
  const row = db
    .prepare("SELECT data FROM pokeapi_cache WHERE cache_key = ? AND expira_em > ?")
    .get(key, now);
  return row ? JSON.parse(row.data) : null;
}

function cacheSet(key, data, ttlSeconds = TTL) {
  const db  = getDb();
  const now = Math.floor(Date.now() / 1000);
  db.prepare(`
    INSERT INTO pokeapi_cache (cache_key, data, criado_em, expira_em)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(cache_key) DO UPDATE SET
      data      = excluded.data,
      criado_em = excluded.criado_em,
      expira_em = excluded.expira_em
  `).run(key, JSON.stringify(data), now, now + ttlSeconds);
}

function cacheClean() {
  const db  = getDb();
  const now = Math.floor(Date.now() / 1000);
  const { changes } = db
    .prepare("DELETE FROM pokeapi_cache WHERE expira_em < ?")
    .run(now);
  return changes;
}

module.exports = { getDb, initDb, cacheGet, cacheSet, cacheClean };
