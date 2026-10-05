const express = require("express");
const router = express.Router();
const { pokeFetch } = require('../middleware/cache');
const { source, datasetId } = require('../lib/game-data');
const NodeCache = require("node-cache");

const cache = new NodeCache({ stdTTL: 3600 });

const upstreamError = require("../middleware/upstream-error");
router.get('/', require('../middleware/validation').pagination, async (req, res) => {
  const limit = Number(req.query.limit ?? 50), offset = Number(req.query.offset ?? 0);
  const data = await pokeFetch(`move?limit=${limit}&offset=${offset}`);
  res.json({ fonte: source, dataset_id: datasetId, total:data.count, limit, offset,
    resultados:data.results.map(m=>({name:m.name,url:`/moves/${m.name}`})) });
});

/**
 * GET /moves/:name
 * Dados completos de um move (golpe) via PokeAPI
 */
router.get("/:name", async (req, res) => {
  const { name } = req.params;
  const cacheKey = `move_${name}`;

  if (cache.has(cacheKey)) {
    return res.json(cache.get(cacheKey));
  }

  try {
    const data = await pokeFetch(`move/${name.toLowerCase()}`);

    // Nome em português (se disponível)
    const nomePt = data.names.find(
      (n) => ["pt-BR", "pt-br", "pt"].includes(n.language.name)
    );

    // Efeito em inglês
    const efeito = data.effect_entries.find((e) => e.language.name === "en");
    const efeitoResumido = data.flavor_text_entries.find(
      (f) => f.language.name === "en"
    );

    const result = {
      fonte: source, dataset_id: datasetId,
      id: data.id,
      nome: data.name,
      nome_traduzido: nomePt?.name || data.name,
      idioma_nome: nomePt?.language.name || 'identificador',
      traducao_disponivel: !!nomePt,
      tipo: data.type.name,
      categoria: data.damage_class.name, // physical, special, status
      poder: data.power,
      precisao: data.accuracy,
      pp: data.pp,
      prioridade: data.priority,
      alcance: data.target.name,
      efeito_chance: data.effect_chance,
      efeito: efeito ? efeito.effect.replace(/\$effect_chance/g, data.effect_chance ?? "?") : null,
      efeito_resumido: efeitoResumido?.flavor_text || data.dados_jogo?.description_source_es || null,
      idioma_descricao: data.dados_jogo?.description_source_es ? 'es' : null,
      geracao_introduzida: data.generation.name,
      dados_jogo: data.dados_jogo,
      meta: data.meta
        ? {
            categoria_meta: data.meta.category?.name,
            min_hits: data.meta.min_hits,
            max_hits: data.meta.max_hits,
            cura: data.meta.healing,
            crit_rate: data.meta.crit_rate,
            drain: data.meta.drain,
            flinch_chance: data.meta.flinch_chance,
            stat_chance: data.meta.stat_chance,
          }
        : null,
      mudancas_de_stat: data.stat_changes.map((s) => ({
        stat: s.stat.name,
        mudanca: s.change,
      })),
    };

    cache.set(cacheKey, result);
    res.json(result);
  } catch (err) {
    if (err.response?.status === 404) {
      return res.status(404).json({ erro: `Move '${name}' não encontrado nos dados do jogo.` });
    }
    upstreamError(res, err, "Recurso não encontrado nos dados do jogo.");
  }
});

/**
 * GET /moves/type/:type
 * Lista todos os moves de um determinado tipo
 */
router.get("/type/:type", async (req, res) => {
  const { type } = req.params;
  const cacheKey = `moves_type_${type}`;

  if (cache.has(cacheKey)) {
    return res.json(cache.get(cacheKey));
  }

  try {
    const data = await pokeFetch(`type/${type.toLowerCase()}`);

    const result = {
      fonte: source, dataset_id: datasetId,
      tipo: type,
      total_moves: data.moves.length,
      moves: data.moves.map((m) => ({
        nome: m.name,
        url: `/moves/${m.name}`,
      })),
    };

    cache.set(cacheKey, result);
    res.json(result);
  } catch (err) {
    if (err.response?.status === 404) {
      return res.status(404).json({ erro: `Tipo '${type}' não encontrado.` });
    }
    upstreamError(res, err, "Recurso não encontrado nos dados do jogo.");
  }
});

/**
 * GET /moves/category/:category
 * physical | special | status
 */
router.get("/category/:category", async (req, res) => {
  const { category } = req.params;
  const cacheKey = `moves_cat_${category}`;

  if (cache.has(cacheKey)) {
    return res.json(cache.get(cacheKey));
  }

  const categorias = ["physical", "special", "status"];
  if (!categorias.includes(category.toLowerCase())) {
    return res.status(400).json({
      erro: "Categoria inválida.",
      categorias_validas: categorias,
    });
  }

  try {
    const data = await pokeFetch(`move-damage-class/${category.toLowerCase()}`);

    const result = {
      fonte: source, dataset_id: datasetId,
      categoria: category,
      descricao: data.descriptions.find((d) => d.language.name === "en")?.description || null,
      total_moves: data.moves.length,
      moves: data.moves.map((m) => m.name),
    };

    cache.set(cacheKey, result);
    res.json(result);
  } catch (err) {
    upstreamError(res, err, "Recurso não encontrado nos dados do jogo.");
  }
});

module.exports = router;
