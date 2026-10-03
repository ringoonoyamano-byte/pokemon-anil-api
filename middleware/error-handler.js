module.exports = function errorHandler(err, _req, res, _next) {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ erro: 'JSON inválido.' });
  if (err.type === 'entity.too.large') return res.status(413).json({ erro: 'Corpo da requisição excede o limite.' });
  console.error('[ERRO]', err.stack);
  res.status(500).json({ erro: 'Erro interno no servidor.', detalhe: process.env.NODE_ENV === 'development' ? err.message : undefined });
};
