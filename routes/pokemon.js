const express = require("express");
const router = express.Router();
const axios = require("axios");
const NodeCache = require("node-cache");
const anilData = require("../data/anil.json");

const cache = new NodeCache({ stdTTL: 3600 }); // cache 1h
const POKEAPI = "https://pokeapi.co/api/v2";

// Helpers
function getAnilNotes(pokemonId) {
  const notes = [];

  // Verifica se é starter do Anil
  const allStarters = Object.values(anilData.starters.por_geracao).flat();
  const starter = allStarters.find((s) => s.id === pokemonId);
  if (starter) {
    notes.push(`⭐ Starter disponível no Pokémon Anil (${starter.nome})`);
  }

  // Verifica se tem evolução alterada
  const evoChange = anilData.evolution_changes.lista.find(
    (e) => e.id === pokemonId || e.id_evolucao === pokemonId
  );
  if (evoChange) {
    if (evoChange.id === pokemonId) {
      notes.push(
        `🔄 Evolução alterada no Anil: evolui para ${evoChange.evolui_para} por Level Up (original: ${evoChange.metodo_original})`
      );
    } else {
      const base = anilData.evolution_changes.lista.find(
        (e) => e.id_evolucao === pokemonId
      );
      if (base) {
        notes.push(
          `🔄 No Anil, este Pokémon é obtido por Level Up a partir de ${base.pokemon} (original: ${base.metodo_original})`
        );
      }
    }
  }

  return notes;
}

/**
 * GET /pokemon/:id
 * Busca dados de um Pokémon na PokeAPI e adiciona notas do Anil
 */
router.get("/:id", async (req, res) => {
  const { id } = req.params;
  const cacheKey = `pokemon_${id}`;

  if (cache.has(cacheKey)) {
    return res.json(cache.get(cacheKey));
  }

  try {
    const [pokemonRes, speciesRes] = await Promise.all([
      axios.get(`${POKEAPI}/pokemon/${id.toLowerCase()}`),
      axios.get(`${POKEAPI}/pokemon-species/${id.toLowerCase()}`).catch(() => null),
    ]);

    const p = pokemonRes.data;
    const species = speciesRes ? speciesRes.data : null;

    // Nome em PT-BR (via PokeAPI)
    let nomePtBr = null;
    if (species) {
      const ptName = species.names.find(
        (n) => n.language.name === "fr" // PokeAPI não tem PT-BR oficial, usamos nome base
      );
      nomePtBr = ptName ? ptName.name : p.name;
    }

    // Flavor text em PT-BR (se disponível)
    let descricaoPtBr = null;
    if (species) {
      const ptFlavor = species.flavor_text_entries.find(
        (f) => f.language.name === "fr" // aproximação
      );
      descricaoPtBr = ptFlavor
        ? ptFlavor.flavor_text.replace(/\f|\n/g, " ")
        : null;
    }

    const result = {
      id: p.id,
      nome: p.name,
      nome_ptbr: nomePtBr,
      sprites: {
        frente: p.sprites.front_default,
        frente_shiny: p.sprites.front_shiny,
        costas: p.sprites.back_default,
        artwork: p.sprites.other["official-artwork"].front_default,
      },
      tipos: p.types.map((t) => ({
        slot: t.slot,
        tipo: t.type.name,
      })),
      stats: p.stats.map((s) => ({
        nome: s.stat.name,
        base: s.base_stat,
        esforco: s.effort,
      })),
      habilidades: p.abilities.map((a) => ({
        nome: a.ability.name,
        oculta: a.is_hidden,
        slot: a.slot,
      })),
      altura_m: p.height / 10,
      peso_kg: p.weight / 10,
      experiencia_base: p.base_experience,
      moves: p.moves.slice(0, 10).map((m) => ({
        nome: m.move.name,
        aprendidos_por: m.version_group_details.slice(-1)[0]?.move_learn_method?.name,
      })),
      descricao_ptbr: descricaoPtBr,
      anil: {
        notas: getAnilNotes(p.id),
        e_starter_anil: Object.values(anilData.starters.por_geracao)
          .flat()
          .some((s) => s.id === p.id),
        evolucao_alterada: anilData.evolution_changes.lista.some(
          (e) => e.id === p.id || e.id_evolucao === p.id
        ),
      },
    };

    cache.set(cacheKey, result);
    res.json(result);
  } catch (err) {
    if (err.response?.status === 404) {
      return res.status(404).json({ erro: `Pokémon '${id}' não encontrado na PokeAPI.` });
    }
    res.status(500).json({ erro: "Erro ao consultar a PokeAPI.", detalhe: err.message });
  }
});

