const router = require('express').Router();
const { pokeFetch } = require('../middleware/cache');
const { pagination } = require('../middleware/validation');
const upstreamError = require('../middleware/upstream-error');
router.get('/', pagination, async (req, res) => {
  const { q, type, ability, generation, min_bst } = req.query;
  if ([q, type, ability, generation].some(v => v !== undefined && (typeof v !== 'string' || !/^[a-z0-9-]+$/i.test(v)))
      || (min_bst !== undefined && (typeof min_bst !== 'string' || !/^\d+$/.test(min_bst) || Number(min_bst) > 2000))) {
    return res.status(400).json({ erro: 'Filtros inválidos.' });
  }
  try {
    let list = (await pokeFetch('pokemon?limit=2000&offset=0')).results;
    if (q) list = list.filter(p => p.name.includes(q.toLowerCase()));
    if (type) { const names = new Set((await pokeFetch(`type/${type.toLowerCase()}`)).pokemon.map(p => p.pokemon.name)); list = list.filter(p => names.has(p.name)); }
    if (ability) { const names = new Set((await pokeFetch(`ability/${ability.toLowerCase()}`)).pokemon.map(p => p.pokemon.name)); list = list.filter(p => names.has(p.name)); }
    let species;
    if (generation) species = new Set((await pokeFetch(`generation/${generation.toLowerCase()}`)).pokemon_species.map(p => p.name));
    const limit = Number(req.query.limit ?? 50), offset = Number(req.query.offset ?? 0);
    const needsFullScan = !!species || min_bst !== undefined;
    const countBeforePaging = list.length;
    if (!needsFullScan) list = list.slice(offset, offset + limit);
    const results = [];
    // Lotes pequenos limitam as consultas simultâneas ao serviço externo.
    for (let i = 0; i < list.length; i += 8) {
      const batch = await Promise.all(list.slice(i, i + 8).map(p => pokeFetch(p.url)));
      for (const p of batch) {
        const bst = p.stats.reduce((n, s) => n + s.base_stat, 0);
        if ((!species || species.has(p.species.name)) && (min_bst === undefined || bst >= Number(min_bst))) {
          results.push({ id: p.id, nome: p.name, tipos: p.types.map(t => t.type.name), habilidades: p.abilities.map(a => a.ability.name), total_stats_base: bst });
        }
      }
    }
    res.json({ fonte: 'PokeAPI', escopo: 'Série principal; disponibilidade no Añil não verificada.', total: needsFullScan ? results.length : countBeforePaging, limit, offset, resultados: needsFullScan ? results.slice(offset, offset + limit) : results });
  } catch (error) { upstreamError(res, error, 'Filtro não encontrado.'); }
});
module.exports = router;
