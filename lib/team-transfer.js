const { NATUREZAS } = require('./stats');
const { integerIn, statBlock, text } = require('../middleware/validation');
const slug = value => value.trim().toLowerCase().replace(/\s+/g, '-');
function parseText(value) {
  if (typeof value !== 'string' || !value.trim()) throw new Error('Texto de time vazio.');
  return value.trim().split(/\r?\n\s*\r?\n/).map((block, i) => {
    const lines = block.split(/\r?\n/).map(s => s.trim());
    const head = lines.shift().split(' @ ');
    if (head.length > 2) throw new Error('Cabeçalho de time inválido.');
    const identity = head[0].match(/^(.+) \(([^()]+)\)$/);
    const m = { slot: i + 1, pokemon: slug(identity ? identity[2] : head[0]), moves: [], evs: {}, ivs: {} };
    if (identity) m.apelido = identity[1];
    if (head[1]) m.item = slug(head[1]);
    for (const line of lines) {
      if (line.startsWith('- ')) m.moves.push(slug(line.slice(2)));
      else if (line.startsWith('Ability: ')) m.habilidade = slug(line.slice(9));
      else if (line.startsWith('Level: ')) m.nivel = Number(line.slice(7));
      else if (/^[A-Za-z]+ Nature$/.test(line)) m.natureza = line.split(' ')[0].toLowerCase();
      else if (/^(EVs|IVs): /.test(line)) {
        const target = line.startsWith('EVs') ? m.evs : m.ivs;
        const keys = { HP: 'hp', Atk: 'atk', Def: 'def', SpA: 'spa', SpD: 'spd', Spe: 'spe' };
        for (const part of line.slice(5).split(' / ')) {
          const match = part.match(/^(\d+) (HP|Atk|Def|SpA|SpD|Spe)$/);
          if (!match) throw new Error('IVs ou EVs inválidos.');
          if (Object.hasOwn(target, keys[match[2]])) throw new Error('Stat repetido na linha de IVs ou EVs.');
          target[keys[match[2]]] = Number(match[1]);
        }
      } else throw new Error(`Linha não suportada: ${line}`);
    }
    return m;
  });
}
function normalizeMembers(members) {
  if (!Array.isArray(members) || members.length < 1 || members.length > 6) throw new Error('Envie de 1 a 6 membros.');
  const slots = new Set();
  return members.map((m, i) => {
    if (!m || typeof m !== 'object' || Array.isArray(m)) throw new Error('Membro inválido.');
    const out = { ...m, slot: m.slot ?? i + 1, nivel: m.nivel ?? 50, natureza: m.natureza ?? 'hardy', moves: m.moves ?? [], evs: m.evs ?? {}, ivs: m.ivs ?? {} };
    if (!text(out.pokemon) || !/^[a-z0-9-]+$/i.test(out.pokemon) || !integerIn(out.slot, 1, 6) || slots.has(out.slot)
        || !integerIn(out.nivel, 1, 100) || typeof out.natureza !== 'string' || !NATUREZAS.includes(out.natureza.toLowerCase())
        || !statBlock(out.evs, 252, 510) || !statBlock(out.ivs, 31) || !Array.isArray(out.moves) || out.moves.length > 4
        || !out.moves.every(v => text(v) && /^[a-z0-9-]+$/i.test(v)) || new Set(out.moves).size !== out.moves.length
        || ['habilidade','item','apelido'].some(k => out[k] !== undefined && out[k] !== null && (!text(out[k]) || /[\r\n]/.test(out[k])))
        || (out.apelido && / @ |\([^()]+\)$/.test(out.apelido))) throw new Error('Campos do membro inválidos.');
    slots.add(out.slot); out.natureza = out.natureza.toLowerCase();
    out.pokemon = out.pokemon.toLowerCase();
    out.moves = out.moves.map(move => move.toLowerCase());
    if (new Set(out.moves).size !== out.moves.length) throw new Error('Golpes repetidos.');
    if (out.habilidade) out.habilidade = slug(out.habilidade);
    if (out.item) out.item = slug(out.item);
    return out;
  });
}
function exportText(members) {
  const labels = { hp: 'HP', atk: 'Atk', def: 'Def', spa: 'SpA', spd: 'SpD', spe: 'Spe' };
  return members.map(m => {
    const lines = [(m.apelido ? `${m.apelido} (${m.pokemon})` : m.pokemon) + (m.item ? ' @ ' + m.item : '')];
    if (m.habilidade) lines.push('Ability: ' + m.habilidade);
    lines.push('Level: ' + m.nivel, m.natureza[0].toUpperCase() + m.natureza.slice(1) + ' Nature');
    for (const [key, label] of [['evs','EVs'],['ivs','IVs']]) {
      const values = Object.entries(m[key]).filter(([k]) => labels[k]).map(([k,v]) => `${v} ${labels[k]}`);
      if (values.length) lines.push(label + ': ' + values.join(' / '));
    }
    lines.push(...m.moves.map(move => '- ' + move));
    return lines.join('\n');
  }).join('\n\n');
}
module.exports = { parseText, normalizeMembers, exportText };
