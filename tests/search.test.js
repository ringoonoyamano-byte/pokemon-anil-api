const { test }=require('node:test');
const assert=require('node:assert/strict');
const express=require('express');
const pokemon={id:25,name:'pikachu',species:{name:'pikachu'},types:[{type:{name:'electric'}}],abilities:[{ability:{name:'static'}}],stats:[{base_stat:100}]};
require.cache[require.resolve('../middleware/cache')]={loaded:true,exports:{pokeFetch:async path=> {
  if(path.startsWith('pokemon?')) return {results:[{name:'pikachu',url:'pokemon/25'},{name:'other',url:'pokemon/1'}]};
  if(path.startsWith('type/')) return {pokemon:[{pokemon:{name:'pikachu'}}]};
  if(path.startsWith('ability/')) return {pokemon:[{pokemon:{name:'pikachu'}}]};
  if(path.startsWith('generation/')) return {pokemon_species:[{name:'pikachu'}]};
  return path==='pokemon/25'?pokemon:{...pokemon,id:1,name:'other',species:{name:'other'}};
}}};
test('search combines filters and applies pagination after stat and generation filtering',async()=>{
  const app=express();app.use('/pokemon',require('../routes/search'));
  const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  const base=`http://127.0.0.1:${server.address().port}`;
  try {
    const result=await(await fetch(base+'/pokemon?type=electric&ability=static&generation=1&min_bst=90&limit=1')).json();
    assert.equal(result.total,1);assert.equal(result.resultados[0].nome,'pikachu');
    const page=await(await fetch(base+'/pokemon?limit=1&offset=1')).json();assert.equal(page.total,2);assert.equal(page.resultados[0].nome,'other');
    assert.equal((await fetch(base+'/pokemon?type[]=electric')).status,400);
  }finally{await new Promise(r=>server.close(r));}
});
