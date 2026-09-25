const express = require("express");
const router = express.Router();
const axios = require("axios");
const NodeCache = require("node-cache");

const cache = new NodeCache({ stdTTL: 3600 });
const POKEAPI = "https://pokeapi.co/api/v2";

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
    const { data } = await axios.get(`${POKEAPI}/move/${name.toLowerCase()}`);

    // Nome em português (se disponível)
    const nomePt = data.names.find(
      (n) => n.language.name === "de" // PokeAPI não oferece PT oficial; using German as fallback
    );

    // Efeito em inglês
    const efeito = data.effect_entries.find((e) => e.language.name === "en");
    const efeitoResumido = data.flavor_text_entries.find(
      (f) => f.language.name === "en"
    );

    const result = {
      id: data.id,
      nome: data.name,
      nome_traduzido: nomePt?.name || data.name,
      tipo: data.type.name,
      categoria: data.damage_class.name, // physical, special, status
      poder: data.power,
      precisao: data.accuracy,
      pp: data.pp,
      prioridade: data.priority,
      alcance: data.target.name,
      efeito_chance: data.effect_chance,
      efeito: efeito ? efeito.effect.replace(/\$effect_chance/g, data.effect_chance || "?") : null,
      efeito_resumido: efeitoResumido?.flavor_text || null,
      geracao_introduzida: data.generation.name,
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
      return res.status(404).json({ erro: `Move '${name}' não encontrado na PokeAPI.` });
    }
    res.status(500).json({ erro: "Erro ao consultar a PokeAPI.", detalhe: err.message });
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
    const { data } = await axios.get(`${POKEAPI}/type/${type.toLowerCase()}`);

    const result = {
      tipo: type,
      total_moves: data.moves.length,
      moves: data.moves.map((m) => ({
        nome: m.name,
        url: m.url,
      })),
    };

    cache.set(cacheKey, result);
    res.json(result);
  } catch (err) {
    if (err.response?.status === 404) {
      return res.status(404).json({ erro: `Tipo '${type}' não encontrado.` });
    }
    res.status(500).json({ erro: "Erro ao consultar a PokeAPI.", detalhe: err.message });
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
    const { data } = await axios.get(
      `${POKEAPI}/move-damage-class/${category.toLowerCase()}`
    );

    const result = {
      categoria: category,
      descricao: data.descriptions.find((d) => d.language.name === "en")?.description || null,
      total_moves: data.moves.length,
      moves: data.moves.map((m) => m.name),
    };

    cache.set(cacheKey, result);
    res.json(result);
  } catch (err) {
    res.status(500).json({ erro: "Erro ao consultar a PokeAPI.", detalhe: err.message });
  }
});

module.exports = router;
