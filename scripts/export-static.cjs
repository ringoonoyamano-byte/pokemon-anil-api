// Export only public game metadata. No SQLite, accounts, teams or secrets.
const fs=require('node:fs'),path=require('node:path');
const game=require('../lib/game-data'),{loadResource,datasetId}=require('../lib/dataset-resources');
const pokemon=require('../routes/routes_pokemon'),moves=require('../routes/moves');
function request(router,url){return new Promise((resolve,reject)=>{
 const req={method:'GET',url,originalUrl:url,query:{},headers:{}};
 const res={statusCode:200,status(n){this.statusCode=n;return this;},json(data){this.statusCode===200?resolve(data):reject(new Error(url+': '+JSON.stringify(data)));}};
 router.handle(req,res,err=>reject(err||new Error('Unmatched '+url)));
});}
(async()=>{
 const out=path.resolve(process.argv[2]||path.join(__dirname,'../public-data'));
 fs.mkdirSync(out,{recursive:true});
 const write=(name,data)=>fs.writeFileSync(path.join(out,name+'.json'),JSON.stringify(data));
 const raw=loadResource('species'),all=[] ,evolutions={};
 for(const row of raw){const p=game.pokemon(row);all.push(await request(pokemon,'/'+p.id));if(row.form===0)evolutions[p.id]=await request(pokemon,'/'+p.id+'/evolution');}
 const attacks=[];for(const row of loadResource('moves')){const m=game.move(row);attacks.push(await request(moves,'/'+m.name));}
 write('pokemon',all);write('moves',attacks);write('evolutions',evolutions);
 for(const name of ['metadata','species','abilities','items','types'])write(name,loadResource(name));
 write('raw-moves',loadResource('moves'));
 write('manifest',{nome:'Pokemon game data',versao:require('../package.json').version,dataset_ativo:datasetId,format:1,pokemon:all.length,moves:attacks.length});
 fs.writeFileSync(path.join(out,'index.html'),'<!doctype html><meta charset="utf-8"><title>Pokémon data</title><h1>Dados estáticos de Pokémon</h1><p>Dados públicos para clientes web. O servidor Node e endpoints de escrita não são executados aqui.</p><a href="manifest.json">Manifesto JSON</a>');
 console.log('Exported '+all.length+' Pokemon, '+attacks.length+' moves to '+out);
})().catch(e=>{console.error(e);process.exitCode=1;});
