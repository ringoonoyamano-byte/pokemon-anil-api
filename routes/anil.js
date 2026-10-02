const express = require("express");
const router = express.Router();
const anilData = require("../data/anil.json");

/**
 * GET /anil
 * Informações gerais do Pokémon Anil
 */
router.get("/", (req, res) => {
  res.json({
    jogo: anilData.info,
    verificacao: anilData.verificacao,
    resumo: {
      total_starters: anilData.starters.total,
      total_modos: anilData.modos_de_jogo.length,
      total_mecanicas_exclusivas: anilData.mecanicas_exclusivas.length,
      total_evolucoes_alteradas: anilData.evolution_changes.lista.length,
      total_hm_substituidos: anilData.hm_replacements.length,
      total_personagens_novos: anilData.personagens_novos.length,
      total_locais: anilData.locais.length,
      total_chefes_opcionais: anilData.chefes_opcionais.length,
    },
    endpoints: {
      info_geral: "GET /anil",
      edicoes: "GET /anil/editions",
      online_ptbr: "GET /anil/online",
      fontes: "GET /anil/sources",
      modos: "GET /anil/modes",
      starters: "GET /anil/starters",
      starters_por_gen: "GET /anil/starters/:gen (ex: gen1, gen9)",
      mecanicas: "GET /anil/mechanics",
      mecanica_especifica: "GET /anil/mechanics/:id",
      evolucoes_alteradas: "GET /anil/evolution-changes",
      hm_substitutos: "GET /anil/key-items",
      personagens: "GET /anil/characters",
      locais: "GET /anil/locations",
      ginasios: "GET /anil/gyms",
      pos_jogo: "GET /anil/postgame",
      faq: "GET /anil/faq",
      taxas: "GET /anil/rates",
    },
  });
});

/**
 * GET /anil/modes
 * Todos os modos de jogo do Anil
 */
router.get("/modes", (req, res) => {
  res.json({
    total: anilData.modos_de_jogo.length,
    modos: anilData.modos_de_jogo,
  });
});

/**
 * GET /anil/modes/:id
 * Um modo específico
 */
router.get("/modes/:id", (req, res) => {
  const modo = anilData.modos_de_jogo.find(
    (m) => m.id === req.params.id.toLowerCase()
  );
  if (!modo) {
    return res.status(404).json({
      erro: `Modo '${req.params.id}' não encontrado.`,
      modos_disponiveis: anilData.modos_de_jogo.map((m) => m.id),
    });
  }
  res.json(modo);
});

/**
 * GET /anil/starters
 * Todos os 27 starters
 */
router.get("/starters", (req, res) => {
  res.json(anilData.starters);
});

/**
 * GET /anil/starters/:gen
 * Starters de uma geração específica (ex: gen1, gen9)
 */
router.get("/starters/:gen", (req, res) => {
  const gen = req.params.gen.toLowerCase();
  const starters = anilData.starters.por_geracao[gen];

  if (!starters) {
    return res.status(404).json({
      erro: `Geração '${gen}' não encontrada.`,
      geracoes_disponiveis: Object.keys(anilData.starters.por_geracao),
    });
  }
  res.json({ geracao: gen, starters });
});

/**
 * GET /anil/mechanics
 * Todas as mecânicas exclusivas do Anil
 */
router.get("/mechanics", (req, res) => {
  res.json({
    total: anilData.mecanicas_exclusivas.length,
    mecanicas: anilData.mecanicas_exclusivas,
  });
});

/**
 * GET /anil/mechanics/:id
 * Uma mecânica específica
 */
router.get("/mechanics/:id", (req, res) => {
  const mecanica = anilData.mecanicas_exclusivas.find(
    (m) => m.id === req.params.id.toLowerCase()
  );
  if (!mecanica) {
    return res.status(404).json({
      erro: `Mecânica '${req.params.id}' não encontrada.`,
      mecanicas_disponiveis: anilData.mecanicas_exclusivas.map((m) => m.id),
    });
  }
  res.json(mecanica);
});

/**
 * GET /anil/evolution-changes
 * Pokémon que evoluem por level-up no lugar de troca
 */
router.get("/evolution-changes", (req, res) => {
  res.json({
    descricao: anilData.evolution_changes.descricao,
    nota: anilData.evolution_changes.nota,
    total: anilData.evolution_changes.lista.length,
    lista: anilData.evolution_changes.lista,
  });
});

/**
 * GET /anil/evolution-changes/:pokemon
 * Evolução alterada de um Pokémon específico (por nome)
 */
