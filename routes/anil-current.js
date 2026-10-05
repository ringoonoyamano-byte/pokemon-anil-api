const router = require('express').Router();
const { loadResource, datasetId, catalog } = require('../lib/dataset-resources');
const metadata = loadResource('metadata');
const mechanics = loadResource('mechanics_detected');
const { source, species, normalize } = require('../lib/game-data');
const mode = { id:'complete', nome:'Completo', ativo:true, obrigatorio:true };
const entries = Object.entries(mechanics).filter(([id])=>id!=='evidence' && id!=='edition')
  .map(([id, valor])=>({id,valor}));
const provenance = { fonte:source, dataset_id:datasetId, versao:'4.0.6', versao_interna:'4.0.3' };
router.get('/', (_req,res)=>res.json({...provenance,jogo:metadata,
  resumo:metadata.counts,modos:[mode],recursos:catalog(),
  endpoints:{pokemon:'/pokemon',golpes:'/moves',habilidades:'/abilities',itens:'/items',tipos:'/types',encontros:'/anil/encounters',treinadores:'/anil/trainers',mapas:'/anil/locations',raids:'/anil/raids',mecanicas:'/anil/mechanics',taxas:'/anil/rates'}}));
router.get('/modes', (_req,res)=>res.json({...provenance,total:1,modos:[mode]}));
router.get('/modes/:id', (req,res)=>req.params.id.toLowerCase()==='complete'?res.json({...provenance,...mode}):res.status(404).json({erro:'Modo não disponível nesta compilação.',modos_disponiveis:['complete']}));
router.get('/mechanics', (_req,res)=>res.json({...provenance,total:entries.length,mecanicas:entries,evidencias:mechanics.evidence}));
router.get('/mechanics/:id', (req,res)=>{
  const entry=entries.find(m=>m.id===req.params.id.toLowerCase());
  return entry?res.json({...provenance,...entry}):res.status(404).json({erro:'Mecânica não encontrada.'});
});
router.get('/rates', (_req,res)=>res.json({...provenance,shiny:{chance:String(6/65536),fracao:'6/65536',porcentagem:`${6/65536*100}%`,alteracao_pelo_servidor:true},nivel_maximo:mechanics.maximum_level}));
router.get('/locations', (_req,res)=>res.json({...provenance,total:loadResource('maps').length,locais:loadResource('maps'),regioes:loadResource('regions')}));
router.get('/encounters', (_req,res)=>res.json({...provenance,total:loadResource('encounters').length,encontros:loadResource('encounters')}));
router.get('/trainers', require('../middleware/validation').pagination, (req,res)=>{
  const limit=Number(req.query.limit??50),offset=Number(req.query.offset??0),rows=loadResource('trainers');
  res.json({...provenance,total:rows.length,limit,offset,treinadores:rows.slice(offset,offset+limit)});
});
router.get('/raids', (_req,res)=>res.json({...provenance,total:Object.keys(loadResource('raid_teams')).length,raids:loadResource('raid_teams')}));
function evolutions(query) {
  return species.flatMap(s=>s.evolutions.filter(e=>!e[3]&&e[1]!=='None')
    .map(e=>({pokemon:s.id,evolui_para:e[0],metodo:e[1],parametro:e[2],forma:s.form})))
    .filter(e=>!query||[e.pokemon,e.evolui_para].some(id=>normalize(id)===normalize(query)));
}
router.get('/evolution-changes', (_req,res)=>{const lista=evolutions();res.json({...provenance,descricao:'Evoluções desta compilação; inclui regras comuns e alterações do jogo.',total:lista.length,lista});});
router.get('/evolution-changes/:pokemon', (req,res)=>{const alteracoes=evolutions(req.params.pokemon);res.json({...provenance,pokemon:req.params.pokemon,alteracoes});});
router.get('/key-items', (_req,res)=>{const items=loadResource('items').filter(i=>i.pocket===8);res.json({...provenance,total:items.length,itens:items});});
module.exports = router;
