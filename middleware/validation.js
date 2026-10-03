const statKeys = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
const integerIn = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;
const text = value => typeof value === 'string' && value.trim().length > 0;
function statBlock(value, max, total) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.entries(value).every(([key, n]) => statKeys.includes(key) && integerIn(n, 0, max))
    && (total === undefined || Object.values(value).reduce((sum, n) => sum + n, 0) <= total);
}
function pagination(req, res, next) {
  for (const [key, min, max] of [['limit', 1, 100], ['offset', 0, Number.MAX_SAFE_INTEGER]]) {
    const value = req.query[key];
    if (value !== undefined && (typeof value !== 'string' || !/^\d+$/.test(value) || !integerIn(Number(value), min, max))) {
      return res.status(400).json({ erro: `Parâmetro ${key} inválido.` });
    }
  }
  next();
}
module.exports = { integerIn, text, statBlock, pagination };