router.get("/evolution-changes/:pokemon", (req, res) => {
  const query = req.params.pokemon.toLowerCase();
  const changes = anilData.evolution_changes.lista.filter(
    (e) =>
      e.pokemon.toLowerCase() === query ||
      e.evolui_para.toLowerCase() === query
  );

  if (!changes.length) {
    return res.status(404).json({
      mensagem: `Nenhuma alteração de evolução encontrada para '${query}'. Este Pokémon pode evoluir normalmente.`,
    });
  }
  res.json({ pokemon: query, alteracoes: changes });
});

/**
 * GET /anil/key-items
 * Itens-chave que substituem os HMs
 */
router.get("/key-items", (req, res) => {
  res.json({
    descricao: "No Pokémon Anil, os HMs foram substituídos por Itens-Chave. Pokémon não precisam mais ocupar slots de move para usar HMs.",
    total: anilData.hm_replacements.length,
    substituicoes: anilData.hm_replacements,
  });
});

/**
 * GET /anil/characters
 * Personagens exclusivos e alterados
 */
router.get("/characters", (req, res) => {
  res.json({
    protagonistas: anilData.protagonistas,
    personagens_novos: anilData.personagens_novos,
    personagens_alterados: anilData.personagens_alterados,
    chefes_opcionais: anilData.chefes_opcionais,
  });
});

/**
 * GET /anil/locations
 * Locais do jogo (incluindo exclusivos)
 */
router.get("/locations", (req, res) => {
  const exclusivos = anilData.locais.filter((l) => l.exclusivo_anil);
  const originais = anilData.locais.filter((l) => !l.exclusivo_anil);

  res.json({
    total: anilData.locais.length,
    exclusivos_anil: exclusivos,
    locais_originais_modificados: originais,
  });
});

/**
 * GET /anil/gyms
 * Ginásios na ordem do Pokémon Anil
 */
router.get("/gyms", (req, res) => {
  const data = anilData["insígnias_e_level_cap"];
  res.json({
    total: data.total_insignias,
    descricao_cap: data.descricao,
    nota_cap: data.nota,
    ginasios: data.gyms,
    restricoes_de_rota: anilData.restricoes_de_rota,
  });
});

/**
 * GET /anil/postgame
 * Informações sobre o pós-jogo
 */
router.get("/postgame", (req, res) => {
  const ilhasPlasma = anilData.locais.find((l) => l.id === "plasma_islands");
  const chefes = anilData.chefes_opcionais;
  const formas = anilData.formas_regionais;

  res.json({
    descricao: "Após vencer a Liga Pokémon, um extenso pós-jogo está disponível.",
    locais_pos_jogo: [ilhasPlasma],
    chefes_opcionais: chefes,
    mega_evolucoes: anilData.mecanicas_exclusivas.find(
      (m) => m.id === "mega_evolucoes"
    ),
    formas_regionais: formas,
    aviso: "Não pause após vencer a Liga — o pós-jogo começa imediatamente.",
  });
});

/**
 * GET /anil/rates
 * Taxas e probabilidades exclusivas do Anil
 */
router.get("/rates", (req, res) => {
  const shiny = anilData.mecanicas_exclusivas.find((m) => m.id === "shiny_rate");
  res.json({
    shiny: {
      chance: shiny.taxa,
      fracao: shiny.fracao,
      porcentagem: "0.1%",
      descricao: shiny.descricao,
    },
    level_cap: {
      descricao: anilData["insígnias_e_level_cap"].descricao,
      nota: anilData["insígnias_e_level_cap"].nota,
    },
  });
});

/**
 * GET /anil/faq
 * Perguntas frequentes
 */
router.get("/faq", (req, res) => {
  res.json({
    total: anilData.faq.length,
    faq: anilData.faq,
  });
});

/**
 * GET /anil/faq/search?q=query
 * Busca no FAQ
 */
router.get("/faq/search", (req, res) => {
  const query = (req.query.q || "").toLowerCase();
  if (!query) {
    return res.status(400).json({ erro: "Parâmetro 'q' é obrigatório. Ex: /anil/faq/search?q=shiny" });
  }

  const resultados = anilData.faq.filter(
    (f) =>
      f.pergunta.toLowerCase().includes(query) ||
      f.resposta.toLowerCase().includes(query)
  );

  res.json({
    query,
    total: resultados.length,
    resultados,
  });
});

router.get("/editions", (_req, res) => {
  res.json({ total: anilData.edicoes.length, edicoes: anilData.edicoes });
});

router.get("/online", (_req, res) => {
  res.json(anilData.online_ptbr);
});

router.get("/sources", (_req, res) => {
  res.json({ verificacao: anilData.verificacao, fontes: anilData.fontes });
});

module.exports = router;
