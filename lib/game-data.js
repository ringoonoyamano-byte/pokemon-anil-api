const {loadResource,datasetId}=require('./dataset-resources');
const tables={pokemon:loadResource('species'),move:loadResource('moves'),ability:loadResource('abilities'),item:loadResource('items'),type:loadResource('types')};
const version='azul-4-0-6',source='Pokemon Anil — dados locais do jogo';
const normalize=v=>String(v).toLowerCase().replace(/[^a-z0-9]/g,'');
const slug=v=>String(v).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
const named=r=>slug(r.names?.en || r.id);
const base=tables.pokemon.filter(r=>r.form===0);
const numbers=new Map(base.map((r,i)=>[r.species,i+1]));
const ids=new Map(tables.pokemon.map((r,i)=>[r.id,r.form===0?numbers.get(r.species):10001+i]));
const generations=['i','ii','iii','iv','v','vi','vii','viii','ix'];
function missing(){const e=new Error('Registro não encontrado nos dados do jogo.');e.response={status:404};throw e;}
function find(rows,key,numeric=false){return rows.find(r=>normalize(r.id)===normalize(key)||normalize(named(r))===normalize(key)||(numeric&&/^\d+$/.test(key)&&ids.get(r.id)===Number(key)))||missing();}
function ref(r,resource){const name=resource==='pokemon'?slug(r.id):named(r);return {name,url:`${resource}/${name}`};}
function moveRef(id){const r=tables.move.find(m=>m.id===id);return r?ref(r,'move'):{name:slug(id),url:`move/${slug(id)}`};}
function abilityRef(id){const r=tables.ability.find(a=>a.id===id);return r?ref(r,'ability'):{name:slug(id)};}
function pokemon(r){
 const learned=new Map();
 const add=(id,method,level)=>{if(!learned.has(id))learned.set(id,{move:moveRef(id),version_group_details:[]});learned.get(id).version_group_details.push({move_learn_method:{name:method},level_learned_at:level,version_group:{name:version}});};
 r.moves.forEach(([level,id])=>add(id,'level-up',level));r.tutor_moves.forEach(id=>add(id,'tutor',0));r.egg_moves.forEach(id=>add(id,'egg',0));
 return {id:ids.get(r.id),name:slug(r.id),game_id:r.id,form:r.form,species:{name:slug(r.species),url:`pokemon-species/${slug(r.species)}`},types:r.types.map(t=>({type:{name:slug(t)}})),stats:['HP','ATTACK','DEFENSE','SPECIAL_ATTACK','SPECIAL_DEFENSE','SPEED'].map(k=>({stat:{name:slug(k)},base_stat:r.base_stats[k]})),abilities:[...r.abilities.map(id=>({ability:abilityRef(id),is_hidden:false})),...r.hidden_abilities.map(id=>({ability:abilityRef(id),is_hidden:true}))],moves:[...learned.values()],height:r.height,weight:r.weight,sprites:{front_default:null},dados_jogo:r};
}
function speciesData(r){const gender={Female50Percent:4,FemaleOneEighth:1,Female25Percent:2,Female75Percent:6,AlwaysMale:0,AlwaysFemale:8,Genderless:-1};return {name:slug(r.species),egg_groups:r.egg_groups.map(n=>({name:slug(n)})),gender_rate:gender[r.gender_ratio]??null,hatch_counter:null,hatch_steps:r.hatch_steps,generation:{name:`generation-${generations[r.generation-1]}`},evolution_chain:{url:`evolution-chain/${slug(r.id)}`}};}
function move(r){return {id:r.id,name:named(r),type:{name:slug(r.type)},damage_class:{name:r.category},power:r.power,accuracy:r.accuracy,pp:r.total_pp,priority:r.priority,target:{name:r.target},effect_chance:r.effect_chance,names:r.names?.pt_br?[{name:r.names.pt_br,language:{name:'pt-BR'}}]:[],effect_entries:[],flavor_text_entries:[],stat_changes:[],generation:{name:null},meta:null,dados_jogo:r};}
function type(r){const relations={};const damage=(a,d)=>d.immunities.includes(a.id)?0:d.weaknesses.includes(a.id)?2:d.resistances.includes(a.id)?0.5:1;for(const [label,val] of [['double',2],['half',0.5],['no',0]]){relations[`${label}_damage_to`]=tables.type.filter(d=>damage(r,d)===val).map(t=>({name:slug(t.id)}));relations[`${label}_damage_from`]=tables.type.filter(a=>damage(a,r)===val).map(t=>({name:slug(t.id)}));}return {id:r.id,name:slug(r.id),damage_relations:relations,pokemon:tables.pokemon.filter(s=>s.types.includes(r.id)).map(s=>({pokemon:ref(s,'pokemon')})),moves:tables.move.filter(m=>m.type===r.id).map(m=>ref(m,'move')),dados_jogo:r};}
function details([target,method,param]){return {metodo_jogo:method,parametro_jogo:param,min_level:method.startsWith('Level')||['AttackGreater','DefenseGreater','AtkDefEqual','Silcoon','Cascoon','Ninjask','Shedinja'].includes(method)?param:null,item:method.startsWith('Item')?{name:slug(param)}:null,trigger:{name:method}};}
function chain(r,d=[],seen=new Set()){if(seen.has(r.id))return null;const visited=new Set([...seen,r.id]);return {species:{name:slug(r.id),url:`pokemon-species/${ids.get(r.id)}/`},evolution_details:d,evolves_to:r.evolutions.filter(e=>!e[3]&&e[1]!=='None').map(e=>{const next=tables.pokemon.find(s=>s.id===e[0]);return next?chain(next,[details(e)],visited):null;}).filter(Boolean)};}
async function pokeFetch(input){
 if(typeof input!=='string'||input.startsWith('http'))return missing();
 const [pathname,query='']=input.replace(/^\//,'').replace(/\/$/,'').split('?');const [resource,key]=pathname.split('/');
 if(!key&&tables[resource]){const p=new URLSearchParams(query),limit=Number(p.get('limit')??50),offset=Number(p.get('offset')??0);return {count:tables[resource].length,results:tables[resource].slice(offset,offset+limit).map(r=>ref(r,resource))};}
 if(resource==='pokemon')return pokemon(find(tables.pokemon,key,true));
 if(resource==='pokemon-species')return speciesData(find(tables.pokemon,key,true));
 if(resource==='move')return move(find(tables.move,key));
 if(resource==='type')return type(find(tables.type,key));
 if(resource==='ability'||resource==='item'){const r=find(tables[resource],key);return {...r,name:named(r),pokemon:resource==='ability'?tables.pokemon.filter(s=>[...s.abilities,...s.hidden_abilities].includes(r.id)).map(s=>({pokemon:ref(s,'pokemon')})):undefined};}
 if(resource==='generation'){const gen=/^\d+$/.test(key)?Number(key):generations.indexOf(key.replace('generation-',''))+1;if(gen<1||gen>9)return missing();return {pokemon_species:base.filter(s=>s.generation===gen).map(s=>({name:slug(s.species)}))};}
 if(resource==='move-damage-class')return {moves:tables.move.filter(m=>m.category===key).map(m=>ref(m,'move')),descriptions:[]};
 if(resource==='evolution-chain'){let r=find(tables.pokemon,key,true);const seen=new Set();while(!seen.has(r.id)){seen.add(r.id);const parent=tables.pokemon.find(s=>s.form===0&&s.evolutions.some(e=>!e[3]&&e[1]!=='None'&&e[0]===r.id));if(!parent)break;r=parent;}return {chain:chain(r)};}
 return missing();
}
module.exports={pokeFetch,source,datasetId,version,pokemon,move,species:tables.pokemon,types:tables.type,normalize};
