const router = require('express').Router();
const { pokeFetch } = require('../middleware/cache');
const upstreamError = require('../middleware/upstream-error');
const { integerIn, statBlock } = require('../middleware/validation');
const { calcStat, NATUREZAS } = require('../lib/stats');
const { source, datasetId } = require('../lib/game-data');
router.post('/calculate', async (req, res) => {
  const { pokemon, nivel = 50, natureza = 'hardy', ivs = {}, evs = {} } = req.body || {};
  if (!/^[a-z0-9_-]+$/i.test(String(pokemon ?? '')) || !integerIn(nivel, 1, 100)
      || typeof natureza !== 'string' || !NATUREZAS.includes(natureza.toLowerCase())
      || !statBlock(ivs, 31) || !statBlock(evs, 252, 510)) {
    return res.status(400).json({ erro: 'Confira Pokémon, nível, natureza, IVs e EVs.' });
  }
  try {
    const data = await pokeFetch(`pokemon/${String(pokemon).toLowerCase()}`);
    const aliases = { attack: 'atk', defense: 'def', 'special-attack': 'spa', 'special-defense': 'spd', speed: 'spe' };
    const stats = {}, base = {}, appliedIvs = {}, appliedEvs = {};
    for (const entry of data.stats) {
      const key = aliases[entry.stat.name] || entry.stat.name;
      base[key] = entry.base_stat;
      appliedIvs[key] = ivs[key] ?? 31; appliedEvs[key] = evs[key] ?? 0;
      stats[key] = data.name === 'shedinja' && key === 'hp' ? 1 : calcStat(base[key], appliedIvs[key], appliedEvs[key], nivel, natureza.toLowerCase(), key);
    }
    res.json({ pokemon: data.name, nivel, natureza: natureza.toLowerCase(), fonte: source, dataset_id: datasetId, escopo: 'Stats do jogo, sem modificadores de batalha.', base, ivs: appliedIvs, evs: appliedEvs, stats });
  } catch (error) { upstreamError(res, error, 'Pokémon não encontrado.'); }
});
module.exports = router;
