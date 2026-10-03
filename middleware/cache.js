/* ==========================================================================
   Pokémon Anil API — middleware/cache.js
   Cache de respostas em SQLite + wrapper do axios.
   ========================================================================== */
const axios = require("axios");
const { cacheGet, cacheSet } = require("../database/db");

const TTL_PADRAO = 60 * 60;   /* segundos: mesma unidade de cacheSet */
const pending = new Map();

const pokeapi = axios.create({
  baseURL: "https://pokeapi.co/api/v2",
  timeout: 15000
});

/* busca na PokeAPI com cache em SQLite */
async function pokeFetch(caminho, ttl){
  const url = caminho;
  const hit = cacheGet(url);
  if(hit) return hit;

  if (pending.has(url)) return pending.get(url);
  const request = (async () => {
    const r = await pokeapi.get(caminho);
    cacheSet(url, r.data, ttl ?? ttlPara(caminho));
    return r.data;
  })();
  pending.set(url, request);
  try { return await request; } finally { pending.delete(url); }
}

function ttlPara(recurso){
  if(/(?:^|\/)pokemon\//.test(recurso) || /(?:^|\/)move\//.test(recurso)) return 6 * 60 * 60;
  if(/(?:^|\/)type\//.test(recurso) || /(?:^|\/)pokemon-species\//.test(recurso)) return 24 * 60 * 60;
  return TTL_PADRAO;
}

module.exports = { pokeFetch, ttlPara, pokeapi };
