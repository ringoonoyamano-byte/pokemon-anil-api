module.exports = function upstreamError(res, error, notFound) {
  if (error.response?.status === 404) return res.status(404).json({ erro: notFound });
  if (['ECONNABORTED', 'ETIMEDOUT'].includes(error.code)) {
    return res.status(504).json({ erro: 'A PokeAPI não respondeu dentro do prazo.' });
  }
  if (error.isAxiosError || error.response || error.code === 'EACCES') {
    return res.status(502).json({ erro: 'Falha ao consultar a PokeAPI.' });
  }
  return res.status(500).json({ erro: 'Falha interna ao processar os dados.' });
};
