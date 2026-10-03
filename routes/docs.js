const router = require('express').Router();
const path = require('node:path');
router.get('/openapi.json', (_req, res) => res.json(require('../docs/openapi.json')));
router.get('/docs', (_req, res) => res.type('text/plain').sendFile(path.join(__dirname, '../docs/API.md')));
module.exports = router;
