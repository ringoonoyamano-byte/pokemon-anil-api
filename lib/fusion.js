const axios = require('axios');
const game = require('./game-data');
const { cacheGet, cacheSet } = require('../database/db');
const pending = new Map();
async function external(path) {
  const key = `fusion:v1:${path}`;
  const cached = cacheGet(key);
  if (cached) return cached;
  if (!pending.has(key)) {
    pending.set(key, axios.get(`https://pokeapi.co/api/v2/${path}`, { timeout: 10000 })
      .then(({ data }) => { cacheSet(key, data, 86400); return data; })
      .finally(() => pending.delete(key)));
  }
  return pending.get(key);
}
const resources = ['pokemon', 'move', 'ability', 'item', 'type'];
async function fusion(resource, id, fetchExternal = external) {
  const local = await game.pokeFetch(`${resource}/${id}`);
  // Local form numbers are synthetic; never send them to the national Pokédex.
  const mapped = resource !== 'pokemon' || local.form === 0;
  let reference = null;
  let status = mapped ? 'disponivel' : 'sem_correspondencia';
  if (mapped) {
    try { reference = await fetchExternal(`${resource}/${local.name}`); }
    catch (error) {
      if (!error.isAxiosError && !error.response && !error.code) throw error;
      status = error.response?.status === 404 ? 'sem_correspondencia' : 'indisponivel';
    }
  }
  const merged = { ...local };
  const additions = [];
  if (reference) {
    // Only descriptive fields are enriched. Gameplay values stay local.
    const fields = resource === 'pokemon' ? ['sprites', 'cries']
      : ['effect_entries', 'flavor_text_entries'];
    for (const field of fields) {
      if (reference[field] != null) { merged[field] = reference[field]; additions.push(field); }
    }
  }
  return {
    recurso: resource, dataset_id: game.datasetId,
    prioridade: 'dados_do_jogo', dados: merged,
    fontes: { jogo: game.source, pokeapi: 'https://pokeapi.co/docs/v2/' },
    complementos_pokeapi: additions, status_pokeapi: status,
    referencia_pokeapi: reference,
    aviso: 'A referência PokeAPI descreve a série principal. Textos e imagens externos não confirmam regras do Añil.',
  };
}
module.exports = { fusion, resources };
