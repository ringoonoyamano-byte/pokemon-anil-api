/* ==========================================================================
   Pokémon Anil API — middleware/cache.js
   Cache de respostas em SQLite + wrapper do axios.
   ========================================================================== */
const axios = require("axios");
const { cacheGet, cacheSet } = require("../database/db");

const TTL_PADRAO = 60 * 60 * 1000;   /* 1 hora */

const pokeapi = axios.create({
  baseURL: "https://pokeapi.co/api/v2",
  timeout: 15000
});

/* busca na PokeAPI com cache em SQLite */
async function pokeFetch(caminho, ttl){
  const url = caminho.startsWith("http") ? caminho : caminho;
  const hit = cacheGet(url);
  if(hit) return hit;

  const r = await pokeapi.get(caminho);
  cacheSet(url, r.data, ttl || TTL_PADRAO);
  return r.data;
}

function ttlPara(recurso){
  if(/\/pokemon\//.test(recurso) || /\/move\//.test(recurso)) return 6 * 60 * 60 * 1000;
  if(/\/type\//.test(recurso) || /\/pokemon-species\//.test(recurso)) return 24 * 60 * 60 * 1000;
  return TTL_PADRAO;
}

module.exports = { pokeFetch, ttlPara, pokeapi };
