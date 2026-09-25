const express = require("express");
const router = express.Router();
const axios = require("axios");
const NodeCache = require("node-cache");

const cache = new NodeCache({ stdTTL: 3600 });
const POKEAPI = "https://pokeapi.co/api/v2";

const TIPOS_PTBR = {
  normal: "Normal",
  fire: "Fogo",
  water: "Água",
  electric: "Elétrico",
  grass: "Grama",
  ice: "Gelo",
  fighting: "Lutador",
  poison: "Veneno",
  ground: "Terra",
  flying: "Voador",
  psychic: "Psíquico",
  bug: "Inseto",
  rock: "Pedra",
  ghost: "Fantasma",
  dragon: "Dragão",
  dark: "Sombrio",
  steel: "Aço",
  fairy: "Fada",
  stellar: "Estelar",
};

/**
 * GET /types
 * Lista todos os tipos disponíveis
 */
router.get("/", async (req, res) => {
  const cacheKey = "all_types";

  if (cache.has(cacheKey)) {
    return res.json(cache.get(cacheKey));
  }

  try {
    const { data } = await axios.get(`${POKEAPI}/type?limit=30`);

    const result = {
      total: data.count,
      tipos: data.results.map((t) => ({
        nome: t.name,
        nome_ptbr: TIPOS_PTBR[t.name] || t.name,
        url: t.url,
      })),
    };

    cache.set(cacheKey, result);
    res.json(result);
  } catch (err) {
    res.status(500).json({ erro: "Erro ao consultar a PokeAPI.", detalhe: err.message });
  }
});

/**
 * GET /types/:name
 * Efetividade completa de um tipo
 */
router.get("/:name", async (req, res) => {
  const { name } = req.params;
  const cacheKey = `type_${name}`;

  if (cache.has(cacheKey)) {
    return res.json(cache.get(cacheKey));
  }

  try {
    const { data } = await axios.get(`${POKEAPI}/type/${name.toLowerCase()}`);

    const dr = data.damage_relations;

    const traduzir = (arr) =>
      arr.map((t) => ({
        nome: t.name,
        nome_ptbr: TIPOS_PTBR[t.name] || t.name,
      }));

    const result = {
      id: data.id,
      nome: data.name,
      nome_ptbr: TIPOS_PTBR[data.name] || data.name,
      relacoes_de_dano: {
        duplo_dano_contra: traduzir(dr.double_damage_to),
        metade_dano_contra: traduzir(dr.half_damage_to),
        sem_dano_contra: traduzir(dr.no_damage_to),
        duplo_dano_de: traduzir(dr.double_damage_from),
        metade_dano_de: traduzir(dr.half_damage_from),
        sem_dano_de: traduzir(dr.no_damage_from),
      },
      total_pokemon: data.pokemon.length,
      total_moves: data.moves.length,
      geracao: data.generation?.name || null,
    };

    cache.set(cacheKey, result);
    res.json(result);
  } catch (err) {
    if (err.response?.status === 404) {
      return res.status(404).json({
        erro: `Tipo '${name}' não encontrado.`,
        tipos_validos: Object.keys(TIPOS_PTBR),
      });
    }
    res.status(500).json({ erro: "Erro ao consultar a PokeAPI.", detalhe: err.message });
  }
});

/**
 * GET /types/matchup/:atk/:def
 * Efetividade de um tipo atacante contra um tipo defensor
 */
router.get("/matchup/:atk/:def", async (req, res) => {
  const { atk, def } = req.params;
  const cacheKey = `matchup_${atk}_${def}`;

  if (cache.has(cacheKey)) {
    return res.json(cache.get(cacheKey));
  }

  try {
    const { data } = await axios.get(`${POKEAPI}/type/${atk.toLowerCase()}`);
    const dr = data.damage_relations;

    let multiplicador = 1;
    let descricao = "Dano normal (1×)";

    if (dr.double_damage_to.some((t) => t.name === def.toLowerCase())) {
      multiplicador = 2;
      descricao = "Muito efetivo (2×)!";
    } else if (dr.half_damage_to.some((t) => t.name === def.toLowerCase())) {
      multiplicador = 0.5;
      descricao = "Não muito efetivo (0.5×).";
    } else if (dr.no_damage_to.some((t) => t.name === def.toLowerCase())) {
      multiplicador = 0;
      descricao = "Não tem efeito (0×).";
    }

    const result = {
      atacante: { nome: atk, nome_ptbr: TIPOS_PTBR[atk] || atk },
      defensor: { nome: def, nome_ptbr: TIPOS_PTBR[def] || def },
      multiplicador,
      descricao,
    };

    cache.set(cacheKey, result);
    res.json(result);
  } catch (err) {
    if (err.response?.status === 404) {
      return res.status(404).json({ erro: `Tipo '${atk}' não encontrado.` });
    }
    res.status(500).json({ erro: "Erro ao consultar a PokeAPI.", detalhe: err.message });
  }
});

module.exports = router;