/**
 * GET /pokemon/:id/moves
 * Todos os moves que o Pokémon pode aprender
 */
router.get("/:id/moves", async (req, res) => {
  const { id } = req.params;
  const cacheKey = `pokemon_moves_${id}`;

  if (cache.has(cacheKey)) {
    return res.json(cache.get(cacheKey));
  }

  try {
    const { data } = await axios.get(`${POKEAPI}/pokemon/${id.toLowerCase()}`);

    const moves = data.moves.map((m) => ({
      move: m.move.name,
      metodos: m.version_group_details.map((vg) => ({
        versao: vg.version_group.name,
        metodo: vg.move_learn_method.name,
        nivel: vg.level_learned_at || null,
      })),
    }));

    const result = {
      pokemon: data.name,
      id: data.id,
      total_moves: moves.length,
      moves,
    };

    cache.set(cacheKey, result);
    res.json(result);
  } catch (err) {
    if (err.response?.status === 404) {
      return res.status(404).json({ erro: `Pokémon '${id}' não encontrado.` });
    }
    res.status(500).json({ erro: "Erro ao consultar a PokeAPI.", detalhe: err.message });
  }
});

/**
 * GET /pokemon/:id/evolution
 * Cadeia evolutiva com notas do Anil
 */
router.get("/:id/evolution", async (req, res) => {
  const { id } = req.params;
  const cacheKey = `pokemon_evo_${id}`;

  if (cache.has(cacheKey)) {
    return res.json(cache.get(cacheKey));
  }

  try {
    const speciesRes = await axios.get(`${POKEAPI}/pokemon-species/${id.toLowerCase()}`);
    const evoChainUrl = speciesRes.data.evolution_chain.url;
    const evoRes = await axios.get(evoChainUrl);

    function parseChain(chain) {
      const idNum = parseInt(chain.species.url.split("/").slice(-2, -1)[0]);
      const anilEvo = anilData.evolution_changes.lista.find(
        (e) => e.id === idNum || e.id_evolucao === idNum
      );

      return {
        id: idNum,
        nome: chain.species.name,
        detalhes_evolucao: chain.evolution_details.map((d) => ({
          trigger: d.trigger?.name,
          nivel_minimo: d.min_level,
          item: d.item?.name || null,
          troca: d.trigger?.name === "trade",
        })),
        anil_alterado: !!anilEvo,
        anil_metodo: anilEvo ? `Level Up (original: ${anilEvo.metodo_original})` : null,
        evolucoes: chain.evolves_to.map(parseChain),
      };
    }

    const result = {
      pokemon: id,
      cadeia: parseChain(evoRes.data.chain),
    };

    cache.set(cacheKey, result);
    res.json(result);
  } catch (err) {
    if (err.response?.status === 404) {
      return res.status(404).json({ erro: `Pokémon '${id}' não encontrado.` });
    }
    res.status(500).json({ erro: "Erro ao buscar cadeia evolutiva.", detalhe: err.message });
  }
});

/**
 * GET /pokemon/search/:query
 * Busca Pokémon por nome na PokeAPI
 */
router.get("/search/:query", async (req, res) => {
  const { query } = req.params;
  const cacheKey = `search_${query}`;

  if (cache.has(cacheKey)) {
    return res.json(cache.get(cacheKey));
  }

  try {
    // PokeAPI suporta busca direta por nome
    const { data } = await axios.get(
      `${POKEAPI}/pokemon/${query.toLowerCase()}`
    );

    const result = {
      id: data.id,
      nome: data.name,
      tipos: data.types.map((t) => t.type.name),
      sprite: data.sprites.front_default,
      url: `${POKEAPI}/pokemon/${data.id}`,
    };

    cache.set(cacheKey, result);
    res.json(result);
  } catch (err) {
    if (err.response?.status === 404) {
      return res.status(404).json({ erro: `Nenhum Pokémon encontrado para '${query}'.` });
    }
    res.status(500).json({ erro: "Erro na busca.", detalhe: err.message });
  }
});

module.exports = router;
