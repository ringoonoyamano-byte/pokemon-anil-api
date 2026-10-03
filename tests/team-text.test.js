const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseText, normalizeMembers, exportText } = require('../lib/team-transfer');
test('text round trip preserves nicknames, forms and zero IVs', () => {
  const original = normalizeMembers([{ pokemon:'rotom-wash', apelido:'Lavadora', natureza:'bold', ivs:{atk:0}, moves:['hydro-pump'], item:'leftovers', habilidade:'levitate' }]);
  const imported = normalizeMembers(parseText(exportText(original)));
  assert.equal(imported[0].pokemon,'rotom-wash');
  assert.equal(imported[0].apelido,'Lavadora');
  assert.equal(imported[0].ivs.atk,0);
  assert.deepEqual(imported[0].moves,['hydro-pump']);
});
test('ambiguous headers, repeated stats and line injection are rejected', () => {
  assert.throws(() => parseText('pikachu @ item @ other'));
  assert.throws(() => parseText('pikachu\nIVs: 0 Atk / 31 Atk'));
  assert.throws(() => normalizeMembers([{pokemon:'pikachu',apelido:'Name\nAbility: static'}]));
  assert.throws(() => normalizeMembers([{pokemon:'pikachu',moves:['TACKLE','tackle']}]));
});
