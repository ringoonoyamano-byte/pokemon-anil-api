const { test } = require('node:test');
const assert = require('node:assert/strict');
const { statBlock, pagination } = require('../middleware/validation');
test('EV and IV validation preserves zero and rejects invalid blocks', () => {
  assert.ok(statBlock({ atk: 0 }, 31));
  assert.ok(statBlock({ atk: 252, spe: 252, hp: 6 }, 252, 510));
  for (const block of [null, [], { unknown: 1 }, { atk: -1 }, { atk: 1.5 }, { atk: 253 }, { atk: 252, spe: 252, hp: 7 }]) {
    assert.equal(statBlock(block, 252, 510), false);
  }
});
test('pagination rejects negative, oversized and structured parameters', () => {
  for (const query of [{ limit: '-1' }, { limit: '101' }, { offset: 'NaN' }, { limit: ['1'] }]) {
    let status, allowed = false;
    pagination({ query }, { status(n) { status = n; return this; }, json() {} }, () => { allowed = true; });
    assert.equal(status, 400); assert.equal(allowed, false);
  }
});
test('upstream failures are distinct from missing resources', () => {
  const handler = require('../middleware/upstream-error');
  for (const [error, expected] of [[{ response: { status: 404 } }, 404], [{ code: 'ETIMEDOUT' }, 504], [{ isAxiosError: true }, 502], [new Error('internal'), 500]]) {
    let status;
    handler({ status(n) { status = n; return this; }, json() {} }, error, 'missing');
    assert.equal(status, expected);
  }
});
