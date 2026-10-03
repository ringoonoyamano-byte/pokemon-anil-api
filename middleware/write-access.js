const { timingSafeEqual } = require('node:crypto');

module.exports = function writeAccess(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const key = process.env.API_WRITE_KEY;
  if (!key) {
    const address = req.socket.remoteAddress;
    if (['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address)) return next();
    return res.status(403).json({ erro: 'Escrita remota desativada. Configure API_WRITE_KEY no servidor.' });
  }
  const header = req.get('authorization') || '';
  const supplied = Buffer.from(header.startsWith('Bearer ') ? header.slice(7) : '');
  const expected = Buffer.from(key);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    return res.status(401).json({ erro: 'Chave de escrita ausente ou inválida.' });
  }
  next();
};
