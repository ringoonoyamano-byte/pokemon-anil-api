const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const extracted = require('../lib/dataset-resources');

test('extracted build is registered, complete and isolated from historical rules', async () => {
  const app = express();
  app.use('/anil', require('../routes/anil'));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/anil`;
  const dataset = `${base}/datasets/${extracted.datasetId}`;
  const get = async url => (await fetch(url)).json();
  try {
    const registry = await get(`${base}/datasets?edition=azul_ptbr_online&version=4.0.6`);
    assert.equal(registry.total, 1);
    const detail = await get(dataset);
    assert.equal(detail.dados.internal_game_version, '4.0.3');
    assert.equal(detail.recursos.length, extracted.resources.length);
    const counts = { species: 1519, moves: 851, abilities: 328, items: 933, encounters: 103, trainers: 685, maps: 225, types: 19 };
    for (const [resource, count] of Object.entries(counts)) {
      const page = await get(`${dataset}/${resource}?limit=1&offset=1`);
      assert.equal(page.total, count);
      assert.deepEqual(page.dados, extracted.loadResource(resource).slice(1, 2));
    }
    const species = await get(`${dataset}/species/bulbasaur`);
    assert.equal(species.dados.base_stats.HP, 45);
    assert.equal((await get(`${dataset}/species?q=bulbasaur`)).total > 0, true);
    assert.ok((await get(`${dataset}/raid_teams/BLAINE`)).dados.length);
    const mechanics = (await get(`${dataset}/mechanics_detected`)).dados;
    assert.equal(mechanics.shiny_base_denominator, 65536);
    assert.equal(mechanics.mode_forced, 'complete');
    assert.equal((await get(`${base}/rates`)).shiny.fracao, '6/65536');
    assert.ok((await get(`${base}/datasets/anil-3.06-historico`)).dados.starters);
    for (const suffix of ['/species?limit=201', '/species?offset=-1', '/species?q[]=x', '/species?limit=1&limit=2']) {
      assert.equal((await fetch(dataset + suffix)).status, 400);
    }
    for (const suffix of ['/unknown', '/species/unknown', '/constructor', '/__proto__']) {
      assert.equal((await fetch(dataset + suffix)).status, 404);
    }
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});
