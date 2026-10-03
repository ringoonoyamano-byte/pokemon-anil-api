const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const axios = require('axios');
const dbPath = require.resolve('../database/db');
const originalDb = require.cache[dbPath];
const originalGet = axios.get;
const cachePath = require.resolve('../middleware/cache');
const node = (name, id, details = [], children = []) => ({ species: { name, url: `https://pokeapi.co/api/v2/pokemon-species/${id}/` }, evolution_details: details, evolves_to: children });
const evolution = node('bulbasaur', 1, [], [node('ivysaur', 2, [{ min_level: 16 }], [node('venusaur', 3, [{ min_level: 32 }])]), node('test-item', 4, [{ item: { name: 'leaf-stone' } }, { min_happiness: 220, time_of_day: 'night' }])]);
const stats = names => names.map((name, i) => ({ stat: { name }, base_stat: [35, 55, 40, 50, 50, 90][i] }));
const pokemon = { id: 25, name: 'pikachu', types: [{ type: { name: 'electric' } }], stats: stats(['hp','attack','defense','special-attack','special-defense','speed']) };
let server, base;
before(async () => {
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { getDb: () => ({ prepare: () => ({ run: () => ({}), get: () => ({ ok: 1, id: 1, nome: 'fixture' }), all: () => [{ slot: 1, pokemon_id: 25 }] }) }) } };
  axios.get = async url => ({ data: url.includes('/move/') ? {
    name: url.split('/').pop(), type: { name: 'normal' }, target: { name: 'selected-pokemon' }, damage_class: { name: url.endsWith('special') ? 'special' : 'physical' }, power: 40,
    names: [{ language: { name: 'de' }, name: 'Deutsch' }], effect_entries: [], flavor_text_entries: [], stat_changes: [], generation: { name: 'generation-i' }
  } : pokemon });
  require.cache[cachePath] = { id: cachePath, filename: cachePath, loaded: true, exports: {
    pokeFetch: async path => path.startsWith('pokemon/') ? { ...pokemon, species: { url: 'species-test' }, moves: [{ move: { name: 'tackle' }, version_group_details: ['red-blue', 'scarlet-violet'].map(name => ({ version_group: { name }, move_learn_method: { name: 'level-up' }, level_learned_at: 1 })) }] }
      : path.startsWith('ability?') || path.startsWith('item?') ? { count: 1, results: [{ name: 'fixture' }] }
      : path.startsWith('ability/') || path.startsWith('item/') ? { id: 1, name: 'fixture' }
      : path.startsWith('move/') ? (await axios.get('https://pokeapi.co/api/v2/' + path)).data
      : path === 'species-test' ? { evolution_chain: { url: 'chain-test' } } : { chain: evolution }
  } };
  const app = express(); app.use(express.json());
  app.use('/calculator', require('../routes/calculator'));
  app.use('/moves', require('../routes/moves'));
  app.use('/pokemon', require('../routes/routes_pokemon'));
  app.use('/teams', require('../routes/teams'));
  app.use('/custom', require('../routes/custom'));
  app.use('/types', require('../routes/types'));
  app.use(require('../routes/health'));
  app.use('/abilities', require('../routes/catalog')('ability'));
  app.use('/items', require('../routes/catalog')('item'));
  app.use('/stats', require('../routes/stats'));
  app.use(require('../middleware/error-handler'));
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  axios.get = originalGet;
  if (originalDb) require.cache[dbPath] = originalDb; else delete require.cache[dbPath];
  delete require.cache[cachePath];
  await new Promise(resolve => server.close(resolve));
});
async function calculate(extra = {}) {
  const response = await fetch(base + '/calculator', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ atacante: 'pikachu', defensor: 'pikachu', move: 'tackle', ...extra }) });
  return { status: response.status, data: await response.json() };
}
test('physical damage uses attack/defense and keeps fractional ratio', async () => {
  const { status, data } = await calculate();
  assert.equal(status, 200);
  assert.equal(data.calculo.stat_atk.valor, 75);
  assert.equal(data.calculo.stat_def.valor, 60);
  assert.equal(data.dano.minimo, 20);
  assert.equal(data.dano.maximo, 24);
});
test('burn reduces physical damage but does not reduce special damage', async () => {
  const normal = await calculate({ move: 'special' });
  const burned = await calculate({ move: 'special', burn: true });
  assert.deepEqual(normal.data.dano, burned.data.dano);
  const physical = await calculate({ burn: true });
  assert.equal(physical.data.dano.maximo, 12);
});
test('invalid stats return 400 rather than NaN or database errors', async () => {
  for (const extra of [{ def_override: 0 }, { nivel: 101 }, { ivs_atk: 32 }, { evs_def: 253 }, { natureza_atk: 'invalid' }]) {
    assert.equal((await calculate(extra)).status, 400);
  }
});
test('evolution uses each child condition and preserves alternatives', async () => {
  const response = await fetch(base + '/pokemon/bulbasaur/evolution');
  assert.equal(response.status, 200);
  const { cadeia } = await response.json();
  assert.equal(cadeia.condicao_propria, null);
  assert.equal(cadeia.evolui_para[0].nivel_minimo, 16);
  assert.equal(cadeia.evolui_para[0].proximo.evolui_para[0].nivel_minimo, 32);
  assert.equal(cadeia.evolui_para[1].item, 'leaf-stone');
  assert.equal(cadeia.evolui_para[1].condicoes.length, 2);
});
test('German names are not returned as Portuguese translations', async () => {
  const response = await fetch(base + '/moves/tackle');
  const result = await response.json();
  assert.equal(result.nome_traduzido, 'tackle');
  assert.equal(result.traducao_disponivel, false);
});
test('learnset filters preserve the source version', async () => {
  const response = await fetch(base + '/pokemon/25/moves?version=red-blue');
  const result = await response.json();
  assert.equal(result.moves[0].metodos.length, 1);
  assert.equal(result.moves[0].metodos[0].jogo, 'red-blue');
  assert.equal((await fetch(base + '/pokemon/25/moves?version[]=red-blue')).status, 400);
});
test('remote writes require a key and reject spoofed forwarded addresses', () => {
  const access = require('../middleware/write-access');
  const previous = process.env.API_WRITE_KEY;
  let allowed, status;
  const req = { method: 'POST', socket: { remoteAddress: '192.0.2.1' }, get: () => 'Bearer wrong', headers: { 'x-forwarded-for': '127.0.0.1' } };
  const res = { status(code) { status = code; return this; }, json() {} };
  try {
    delete process.env.API_WRITE_KEY;
    access(req, res, () => { allowed = true; });
    assert.equal(status, 403); assert.equal(allowed, undefined);
    process.env.API_WRITE_KEY = 'test-key';
    access(req, res, () => { allowed = true; }); assert.equal(status, 401);
    req.get = () => 'Bearer test-key';
    access(req, res, () => { allowed = true; }); assert.equal(allowed, true);
  } finally {
    if (previous === undefined) delete process.env.API_WRITE_KEY; else process.env.API_WRITE_KEY = previous;
  }
});
test('team endpoints reject malformed members before database writes', async () => {
  for (const extra of [{ slot: 1.5 }, { natureza: 42 }, { ivs: { hp: 32 } }, { evs: { atk: 252, spe: 252, hp: 7 } }, { moves: 'tackle' }, { moves: ['tackle', 'tackle'] }]) {
    const response = await fetch(base + '/teams/1/members', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ slot: 1, pokemon: 'pikachu', ...extra }) });
    assert.equal(response.status, 400);
  }
});
test('custom data rejects invalid fields without changing the database', async () => {
  for (const body of [[], { nome: 42 }, { dados: 'text' }, { dados: null }, { categoria: 'invalid' }]) {
    const response = await fetch(base + '/custom', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    assert.equal(response.status, 400);
  }
  assert.equal((await fetch(base + '/custom?q[]=value')).status, 400);
});
test('malformed JSON returns 400', async () => {
  const response = await fetch(base + '/custom', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{broken' });
  assert.equal(response.status, 400);
});
test('type matchup rejects invalid defenders and unsupported stellar rules', async () => {
  for (const type of ['invalid', 'stellar']) {
    assert.equal((await fetch(base + '/types/matchup/fire/' + type)).status, 400);
  }
});
test('health and readiness respond without querying external services', async () => {
  for (const path of ['/health', '/ready']) {
    const response = await fetch(base + path);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).status, 'ok');
  }
});
test('catalogs identify the source and validate pagination', async () => {
  for (const path of ['/abilities', '/items']) {
    const list = await (await fetch(base + path + '?limit=1')).json();
    assert.equal(list.fonte, 'PokeAPI'); assert.equal(list.limit, 1);
    const detail = await (await fetch(base + path + '/1')).json();
    assert.equal(detail.dados.id, 1); assert.equal(detail.fonte, 'PokeAPI');
    assert.equal((await fetch(base + path + '?limit=-1')).status, 400);
  }
});
test('stat calculator applies nature and preserves zero IV', async () => {
  const response = await fetch(base + '/stats/calculate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pokemon: 'pikachu', natureza: 'adamant', ivs: { hp: 0 } }) });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.stats.hp, 95); assert.equal(result.stats.atk, 82); assert.equal(result.stats.spa, 63);
  assert.equal(result.ivs.hp, 0);
});
test('team analysis reports weaknesses, resistances and immunity by slot', async () => {
  const response = await fetch(base + '/teams/1/analysis');
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.deepEqual(result.defesa.ground.fracos, [1]);
  assert.deepEqual(result.defesa.electric.resistentes, [1]);
  assert.deepEqual(result.defesa.ground.imunes, []);
});
