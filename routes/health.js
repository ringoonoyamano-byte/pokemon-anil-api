const router = require('express').Router();
const { getDb } = require('../database/db');
router.get('/health', (_req, res) => res.json({ status: 'ok', versao: require('../package.json').version }));
router.get('/ready', (_req, res) => {
  try {
    getDb().prepare('SELECT 1 AS ok').get();
    res.json({ status: 'ok', banco: 'ok' });
  } catch {
    res.status(503).json({ status: 'indisponivel', banco: 'indisponivel' });
  }
});
module.exports = router;
