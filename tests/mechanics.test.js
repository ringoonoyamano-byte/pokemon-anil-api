const { test } = require('node:test');
const assert = require('node:assert/strict');
const { getEffectiveness } = require('../lib/types');
const { calcStat } = require('../lib/stats');
test('dual types combine immunity, double weakness and cancelling modifiers', () => {
  assert.equal(getEffectiveness('electric', ['water', 'ground']), 0);
  assert.equal(getEffectiveness('rock', ['fire', 'flying']), 4);
  assert.equal(getEffectiveness('fire', ['grass', 'water']), 1);
});
test('stat calculations apply EVs and nature', () => {
  assert.equal(calcStat(55, 31, 252, 50, 'adamant', 'atk'), 117);
  assert.equal(calcStat(35, 0, 0, 50, 'adamant', 'hp'), 95);
});
