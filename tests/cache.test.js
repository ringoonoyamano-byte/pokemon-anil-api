const {test}=require('node:test');
const assert=require('node:assert/strict');
const {pokeFetch}=require('../middleware/cache');
const axios=require('axios');
test('gameplay reads ignore stale external cache and work without network',async()=>{
 const original=axios.get;axios.get=async()=>{throw new Error('network disabled');};
 try {
  const p=await pokeFetch('pokemon/25');assert.equal(p.name,'pikachu');
  const bulbasaur=await pokeFetch('pokemon/bulbasaur');
  assert.ok(bulbasaur.moves.some(m=>m.move.name==='acid'&&m.version_group_details.some(d=>d.level_learned_at===13)));
  const mega=await pokeFetch('pokemon/charizard_1');assert.equal(mega.stats[1].base_stat,130);assert.equal(mega.game_id,'CHARIZARD_1');
  assert.equal((await pokeFetch('move/vine-whip')).name,'vinewhip');
  assert.equal((await pokeFetch('ability/tough-claws')).id,'TOUGHCLAWS');
  assert.equal((await pokeFetch('item/REPEL')).price,400);
 }finally{axios.get=original;}
});
test('missing local records never fall back to external resources',async()=>{
 for(const path of ['pokemon/unknown','move/unknown','https://pokeapi.co/api/v2/pokemon/25'])await assert.rejects(pokeFetch(path),e=>e.response.status===404);
 const results=await Promise.all([pokeFetch('pokemon/25'),pokeFetch('pokemon/pikachu')]);assert.deepEqual(results[0],results[1]);
});
