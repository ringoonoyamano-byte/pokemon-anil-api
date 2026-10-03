const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require.resolve('../database/db');
let stored;
require.cache[path] = { id: path, filename: path, loaded: true, exports: {
  cacheGet: () => null, cacheSet: (_key, _data, ttl) => { stored = ttl; }
} };
const { pokeFetch, pokeapi, ttlPara } = require('../middleware/cache');
test('cache TTL uses seconds and handles relative and absolute paths', async () => {
  assert.equal(ttlPara('pokemon/25'), 21600);
  assert.equal(ttlPara('https://pokeapi.co/api/v2/type/fire'), 86400);
  const original = pokeapi.get;
  pokeapi.get = async () => ({ data: { id: 25 } });
  try {
    await pokeFetch('pokemon/25'); assert.equal(stored, 21600);
    await pokeFetch('move/tackle', 60); assert.equal(stored, 60);
  } finally { pokeapi.get = original; }
});
test('concurrent cache misses share a request and failures allow retries', async () => {
  const original = pokeapi.get;
  let calls = 0;
  pokeapi.get = async () => { calls++; await new Promise(resolve => setTimeout(resolve, 5)); return { data: { id: 25 } }; };
  try {
    const data = await Promise.all([pokeFetch('pokemon/25'), pokeFetch('pokemon/25'), pokeFetch('pokemon/25')]);
    assert.equal(calls, 1); assert.equal(data.length, 3);
    pokeapi.get = async () => { throw new Error('offline'); };
    await assert.rejects(pokeFetch('pokemon/1'));
    pokeapi.get = async () => ({ data: { id: 1 } });
    assert.equal((await pokeFetch('pokemon/1')).id, 1);
  } finally { pokeapi.get = original; }
});
