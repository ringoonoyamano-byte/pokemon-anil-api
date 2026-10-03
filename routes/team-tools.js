const router = require('express').Router();
const { getDb } = require('../database/db');
const { pokeFetch } = require('../middleware/cache');
const upstreamError = require('../middleware/upstream-error');
const { parseText, normalizeMembers, exportText } = require('../lib/team-transfer');
const modes = require('../data/anil.json').modos_de_jogo.map(m => m.id);
router.post('/import', async (req, res) => {
  let members;
  const b = req.body || {};
  try {
    if (typeof b.nome !== 'string' || !b.nome.trim() || !modes.includes(b.modo_anil ?? 'complete')
        || (b.descricao !== undefined && b.descricao !== null && typeof b.descricao !== 'string')) throw new Error('Nome, descrição ou modo inválido.');
    members = normalizeMembers(b.texto !== undefined ? parseText(b.texto) : b.membros);
  } catch (error) { return res.status(400).json({ erro: error.message }); }
  try {
    const data = await Promise.all(members.map(m => pokeFetch('pokemon/' + m.pokemon.toLowerCase())));
    const db = getDb();
    const id = db.transaction(() => {
      const team = db.prepare('INSERT INTO teams (nome, modo_anil, descricao) VALUES (?, ?, ?)').run(b.nome.trim(), b.modo_anil ?? 'complete', b.descricao ?? null);
      const insert = db.prepare('INSERT INTO team_members (team_id, slot, pokemon_id, pokemon_nome, apelido, nivel, natureza, habilidade, item, moves, evs, ivs) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
      members.forEach((m, i) => insert.run(team.lastInsertRowid, m.slot, data[i].id, data[i].name, m.apelido ?? null, m.nivel, m.natureza, m.habilidade ?? null, m.item ?? null, JSON.stringify(m.moves), JSON.stringify({ hp:0, atk:0, def:0, spa:0, spd:0, spe:0, ...m.evs }), JSON.stringify({ hp:31, atk:31, def:31, spa:31, spd:31, spe:31, ...m.ivs })));
      return Number(team.lastInsertRowid);
    })();
    res.status(201).json({ id, total_membros: members.length, mensagem: 'Time importado.' });
  } catch (error) { upstreamError(res, error, 'Pokémon da importação não encontrado.'); }
});
router.get('/:id/export', (req, res) => {
  if (req.query.format !== undefined && !['json','text'].includes(req.query.format)) return res.status(400).json({ erro: 'format deve ser json ou text.' });
  const db = getDb(), team = db.prepare('SELECT * FROM teams WHERE id = ?').get(req.params.id);
  if (!team) return res.status(404).json({ erro: 'Time não encontrado.' });
  const members = db.prepare('SELECT * FROM team_members WHERE team_id = ? ORDER BY slot').all(team.id).map(m => ({ slot:m.slot, pokemon:m.pokemon_nome, apelido:m.apelido, nivel:m.nivel, natureza:m.natureza, habilidade:m.habilidade, item:m.item, moves:JSON.parse(m.moves), evs:JSON.parse(m.evs), ivs:JSON.parse(m.ivs) }));
  if (req.query.format === 'text') return res.type('text/plain').send(exportText(members));
  res.json({ nome:team.nome, modo_anil:team.modo_anil, descricao:team.descricao ?? undefined, membros:members });
});
router.post('/:id/validate', async (req, res) => {
  const version = req.body?.version;
  if (version !== undefined && (typeof version !== 'string' || !/^[a-z0-9-]+$/.test(version))) return res.status(400).json({ erro: 'version inválida.' });
  const db = getDb(), team = db.prepare('SELECT * FROM teams WHERE id = ?').get(req.params.id);
  if (!team) return res.status(404).json({ erro: 'Time não encontrado.' });
  const rows = db.prepare('SELECT * FROM team_members WHERE team_id = ? ORDER BY slot').all(team.id);
  const errors = [], warnings = ['Disponibilidade e regras exclusivas do Añil não verificadas.'];
  let commonTypes;
  if (!version) warnings.push('Golpes comparados com todas as versões da PokeAPI; informe version para restringir.');
  try {
    if (!rows.length) errors.push('Time sem membros.');
    else try { normalizeMembers(rows.map(m => ({ ...m, pokemon:m.pokemon_nome, moves:JSON.parse(m.moves), evs:JSON.parse(m.evs), ivs:JSON.parse(m.ivs) }))); } catch (error) { errors.push(error.message); }
    for (const m of rows) {
      const p = await pokeFetch('pokemon/' + m.pokemon_id);
      const types = p.types.map(t => t.type.name);
      commonTypes = commonTypes === undefined ? types : commonTypes.filter(t => types.includes(t));
      if (team.modo_anil === 'classic') {
        const species = await pokeFetch(p.species.url);
        if (!['generation-i','generation-ii'].includes(species.generation.name)) errors.push(`Slot ${m.slot}: espécie fora das gerações 1 e 2 do perfil clássico histórico.`);
      }
      if (m.habilidade && !p.abilities.some(a => a.ability.name === m.habilidade)) errors.push(`Slot ${m.slot}: habilidade incompatível na PokeAPI.`);
      for (const move of JSON.parse(m.moves)) {
        const entry = p.moves.find(e => e.move.name === move);
        if (!entry || !entry.version_group_details.some(d => (!version || d.version_group.name === version) && (d.move_learn_method.name !== 'level-up' || d.level_learned_at <= m.nivel))) errors.push(`Slot ${m.slot}: golpe ${move} incompatível com os filtros.`);
      }
    }
    if (team.modo_anil === 'monotype' && rows.length && !commonTypes.length) errors.push('Time Monotype sem um tipo comum entre os membros.');
    res.json({ valido_base: errors.length === 0, validacao_anil: 'pendente', fonte:'PokeAPI', version:version ?? null, erros:errors, avisos:warnings });
  } catch (error) { upstreamError(res, error, 'Pokémon não encontrado.'); }
});
module.exports = router;
