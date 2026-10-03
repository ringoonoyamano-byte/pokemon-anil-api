const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const Database = require('better-sqlite3');
const db = new Database(':memory:');
const dbPath = require.resolve('../database/db'), cachePath = require.resolve('../middleware/cache');
let server, base;
before(async () => {
  db.exec(`CREATE TABLE teams(id INTEGER PRIMARY KEY, nome TEXT, modo_anil TEXT, descricao TEXT, criado_em INTEGER DEFAULT 1, atualizado_em INTEGER DEFAULT 1); CREATE TABLE team_members(team_id INTEGER, slot INTEGER, pokemon_id INTEGER, pokemon_nome TEXT, apelido TEXT, nivel INTEGER, natureza TEXT, habilidade TEXT, item TEXT, moves TEXT, evs TEXT, ivs TEXT);`);
  db.exec('CREATE TABLE anil_custom(id INTEGER PRIMARY KEY, categoria TEXT, chave TEXT UNIQUE, nome TEXT, dados TEXT, fonte TEXT, criado_em INTEGER DEFAULT 1, atualizado_em INTEGER DEFAULT 1)');
  require.cache[dbPath] = { exports: { getDb: () => db }, loaded: true };
  require.cache[cachePath] = { exports: { pokeFetch: async path => {
    if (path.includes('missing')) throw { response: { status:404 } };
    return { id:25, name:'pikachu', types:[{ type:{name:'electric'} }], abilities:[{ability:{name:'static'}}], moves:[{move:{name:'tackle'},version_group_details:[{version_group:{name:'red-blue'},move_learn_method:{name:'level-up'},level_learned_at:5}]}] };
  } }, loaded: true };
  const app = express(); app.use(express.json()); app.use('/teams', require('../routes/team-tools')); app.use('/teams', require('../routes/teams')); app.use('/anil',require('../routes/anil')); app.use('/custom',require('../routes/custom'));
  app.use((_error, _req, res, _next) => res.status(500).json({ erro:'test database failure' }));
  server = app.listen(0,'127.0.0.1'); await new Promise(r => server.once('listening',r)); base=`http://127.0.0.1:${server.address().port}`;
});
after(async () => { await new Promise(r => server.close(r)); db.close(); });
async function post(path, body) { const r=await fetch(base+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}); return {status:r.status,data:await r.json()}; }
test('JSON import, export and validation round trip on a temporary database', async () => {
  const imported=await post('/teams/import',{nome:'Example',membros:[{pokemon:'pikachu',moves:['tackle'],habilidade:'static',ivs:{hp:0}}]}); assert.equal(imported.status,201);
  const id=imported.data.id;
  const exported=await (await fetch(base+`/teams/${id}/export`)).json(); assert.equal(exported.membros[0].ivs.hp,0);
  assert.equal((await post(`/teams/${id}/validate`,{version:'red-blue'})).data.valido_base,true);
  const text=await (await fetch(base+`/teams/${id}/export?format=text`)).text();
  assert.equal((await post('/teams/import',{nome:'Text',texto:text})).status,201);
});
test('failed imports leave no partial teams', async () => {
  const count=db.prepare('SELECT COUNT(*) n FROM teams').get().n;
  assert.equal((await post('/teams/import',{nome:'Bad',membros:[{pokemon:'pikachu'},{pokemon:'missing'}]})).status,404);
  assert.equal((await post('/teams/import',{nome:'Bad',membros:[{pokemon:'pikachu',evs:{atk:252,spe:252,hp:7}}]})).status,400);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM teams').get().n,count);
});
test('invalid learnsets and incomplete Anil verification are explicit', async () => {
  const imported=await post('/teams/import',{nome:'Invalid move',membros:[{pokemon:'pikachu',moves:['surf']}]});
  const result=await post(`/teams/${imported.data.id}/validate`,{version:'red-blue'});
  assert.equal(result.data.valido_base,false); assert.equal(result.data.validacao_anil,'pendente');
});
test('dataset filters isolate historical rules and metadata', async () => {
  const list=await (await fetch(base+'/anil/datasets?edition=azul_ptbr_online')).json(); assert.equal(list.total,1);
  const legacy=await (await fetch(base+'/anil/datasets/anil-3.06-historico')).json(); assert.equal(legacy.dataset.status,'historico_nao_validado'); assert.equal(legacy.dados.online_ptbr,undefined);
});
test('database failure during import rolls back the team and members', async () => {
  const count=db.prepare('SELECT COUNT(*) n FROM teams').get().n;
  db.exec("CREATE TRIGGER reject_member BEFORE INSERT ON team_members BEGIN SELECT RAISE(ABORT, 'test failure'); END;");
  try {
    const result=await post('/teams/import',{nome:'Rollback',membros:[{pokemon:'pikachu'}]});
    assert.equal(result.status,500);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM teams').get().n,count);
  } finally { db.exec('DROP TRIGGER reject_member'); }
});
test('team pagination returns stable pages, filtered totals and member counts', async () => {
  const first=await(await fetch(base+'/teams?limit=1&offset=0&modo=complete')).json();
  const second=await(await fetch(base+'/teams?limit=1&offset=1&modo=complete')).json();
  assert.equal(first.total,db.prepare("SELECT COUNT(*) n FROM teams WHERE modo_anil='complete'").get().n);
  assert.equal(first.total_pagina,1);assert.equal(first.times[0].total_membros,1);
  assert.notEqual(first.times[0].id,second.times[0].id);
  assert.ok(first.times[0].id>second.times[0].id);
  assert.equal((await fetch(base+'/teams?modo[]=complete')).status,400);
});
test('team update distinguishes omitted description from explicit null', async () => {
  const imported=await post('/teams/import',{nome:'Description',descricao:'keep',membros:[{pokemon:'pikachu'}]});
  const url=base+`/teams/${imported.data.id}`;
  const update=async body=>await(await fetch(url,{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify(body)})).json();
  assert.equal((await update({nome:'Renamed'})).time.descricao,'keep');
  assert.equal((await update({descricao:null})).time.descricao,null);
  assert.equal((await update({descricao:''})).time.descricao,'');
});
test('custom update preserves omitted source and clears explicit null', async () => {
  assert.equal((await post('/custom',{categoria:'outro',chave:'source',nome:'Source',dados:{},fonte:'https://example.com'})).status,201);
  const update=async body=>await(await fetch(base+'/custom/source',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify(body)})).json();
  assert.equal((await update({nome:'Renamed'})).registro.fonte,'https://example.com');
  assert.equal((await update({fonte:null})).registro.fonte,null);
});
test('cloning rolls back the new team if copying a member fails', async () => {
  const imported=await post('/teams/import',{nome:'Clone source',descricao:null,membros:[{pokemon:'pikachu'}]});
  assert.equal(imported.status,201);
  const count=db.prepare('SELECT COUNT(*) n FROM teams').get().n;
  db.exec("CREATE TRIGGER reject_clone BEFORE INSERT ON team_members BEGIN SELECT RAISE(ABORT, 'test failure'); END;");
  try {
    assert.equal((await post(`/teams/${imported.data.id}/clone`,{})).status,500);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM teams').get().n,count);
  } finally { db.exec('DROP TRIGGER reject_clone'); }
  assert.equal((await post(`/teams/${imported.data.id}/clone`,{})).status,201);
});
