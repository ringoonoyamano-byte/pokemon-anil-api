const { test } = require('node:test');
const assert = require('node:assert/strict');
const { fusion } = require('../lib/fusion');
test('fusion keeps game rules and enriches descriptive fields', async () => {
  const result = await fusion('pokemon', 'bulbasaur', async path => {
    assert.equal(path, 'pokemon/bulbasaur');
    return { stats: [], moves: [], sprites: { front_default: 'example.png' } };
  });
  assert.ok(result.dados.stats.length);
  assert.ok(result.dados.moves.length);
  assert.equal(result.dados.sprites.front_default, 'example.png');
  assert.deepEqual(result.referencia_pokeapi.stats, []);
});
test('fusion never maps synthetic form IDs to PokeAPI', async () => {
  const result = await fusion('pokemon', 'charizard_1', async () => { throw Error('must not fetch'); });
  assert.equal(result.status_pokeapi, 'sem_correspondencia');
  assert.equal(result.dados.stats[1].base_stat, 130);
});
test('fusion returns local data during external failure', async () => {
  const result = await fusion('move', 'vine-whip', async () => {
    const error = Error('timeout'); error.code = 'ETIMEDOUT'; throw error;
  });
  assert.equal(result.status_pokeapi, 'indisponivel');
  assert.equal(result.dados.power, 45);
});
test('fusion does not substitute missing game records', async () => {
  await assert.rejects(fusion('pokemon', 'unknown', async () => ({})), e => e.response.status === 404);
});
