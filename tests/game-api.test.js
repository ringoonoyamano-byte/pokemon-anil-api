const {test}=require('node:test');
const assert=require('node:assert/strict');
const express=require('express');
test('main API serves the game build consistently across catalogs and rules',async()=>{
  const app=express();
  app.use('/pokemon',require('../routes/search'));
  app.use('/pokemon',require('../routes/routes_pokemon'));
  app.use('/moves',require('../routes/moves'));
  app.use('/types',require('../routes/types'));
  app.use('/abilities',require('../routes/catalog')('ability'));
  app.use('/items',require('../routes/catalog')('item'));
  app.use('/anil',require('../routes/anil'));
  const server=app.listen(0,'127.0.0.1');
  await new Promise(r=>server.once('listening',r));
  const base=`http://127.0.0.1:${server.address().port}`;
  const get=async path=>{const response=await fetch(base+path);assert.equal(response.status,200,path);return response.json();};
  try{
    const p=await get('/pokemon/charizard_1');assert.equal(p.stats.atk,130);assert.equal(p.game_id,'CHARIZARD_1');assert.equal(p.sprite,null);
    const moves=await get('/pokemon/bulbasaur/moves?version=azul-4-0-6');assert.ok(moves.moves.some(m=>m.name==='acid'));
    const move=await get('/moves/vine-whip');assert.equal(move.poder,45);assert.equal(move.traducao_disponivel,false);
    assert.equal((await get('/moves?limit=1')).total,851);
    const chain=await get('/pokemon/ivysaur/evolution');assert.equal(chain.cadeia.name,'bulbasaur');assert.equal(chain.cadeia.evolui_para[0].nivel_minimo,16);
    const list=await get('/pokemon?type=fire&ability=tough-claws&min_bst=600');assert.ok(list.resultados.some(r=>r.nome==='charizard-1'));
    assert.equal((await get('/abilities')).total,328);assert.equal((await get('/items')).total,933);
    assert.equal((await get('/types/matchup/fire/grass')).multiplicador,2);
    assert.equal((await get('/anil/rates')).shiny.fracao,'6/65536');assert.equal((await get('/anil/modes')).total,1);
    assert.equal((await get('/anil/encounters')).total,103);assert.equal((await get('/anil/trainers?limit=1')).treinadores.length,1);
    assert.equal((await get('/anil/raids')).total,7);
    assert.equal((await get('/anil/gyms')).referencia_historica,true);
    assert.equal((await fetch(base+'/pokemon/unknown')).status,404);
  }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});
