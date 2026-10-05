const { source, datasetId, version: gameVersion } = require('../lib/game-data');
const express = require('express');
const { pokeFetch } = require('../middleware/cache');
const { pagination } = require('../middleware/validation');
const upstreamError = require('../middleware/upstream-error');

module.exports = function catalog(resource) {
  const router = express.Router();
  router.use(pagination);
  router.get('/', async (req, res) => {
    const limit = Number(req.query.limit ?? 50), offset = Number(req.query.offset ?? 0);
    try {
      const data = await pokeFetch(`${resource}?limit=${limit}&offset=${offset}`);
      res.json({ fonte: source, dataset_id: datasetId, total: data.count, limit, offset,
        resultados: data.results.map(row=>({...row,url:`/${resource === 'ability' ? 'abilities' : 'items'}/${row.name}`})) });
    } catch (error) { upstreamError(res, error, 'Catálogo não encontrado.'); }
  });
  router.get('/:id', async (req, res) => {
    if (!/^[a-z0-9_-]+$/i.test(req.params.id)) return res.status(400).json({ erro: 'Identificador inválido.' });
    try {
      const data = await pokeFetch(`${resource}/${req.params.id.toLowerCase()}`);
      res.json({ fonte: source, dataset_id: datasetId, escopo: 'Dados extraídos da compilação local do jogo.', dados: data });
    } catch (error) { upstreamError(res, error, 'Registro não encontrado.'); }
  });
  return router;
};
