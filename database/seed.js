/**
 * seed.js — popula a tabela anil_custom com os dados de anil.json
 * Executar manualmente: node database/seed.js
 */

const { getDb, initDb } = require("./db");
const anilData = require("../data/anil.json");

function seed() {
  initDb();
  const db = getDb();

  const upsert = db.prepare(`
    INSERT INTO anil_custom (categoria, chave, nome, dados, fonte)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(chave) DO UPDATE SET
      nome        = excluded.nome,
      dados       = excluded.dados,
      fonte       = excluded.fonte,
      atualizado_em = unixepoch()
  `);

  const runMany = db.transaction((items) => {
    for (const item of items) {
      upsert.run(item.categoria, item.chave, item.nome, JSON.stringify(item.dados), item.fonte || null);
    }
  });

  const items = [];

  // ── Modos de jogo ──────────────────────────────────────────────────────
  for (const modo of anilData.modos_de_jogo) {
    items.push({
      categoria: "modo",
      chave: `modo_${modo.id}`,
      nome: modo.nome,
      dados: modo,
      fonte: "https://pokemonanil.com",
    });
  }

  // ── Mecânicas exclusivas ────────────────────────────────────────────────
  for (const mec of anilData.mecanicas_exclusivas) {
    items.push({
      categoria: "mecanica",
      chave: `mecanica_${mec.id}`,
      nome: mec.nome,
      dados: mec,
      fonte: "https://pokemonanil.com",
    });
  }

  // ── Evoluções alteradas ─────────────────────────────────────────────────
  for (const evo of anilData.evolution_changes.lista) {
    items.push({
      categoria: "evolucao",
      chave: `evo_${evo.id}`,
      nome: `${evo.pokemon} → ${evo.evolui_para}`,
      dados: evo,
      fonte: "https://pokemonanil.com",
    });
  }

  // ── HM Replacements ────────────────────────────────────────────────────
  for (const hm of anilData.hm_replacements) {
    const chave = `hm_${hm.hm.replace(/\s*\(.+\)/, "").trim().toLowerCase().replace(/\s+/g, "_")}`;
    items.push({
      categoria: "item_chave",
      chave,
      nome: hm.hm,
      dados: hm,
      fonte: "https://pokemonanil.com",
    });
  }

  // ── Starters ───────────────────────────────────────────────────────────
  for (const [gen, lista] of Object.entries(anilData.starters.por_geracao)) {
    for (const s of lista) {
      items.push({
        categoria: "starter",
        chave: `starter_${s.id}`,
        nome: s.nome,
        dados: { ...s, geracao: gen },
        fonte: "https://pokemonanil.com",
      });
    }
  }

  // ── Personagens novos ──────────────────────────────────────────────────
  for (const p of anilData.personagens_novos) {
    items.push({
      categoria: "npc",
      chave: `npc_${p.id}`,
      nome: p.nome,
      dados: p,
      fonte: "https://pokemonanil.com",
    });
  }

  // ── Locais ─────────────────────────────────────────────────────────────
  for (const loc of anilData.locais) {
    items.push({
      categoria: "mapa",
      chave: `mapa_${loc.id}`,
      nome: loc.nome,
      dados: loc,
      fonte: "https://pokemonanil.com",
    });
  }

  runMany(items);
  console.log(`✅ Seed completo: ${items.length} registros inseridos/atualizados.`);
  db.close();
}

seed();
