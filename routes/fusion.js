const router = require('express').Router();
const { fusion, resources } = require('../lib/fusion');
router.get('/:resource/:id', async (req, res) => {
  if (!resources.includes(req.params.resource)) {
    return res.status(400).json({ erro: 'Recurso de fusão inválido.', recursos: resources });
  }
  try { res.json(await fusion(req.params.resource, req.params.id)); }
  catch (error) { require('../middleware/upstream-error')(res, error, 'Registro não encontrado no jogo.'); }
});
module.exports = router;
