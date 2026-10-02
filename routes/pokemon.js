/* ==========================================================================
   PokéTama Añil — pokemon.js
   PokéAPI, espécies, stats, evolução, EXP, treino, ovos e breeding
   ========================================================================== */

/* checa a API local uma vez no boot (silencioso se offline) */
function checaAPILocal(){
  if(typeof testaAPILocal !== "function") return;
  testaAPILocal().then(function(ok){
    if(!ok) console.warn("[pokemon] usando PokéAPI externa");
  });
}
function fetchJSON(u){return fetch(u).then(function(r){if(!r.ok)throw new Error("http "+r.status);return r.json();});}
function api(p){return fetchJSON("https://pokeapi.co/api/v2/"+p);}
function fetchCatalog(){return api("pokemon?limit=100000&offset=0").then(function(r){return (r.results||[]).map(function(x,i){return {id:i+1,name:x.name};});});}
function parseCsvNames(txt,out){
  var rows=String(txt).split("\n");
  for(var i=1;i<rows.length;i++){
    var row=rows[i];if(!row)continue;
    var a=row.indexOf(",");if(a<0)continue;
    var b=row.indexOf(",",a+1);if(b<0)continue;
    var id=parseInt(row.slice(0,a),10),lang=row.slice(a+1,b);
    if(lang!=="7"||!id)continue;
    var rest=row.slice(b+1),c=rest.indexOf(",");
    var nm=(c<0?rest:rest.slice(0,c)).replace(/^"|"$/g,"").trim();
    if(nm)out[id]=nm;
  }
  return Object.keys(out).length;
}
function fetchPtNames(){
  return fetchJSON("https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv/pokemon_species_names.csv")
    .then(function(t){return parseCsvNames(t,PT_NAMES);}).catch(function(){return 0;});
}
function fetchMoveNames(){
  return fetchJSON("https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv/move_names.csv")
    .then(function(t){return parseCsvNames(t,MOVE_PT);}).catch(function(){return 0;});
}
function getSpecies(id){
  if(SP[id])return Promise.resolve(SP[id]);
  /* tenta a API local (Pokémon Anil) primeiro; se falhar, usa a PokéAPI */
  if(typeof getSpeciesLocal === "function"){
    return getSpeciesLocal(id, function(i2){ return getSpeciesPokeAPI(i2); });
  }
  return getSpeciesPokeAPI(id);
}

/* a versão original — agora é o fallback */
function getSpeciesPokeAPI(id){
  return api("pokemon/"+id).then(function(p){
    var info={id:id,name:p.name,types:p.types.map(function(t){return t.type.name;}),base:p.stats.map(function(s){return s.base_stat;}),
      learn:(p.moves||[]).map(function(m){return {name:m.move.name,url:m.move.url,
        methods:(m.version_group_details||[]).map(function(d){return {m:d.move_learn_method.name,lv:d.level_learned_at};})};})};
    SP[id]=info;
    /* busca a species para egg groups e taxa de gênero (não bloqueia o retorno) */
    api("pokemon-species/"+id).then(function(sp){
      info.eggGroups=(sp.egg_groups||[]).map(function(g){return g.name;});
      info.genderRate=(typeof sp.gender_rate==="number")?sp.gender_rate:null;
      info.hatchCounter=sp.hatch_counter||null;
      info.color=sp.color&&sp.color.name;
      info.growth=sp.growth_rate&&sp.growth_rate.name;
    }).catch(function(){ info.eggGroups=null; info.genderRate=null; });
    return info;
  });
}
function getMove(x){
  if(!x)return Promise.resolve(fallbackMove());
  var key=String(x);
  if(MOVE_CACHE[key])return Promise.resolve(MOVE_CACHE[key]);
  /* tenta a API local primeiro */
  if(typeof getMoveLocal === "function" && key.indexOf("http")!==0){
    return getMoveLocal(key, function(k2){ return getMovePokeAPI(k2); })
      .then(function(m){
        if(m && m.name){ MOVE_CACHE[key]=m; MOVE_CACHE[m.name]=m; return m; }
        return getMovePokeAPI(key);
      })
      .catch(function(){ return getMovePokeAPI(key); });
  }
  return getMovePokeAPI(x);
}

/* a versão original — agora é o fallback */
function getMovePokeAPI(x){
  if(!x)return Promise.resolve(fallbackMove());
  var key=String(x);
  if(MOVE_CACHE[key])return Promise.resolve(MOVE_CACHE[key]);
  var url=(key.indexOf("http")===0)?key:"https://pokeapi.co/api/v2/move/"+key.toLowerCase().trim().replace(/\s+/g,"-");
  if(MOVE_CACHE[url])return Promise.resolve(MOVE_CACHE[url]);
  return fetchJSON(url).then(function(d){
    var m={id:d.id,name:d.name,power:d.power||0,acc:(d.accuracy==null?100:d.accuracy),type:d.type.name,
      dmgClass:d.damage_class.name,pp:d.pp||10,
      stat_changes:(d.stat_changes||[]).map(function(s){return {stat:s.stat.name,change:s.change};}),drain:d.drain||0};
    m.pt=MOVE_PT[m.id]||pretty(m.name);
    MOVE_CACHE[key]=m;MOVE_CACHE[url]=m;MOVE_CACHE[m.name]=m;return m;
  }).catch(function(){return fallbackMove();});
}
function xpForLevel(l){return Math.floor(2.6*Math.pow(l,3)/3);}
function maxHP(p){return Math.floor((p.base[0]+2*p.iv.hp+Math.floor(p.ev.hp/4))*p.lvl/50)+p.lvl+10;}
function statVal(p,k,i){
  var base=(p.base&&p.base[i]!=null)?p.base[i]:45;
  var iv=(p.iv&&p.iv[k])||0;
  var ev=(p.ev&&p.ev[k])||0;
  var bruto=Math.floor((base+2*iv+Math.floor(ev/4))*((p.lvl||5)/50))+5;
  /* natureza: +10% / -10% (HP nunca e afetado) */
  if(k!=="hp"){
    var mult=natMulti(p.nature,i-1);
    bruto=Math.floor(bruto*mult);
  }
  return bruto;
}
function ivTotal(p){return STAT_KEYS.reduce(function(a,k){return a+p.iv[k];},0);}
function ivGrade(p){var t=ivTotal(p);return t>=165?"Perfeito":t>=140?"Excelente":t>=100?"Bom":t>=60?"Regular":"Fraca";}
function capLevel(){
  if(!S)return 100;
  if(S.champion)return POSTGAME.lv;
  var done=(S.gyms||[]).length;
  if(done>=8)return LEAGUE.lv;
  return done?GYMS[done-1].lv:12;
}
function capLabel(){
  if(S.champion)return "Pós-jogo: Ilhas Prisma (N"+POSTGAME.lv+")";
  var done=(S.gyms||[]).length;
  if(done>=8)return "Liga Pokémon (N"+LEAGUE.lv+")";
  var nx=GYMS[done];
  return "Próximo: "+nx.name+" · "+nx.city+" (N"+nx.lv+")";
}
function newMon(o){
  var m={uid:Math.random().toString(36).slice(2,10),id:null,name:"",types:[],base:[45,45,45,45,45,45],
    iv:{hp:0,atk:0,def:0,spa:0,spd:0,spe:0},ev:{hp:0,atk:0,def:0,spa:0,spd:0,spe:0},
    lvl:5,exp:0,hunger:80,energy:100,bond:20,awake:true,moves:[],learned:[],hp:1,fainted:false,shiny:false,
    ivCap:0,obtained:""};
  Object.keys(o||{}).forEach(function(k){m[k]=o[k];});
  if(!m.exp)m.exp=xpForLevel(m.lvl);
  return m;
}
function randomIV(){var iv={};STAT_KEYS.forEach(function(k){iv[k]=Math.random()<0.02?31:ri(0,28);});return iv;}
function moveKey(x){return String((x&&x.name)||x||"").toLowerCase().trim();}
function levelUpMovesUpTo(info,lvl){
  var out=[],seen={};
  (info.learn||[]).forEach(function(mv){for(var i=0;i<mv.methods.length;i++){var d=mv.methods[i];
    if(d.m==="level-up"&&d.lv>0&&d.lv<=lvl&&!seen[mv.name]){out.push({name:mv.name,url:mv.url,lv:d.lv});seen[mv.name]=1;break;}}});
  return out;
}
function futureLevelMoves(info,lvl){
  var out=[],seen={};
  (info.learn||[]).forEach(function(mv){for(var i=0;i<mv.methods.length;i++){var d=mv.methods[i];
    if(d.m==="level-up"&&d.lv>lvl&&!seen[mv.name]){out.push({name:mv.name,url:mv.url,lv:d.lv});seen[mv.name]=1;break;}}});
  return out.sort(function(a,b){return a.lv-b.lv;});
}
function machineMoves(info){
  var out=[],seen={};
  (info.learn||[]).forEach(function(mv){for(var i=0;i<mv.methods.length;i++){var d=mv.methods[i];
    if((d.m==="machine"||d.m==="tutor")&&!seen[mv.name]){out.push({name:mv.name,url:mv.url,kind:d.m});seen[mv.name]=1;break;}}});
  return out.slice(0,100);
}
const NATURES=["Hardy","Lonely","Brave","Adamant","Naughty","Bold","Docile","Relaxed","Impish","Lax","Timid","Hasty","Serious","Jolly","Naive","Modest","Mild","Quiet","Bashful","Rash","Calm","Gentle","Sassy","Careful","Quirky"];
const ABIL_DB={"nat":{"Hardy":{"pt":"Resistente","ef":[0,0,0,0,0]},"Lonely":{"pt":"Solitária","ef":[1,0,0,0,-1]},"Brave":{"pt":"Brava","ef":[1,0,0,-1,0]},"Adamant":{"pt":"Firme","ef":[1,0,-1,0,0]},"Naughty":{"pt":"Travessa","ef":[1,-1,0,0,0]},"Bold":{"pt":"Ousada","ef":[-1,1,0,0,0]},"Docile":{"pt":"Dócil","ef":[0,0,0,0,0]},"Relaxed":{"pt":"Relaxada","ef":[0,1,0,0,-1]},"Impish":{"pt":"Impish","ef":[0,1,-1,0,0]},"Lax":{"pt":"Laxa","ef":[0,1,0,-1,0]},"Timid":{"pt":"Tímida","ef":[-1,0,0,0,1]},"Hasty":{"pt":"Apressada","ef":[0,-1,0,0,1]},"Serious":{"pt":"Séria","ef":[0,0,0,0,0]},"Jolly":{"pt":"Alegre","ef":[-1,0,-1,0,1]},"Naive":{"pt":"Ingênua","ef":[0,0,-1,0,1]},"Modest":{"pt":"Modesta","ef":[-1,0,1,0,0]},"Mild":{"pt":"Suave","ef":[0,-1,1,0,0]},"Quiet":{"pt":"Quieta","ef":[0,0,1,0,-1]},"Bashful":{"pt":"Tímida neutra","ef":[0,0,0,0,0]},"Rash":{"pt":"Precipitada","ef":[0,0,1,-1,0]},"Calm":{"pt":"Calma","ef":[-1,0,0,1,0]},"Gentle":{"pt":"Gentil","ef":[0,-1,0,1,0]},"Sassy":{"pt":"Atrevida","ef":[0,0,0,1,-1]},"Careful":{"pt":"Cautelosa","ef":[0,0,-1,1,0]},"Quirky":{"pt":"Excêntrica","ef":[0,0,0,0,0]}},"ab":{"1":[["Overgrow","Supercrescimento",0],["Chlorophyll","Nome PT não consolidado",1]],"2":[["Overgrow","Supercrescimento",0],["Chlorophyll","Nome PT não consolidado",1]],"3":[["Thick Fat","Gordura Espessa",0]],"4":[["Blaze","Incêndio",0],["Solar Power","Poder Solar",1]],"5":[["Blaze","Incêndio",0],["Solar Power","Poder Solar",1]],"6":[["Drought","Seca",0]],"7":[["Torrent","Dilúvio",0],["Rain Dish","Nome PT não consolidado",1]],"8":[["Torrent","Dilúvio",0],["Rain Dish","Nome PT não consolidado",1]],"9":[["Mega Launcher","Megalançador",0]],"10":[["Shield Dust","Nome PT não consolidado",0],["Run Away","Nome PT não consolidado",1]],"11":[["Shed Skin","Nome PT não consolidado",0]],"12":[["Compound Eyes","Nome PT não consolidado",0],["Tinted Lens","Nome PT não consolidado",1]],"13":[["Shield Dust","Nome PT não consolidado",0],["Run Away","Nome PT não consolidado",1]],"14":[["Shed Skin","Nome PT não consolidado",0]],"15":[["Adaptability","Adaptabilidade",0]],"16":[["Keen Eye","Nome PT não consolidado",0],["Tangled Feet","Nome PT não consolidado",0],["Big Pecks","Nome PT não consolidado",1]],"17":[["Keen Eye","Nome PT não consolidado",0],["Tangled Feet","Nome PT não consolidado",0],["Big Pecks","Nome PT não consolidado",1]],"18":[["No Guard","Indefeso",0]],"19":[["Gluttony","Nome PT não consolidado",0],["Hustle","Nome PT não consolidado",0],["Thick Fat","Gordura Espessa",1]],"20":[["Thick Fat","Gordura Espessa",0]],"21":[["Keen Eye","Nome PT não consolidado",0],["Sniper","Nome PT não consolidado",1]],"22":[["Keen Eye","Nome PT não consolidado",0],["Sniper","Nome PT não consolidado",1]],"23":[["Intimidate","Intimidação",0],["Shed Skin","Nome PT não consolidado",0],["Unnerve","Nome PT não consolidado",1]],"24":[["Intimidate","Intimidação",0],["Shed Skin","Nome PT não consolidado",0],["Unnerve","Nome PT não consolidado",1]],"25":[["Static","Nome PT não consolidado",0],["Lightning Rod","Para-raios",1]],"26":[["No Guard","Indefeso",0]],"27":[["Sand Veil","Nome PT não consolidado",0],["Sand Rush","Nome PT não consolidado",1]],"28":[["Sand Veil","Nome PT não consolidado",0],["Sand Rush","Nome PT não consolidado",1]],"29":[["Poison Point","Nome PT não consolidado",0],["Rivalry","Nome PT não consolidado",0],["Hustle","Nome PT não consolidado",1]],"30":[["Poison Point","Nome PT não consolidado",0],["Rivalry","Nome PT não consolidado",0],["Hustle","Nome PT não consolidado",1]],"31":[["Poison Point","Nome PT não consolidado",0],["Rivalry","Nome PT não consolidado",0],["Sheer Force","Força Absoluta",1]],"32":[["Poison Point","Nome PT não consolidado",0],["Rivalry","Nome PT não consolidado",0],["Hustle","Nome PT não consolidado",1]],"33":[["Poison Point","Nome PT não consolidado",0],["Rivalry","Nome PT não consolidado",0],["Hustle","Nome PT não consolidado",1]],"34":[["Poison Point","Nome PT não consolidado",0],["Rivalry","Nome PT não consolidado",0],["Sheer Force","Força Absoluta",1]],"35":[["Cute Charm","Nome PT não consolidado",0],["Magic Guard","Nome PT não consolidado",0],["Friend Guard","Nome PT não consolidado",1]],"36":[["Magic Bounce","Espelho Mágico",0]],"37":[["Snow Cloak","Nome PT não consolidado",0],["Snow Warning","Alerta de Neve",1]],"38":[["Snow Cloak","Nome PT não consolidado",0],["Snow Warning","Alerta de Neve",1]],"39":[["Cute Charm","Nome PT não consolidado",0],["Competitive","Nome PT não consolidado",0],["Friend Guard","Nome PT não consolidado",1]],"40":[["Cute Charm","Nome PT não consolidado",0],["Competitive","Nome PT não consolidado",0],["Frisk","Nome PT não consolidado",1]],"41":[["Inner Focus","Força Interior",0],["Infiltrator","Nome PT não consolidado",1]],"42":[["Inner Focus","Força Interior",0],["Infiltrator","Nome PT não consolidado",1]],"43":[["Chlorophyll","Nome PT não consolidado",0],["Run Away","Nome PT não consolidado",1]],"44":[["Chlorophyll","Nome PT não consolidado",0],["Stench","Nome PT não consolidado",1]],"45":[["Chlorophyll","Nome PT não consolidado",0],["Effect Spore","Nome PT não consolidado",1]],"46":[["Effect Spore","Nome PT não consolidado",0],["Dry Skin","Nome PT não consolidado",0],["Damp","Nome PT não consolidado",1]],"47":[["Effect Spore","Nome PT não consolidado",0],["Dry Skin","Nome PT não consolidado",0],["Damp","Nome PT não consolidado",1]],"48":[["Compound Eyes","Nome PT não consolidado",0],["Tinted Lens","Nome PT não consolidado",0],["Run Away","Nome PT não consolidado",1]],"49":[["Shield Dust","Nome PT não consolidado",0],["Tinted Lens","Nome PT não consolidado",0],["Wonder Skin","Nome PT não consolidado",1]],"50":[["Sand Veil","Nome PT não consolidado",0],["Tangling Hair","Nome PT não consolidado",0],["Sand Force","Força Arenosa",1]],"51":[["Sand Veil","Nome PT não consolidado",0],["Tangling Hair","Nome PT não consolidado",0],["Sand Force","Força Arenosa",1]],"52":[["Pickup","Nome PT não consolidado",0],["Technician","Técnico",0],["Rattled","Nome PT não consolidado",1]],"53":[["Fur Coat","Nome PT não consolidado",0],["Technician","Técnico",0],["Rattled","Nome PT não consolidado",1]],"54":[["Damp","Nome PT não consolidado",0],["Cloud Nine","Nome PT não consolidado",0],["Swift Swim","Nado Rápido",1]],"55":[["Damp","Nome PT não consolidado",0],["Cloud Nine","Nome PT não consolidado",0],["Swift Swim","Nado Rápido",1]],"56":[["Vital Spirit","Nome PT não consolidado",0],["Anger Point","Nome PT não consolidado",0],["Defiant","Nome PT não consolidado",1]],"57":[["Vital Spirit","Nome PT não consolidado",0],["Anger Point","Nome PT não consolidado",0],["Defiant","Nome PT não consolidado",1]],"58":[["Intimidate","Intimidação",0],["Flash Fire","Nome PT não consolidado",0],["Rock Head","Nome PT não consolidado",1]],"59":[["Intimidate","Intimidação",0],["Flash Fire","Nome PT não consolidado",0],["Rock Head","Nome PT não consolidado",1]],"60":[["Water Absorb","Nome PT não consolidado",0],["Damp","Nome PT não consolidado",0],["Swift Swim","Nado Rápido",1]],"61":[["Water Absorb","Nome PT não consolidado",0],["Damp","Nome PT não consolidado",0],["Swift Swim","Nado Rápido",1]],"62":[["Water Absorb","Nome PT não consolidado",0],["Damp","Nome PT não consolidado",0],["Swift Swim","Nado Rápido",1]],"63":[["Synchronize","Nome PT não consolidado",0],["Inner Focus","Força Interior",0],["Magic Guard","Nome PT não consolidado",1]],"64":[["Synchronize","Nome PT não consolidado",0],["Inner Focus","Força Interior",0],["Magic Guard","Nome PT não consolidado",1]],"65":[["Trace","Traçar",0]],"66":[["Guts","Nome PT não consolidado",0],["No Guard","Indefeso",0],["Steadfast","Inabalável",1]],"67":[["Guts","Nome PT não consolidado",0],["No Guard","Indefeso",0],["Steadfast","Inabalável",1]],"68":[["Guts","Nome PT não consolidado",0],["No Guard","Indefeso",0],["Steadfast","Inabalável",1]],"69":[["Chlorophyll","Nome PT não consolidado",0],["Gluttony","Nome PT não consolidado",1]],"70":[["Chlorophyll","Nome PT não consolidado",0],["Gluttony","Nome PT não consolidado",1]],"71":[["Innards Out","Nome PT não consolidado",0]],"72":[["Clear Body","Nome PT não consolidado",0],["Liquid Ooze","Nome PT não consolidado",0],["Rain Dish","Nome PT não consolidado",1]],"73":[["Clear Body","Nome PT não consolidado",0],["Liquid Ooze","Nome PT não consolidado",0],["Rain Dish","Nome PT não consolidado",1]],"74":[["Magnet Pull","Nome PT não consolidado",0],["Sturdy","Nome PT não consolidado",0],["Galvanize","Nome PT não consolidado",1]],"75":[["Magnet Pull","Nome PT não consolidado",0],["Sturdy","Nome PT não consolidado",0],["Galvanize","Nome PT não consolidado",1]],"76":[["Magnet Pull","Nome PT não consolidado",0],["Sturdy","Nome PT não consolidado",0],["Galvanize","Nome PT não consolidado",1]],"77":[["Run Away","Nome PT não consolidado",0],["Pastel Veil","Nome PT não consolidado",0],["Anticipation","Nome PT não consolidado",1]],"78":[["Run Away","Nome PT não consolidado",0],["Pastel Veil","Nome PT não consolidado",0],["Anticipation","Nome PT não consolidado",1]],"79":[["Gluttony","Nome PT não consolidado",0],["Own Tempo","Nome PT não consolidado",0],["Regenerator","Nome PT não consolidado",1]],"80":[["Quick Draw","Nome PT não consolidado",0],["Own Tempo","Nome PT não consolidado",0],["Regenerator","Nome PT não consolidado",1]],"81":[["Magnet Pull","Nome PT não consolidado",0],["Sturdy","Nome PT não consolidado",0],["Analytic","Nome PT não consolidado",1]],"82":[["Magnet Pull","Nome PT não consolidado",0],["Sturdy","Nome PT não consolidado",0],["Analytic","Nome PT não consolidado",1]],"83":[["Keen Eye","Nome PT não consolidado",0],["Inner Focus","Força Interior",0],["Defiant","Nome PT não consolidado",1]],"84":[["Run Away","Nome PT não consolidado",0],["Early Bird","Nome PT não consolidado",0],["Tangled Feet","Nome PT não consolidado",1]],"85":[["Run Away","Nome PT não consolidado",0],["Early Bird","Nome PT não consolidado",0],["Tangled Feet","Nome PT não consolidado",1]],"86":[["Thick Fat","Gordura Espessa",0],["Hydration","Nome PT não consolidado",0],["Ice Body","Nome PT não consolidado",1]],"87":[["Thick Fat","Gordura Espessa",0],["Hydration","Nome PT não consolidado",0],["Ice Body","Nome PT não consolidado",1]],"88":[["Poison Touch","Nome PT não consolidado",0],["Gluttony","Nome PT não consolidado",0],["Power of Alchemy","Nome PT não consolidado",1]],"89":[["Poison Touch","Nome PT não consolidado",0],["Gluttony","Nome PT não consolidado",0],["Power of Alchemy","Nome PT não consolidado",1]],"90":[["Shell Armor","Armadura de Concha",0],["Skill Link","Encadeado",0],["Overcoat","Nome PT não consolidado",1]],"91":[["Shell Armor","Armadura de Concha",0],["Skill Link","Encadeado",0],["Overcoat","Nome PT não consolidado",1]],"92":[["Levitate","Levitação",0]],"93":[["Levitate","Levitação",0]],"94":[["Shadow Tag","Toque Sombrio",0]],"95":[["Rock Head","Nome PT não consolidado",0],["Sturdy","Nome PT não consolidado",0],["Weak Armor","Nome PT não consolidado",1]],"96":[["Insomnia","Insônia",0],["Forewarn","Nome PT não consolidado",0],["Inner Focus","Força Interior",1]],"97":[["Insomnia","Insônia",0],["Forewarn","Nome PT não consolidado",0],["Inner Focus","Força Interior",1]],"98":[["Hyper Cutter","Nome PT não consolidado",0],["Shell Armor","Armadura de Concha",0],["Sheer Force","Força Absoluta",1]],"99":[["Hyper Cutter","Nome PT não consolidado",0],["Shell Armor","Armadura de Concha",0],["Sheer Force","Força Absoluta",1]],"100":[["Soundproof","Nome PT não consolidado",0],["Static","Nome PT não consolidado",0],["Aftermath","Nome PT não consolidado",1]],"101":[["Soundproof","Nome PT não consolidado",0],["Static","Nome PT não consolidado",0],["Aftermath","Nome PT não consolidado",1]],"102":[["Chlorophyll","Nome PT não consolidado",0],["Harvest","Nome PT não consolidado",1]],"103":[["Frisk","Nome PT não consolidado",0],["Harvest","Nome PT não consolidado",1]],"104":[["Rock Head","Nome PT não consolidado",0],["Lightning Rod","Para-raios",0],["Battle Armor","Nome PT não consolidado",1]],"105":[["Rock Head","Nome PT não consolidado",0],["Lightning Rod","Para-raios",0],["Battle Armor","Nome PT não consolidado",1]],"106":[["Limber","Nome PT não consolidado",0],["Reckless","Nome PT não consolidado",0],["Unburden","Nome PT não consolidado",1]],"107":[["Keen Eye","Nome PT não consolidado",0],["Iron Fist","Nome PT não consolidado",0],["Inner Focus","Força Interior",1]],"108":[["Own Tempo","Nome PT não consolidado",0],["Oblivious","Nome PT não consolidado",0],["Cloud Nine","Nome PT não consolidado",1]],"109":[["Levitate","Levitação",0],["Neutralizing Gas","Nome PT não consolidado",0],["Stench","Nome PT não consolidado",1]],"110":[["Levitate","Levitação",0],["Neutralizing Gas","Nome PT não consolidado",0],["Misty Surge","Nome PT não consolidado",1]],"111":[["Lightning Rod","Para-raios",0],["Rock Head","Nome PT não consolidado",0],["Reckless","Nome PT não consolidado",1]],"112":[["Lightning Rod","Para-raios",0],["Rock Head","Nome PT não consolidado",0],["Reckless","Nome PT não consolidado",1]],"113":[["Natural Cure","Nome PT não consolidado",0],["Serene Grace","Nome PT não consolidado",0],["Healer","Curador",1]],"114":[["Chlorophyll","Nome PT não consolidado",0],["Leaf Guard","Nome PT não consolidado",0],["Regenerator","Nome PT não consolidado",1]],"115":[["Parental Bond","Laços Familiares",0]],"116":[["Swift Swim","Nado Rápido",0],["Sniper","Nome PT não consolidado",0],["Damp","Nome PT não consolidado",1]],"117":[["Poison Point","Nome PT não consolidado",0],["Sniper","Nome PT não consolidado",0],["Damp","Nome PT não consolidado",1]],"118":[["Swift Swim","Nado Rápido",0],["Water Veil","Nome PT não consolidado",0],["Lightning Rod","Para-raios",1]],"119":[["Swift Swim","Nado Rápido",0],["Water Veil","Nome PT não consolidado",0],["Lightning Rod","Para-raios",1]],"120":[["Illuminate","Nome PT não consolidado",0],["Natural Cure","Nome PT não consolidado",0],["Analytic","Nome PT não consolidado",1]],"121":[["Huge Power","Poderzão",0]],"122":[["Soundproof","Nome PT não consolidado",0],["Filter","Filtro",0],["Technician","Técnico",1]],"123":[["Swarm","Nome PT não consolidado",0],["Technician","Técnico",0],["Steadfast","Inabalável",1]],"124":[["Oblivious","Nome PT não consolidado",0],["Forewarn","Nome PT não consolidado",0],["Dry Skin","Nome PT não consolidado",1]],"125":[["Static","Nome PT não consolidado",0],["Vital Spirit","Nome PT não consolidado",1]],"126":[["Flame Body","Nome PT não consolidado",0],["Vital Spirit","Nome PT não consolidado",1]],"127":[["Aerilate","Mãos Aéreas",0]],"128":[["Intimidate","Intimidação",0],["Anger Point","Nome PT não consolidado",0],["Sheer Force","Força Absoluta",1]],"129":[["Swift Swim","Nado Rápido",0],["Rattled","Nome PT não consolidado",1]],"130":[["Mold Breaker","Quebra-moldes",0]],"131":[["Water Absorb","Nome PT não consolidado",0],["Shell Armor","Armadura de Concha",0],["Hydration","Nome PT não consolidado",1]],"132":[["Limber","Nome PT não consolidado",0],["Imposter","Nome PT não consolidado",1]],"133":[["Run Away","Nome PT não consolidado",0],["Adaptability","Adaptabilidade",0],["Anticipation","Nome PT não consolidado",1]],"134":[["Water Absorb","Nome PT não consolidado",0],["Hydration","Nome PT não consolidado",1]],"135":[["Volt Absorb","Nome PT não consolidado",0],["Quick Feet","Nome PT não consolidado",1]],"136":[["Flash Fire","Nome PT não consolidado",0],["Guts","Nome PT não consolidado",1]],"137":[["Trace","Traçar",0],["Download","Nome PT não consolidado",0],["Analytic","Nome PT não consolidado",1]],"138":[["Swift Swim","Nado Rápido",0],["Shell Armor","Armadura de Concha",0],["Weak Armor","Nome PT não consolidado",1]],"139":[["Swift Swim","Nado Rápido",0],["Shell Armor","Armadura de Concha",0],["Weak Armor","Nome PT não consolidado",1]],"140":[["Swift Swim","Nado Rápido",0],["Battle Armor","Nome PT não consolidado",0],["Weak Armor","Nome PT não consolidado",1]],"141":[["Swift Swim","Nado Rápido",0],["Battle Armor","Nome PT não consolidado",0],["Weak Armor","Nome PT não consolidado",1]],"142":[["Tough Claws","Garras Firmes",0]],"143":[["Immunity","Nome PT não consolidado",0],["Thick Fat","Gordura Espessa",0],["Gluttony","Nome PT não consolidado",1]],"144":[["Competitive","Nome PT não consolidado",0]],"145":[["Defiant","Nome PT não consolidado",0]],"146":[["Berserk","Nome PT não consolidado",0]],"147":[["Shed Skin","Nome PT não consolidado",0],["Marvel Scale","Nome PT não consolidado",1]],"148":[["Shed Skin","Nome PT não consolidado",0],["Marvel Scale","Nome PT não consolidado",1]],"149":[["Multiscale","Nome PT não consolidado",0]],"150":[["Insomnia","Insônia",0]],"151":[["Synchronize","Nome PT não consolidado",0]],"152":[["Overgrow","Supercrescimento",0],["Leaf Guard","Nome PT não consolidado",1]],"153":[["Overgrow","Supercrescimento",0],["Leaf Guard","Nome PT não consolidado",1]],"154":[["Mega Sol","Nome PT não consolidado",0]],"155":[["Blaze","Incêndio",0],["Flash Fire","Nome PT não consolidado",1]],"156":[["Blaze","Incêndio",0],["Flash Fire","Nome PT não consolidado",1]],"157":[["Blaze","Incêndio",0],["Frisk","Nome PT não consolidado",1]],"158":[["Torrent","Dilúvio",0],["Sheer Force","Força Absoluta",1]],"159":[["Torrent","Dilúvio",0],["Sheer Force","Força Absoluta",1]],"160":[["Dragonize","Nome PT não consolidado",0]],"161":[["Run Away","Nome PT não consolidado",0],["Keen Eye","Nome PT não consolidado",0],["Frisk","Nome PT não consolidado",1]],"162":[["Run Away","Nome PT não consolidado",0],["Keen Eye","Nome PT não consolidado",0],["Frisk","Nome PT não consolidado",1]],"163":[["Insomnia","Insônia",0],["Keen Eye","Nome PT não consolidado",0],["Tinted Lens","Nome PT não consolidado",1]],"164":[["Insomnia","Insônia",0],["Keen Eye","Nome PT não consolidado",0],["Tinted Lens","Nome PT não consolidado",1]],"165":[["Swarm","Nome PT não consolidado",0],["Early Bird","Nome PT não consolidado",0],["Rattled","Nome PT não consolidado",1]],"166":[["Swarm","Nome PT não consolidado",0],["Early Bird","Nome PT não consolidado",0],["Iron Fist","Nome PT não consolidado",1]],"167":[["Swarm","Nome PT não consolidado",0],["Insomnia","Insônia",0],["Sniper","Nome PT não consolidado",1]],"168":[["Swarm","Nome PT não consolidado",0],["Insomnia","Insônia",0],["Sniper","Nome PT não consolidado",1]],"169":[["Inner Focus","Força Interior",0],["Infiltrator","Nome PT não consolidado",1]],"170":[["Volt Absorb","Nome PT não consolidado",0],["Illuminate","Nome PT não consolidado",0],["Water Absorb","Nome PT não consolidado",1]],"171":[["Volt Absorb","Nome PT não consolidado",0],["Illuminate","Nome PT não consolidado",0],["Water Absorb","Nome PT não consolidado",1]],"172":[["Static","Nome PT não consolidado",0]],"173":[["Cute Charm","Nome PT não consolidado",0],["Magic Guard","Nome PT não consolidado",0],["Friend Guard","Nome PT não consolidado",1]],"174":[["Cute Charm","Nome PT não consolidado",0],["Competitive","Nome PT não consolidado",0],["Friend Guard","Nome PT não consolidado",1]],"175":[["Hustle","Nome PT não consolidado",0],["Serene Grace","Nome PT não consolidado",0],["Super Luck","Nome PT não consolidado",1]],"176":[["Hustle","Nome PT não consolidado",0],["Serene Grace","Nome PT não consolidado",0],["Super Luck","Nome PT não consolidado",1]],"177":[["Synchronize","Nome PT não consolidado",0],["Early Bird","Nome PT não consolidado",0],["Magic Bounce","Espelho Mágico",1]],"178":[["Synchronize","Nome PT não consolidado",0],["Early Bird","Nome PT não consolidado",0],["Magic Bounce","Espelho Mágico",1]],"179":[["Static","Nome PT não consolidado",0],["Plus","Nome PT não consolidado",1]],"180":[["Static","Nome PT não consolidado",0],["Plus","Nome PT não consolidado",1]],"181":[["Mold Breaker","Quebra-moldes",0]],"182":[["Chlorophyll","Nome PT não consolidado",0],["Healer","Curador",1]],"183":[["Thick Fat","Gordura Espessa",0],["Huge Power","Poderzão",0],["Sap Sipper","Nome PT não consolidado",1]],"184":[["Thick Fat","Gordura Espessa",0],["Huge Power","Poderzão",0],["Sap Sipper","Nome PT não consolidado",1]],"185":[["Sturdy","Nome PT não consolidado",0],["Rock Head","Nome PT não consolidado",0],["Rattled","Nome PT não consolidado",1]],"186":[["Water Absorb","Nome PT não consolidado",0],["Damp","Nome PT não consolidado",0],["Drizzle","Nome PT não consolidado",1]],"187":[["Chlorophyll","Nome PT não consolidado",0],["Leaf Guard","Nome PT não consolidado",0],["Infiltrator","Nome PT não consolidado",1]],"188":[["Chlorophyll","Nome PT não consolidado",0],["Leaf Guard","Nome PT não consolidado",0],["Infiltrator","Nome PT não consolidado",1]],"189":[["Chlorophyll","Nome PT não consolidado",0],["Leaf Guard","Nome PT não consolidado",0],["Infiltrator","Nome PT não consolidado",1]],"190":[["Run Away","Nome PT não consolidado",0],["Pickup","Nome PT não consolidado",0],["Skill Link","Encadeado",1]],"191":[["Chlorophyll","Nome PT não consolidado",0],["Solar Power","Poder Solar",0],["Early Bird","Nome PT não consolidado",1]],"192":[["Chlorophyll","Nome PT não consolidado",0],["Solar Power","Poder Solar",0],["Early Bird","Nome PT não consolidado",1]],"193":[["Speed Boost","Impulso de Velocidade",0],["Compound Eyes","Nome PT não consolidado",0],["Frisk","Nome PT não consolidado",1]],"194":[["Poison Point","Nome PT não consolidado",0],["Water Absorb","Nome PT não consolidado",0],["Unaware","Nome PT não consolidado",1]],"195":[["Damp","Nome PT não consolidado",0],["Water Absorb","Nome PT não consolidado",0],["Unaware","Nome PT não consolidado",1]],"196":[["Synchronize","Nome PT não consolidado",0],["Magic Bounce","Espelho Mágico",1]],"197":[["Synchronize","Nome PT não consolidado",0],["Inner Focus","Força Interior",1]],"198":[["Insomnia","Insônia",0],["Super Luck","Nome PT não consolidado",0],["Prankster","Travesso",1]],"199":[["Curious Medicine","Nome PT não consolidado",0],["Own Tempo","Nome PT não consolidado",0],["Regenerator","Nome PT não consolidado",1]],"200":[["Levitate","Levitação",0]],"201":[["Levitate","Levitação",0]],"202":[["Shadow Tag","Toque Sombrio",0],["Telepathy","Nome PT não consolidado",1]],"203":[["Inner Focus","Força Interior",0],["Early Bird","Nome PT não consolidado",0],["Sap Sipper","Nome PT não consolidado",1]],"204":[["Sturdy","Nome PT não consolidado",0],["Overcoat","Nome PT não consolidado",1]],"205":[["Sturdy","Nome PT não consolidado",0],["Overcoat","Nome PT não consolidado",1]],"206":[["Serene Grace","Nome PT não consolidado",0],["Run Away","Nome PT não consolidado",0],["Rattled","Nome PT não consolidado",1]],"207":[["Hyper Cutter","Nome PT não consolidado",0],["Sand Veil","Nome PT não consolidado",0],["Immunity","Nome PT não consolidado",1]],"208":[["Sand Force","Força Arenosa",0]],"209":[["Intimidate","Intimidação",0],["Run Away","Nome PT não consolidado",0],["Rattled","Nome PT não consolidado",1]],"210":[["Intimidate","Intimidação",0],["Quick Feet","Nome PT não consolidado",0],["Rattled","Nome PT não consolidado",1]],"211":[["Poison Point","Nome PT não consolidado",0],["Swift Swim","Nado Rápido",0],["Intimidate","Intimidação",1]],"212":[["Technician","Técnico",0]],"213":[["Sturdy","Nome PT não consolidado",0],["Gluttony","Nome PT não consolidado",0],["Contrary","Nome PT não consolidado",1]],"214":[["Skill Link","Encadeado",0]],"215":[["Inner Focus","Força Interior",0],["Keen Eye","Nome PT não consolidado",0],["Pickpocket","Nome PT não consolidado",1]],"216":[["Pickup","Nome PT não consolidado",0],["Quick Feet","Nome PT não consolidado",0],["Honey Gather","Nome PT não consolidado",1]],"217":[["Guts","Nome PT não consolidado",0],["Quick Feet","Nome PT não consolidado",0],["Unnerve","Nome PT não consolidado",1]],"218":[["Magma Armor","Nome PT não consolidado",0],["Flame Body","Nome PT não consolidado",0],["Weak Armor","Nome PT não consolidado",1]],"219":[["Magma Armor","Nome PT não consolidado",0],["Flame Body","Nome PT não consolidado",0],["Weak Armor","Nome PT não consolidado",1]],"220":[["Oblivious","Nome PT não consolidado",0],["Snow Cloak","Nome PT não consolidado",0],["Thick Fat","Gordura Espessa",1]],"221":[["Oblivious","Nome PT não consolidado",0],["Snow Cloak","Nome PT não consolidado",0],["Thick Fat","Gordura Espessa",1]],"222":[["Weak Armor","Nome PT não consolidado",0],["Cursed Body","Nome PT não consolidado",1]],"223":[["Hustle","Nome PT não consolidado",0],["Sniper","Nome PT não consolidado",0],["Moody","Nome PT não consolidado",1]],"224":[["Suction Cups","Nome PT não consolidado",0],["Sniper","Nome PT não consolidado",0],["Moody","Nome PT não consolidado",1]],"225":[["Vital Spirit","Nome PT não consolidado",0],["Hustle","Nome PT não consolidado",0],["Insomnia","Insônia",1]],"226":[["Swift Swim","Nado Rápido",0],["Water Absorb","Nome PT não consolidado",0],["Water Veil","Nome PT não consolidado",1]],"227":[["Stalwart","Nome PT não consolidado",0]],"228":[["Early Bird","Nome PT não consolidado",0],["Flash Fire","Nome PT não consolidado",0],["Unnerve","Nome PT não consolidado",1]],"229":[["Solar Power","Poder Solar",0]],"230":[["Swift Swim","Nado Rápido",0],["Sniper","Nome PT não consolidado",0],["Damp","Nome PT não consolidado",1]],"231":[["Pickup","Nome PT não consolidado",0],["Sand Veil","Nome PT não consolidado",1]],"232":[["Sturdy","Nome PT não consolidado",0],["Sand Veil","Nome PT não consolidado",1]],"233":[["Trace","Traçar",0],["Download","Nome PT não consolidado",0],["Analytic","Nome PT não consolidado",1]],"234":[["Intimidate","Intimidação",0],["Frisk","Nome PT não consolidado",0],["Sap Sipper","Nome PT não consolidado",1]],"235":[["Own Tempo","Nome PT não consolidado",0],["Technician","Técnico",0],["Moody","Nome PT não consolidado",1]],"236":[["Guts","Nome PT não consolidado",0],["Steadfast","Inabalável",0],["Vital Spirit","Nome PT não consolidado",1]],"237":[["Intimidate","Intimidação",0],["Technician","Técnico",0],["Steadfast","Inabalável",1]],"238":[["Oblivious","Nome PT não consolidado",0],["Forewarn","Nome PT não consolidado",0],["Hydration","Nome PT não consolidado",1]],"239":[["Static","Nome PT não consolidado",0],["Vital Spirit","Nome PT não consolidado",1]],"240":[["Flame Body","Nome PT não consolidado",0],["Vital Spirit","Nome PT não consolidado",1]],"241":[["Thick Fat","Gordura Espessa",0],["Scrappy","Brigão",0],["Sap Sipper","Nome PT não consolidado",1]],"242":[["Natural Cure","Nome PT não consolidado",0],["Serene Grace","Nome PT não consolidado",0],["Healer","Curador",1]],"243":[["Pressure","Nome PT não consolidado",0],["Inner Focus","Força Interior",1]],"244":[["Pressure","Nome PT não consolidado",0],["Inner Focus","Força Interior",1]],"245":[["Pressure","Nome PT não consolidado",0],["Inner Focus","Força Interior",1]],"246":[["Guts","Nome PT não consolidado",0],["Sand Veil","Nome PT não consolidado",1]],"247":[["Shed Skin","Nome PT não consolidado",0]],"248":[["Sand Stream","Fluxo de Areia",0]],"249":[["Pressure","Nome PT não consolidado",0],["Multiscale","Nome PT não consolidado",1]],"250":[["Pressure","Nome PT não consolidado",0],["Regenerator","Nome PT não consolidado",1]],"251":[["Natural Cure","Nome PT não consolidado",0]],"252":[["Overgrow","Supercrescimento",0],["Unburden","Nome PT não consolidado",1]],"253":[["Overgrow","Supercrescimento",0],["Unburden","Nome PT não consolidado",1]],"254":[["Lightning Rod","Para-raios",0]],"255":[["Blaze","Incêndio",0],["Speed Boost","Impulso de Velocidade",1]],"256":[["Blaze","Incêndio",0],["Speed Boost","Impulso de Velocidade",1]],"257":[["Speed Boost","Impulso de Velocidade",0]],"258":[["Torrent","Dilúvio",0],["Damp","Nome PT não consolidado",1]],"259":[["Torrent","Dilúvio",0],["Damp","Nome PT não consolidado",1]],"260":[["Swift Swim","Nado Rápido",0]],"261":[["Run Away","Nome PT não consolidado",0],["Quick Feet","Nome PT não consolidado",0],["Rattled","Nome PT não consolidado",1]],"262":[["Intimidate","Intimidação",0],["Quick Feet","Nome PT não consolidado",0],["Moxie","Nome PT não consolidado",1]],"263":[["Pickup","Nome PT não consolidado",0],["Gluttony","Nome PT não consolidado",0],["Quick Feet","Nome PT não consolidado",1]],"264":[["Pickup","Nome PT não consolidado",0],["Gluttony","Nome PT não consolidado",0],["Quick Feet","Nome PT não consolidado",1]],"265":[["Shield Dust","Nome PT não consolidado",0],["Run Away","Nome PT não consolidado",1]],"266":[["Shed Skin","Nome PT não consolidado",0]],"267":[["Swarm","Nome PT não consolidado",0],["Rivalry","Nome PT não consolidado",1]],"268":[["Shed Skin","Nome PT não consolidado",0]],"269":[["Shield Dust","Nome PT não consolidado",0],["Compound Eyes","Nome PT não consolidado",1]],"270":[["Swift Swim","Nado Rápido",0],["Rain Dish","Nome PT não consolidado",0],["Own Tempo","Nome PT não consolidado",1]],"271":[["Swift Swim","Nado Rápido",0],["Rain Dish","Nome PT não consolidado",0],["Own Tempo","Nome PT não consolidado",1]],"272":[["Swift Swim","Nado Rápido",0],["Rain Dish","Nome PT não consolidado",0],["Own Tempo","Nome PT não consolidado",1]],"273":[["Chlorophyll","Nome PT não consolidado",0],["Early Bird","Nome PT não consolidado",0],["Pickpocket","Nome PT não consolidado",1]],"274":[["Chlorophyll","Nome PT não consolidado",0],["Early Bird","Nome PT não consolidado",0],["Pickpocket","Nome PT não consolidado",1]],"275":[["Chlorophyll","Nome PT não consolidado",0],["Wind Rider","Nome PT não consolidado",0],["Pickpocket","Nome PT não consolidado",1]],"276":[["Guts","Nome PT não consolidado",0],["Scrappy","Brigão",1]],"277":[["Guts","Nome PT não consolidado",0],["Scrappy","Brigão",1]],"278":[["Keen Eye","Nome PT não consolidado",0],["Hydration","Nome PT não consolidado",0],["Rain Dish","Nome PT não consolidado",1]],"279":[["Keen Eye","Nome PT não consolidado",0],["Drizzle","Nome PT não consolidado",0],["Rain Dish","Nome PT não consolidado",1]],"280":[["Synchronize","Nome PT não consolidado",0],["Trace","Traçar",0],["Telepathy","Nome PT não consolidado",1]],"281":[["Synchronize","Nome PT não consolidado",0],["Trace","Traçar",0],["Telepathy","Nome PT não consolidado",1]],"282":[["Pixilate","Mãos de Fada",0]],"283":[["Swift Swim","Nado Rápido",0],["Rain Dish","Nome PT não consolidado",1]],"284":[["Intimidate","Intimidação",0],["Unnerve","Nome PT não consolidado",1]],"285":[["Effect Spore","Nome PT não consolidado",0],["Poison Heal","Nome PT não consolidado",0],["Quick Feet","Nome PT não consolidado",1]],"286":[["Effect Spore","Nome PT não consolidado",0],["Poison Heal","Nome PT não consolidado",0],["Technician","Técnico",1]],"287":[["Truant","Nome PT não consolidado",0]],"288":[["Vital Spirit","Nome PT não consolidado",0]],"289":[["Truant","Nome PT não consolidado",0]],"290":[["Compound Eyes","Nome PT não consolidado",0],["Run Away","Nome PT não consolidado",1]],"291":[["Speed Boost","Impulso de Velocidade",0],["Infiltrator","Nome PT não consolidado",1]],"292":[["Wonder Guard","Nome PT não consolidado",0]],"293":[["Soundproof","Nome PT não consolidado",0],["Rattled","Nome PT não consolidado",1]],"294":[["Soundproof","Nome PT não consolidado",0],["Scrappy","Brigão",1]],"295":[["Soundproof","Nome PT não consolidado",0],["Scrappy","Brigão",1]],"296":[["Thick Fat","Gordura Espessa",0],["Guts","Nome PT não consolidado",0],["Sheer Force","Força Absoluta",1]],"297":[["Thick Fat","Gordura Espessa",0],["Guts","Nome PT não consolidado",0],["Sheer Force","Força Absoluta",1]],"298":[["Thick Fat","Gordura Espessa",0],["Huge Power","Poderzão",0],["Sap Sipper","Nome PT não consolidado",1]],"299":[["Sturdy","Nome PT não consolidado",0],["Magnet Pull","Nome PT não consolidado",0],["Sand Force","Força Arenosa",1]],"300":[["Cute Charm","Nome PT não consolidado",0],["Normalize","Nome PT não consolidado",0],["Wonder Skin","Nome PT não consolidado",1]],"301":[["Cute Charm","Nome PT não consolidado",0],["Normalize","Nome PT não consolidado",0],["Wonder Skin","Nome PT não consolidado",1]],"302":[["Magic Bounce","Espelho Mágico",0]],"303":[["Huge Power","Poderzão",0]],"304":[["Sturdy","Nome PT não consolidado",0],["Rock Head","Nome PT não consolidado",0],["Heavy Metal","Nome PT não consolidado",1]],"305":[["Sturdy","Nome PT não consolidado",0],["Rock Head","Nome PT não consolidado",0],["Heavy Metal","Nome PT não consolidado",1]],"306":[["Filter","Filtro",0]],"307":[["Pure Power","Poder Puro",0],["Telepathy","Nome PT não consolidado",1]],"308":[["Pure Power","Poder Puro",0]],"309":[["Static","Nome PT não consolidado",0],["Lightning Rod","Para-raios",0],["Minus","Nome PT não consolidado",1]],"310":[["Intimidate","Intimidação",0]],"311":[["Plus","Nome PT não consolidado",0],["Lightning Rod","Para-raios",1]],"312":[["Minus","Nome PT não consolidado",0],["Volt Absorb","Nome PT não consolidado",1]],"313":[["Illuminate","Nome PT não consolidado",0],["Swarm","Nome PT não consolidado",0],["Prankster","Travesso",1]],"314":[["Oblivious","Nome PT não consolidado",0],["Tinted Lens","Nome PT não consolidado",0],["Prankster","Travesso",1]],"315":[["Natural Cure","Nome PT não consolidado",0],["Poison Point","Nome PT não consolidado",0],["Leaf Guard","Nome PT não consolidado",1]],"316":[["Liquid Ooze","Nome PT não consolidado",0],["Sticky Hold","Nome PT não consolidado",0],["Gluttony","Nome PT não consolidado",1]],"317":[["Liquid Ooze","Nome PT não consolidado",0],["Sticky Hold","Nome PT não consolidado",0],["Gluttony","Nome PT não consolidado",1]],"318":[["Rough Skin","Nome PT não consolidado",0],["Speed Boost","Impulso de Velocidade",1]],"319":[["Strong Jaw","Mandíbula Forte",0]],"320":[["Water Veil","Nome PT não consolidado",0],["Oblivious","Nome PT não consolidado",0],["Pressure","Nome PT não consolidado",1]],"321":[["Water Veil","Nome PT não consolidado",0],["Oblivious","Nome PT não consolidado",0],["Pressure","Nome PT não consolidado",1]],"322":[["Oblivious","Nome PT não consolidado",0],["Simple","Nome PT não consolidado",0],["Own Tempo","Nome PT não consolidado",1]],"323":[["Sheer Force","Força Absoluta",0]],"324":[["White Smoke","Nome PT não consolidado",0],["Drought","Seca",0],["Shell Armor","Armadura de Concha",1]],"325":[["Thick Fat","Gordura Espessa",0],["Own Tempo","Nome PT não consolidado",0],["Gluttony","Nome PT não consolidado",1]],"326":[["Thick Fat","Gordura Espessa",0],["Own Tempo","Nome PT não consolidado",0],["Gluttony","Nome PT não consolidado",1]],"327":[["Own Tempo","Nome PT não consolidado",0],["Tangled Feet","Nome PT não consolidado",0],["Contrary","Nome PT não consolidado",1]],"328":[["Hyper Cutter","Nome PT não consolidado",0],["Arena Trap","Nome PT não consolidado",0],["Sheer Force","Força Absoluta",1]],"329":[["Levitate","Levitação",0]],"330":[["Levitate","Levitação",0]],"331":[["Sand Veil","Nome PT não consolidado",0],["Water Absorb","Nome PT não consolidado",1]],"332":[["Sand Veil","Nome PT não consolidado",0],["Water Absorb","Nome PT não consolidado",1]],"333":[["Natural Cure","Nome PT não consolidado",0],["Cloud Nine","Nome PT não consolidado",1]],"334":[["Pixilate","Mãos de Fada",0]],"335":[["Immunity","Nome PT não consolidado",0],["Toxic Boost","Nome PT não consolidado",1]],"336":[["Shed Skin","Nome PT não consolidado",0],["Infiltrator","Nome PT não consolidado",1]],"337":[["Levitate","Levitação",0]],"338":[["Levitate","Levitação",0]],"339":[["Oblivious","Nome PT não consolidado",0],["Anticipation","Nome PT não consolidado",0],["Hydration","Nome PT não consolidado",1]],"340":[["Oblivious","Nome PT não consolidado",0],["Anticipation","Nome PT não consolidado",0],["Hydration","Nome PT não consolidado",1]],"341":[["Hyper Cutter","Nome PT não consolidado",0],["Shell Armor","Armadura de Concha",0],["Adaptability","Adaptabilidade",1]],"342":[["Hyper Cutter","Nome PT não consolidado",0],["Shell Armor","Armadura de Concha",0],["Adaptability","Adaptabilidade",1]],"343":[["Levitate","Levitação",0]],"344":[["Levitate","Levitação",0]],"345":[["Suction Cups","Nome PT não consolidado",0],["Storm Drain","Nome PT não consolidado",1]],"346":[["Suction Cups","Nome PT não consolidado",0],["Storm Drain","Nome PT não consolidado",1]],"347":[["Battle Armor","Nome PT não consolidado",0],["Swift Swim","Nado Rápido",1]],"348":[["Battle Armor","Nome PT não consolidado",0],["Swift Swim","Nado Rápido",1]],"349":[["Swift Swim","Nado Rápido",0],["Oblivious","Nome PT não consolidado",0],["Adaptability","Adaptabilidade",1]],"350":[["Marvel Scale","Nome PT não consolidado",0],["Competitive","Nome PT não consolidado",0],["Cute Charm","Nome PT não consolidado",1]],"351":[["Forecast","Nome PT não consolidado",0]],"352":[["Color Change","Nome PT não consolidado",0],["Protean","Nome PT não consolidado",1]],"353":[["Insomnia","Insônia",0],["Frisk","Nome PT não consolidado",0],["Cursed Body","Nome PT não consolidado",1]],"354":[["Prankster","Travesso",0]],"355":[["Levitate","Levitação",0],["Frisk","Nome PT não consolidado",1]],"356":[["Pressure","Nome PT não consolidado",0],["Frisk","Nome PT não consolidado",1]],"357":[["Chlorophyll","Nome PT não consolidado",0],["Solar Power","Poder Solar",0],["Harvest","Nome PT não consolidado",1]],"358":[["Levitate","Levitação",0]],"359":[["Magic Bounce","Espelho Mágico",0]],"360":[["Shadow Tag","Toque Sombrio",0],["Telepathy","Nome PT não consolidado",1]],"361":[["Inner Focus","Força Interior",0],["Ice Body","Nome PT não consolidado",0],["Moody","Nome PT não consolidado",1]],"362":[["Refrigerate","Refrigerar",0]],"363":[["Thick Fat","Gordura Espessa",0],["Ice Body","Nome PT não consolidado",0],["Oblivious","Nome PT não consolidado",1]],"364":[["Thick Fat","Gordura Espessa",0],["Ice Body","Nome PT não consolidado",0],["Oblivious","Nome PT não consolidado",1]],"365":[["Thick Fat","Gordura Espessa",0],["Ice Body","Nome PT não consolidado",0],["Oblivious","Nome PT não consolidado",1]],"366":[["Shell Armor","Armadura de Concha",0],["Rattled","Nome PT não consolidado",1]],"367":[["Swift Swim","Nado Rápido",0],["Water Veil","Nome PT não consolidado",1]],"368":[["Swift Swim","Nado Rápido",0],["Hydration","Nome PT não consolidado",1]],"369":[["Swift Swim","Nado Rápido",0],["Rock Head","Nome PT não consolidado",0],["Sturdy","Nome PT não consolidado",1]],"370":[["Swift Swim","Nado Rápido",0],["Hydration","Nome PT não consolidado",1]],"371":[["Rock Head","Nome PT não consolidado",0],["Sheer Force","Força Absoluta",1]],"372":[["Rock Head","Nome PT não consolidado",0],["Overcoat","Nome PT não consolidado",1]],"373":[["Aerilate","Mãos Aéreas",0]],"374":[["Clear Body","Nome PT não consolidado",0],["Light Metal","Nome PT não consolidado",1]],"375":[["Clear Body","Nome PT não consolidado",0],["Light Metal","Nome PT não consolidado",1]],"376":[["Tough Claws","Garras Firmes",0]],"377":[["Clear Body","Nome PT não consolidado",0],["Sturdy","Nome PT não consolidado",1]],"378":[["Clear Body","Nome PT não consolidado",0],["Ice Body","Nome PT não consolidado",1]],"379":[["Clear Body","Nome PT não consolidado",0],["Light Metal","Nome PT não consolidado",1]],"380":[["Levitate","Levitação",0]],"381":[["Levitate","Levitação",0]],"382":[["Primordial Sea","Nome PT não consolidado",0]],"383":[["Desolate Land","Nome PT não consolidado",0]],"384":[["Delta Stream","Fluxo Delta",0]],"385":[["Serene Grace","Nome PT não consolidado",0]],"386":[["Pressure","Nome PT não consolidado",0]],"387":[["Overgrow","Supercrescimento",0],["Shell Armor","Armadura de Concha",1]],"388":[["Overgrow","Supercrescimento",0],["Shell Armor","Armadura de Concha",1]],"389":[["Overgrow","Supercrescimento",0],["Shell Armor","Armadura de Concha",1]],"390":[["Blaze","Incêndio",0],["Iron Fist","Nome PT não consolidado",1]],"391":[["Blaze","Incêndio",0],["Iron Fist","Nome PT não consolidado",1]],"392":[["Blaze","Incêndio",0],["Iron Fist","Nome PT não consolidado",1]],"393":[["Torrent","Dilúvio",0],["Competitive","Nome PT não consolidado",1]],"394":[["Torrent","Dilúvio",0],["Competitive","Nome PT não consolidado",1]],"395":[["Torrent","Dilúvio",0],["Competitive","Nome PT não consolidado",1]],"396":[["Keen Eye","Nome PT não consolidado",0],["Reckless","Nome PT não consolidado",1]],"397":[["Intimidate","Intimidação",0],["Reckless","Nome PT não consolidado",1]],"398":[["Intimidate","Intimidação",0],["Reckless","Nome PT não consolidado",1]],"399":[["Simple","Nome PT não consolidado",0],["Unaware","Nome PT não consolidado",0],["Moody","Nome PT não consolidado",1]],"400":[["Simple","Nome PT não consolidado",0],["Unaware","Nome PT não consolidado",0],["Moody","Nome PT não consolidado",1]],"401":[["Shed Skin","Nome PT não consolidado",0],["Run Away","Nome PT não consolidado",1]],"402":[["Swarm","Nome PT não consolidado",0],["Technician","Técnico",1]],"403":[["Rivalry","Nome PT não consolidado",0],["Intimidate","Intimidação",0],["Guts","Nome PT não consolidado",1]],"404":[["Rivalry","Nome PT não consolidado",0],["Intimidate","Intimidação",0],["Guts","Nome PT não consolidado",1]],"405":[["Rivalry","Nome PT não consolidado",0],["Intimidate","Intimidação",0],["Guts","Nome PT não consolidado",1]],"406":[["Natural Cure","Nome PT não consolidado",0],["Poison Point","Nome PT não consolidado",0],["Leaf Guard","Nome PT não consolidado",1]],"407":[["Natural Cure","Nome PT não consolidado",0],["Poison Point","Nome PT não consolidado",0],["Technician","Técnico",1]],"408":[["Mold Breaker","Quebra-moldes",0],["Sheer Force","Força Absoluta",1]],"409":[["Mold Breaker","Quebra-moldes",0],["Sheer Force","Força Absoluta",1]],"410":[["Sturdy","Nome PT não consolidado",0],["Soundproof","Nome PT não consolidado",1]],"411":[["Sturdy","Nome PT não consolidado",0],["Soundproof","Nome PT não consolidado",1]],"412":[["Shed Skin","Nome PT não consolidado",0],["Overcoat","Nome PT não consolidado",1]],"413":[["Anticipation","Nome PT não consolidado",0],["Overcoat","Nome PT não consolidado",1]],"414":[["Swarm","Nome PT não consolidado",0],["Tinted Lens","Nome PT não consolidado",1]],"415":[["Honey Gather","Nome PT não consolidado",0],["Hustle","Nome PT não consolidado",1]],"416":[["Pressure","Nome PT não consolidado",0],["Unnerve","Nome PT não consolidado",1]],"417":[["Run Away","Nome PT não consolidado",0],["Pickup","Nome PT não consolidado",0],["Volt Absorb","Nome PT não consolidado",1]],"418":[["Swift Swim","Nado Rápido",0],["Water Veil","Nome PT não consolidado",1]],"419":[["Swift Swim","Nado Rápido",0],["Water Veil","Nome PT não consolidado",1]],"420":[["Chlorophyll","Nome PT não consolidado",0]],"421":[["Flower Gift","Nome PT não consolidado",0]],"422":[["Sticky Hold","Nome PT não consolidado",0],["Storm Drain","Nome PT não consolidado",0],["Sand Force","Força Arenosa",1]],"423":[["Sticky Hold","Nome PT não consolidado",0],["Storm Drain","Nome PT não consolidado",0],["Sand Force","Força Arenosa",1]],"424":[["Technician","Técnico",0],["Pickup","Nome PT não consolidado",0],["Skill Link","Encadeado",1]],"425":[["Aftermath","Nome PT não consolidado",0],["Unburden","Nome PT não consolidado",0],["Flare Boost","Nome PT não consolidado",1]],"426":[["Aftermath","Nome PT não consolidado",0],["Unburden","Nome PT não consolidado",0],["Flare Boost","Nome PT não consolidado",1]],"427":[["Run Away","Nome PT não consolidado",0],["Klutz","Nome PT não consolidado",0],["Limber","Nome PT não consolidado",1]],"428":[["Scrappy","Brigão",0]],"429":[["Levitate","Levitação",0]],"430":[["Insomnia","Insônia",0],["Super Luck","Nome PT não consolidado",0],["Moxie","Nome PT não consolidado",1]],"431":[["Limber","Nome PT não consolidado",0],["Own Tempo","Nome PT não consolidado",0],["Keen Eye","Nome PT não consolidado",1]],"432":[["Thick Fat","Gordura Espessa",0],["Own Tempo","Nome PT não consolidado",0],["Defiant","Nome PT não consolidado",1]],"433":[["Levitate","Levitação",0]],"434":[["Stench","Nome PT não consolidado",0],["Aftermath","Nome PT não consolidado",0],["Keen Eye","Nome PT não consolidado",1]],"435":[["Stench","Nome PT não consolidado",0],["Aftermath","Nome PT não consolidado",0],["Keen Eye","Nome PT não consolidado",1]],"436":[["Levitate","Levitação",0],["Heatproof","Nome PT não consolidado",0],["Heavy Metal","Nome PT não consolidado",1]],"437":[["Levitate","Levitação",0],["Heatproof","Nome PT não consolidado",0],["Heavy Metal","Nome PT não consolidado",1]],"438":[["Sturdy","Nome PT não consolidado",0],["Rock Head","Nome PT não consolidado",0],["Rattled","Nome PT não consolidado",1]],"439":[["Soundproof","Nome PT não consolidado",0],["Filter","Filtro",0],["Technician","Técnico",1]],"440":[["Natural Cure","Nome PT não consolidado",0],["Serene Grace","Nome PT não consolidado",0],["Friend Guard","Nome PT não consolidado",1]],"441":[["Keen Eye","Nome PT não consolidado",0],["Tangled Feet","Nome PT não consolidado",0],["Big Pecks","Nome PT não consolidado",1]],"442":[["Pressure","Nome PT não consolidado",0],["Infiltrator","Nome PT não consolidado",1]],"443":[["Sand Veil","Nome PT não consolidado",0],["Rough Skin","Nome PT não consolidado",1]],"444":[["Sand Veil","Nome PT não consolidado",0],["Rough Skin","Nome PT não consolidado",1]],"445":[["Sand Force","Força Arenosa",0]],"446":[["Pickup","Nome PT não consolidado",0],["Thick Fat","Gordura Espessa",0],["Gluttony","Nome PT não consolidado",1]],"447":[["Steadfast","Inabalável",0],["Inner Focus","Força Interior",0],["Prankster","Travesso",1]],"448":[["Adaptability","Adaptabilidade",0]],"449":[["Sand Stream","Fluxo de Areia",0],["Sand Force","Força Arenosa",1]],"450":[["Sand Stream","Fluxo de Areia",0],["Sand Force","Força Arenosa",1]],"451":[["Battle Armor","Nome PT não consolidado",0],["Sniper","Nome PT não consolidado",0],["Keen Eye","Nome PT não consolidado",1]],"452":[["Battle Armor","Nome PT não consolidado",0],["Sniper","Nome PT não consolidado",0],["Keen Eye","Nome PT não consolidado",1]],"453":[["Anticipation","Nome PT não consolidado",0],["Dry Skin","Nome PT não consolidado",0],["Poison Touch","Nome PT não consolidado",1]],"454":[["Anticipation","Nome PT não consolidado",0],["Dry Skin","Nome PT não consolidado",0],["Poison Touch","Nome PT não consolidado",1]],"455":[["Levitate","Levitação",0]],"456":[["Swift Swim","Nado Rápido",0],["Storm Drain","Nome PT não consolidado",0],["Water Veil","Nome PT não consolidado",1]],"457":[["Swift Swim","Nado Rápido",0],["Storm Drain","Nome PT não consolidado",0],["Water Veil","Nome PT não consolidado",1]],"458":[["Swift Swim","Nado Rápido",0],["Water Absorb","Nome PT não consolidado",0],["Water Veil","Nome PT não consolidado",1]],"459":[["Snow Warning","Alerta de Neve",0],["Soundproof","Nome PT não consolidado",1]],"460":[["Snow Warning","Alerta de Neve",0]],"461":[["Pressure","Nome PT não consolidado",0],["Pickpocket","Nome PT não consolidado",1]],"462":[["Magnet Pull","Nome PT não consolidado",0],["Sturdy","Nome PT não consolidado",0],["Analytic","Nome PT não consolidado",1]],"463":[["Own Tempo","Nome PT não consolidado",0],["Oblivious","Nome PT não consolidado",0],["Cloud Nine","Nome PT não consolidado",1]],"464":[["Lightning Rod","Para-raios",0],["Solid Rock","Nome PT não consolidado",0],["Reckless","Nome PT não consolidado",1]],"465":[["Chlorophyll","Nome PT não consolidado",0],["Leaf Guard","Nome PT não consolidado",0],["Regenerator","Nome PT não consolidado",1]],"466":[["Motor Drive","Nome PT não consolidado",0],["Vital Spirit","Nome PT não consolidado",1]],"467":[["Flame Body","Nome PT não consolidado",0],["Vital Spirit","Nome PT não consolidado",1]],"468":[["Hustle","Nome PT não consolidado",0],["Serene Grace","Nome PT não consolidado",0],["Super Luck","Nome PT não consolidado",1]],"469":[["Speed Boost","Impulso de Velocidade",0],["Tinted Lens","Nome PT não consolidado",0],["Frisk","Nome PT não consolidado",1]],"470":[["Leaf Guard","Nome PT não consolidado",0],["Chlorophyll","Nome PT não consolidado",1]],"471":[["Snow Cloak","Nome PT não consolidado",0],["Ice Body","Nome PT não consolidado",1]],"472":[["Hyper Cutter","Nome PT não consolidado",0],["Sand Veil","Nome PT não consolidado",0],["Poison Heal","Nome PT não consolidado",1]],"473":[["Oblivious","Nome PT não consolidado",0],["Snow Cloak","Nome PT não consolidado",0],["Thick Fat","Gordura Espessa",1]],"474":[["Adaptability","Adaptabilidade",0],["Download","Nome PT não consolidado",0],["Analytic","Nome PT não consolidado",1]],"475":[["Inner Focus","Força Interior",0]],"476":[["Sturdy","Nome PT não consolidado",0],["Magnet Pull","Nome PT não consolidado",0],["Sand Force","Força Arenosa",1]],"477":[["Pressure","Nome PT não consolidado",0],["Frisk","Nome PT não consolidado",1]],"478":[["Snow Warning","Alerta de Neve",0]],"479":[["Levitate","Levitação",0]],"480":[["Levitate","Levitação",0]],"481":[["Levitate","Levitação",0]],"482":[["Levitate","Levitação",0]],"483":[["Pressure","Nome PT não consolidado",0],["Telepathy","Nome PT não consolidado",1]],"484":[["Pressure","Nome PT não consolidado",0],["Telepathy","Nome PT não consolidado",1]],"485":[["Flash Fire","Nome PT não consolidado",0],["Flame Body","Nome PT não consolidado",1]],"486":[["Slow Start","Nome PT não consolidado",0]],"487":[["Levitate","Levitação",0]],"488":[["Levitate","Levitação",0]],"489":[["Hydration","Nome PT não consolidado",0]],"490":[["Hydration","Nome PT não consolidado",0]],"491":[["Bad Dreams","Nome PT não consolidado",0]],"492":[["Serene Grace","Nome PT não consolidado",0]],"493":[["Multitype","Nome PT não consolidado",0]],"494":[["Victory Star","Nome PT não consolidado",0]],"495":[["Overgrow","Supercrescimento",0],["Contrary","Nome PT não consolidado",1]],"496":[["Overgrow","Supercrescimento",0],["Contrary","Nome PT não consolidado",1]],"497":[["Overgrow","Supercrescimento",0],["Contrary","Nome PT não consolidado",1]],"498":[["Blaze","Incêndio",0],["Thick Fat","Gordura Espessa",1]],"499":[["Blaze","Incêndio",0],["Thick Fat","Gordura Espessa",1]],"500":[["Mold Breaker","Quebra-moldes",0]],"501":[["Torrent","Dilúvio",0],["Shell Armor","Armadura de Concha",1]],"502":[["Torrent","Dilúvio",0],["Shell Armor","Armadura de Concha",1]],"503":[["Torrent","Dilúvio",0],["Sharpness","Nome PT não consolidado",1]],"504":[["Run Away","Nome PT não consolidado",0],["Keen Eye","Nome PT não consolidado",0],["Analytic","Nome PT não consolidado",1]],"505":[["Illuminate","Nome PT não consolidado",0],["Keen Eye","Nome PT não consolidado",0],["Analytic","Nome PT não consolidado",1]],"506":[["Vital Spirit","Nome PT não consolidado",0],["Pickup","Nome PT não consolidado",0],["Run Away","Nome PT não consolidado",1]],"507":[["Intimidate","Intimidação",0],["Sand Rush","Nome PT não consolidado",0],["Scrappy","Brigão",1]],"508":[["Intimidate","Intimidação",0],["Sand Rush","Nome PT não consolidado",0],["Scrappy","Brigão",1]],"509":[["Limber","Nome PT não consolidado",0],["Unburden","Nome PT não consolidado",0],["Prankster","Travesso",1]],"510":[["Limber","Nome PT não consolidado",0],["Unburden","Nome PT não consolidado",0],["Prankster","Travesso",1]],"511":[["Gluttony","Nome PT não consolidado",0],["Overgrow","Supercrescimento",1]],"512":[["Gluttony","Nome PT não consolidado",0],["Overgrow","Supercrescimento",1]],"513":[["Gluttony","Nome PT não consolidado",0],["Blaze","Incêndio",1]],"514":[["Gluttony","Nome PT não consolidado",0],["Blaze","Incêndio",1]],"515":[["Gluttony","Nome PT não consolidado",0],["Torrent","Dilúvio",1]],"516":[["Gluttony","Nome PT não consolidado",0],["Torrent","Dilúvio",1]],"517":[["Forewarn","Nome PT não consolidado",0],["Synchronize","Nome PT não consolidado",0],["Telepathy","Nome PT não consolidado",1]],"518":[["Forewarn","Nome PT não consolidado",0],["Synchronize","Nome PT não consolidado",0],["Telepathy","Nome PT não consolidado",1]],"519":[["Big Pecks","Nome PT não consolidado",0],["Super Luck","Nome PT não consolidado",0],["Rivalry","Nome PT não consolidado",1]],"520":[["Big Pecks","Nome PT não consolidado",0],["Super Luck","Nome PT não consolidado",0],["Rivalry","Nome PT não consolidado",1]],"521":[["Big Pecks","Nome PT não consolidado",0],["Super Luck","Nome PT não consolidado",0],["Rivalry","Nome PT não consolidado",1]],"522":[["Lightning Rod","Para-raios",0],["Motor Drive","Nome PT não consolidado",0],["Sap Sipper","Nome PT não consolidado",1]],"523":[["Lightning Rod","Para-raios",0],["Motor Drive","Nome PT não consolidado",0],["Sap Sipper","Nome PT não consolidado",1]],"524":[["Sturdy","Nome PT não consolidado",0],["Weak Armor","Nome PT não consolidado",0],["Sand Force","Força Arenosa",1]],"525":[["Sturdy","Nome PT não consolidado",0],["Weak Armor","Nome PT não consolidado",0],["Sand Force","Força Arenosa",1]],"526":[["Sturdy","Nome PT não consolidado",0],["Sand Stream","Fluxo de Areia",0],["Sand Force","Força Arenosa",1]],"527":[["Unaware","Nome PT não consolidado",0],["Klutz","Nome PT não consolidado",0],["Simple","Nome PT não consolidado",1]],"528":[["Unaware","Nome PT não consolidado",0],["Klutz","Nome PT não consolidado",0],["Simple","Nome PT não consolidado",1]],"529":[["Sand Rush","Nome PT não consolidado",0],["Sand Force","Força Arenosa",0],["Mold Breaker","Quebra-moldes",1]],"530":[["Piercing Drill","Nome PT não consolidado",0]],"531":[["Healer","Curador",0]],"532":[["Guts","Nome PT não consolidado",0],["Sheer Force","Força Absoluta",0],["Iron Fist","Nome PT não consolidado",1]],"533":[["Guts","Nome PT não consolidado",0],["Sheer Force","Força Absoluta",0],["Iron Fist","Nome PT não consolidado",1]],"534":[["Guts","Nome PT não consolidado",0],["Sheer Force","Força Absoluta",0],["Iron Fist","Nome PT não consolidado",1]],"535":[["Swift Swim","Nado Rápido",0],["Hydration","Nome PT não consolidado",0],["Water Absorb","Nome PT não consolidado",1]],"536":[["Swift Swim","Nado Rápido",0],["Hydration","Nome PT não consolidado",0],["Water Absorb","Nome PT não consolidado",1]],"537":[["Swift Swim","Nado Rápido",0],["Poison Touch","Nome PT não consolidado",0],["Water Absorb","Nome PT não consolidado",1]],"538":[["Guts","Nome PT não consolidado",0],["Inner Focus","Força Interior",0],["Mold Breaker","Quebra-moldes",1]],"539":[["Sturdy","Nome PT não consolidado",0],["Inner Focus","Força Interior",0],["Mold Breaker","Quebra-moldes",1]],"540":[["Swarm","Nome PT não consolidado",0],["Chlorophyll","Nome PT não consolidado",0],["Overcoat","Nome PT não consolidado",1]],"541":[["Leaf Guard","Nome PT não consolidado",0],["Chlorophyll","Nome PT não consolidado",0],["Overcoat","Nome PT não consolidado",1]],"542":[["Swarm","Nome PT não consolidado",0],["Chlorophyll","Nome PT não consolidado",0],["Overcoat","Nome PT não consolidado",1]],"543":[["Poison Point","Nome PT não consolidado",0],["Swarm","Nome PT não consolidado",0],["Speed Boost","Impulso de Velocidade",1]],"544":[["Poison Point","Nome PT não consolidado",0],["Swarm","Nome PT não consolidado",0],["Speed Boost","Impulso de Velocidade",1]],"545":[["Shell Armor","Armadura de Concha",0]],"546":[["Prankster","Travesso",0],["Infiltrator","Nome PT não consolidado",0],["Chlorophyll","Nome PT não consolidado",1]],"547":[["Prankster","Travesso",0],["Infiltrator","Nome PT não consolidado",0],["Chlorophyll","Nome PT não consolidado",1]],"548":[["Chlorophyll","Nome PT não consolidado",0],["Own Tempo","Nome PT não consolidado",0],["Leaf Guard","Nome PT não consolidado",1]],"549":[["Chlorophyll","Nome PT não consolidado",0],["Hustle","Nome PT não consolidado",0],["Leaf Guard","Nome PT não consolidado",1]],"550":[["Rattled","Nome PT não consolidado",0],["Adaptability","Adaptabilidade",0],["Mold Breaker","Quebra-moldes",1]],"551":[["Intimidate","Intimidação",0],["Moxie","Nome PT não consolidado",0],["Anger Point","Nome PT não consolidado",1]],"552":[["Intimidate","Intimidação",0],["Moxie","Nome PT não consolidado",0],["Anger Point","Nome PT não consolidado",1]],"553":[["Intimidate","Intimidação",0],["Moxie","Nome PT não consolidado",0],["Anger Point","Nome PT não consolidado",1]],"554":[["Hustle","Nome PT não consolidado",0],["Inner Focus","Força Interior",1]],"555":[["Zen Mode","Nome PT não consolidado",0]],"556":[["Water Absorb","Nome PT não consolidado",0],["Chlorophyll","Nome PT não consolidado",0],["Storm Drain","Nome PT não consolidado",1]],"557":[["Sturdy","Nome PT não consolidado",0],["Shell Armor","Armadura de Concha",0],["Weak Armor","Nome PT não consolidado",1]],"558":[["Sturdy","Nome PT não consolidado",0],["Shell Armor","Armadura de Concha",0],["Weak Armor","Nome PT não consolidado",1]],"559":[["Shed Skin","Nome PT não consolidado",0],["Moxie","Nome PT não consolidado",0],["Intimidate","Intimidação",1]],"560":[["Intimidate","Intimidação",0]],"561":[["Wonder Skin","Nome PT não consolidado",0],["Magic Guard","Nome PT não consolidado",0],["Tinted Lens","Nome PT não consolidado",1]],"562":[["Wandering Spirit","Nome PT não consolidado",0]],"563":[["Mummy","Nome PT não consolidado",0]],"564":[["Solid Rock","Nome PT não consolidado",0],["Sturdy","Nome PT não consolidado",0],["Swift Swim","Nado Rápido",1]],"565":[["Solid Rock","Nome PT não consolidado",0],["Sturdy","Nome PT não consolidado",0],["Swift Swim","Nado Rápido",1]],"566":[["Defeatist","Nome PT não consolidado",0]],"567":[["Defeatist","Nome PT não consolidado",0]],"568":[["Stench","Nome PT não consolidado",0],["Sticky Hold","Nome PT não consolidado",0],["Aftermath","Nome PT não consolidado",1]],"569":[["Stench","Nome PT não consolidado",0],["Weak Armor","Nome PT não consolidado",0],["Aftermath","Nome PT não consolidado",1]],"570":[["Illusion","Nome PT não consolidado",0]],"571":[["Illusion","Nome PT não consolidado",0]],"572":[["Cute Charm","Nome PT não consolidado",0],["Technician","Técnico",0],["Skill Link","Encadeado",1]],"573":[["Cute Charm","Nome PT não consolidado",0],["Technician","Técnico",0],["Skill Link","Encadeado",1]],"574":[["Frisk","Nome PT não consolidado",0],["Competitive","Nome PT não consolidado",0],["Shadow Tag","Toque Sombrio",1]],"575":[["Frisk","Nome PT não consolidado",0],["Competitive","Nome PT não consolidado",0],["Shadow Tag","Toque Sombrio",1]],"576":[["Frisk","Nome PT não consolidado",0],["Competitive","Nome PT não consolidado",0],["Shadow Tag","Toque Sombrio",1]],"577":[["Overcoat","Nome PT não consolidado",0],["Magic Guard","Nome PT não consolidado",0],["Regenerator","Nome PT não consolidado",1]],"578":[["Overcoat","Nome PT não consolidado",0],["Magic Guard","Nome PT não consolidado",0],["Regenerator","Nome PT não consolidado",1]],"579":[["Overcoat","Nome PT não consolidado",0],["Magic Guard","Nome PT não consolidado",0],["Regenerator","Nome PT não consolidado",1]],"580":[["Keen Eye","Nome PT não consolidado",0],["Big Pecks","Nome PT não consolidado",0],["Hydration","Nome PT não consolidado",1]],"581":[["Keen Eye","Nome PT não consolidado",0],["Big Pecks","Nome PT não consolidado",0],["Hydration","Nome PT não consolidado",1]],"582":[["Ice Body","Nome PT não consolidado",0],["Snow Cloak","Nome PT não consolidado",0],["Weak Armor","Nome PT não consolidado",1]],"583":[["Ice Body","Nome PT não consolidado",0],["Snow Cloak","Nome PT não consolidado",0],["Weak Armor","Nome PT não consolidado",1]],"584":[["Ice Body","Nome PT não consolidado",0],["Snow Warning","Alerta de Neve",0],["Weak Armor","Nome PT não consolidado",1]],"585":[["Chlorophyll","Nome PT não consolidado",0],["Sap Sipper","Nome PT não consolidado",0],["Serene Grace","Nome PT não consolidado",1]],"586":[["Chlorophyll","Nome PT não consolidado",0],["Sap Sipper","Nome PT não consolidado",0],["Serene Grace","Nome PT não consolidado",1]],"587":[["Static","Nome PT não consolidado",0],["Motor Drive","Nome PT não consolidado",1]],"588":[["Swarm","Nome PT não consolidado",0],["Shed Skin","Nome PT não consolidado",0],["No Guard","Indefeso",1]],"589":[["Swarm","Nome PT não consolidado",0],["Shell Armor","Armadura de Concha",0],["Overcoat","Nome PT não consolidado",1]],"590":[["Effect Spore","Nome PT não consolidado",0],["Regenerator","Nome PT não consolidado",1]],"591":[["Effect Spore","Nome PT não consolidado",0],["Regenerator","Nome PT não consolidado",1]],"592":[["Water Absorb","Nome PT não consolidado",0],["Cursed Body","Nome PT não consolidado",0],["Damp","Nome PT não consolidado",1]],"593":[["Water Absorb","Nome PT não consolidado",0],["Cursed Body","Nome PT não consolidado",0],["Damp","Nome PT não consolidado",1]],"594":[["Healer","Curador",0],["Hydration","Nome PT não consolidado",0],["Regenerator","Nome PT não consolidado",1]],"595":[["Compound Eyes","Nome PT não consolidado",0],["Unnerve","Nome PT não consolidado",0],["Swarm","Nome PT não consolidado",1]],"596":[["Compound Eyes","Nome PT não consolidado",0],["Unnerve","Nome PT não consolidado",0],["Swarm","Nome PT não consolidado",1]],"597":[["Iron Barbs","Nome PT não consolidado",0]],"598":[["Iron Barbs","Nome PT não consolidado",0],["Anticipation","Nome PT não consolidado",1]],"599":[["Plus","Nome PT não consolidado",0],["Minus","Nome PT não consolidado",0],["Clear Body","Nome PT não consolidado",1]],"600":[["Plus","Nome PT não consolidado",0],["Minus","Nome PT não consolidado",0],["Clear Body","Nome PT não consolidado",1]],"601":[["Plus","Nome PT não consolidado",0],["Minus","Nome PT não consolidado",0],["Clear Body","Nome PT não consolidado",1]],"602":[["Levitate","Levitação",0]],"603":[["Levitate","Levitação",0]],"604":[["Eelevate","Nome PT não consolidado",0]],"605":[["Telepathy","Nome PT não consolidado",0],["Synchronize","Nome PT não consolidado",0],["Analytic","Nome PT não consolidado",1]],"606":[["Telepathy","Nome PT não consolidado",0],["Synchronize","Nome PT não consolidado",0],["Analytic","Nome PT não consolidado",1]],"607":[["Flash Fire","Nome PT não consolidado",0],["Flame Body","Nome PT não consolidado",0],["Infiltrator","Nome PT não consolidado",1]],"608":[["Flash Fire","Nome PT não consolidado",0],["Flame Body","Nome PT não consolidado",0],["Infiltrator","Nome PT não consolidado",1]],"609":[["Infiltrator","Nome PT não consolidado",0]],"610":[["Rivalry","Nome PT não consolidado",0],["Mold Breaker","Quebra-moldes",0],["Unnerve","Nome PT não consolidado",1]],"611":[["Rivalry","Nome PT não consolidado",0],["Mold Breaker","Quebra-moldes",0],["Unnerve","Nome PT não consolidado",1]],"612":[["Rivalry","Nome PT não consolidado",0],["Mold Breaker","Quebra-moldes",0],["Unnerve","Nome PT não consolidado",1]],"613":[["Snow Cloak","Nome PT não consolidado",0],["Slush Rush","Nome PT não consolidado",0],["Rattled","Nome PT não consolidado",1]],"614":[["Snow Cloak","Nome PT não consolidado",0],["Slush Rush","Nome PT não consolidado",0],["Swift Swim","Nado Rápido",1]],"615":[["Levitate","Levitação",0]],"616":[["Hydration","Nome PT não consolidado",0],["Shell Armor","Armadura de Concha",0],["Overcoat","Nome PT não consolidado",1]],"617":[["Hydration","Nome PT não consolidado",0],["Sticky Hold","Nome PT não consolidado",0],["Unburden","Nome PT não consolidado",1]],"618":[["Mimicry","Nome PT não consolidado",0]],"619":[["Inner Focus","Força Interior",0],["Regenerator","Nome PT não consolidado",0],["Reckless","Nome PT não consolidado",1]],"620":[["Inner Focus","Força Interior",0],["Regenerator","Nome PT não consolidado",0],["Reckless","Nome PT não consolidado",1]],"621":[["Rough Skin","Nome PT não consolidado",0],["Sheer Force","Força Absoluta",0],["Mold Breaker","Quebra-moldes",1]],"622":[["Iron Fist","Nome PT não consolidado",0],["Klutz","Nome PT não consolidado",0],["No Guard","Indefeso",1]],"623":[["Unseen Fist","Nome PT não consolidado",0]],"624":[["Defiant","Nome PT não consolidado",0],["Inner Focus","Força Interior",0],["Pressure","Nome PT não consolidado",1]],"625":[["Defiant","Nome PT não consolidado",0],["Inner Focus","Força Interior",0],["Pressure","Nome PT não consolidado",1]],"626":[["Reckless","Nome PT não consolidado",0],["Sap Sipper","Nome PT não consolidado",0],["Soundproof","Nome PT não consolidado",1]],"627":[["Keen Eye","Nome PT não consolidado",0],["Sheer Force","Força Absoluta",0],["Hustle","Nome PT não consolidado",1]],"628":[["Keen Eye","Nome PT não consolidado",0],["Sheer Force","Força Absoluta",0],["Tinted Lens","Nome PT não consolidado",1]],"629":[["Big Pecks","Nome PT não consolidado",0],["Overcoat","Nome PT não consolidado",0],["Weak Armor","Nome PT não consolidado",1]],"630":[["Big Pecks","Nome PT não consolidado",0],["Overcoat","Nome PT não consolidado",0],["Weak Armor","Nome PT não consolidado",1]],"631":[["Gluttony","Nome PT não consolidado",0],["Flash Fire","Nome PT não consolidado",0],["White Smoke","Nome PT não consolidado",1]],"632":[["Swarm","Nome PT não consolidado",0],["Hustle","Nome PT não consolidado",0],["Truant","Nome PT não consolidado",1]],"633":[["Hustle","Nome PT não consolidado",0]],"634":[["Hustle","Nome PT não consolidado",0]],"635":[["Levitate","Levitação",0]],"636":[["Flame Body","Nome PT não consolidado",0],["Swarm","Nome PT não consolidado",1]],"637":[["Flame Body","Nome PT não consolidado",0],["Swarm","Nome PT não consolidado",1]],"638":[["Justified","Nome PT não consolidado",0]],"639":[["Justified","Nome PT não consolidado",0]],"640":[["Justified","Nome PT não consolidado",0]],"641":[["Regenerator","Nome PT não consolidado",0]],"642":[["Volt Absorb","Nome PT não consolidado",0]],"643":[["Turboblaze","Nome PT não consolidado",0]],"644":[["Teravolt","Nome PT não consolidado",0]],"645":[["Intimidate","Intimidação",0]],"646":[["Turboblaze","Nome PT não consolidado",0]],"647":[["Justified","Nome PT não consolidado",0]],"648":[["Serene Grace","Nome PT não consolidado",0]],"649":[["Download","Nome PT não consolidado",0]],"650":[["Overgrow","Supercrescimento",0],["Bulletproof","Nome PT não consolidado",1]],"651":[["Overgrow","Supercrescimento",0],["Bulletproof","Nome PT não consolidado",1]],"652":[["Bulletproof","Nome PT não consolidado",0]],"653":[["Blaze","Incêndio",0],["Magician","Nome PT não consolidado",1]],"654":[["Blaze","Incêndio",0],["Magician","Nome PT não consolidado",1]],"655":[["Levitate","Levitação",0]],"656":[["Torrent","Dilúvio",0],["Protean","Nome PT não consolidado",1]],"657":[["Torrent","Dilúvio",0],["Protean","Nome PT não consolidado",1]],"658":[["Protean","Nome PT não consolidado",0]],"659":[["Pickup","Nome PT não consolidado",0],["Cheek Pouch","Nome PT não consolidado",0],["Huge Power","Poderzão",1]],"660":[["Pickup","Nome PT não consolidado",0],["Cheek Pouch","Nome PT não consolidado",0],["Huge Power","Poderzão",1]],"661":[["Big Pecks","Nome PT não consolidado",0],["Gale Wings","Nome PT não consolidado",1]],"662":[["Flame Body","Nome PT não consolidado",0],["Gale Wings","Nome PT não consolidado",1]],"663":[["Flame Body","Nome PT não consolidado",0],["Gale Wings","Nome PT não consolidado",1]],"664":[["Shield Dust","Nome PT não consolidado",0],["Compound Eyes","Nome PT não consolidado",0],["Friend Guard","Nome PT não consolidado",1]],"665":[["Shed Skin","Nome PT não consolidado",0],["Friend Guard","Nome PT não consolidado",1]],"666":[["Shield Dust","Nome PT não consolidado",0],["Compound Eyes","Nome PT não consolidado",0],["Friend Guard","Nome PT não consolidado",1]],"667":[["Rivalry","Nome PT não consolidado",0],["Unnerve","Nome PT não consolidado",0],["Moxie","Nome PT não consolidado",1]],"668":[["Fire Mane","Nome PT não consolidado",0]],"669":[["Flower Veil","Nome PT não consolidado",0],["Symbiosis","Nome PT não consolidado",1]],"670":[["Flower Veil","Nome PT não consolidado",0],["Symbiosis","Nome PT não consolidado",1]],"671":[["Flower Veil","Nome PT não consolidado",0],["Symbiosis","Nome PT não consolidado",1]],"672":[["Sap Sipper","Nome PT não consolidado",0],["Grass Pelt","Nome PT não consolidado",1]],"673":[["Sap Sipper","Nome PT não consolidado",0],["Grass Pelt","Nome PT não consolidado",1]],"674":[["Iron Fist","Nome PT não consolidado",0],["Mold Breaker","Quebra-moldes",0],["Scrappy","Brigão",1]],"675":[["Iron Fist","Nome PT não consolidado",0],["Mold Breaker","Quebra-moldes",0],["Scrappy","Brigão",1]],"676":[["Fur Coat","Nome PT não consolidado",0]],"677":[["Keen Eye","Nome PT não consolidado",0],["Infiltrator","Nome PT não consolidado",0],["Own Tempo","Nome PT não consolidado",1]],"678":[["Trace","Traçar",0]],"679":[["No Guard","Indefeso",0]],"680":[["No Guard","Indefeso",0]],"681":[["Stance Change","Nome PT não consolidado",0]],"682":[["Healer","Curador",0],["Aroma Veil","Nome PT não consolidado",1]],"683":[["Healer","Curador",0],["Aroma Veil","Nome PT não consolidado",1]],"684":[["Sweet Veil","Nome PT não consolidado",0],["Unburden","Nome PT não consolidado",1]],"685":[["Sweet Veil","Nome PT não consolidado",0],["Unburden","Nome PT não consolidado",1]],"686":[["Contrary","Nome PT não consolidado",0],["Suction Cups","Nome PT não consolidado",0],["Infiltrator","Nome PT não consolidado",1]],"687":[["Contrary","Nome PT não consolidado",0]],"688":[["Tough Claws","Garras Firmes",0],["Sniper","Nome PT não consolidado",0],["Pickpocket","Nome PT não consolidado",1]],"689":[["Tough Claws","Garras Firmes",0]],"690":[["Poison Point","Nome PT não consolidado",0],["Poison Touch","Nome PT não consolidado",0],["Adaptability","Adaptabilidade",1]],"691":[["Regenerator","Nome PT não consolidado",0]],"692":[["Mega Launcher","Megalançador",0]],"693":[["Mega Launcher","Megalançador",0]],"694":[["Dry Skin","Nome PT não consolidado",0],["Sand Veil","Nome PT não consolidado",0],["Solar Power","Poder Solar",1]],"695":[["Dry Skin","Nome PT não consolidado",0],["Sand Veil","Nome PT não consolidado",0],["Solar Power","Poder Solar",1]],"696":[["Strong Jaw","Mandíbula Forte",0],["Sturdy","Nome PT não consolidado",1]],"697":[["Strong Jaw","Mandíbula Forte",0],["Rock Head","Nome PT não consolidado",1]],"698":[["Refrigerate","Refrigerar",0],["Snow Warning","Alerta de Neve",1]],"699":[["Refrigerate","Refrigerar",0],["Snow Warning","Alerta de Neve",1]],"700":[["Cute Charm","Nome PT não consolidado",0],["Pixilate","Mãos de Fada",1]],"701":[["No Guard","Indefeso",0]],"702":[["Cheek Pouch","Nome PT não consolidado",0],["Pickup","Nome PT não consolidado",0],["Plus","Nome PT não consolidado",1]],"703":[["Clear Body","Nome PT não consolidado",0],["Sturdy","Nome PT não consolidado",1]],"704":[["Sap Sipper","Nome PT não consolidado",0],["Hydration","Nome PT não consolidado",0],["Gooey","Nome PT não consolidado",1]],"705":[["Sap Sipper","Nome PT não consolidado",0],["Hydration","Nome PT não consolidado",0],["Gooey","Nome PT não consolidado",1]],"706":[["Sap Sipper","Nome PT não consolidado",0],["Hydration","Nome PT não consolidado",0],["Gooey","Nome PT não consolidado",1]],"707":[["Prankster","Travesso",0],["Magician","Nome PT não consolidado",1]],"708":[["Natural Cure","Nome PT não consolidado",0],["Frisk","Nome PT não consolidado",0],["Harvest","Nome PT não consolidado",1]],"709":[["Natural Cure","Nome PT não consolidado",0],["Frisk","Nome PT não consolidado",0],["Harvest","Nome PT não consolidado",1]],"710":[["Pickup","Nome PT não consolidado",0],["Frisk","Nome PT não consolidado",0],["Insomnia","Insônia",1]],"711":[["Pickup","Nome PT não consolidado",0],["Frisk","Nome PT não consolidado",0],["Insomnia","Insônia",1]],"712":[["Own Tempo","Nome PT não consolidado",0],["Ice Body","Nome PT não consolidado",0],["Sturdy","Nome PT não consolidado",1]],"713":[["Strong Jaw","Mandíbula Forte",0],["Ice Body","Nome PT não consolidado",0],["Sturdy","Nome PT não consolidado",1]],"714":[["Frisk","Nome PT não consolidado",0],["Infiltrator","Nome PT não consolidado",0],["Telepathy","Nome PT não consolidado",1]],"715":[["Frisk","Nome PT não consolidado",0],["Infiltrator","Nome PT não consolidado",0],["Telepathy","Nome PT não consolidado",1]],"716":[["Fairy Aura","Nome PT não consolidado",0]],"717":[["Dark Aura","Nome PT não consolidado",0]],"718":[["Aura Break","Nome PT não consolidado",0]],"719":[["Magic Bounce","Espelho Mágico",0]],"720":[["Magician","Nome PT não consolidado",0]],"721":[["Water Absorb","Nome PT não consolidado",0]],"722":[["Overgrow","Supercrescimento",0],["Long Reach","Nome PT não consolidado",1]],"723":[["Overgrow","Supercrescimento",0],["Long Reach","Nome PT não consolidado",1]],"724":[["Overgrow","Supercrescimento",0],["Scrappy","Brigão",1]],"725":[["Blaze","Incêndio",0],["Intimidate","Intimidação",1]],"726":[["Blaze","Incêndio",0],["Intimidate","Intimidação",1]],"727":[["Blaze","Incêndio",0],["Intimidate","Intimidação",1]],"728":[["Torrent","Dilúvio",0],["Liquid Voice","Nome PT não consolidado",1]],"729":[["Torrent","Dilúvio",0],["Liquid Voice","Nome PT não consolidado",1]],"730":[["Torrent","Dilúvio",0],["Liquid Voice","Nome PT não consolidado",1]],"731":[["Keen Eye","Nome PT não consolidado",0],["Skill Link","Encadeado",0],["Pickup","Nome PT não consolidado",1]],"732":[["Keen Eye","Nome PT não consolidado",0],["Skill Link","Encadeado",0],["Pickup","Nome PT não consolidado",1]],"733":[["Keen Eye","Nome PT não consolidado",0],["Skill Link","Encadeado",0],["Sheer Force","Força Absoluta",1]],"734":[["Stakeout","Nome PT não consolidado",0],["Strong Jaw","Mandíbula Forte",0],["Adaptability","Adaptabilidade",1]],"735":[["Adaptability","Adaptabilidade",0]],"736":[["Swarm","Nome PT não consolidado",0]],"737":[["Battery","Nome PT não consolidado",0]],"738":[["Levitate","Levitação",0]],"739":[["Hyper Cutter","Nome PT não consolidado",0],["Iron Fist","Nome PT não consolidado",0],["Anger Point","Nome PT não consolidado",1]],"740":[["Iron Fist","Nome PT não consolidado",0]],"741":[["Dancer","Nome PT não consolidado",0]],"742":[["Honey Gather","Nome PT não consolidado",0],["Shield Dust","Nome PT não consolidado",0],["Sweet Veil","Nome PT não consolidado",1]],"743":[["Sweet Veil","Nome PT não consolidado",0]],"744":[["Own Tempo","Nome PT não consolidado",0]],"745":[["Keen Eye","Nome PT não consolidado",0],["Vital Spirit","Nome PT não consolidado",0],["No Guard","Indefeso",1]],"746":[["Schooling","Nome PT não consolidado",0]],"747":[["Merciless","Nome PT não consolidado",0],["Limber","Nome PT não consolidado",0],["Regenerator","Nome PT não consolidado",1]],"748":[["Merciless","Nome PT não consolidado",0],["Limber","Nome PT não consolidado",0],["Regenerator","Nome PT não consolidado",1]],"749":[["Own Tempo","Nome PT não consolidado",0],["Stamina","Nome PT não consolidado",0],["Inner Focus","Força Interior",1]],"750":[["Own Tempo","Nome PT não consolidado",0],["Stamina","Nome PT não consolidado",0],["Inner Focus","Força Interior",1]],"751":[["Water Bubble","Nome PT não consolidado",0],["Water Absorb","Nome PT não consolidado",1]],"752":[["Water Bubble","Nome PT não consolidado",0]],"753":[["Leaf Guard","Nome PT não consolidado",0],["Contrary","Nome PT não consolidado",1]],"754":[["Leaf Guard","Nome PT não consolidado",0]],"755":[["Illuminate","Nome PT não consolidado",0],["Effect Spore","Nome PT não consolidado",0],["Rain Dish","Nome PT não consolidado",1]],"756":[["Illuminate","Nome PT não consolidado",0],["Effect Spore","Nome PT não consolidado",0],["Rain Dish","Nome PT não consolidado",1]],"757":[["Corrosion","Nome PT não consolidado",0],["Oblivious","Nome PT não consolidado",1]],"758":[["Corrosion","Nome PT não consolidado",0]],"759":[["Fluffy","Nome PT não consolidado",0],["Klutz","Nome PT não consolidado",0],["Cute Charm","Nome PT não consolidado",1]],"760":[["Fluffy","Nome PT não consolidado",0],["Klutz","Nome PT não consolidado",0],["Unnerve","Nome PT não consolidado",1]],"761":[["Leaf Guard","Nome PT não consolidado",0],["Oblivious","Nome PT não consolidado",0],["Sweet Veil","Nome PT não consolidado",1]],"762":[["Leaf Guard","Nome PT não consolidado",0],["Oblivious","Nome PT não consolidado",0],["Sweet Veil","Nome PT não consolidado",1]],"763":[["Leaf Guard","Nome PT não consolidado",0],["Queenly Majesty","Nome PT não consolidado",0],["Sweet Veil","Nome PT não consolidado",1]],"764":[["Flower Veil","Nome PT não consolidado",0],["Triage","Nome PT não consolidado",0],["Natural Cure","Nome PT não consolidado",1]],"765":[["Inner Focus","Força Interior",0],["Telepathy","Nome PT não consolidado",0],["Symbiosis","Nome PT não consolidado",1]],"766":[["Receiver","Nome PT não consolidado",0],["Defiant","Nome PT não consolidado",1]],"767":[["Wimp Out","Nome PT não consolidado",0]],"768":[["Emergency Exit","Nome PT não consolidado",0]],"769":[["Water Compaction","Nome PT não consolidado",0],["Sand Veil","Nome PT não consolidado",1]],"770":[["Water Compaction","Nome PT não consolidado",0],["Sand Veil","Nome PT não consolidado",1]],"771":[["Innards Out","Nome PT não consolidado",0],["Unaware","Nome PT não consolidado",1]],"772":[["Battle Armor","Nome PT não consolidado",0]],"773":[["RKS System","Nome PT não consolidado",0]],"774":[["Shields Down","Nome PT não consolidado",0]],"775":[["Comatose","Nome PT não consolidado",0]],"776":[["Shell Armor","Armadura de Concha",0]],"777":[["Sturdy","Nome PT não consolidado",0]],"778":[["Disguise","Nome PT não consolidado",0]],"779":[["Dazzling","Nome PT não consolidado",0],["Strong Jaw","Mandíbula Forte",0],["Wonder Skin","Nome PT não consolidado",1]],"780":[["Berserk","Nome PT não consolidado",0]],"781":[["Steelworker","Nome PT não consolidado",0]],"782":[["Bulletproof","Nome PT não consolidado",0],["Soundproof","Nome PT não consolidado",0],["Overcoat","Nome PT não consolidado",1]],"783":[["Bulletproof","Nome PT não consolidado",0],["Soundproof","Nome PT não consolidado",0],["Overcoat","Nome PT não consolidado",1]],"784":[["Overcoat","Nome PT não consolidado",0]],"785":[["Electric Surge","Nome PT não consolidado",0],["Telepathy","Nome PT não consolidado",1]],"786":[["Psychic Surge","Nome PT não consolidado",0],["Telepathy","Nome PT não consolidado",1]],"787":[["Grassy Surge","Nome PT não consolidado",0],["Telepathy","Nome PT não consolidado",1]],"788":[["Misty Surge","Nome PT não consolidado",0],["Telepathy","Nome PT não consolidado",1]],"789":[["Unaware","Nome PT não consolidado",0]],"790":[["Sturdy","Nome PT não consolidado",0]],"791":[["Full Metal Body","Nome PT não consolidado",0]],"792":[["Shadow Shield","Nome PT não consolidado",0]],"793":[["Beast Boost","Nome PT não consolidado",0]],"794":[["Beast Boost","Nome PT não consolidado",0]],"795":[["Beast Boost","Nome PT não consolidado",0]],"796":[["Beast Boost","Nome PT não consolidado",0]],"797":[["Beast Boost","Nome PT não consolidado",0]],"798":[["Beast Boost","Nome PT não consolidado",0]],"799":[["Beast Boost","Nome PT não consolidado",0]],"800":[["Neuroforce","Nome PT não consolidado",0]],"801":[["Soul-Heart","Nome PT não consolidado",0]],"802":[["Technician","Técnico",0]],"803":[["Beast Boost","Nome PT não consolidado",0]],"804":[["Beast Boost","Nome PT não consolidado",0]],"805":[["Beast Boost","Nome PT não consolidado",0]],"806":[["Beast Boost","Nome PT não consolidado",0]],"807":[["Volt Absorb","Nome PT não consolidado",0]],"808":[["Magnet Pull","Nome PT não consolidado",0]],"809":[["Iron Fist","Nome PT não consolidado",0]],"810":[["Overgrow","Supercrescimento",0],["Grassy Surge","Nome PT não consolidado",1]],"811":[["Overgrow","Supercrescimento",0],["Grassy Surge","Nome PT não consolidado",1]],"812":[["Overgrow","Supercrescimento",0],["Grassy Surge","Nome PT não consolidado",1]],"813":[["Blaze","Incêndio",0],["Libero","Nome PT não consolidado",1]],"814":[["Blaze","Incêndio",0],["Libero","Nome PT não consolidado",1]],"815":[["Blaze","Incêndio",0],["Libero","Nome PT não consolidado",1]],"816":[["Torrent","Dilúvio",0],["Sniper","Nome PT não consolidado",1]],"817":[["Torrent","Dilúvio",0],["Sniper","Nome PT não consolidado",1]],"818":[["Torrent","Dilúvio",0],["Sniper","Nome PT não consolidado",1]],"819":[["Cheek Pouch","Nome PT não consolidado",0],["Gluttony","Nome PT não consolidado",1]],"820":[["Cheek Pouch","Nome PT não consolidado",0],["Gluttony","Nome PT não consolidado",1]],"821":[["Keen Eye","Nome PT não consolidado",0],["Unnerve","Nome PT não consolidado",0],["Big Pecks","Nome PT não consolidado",1]],"822":[["Keen Eye","Nome PT não consolidado",0],["Unnerve","Nome PT não consolidado",0],["Big Pecks","Nome PT não consolidado",1]],"823":[["Pressure","Nome PT não consolidado",0],["Unnerve","Nome PT não consolidado",0],["Mirror Armor","Nome PT não consolidado",1]],"824":[["Swarm","Nome PT não consolidado",0],["Compound Eyes","Nome PT não consolidado",0],["Telepathy","Nome PT não consolidado",1]],"825":[["Swarm","Nome PT não consolidado",0],["Compound Eyes","Nome PT não consolidado",0],["Telepathy","Nome PT não consolidado",1]],"826":[["Swarm","Nome PT não consolidado",0],["Frisk","Nome PT não consolidado",0],["Telepathy","Nome PT não consolidado",1]],"827":[["Run Away","Nome PT não consolidado",0],["Unburden","Nome PT não consolidado",0],["Stakeout","Nome PT não consolidado",1]],"828":[["Run Away","Nome PT não consolidado",0],["Unburden","Nome PT não consolidado",0],["Stakeout","Nome PT não consolidado",1]],"829":[["Cotton Down","Nome PT não consolidado",0],["Regenerator","Nome PT não consolidado",0],["Effect Spore","Nome PT não consolidado",1]],"830":[["Cotton Down","Nome PT não consolidado",0],["Regenerator","Nome PT não consolidado",0],["Effect Spore","Nome PT não consolidado",1]],"831":[["Fluffy","Nome PT não consolidado",0],["Run Away","Nome PT não consolidado",0],["Bulletproof","Nome PT não consolidado",1]],"832":[["Fluffy","Nome PT não consolidado",0],["Steadfast","Inabalável",0],["Bulletproof","Nome PT não consolidado",1]],"833":[["Strong Jaw","Mandíbula Forte",0],["Shell Armor","Armadura de Concha",0],["Swift Swim","Nado Rápido",1]],"834":[["Strong Jaw","Mandíbula Forte",0],["Shell Armor","Armadura de Concha",0],["Swift Swim","Nado Rápido",1]],"835":[["Ball Fetch","Nome PT não consolidado",0],["Rattled","Nome PT não consolidado",1]],"836":[["Strong Jaw","Mandíbula Forte",0],["Competitive","Nome PT não consolidado",1]],"837":[["Steam Engine","Nome PT não consolidado",0],["Heatproof","Nome PT não consolidado",0],["Flash Fire","Nome PT não consolidado",1]],"838":[["Steam Engine","Nome PT não consolidado",0],["Flame Body","Nome PT não consolidado",0],["Flash Fire","Nome PT não consolidado",1]],"839":[["Steam Engine","Nome PT não consolidado",0],["Flame Body","Nome PT não consolidado",0],["Flash Fire","Nome PT não consolidado",1]],"840":[["Ripen","Nome PT não consolidado",0],["Gluttony","Nome PT não consolidado",0],["Bulletproof","Nome PT não consolidado",1]],"841":[["Ripen","Nome PT não consolidado",0],["Gluttony","Nome PT não consolidado",0],["Hustle","Nome PT não consolidado",1]],"842":[["Ripen","Nome PT não consolidado",0],["Gluttony","Nome PT não consolidado",0],["Thick Fat","Gordura Espessa",1]],"843":[["Sand Spit","Nome PT não consolidado",0],["Shed Skin","Nome PT não consolidado",0],["Sand Veil","Nome PT não consolidado",1]],"844":[["Sand Spit","Nome PT não consolidado",0],["Shed Skin","Nome PT não consolidado",0],["Sand Veil","Nome PT não consolidado",1]],"845":[["Gulp Missile","Nome PT não consolidado",0]],"846":[["Swift Swim","Nado Rápido",0],["Propeller Tail","Nome PT não consolidado",1]],"847":[["Swift Swim","Nado Rápido",0],["Propeller Tail","Nome PT não consolidado",1]],"848":[["Rattled","Nome PT não consolidado",0],["Static","Nome PT não consolidado",0],["Klutz","Nome PT não consolidado",1]],"849":[["Punk Rock","Nome PT não consolidado",0],["Minus","Nome PT não consolidado",0],["Technician","Técnico",1]],"850":[["Flash Fire","Nome PT não consolidado",0],["White Smoke","Nome PT não consolidado",0],["Flame Body","Nome PT não consolidado",1]],"851":[["Flash Fire","Nome PT não consolidado",0],["White Smoke","Nome PT não consolidado",0],["Flame Body","Nome PT não consolidado",1]],"852":[["Limber","Nome PT não consolidado",0],["Technician","Técnico",1]],"853":[["Limber","Nome PT não consolidado",0],["Technician","Técnico",1]],"854":[["Weak Armor","Nome PT não consolidado",0],["Cursed Body","Nome PT não consolidado",1]],"855":[["Weak Armor","Nome PT não consolidado",0],["Cursed Body","Nome PT não consolidado",1]],"856":[["Healer","Curador",0],["Anticipation","Nome PT não consolidado",0],["Magic Bounce","Espelho Mágico",1]],"857":[["Healer","Curador",0],["Anticipation","Nome PT não consolidado",0],["Magic Bounce","Espelho Mágico",1]],"858":[["Healer","Curador",0],["Anticipation","Nome PT não consolidado",0],["Magic Bounce","Espelho Mágico",1]],"859":[["Prankster","Travesso",0],["Frisk","Nome PT não consolidado",0],["Pickpocket","Nome PT não consolidado",1]],"860":[["Prankster","Travesso",0],["Frisk","Nome PT não consolidado",0],["Pickpocket","Nome PT não consolidado",1]],"861":[["Prankster","Travesso",0],["Frisk","Nome PT não consolidado",0],["Pickpocket","Nome PT não consolidado",1]],"862":[["Reckless","Nome PT não consolidado",0],["Guts","Nome PT não consolidado",0],["Defiant","Nome PT não consolidado",1]],"863":[["Battle Armor","Nome PT não consolidado",0],["Tough Claws","Garras Firmes",0],["Steely Spirit","Nome PT não consolidado",1]],"864":[["Weak Armor","Nome PT não consolidado",0],["Perish Body","Nome PT não consolidado",1]],"865":[["Steadfast","Inabalável",0],["Scrappy","Brigão",1]],"866":[["Tangled Feet","Nome PT não consolidado",0],["Screen Cleaner","Nome PT não consolidado",0],["Ice Body","Nome PT não consolidado",1]],"867":[["Wandering Spirit","Nome PT não consolidado",0]],"868":[["Sweet Veil","Nome PT não consolidado",0],["Aroma Veil","Nome PT não consolidado",1]],"869":[["Sweet Veil","Nome PT não consolidado",0],["Aroma Veil","Nome PT não consolidado",1]],"870":[["Defiant","Nome PT não consolidado",0]],"871":[["Lightning Rod","Para-raios",0],["Electric Surge","Nome PT não consolidado",1]],"872":[["Shield Dust","Nome PT não consolidado",0],["Ice Scales","Nome PT não consolidado",1]],"873":[["Shield Dust","Nome PT não consolidado",0],["Ice Scales","Nome PT não consolidado",1]],"874":[["Power Spot","Nome PT não consolidado",0]],"875":[["Ice Face","Nome PT não consolidado",0]],"876":[["Own Tempo","Nome PT não consolidado",0],["Synchronize","Nome PT não consolidado",0],["Psychic Surge","Nome PT não consolidado",1]],"877":[["Hunger Switch","Nome PT não consolidado",0]],"878":[["Sheer Force","Força Absoluta",0],["Heavy Metal","Nome PT não consolidado",1]],"879":[["Sheer Force","Força Absoluta",0],["Heavy Metal","Nome PT não consolidado",1]],"880":[["Volt Absorb","Nome PT não consolidado",0],["Hustle","Nome PT não consolidado",0],["Sand Rush","Nome PT não consolidado",1]],"881":[["Volt Absorb","Nome PT não consolidado",0],["Static","Nome PT não consolidado",0],["Slush Rush","Nome PT não consolidado",1]],"882":[["Water Absorb","Nome PT não consolidado",0],["Strong Jaw","Mandíbula Forte",0],["Sand Rush","Nome PT não consolidado",1]],"883":[["Water Absorb","Nome PT não consolidado",0],["Ice Body","Nome PT não consolidado",0],["Slush Rush","Nome PT não consolidado",1]],"884":[["Light Metal","Nome PT não consolidado",0],["Heavy Metal","Nome PT não consolidado",0],["Stalwart","Nome PT não consolidado",1]],"885":[["Clear Body","Nome PT não consolidado",0],["Infiltrator","Nome PT não consolidado",0],["Cursed Body","Nome PT não consolidado",1]],"886":[["Clear Body","Nome PT não consolidado",0],["Infiltrator","Nome PT não consolidado",0],["Cursed Body","Nome PT não consolidado",1]],"887":[["Clear Body","Nome PT não consolidado",0],["Infiltrator","Nome PT não consolidado",0],["Cursed Body","Nome PT não consolidado",1]],"888":[["Intrepid Sword","Nome PT não consolidado",0]],"889":[["Dauntless Shield","Nome PT não consolidado",0]],"890":[["Pressure","Nome PT não consolidado",0]],"891":[["Inner Focus","Força Interior",0]],"892":[["Unseen Fist","Nome PT não consolidado",0]],"893":[["Leaf Guard","Nome PT não consolidado",0]],"894":[["Transistor","Nome PT não consolidado",0]],"895":[["Dragon's Maw","Nome PT não consolidado",0]],"896":[["Chilling Neigh","Nome PT não consolidado",0]],"897":[["Grim Neigh","Nome PT não consolidado",0]],"898":[["As One (Spectrier)","Nome PT não consolidado",0]],"899":[["Intimidate","Intimidação",0],["Frisk","Nome PT não consolidado",0],["Sap Sipper","Nome PT não consolidado",1]],"900":[["Swarm","Nome PT não consolidado",0],["Sheer Force","Força Absoluta",0],["Sharpness","Nome PT não consolidado",1]],"901":[["Mind's Eye","Nome PT não consolidado",0]],"902":[["Swift Swim","Nado Rápido",0],["Adaptability","Adaptabilidade",0],["Mold Breaker","Quebra-moldes",1]],"903":[["Pressure","Nome PT não consolidado",0],["Unburden","Nome PT não consolidado",0],["Poison Touch","Nome PT não consolidado",1]],"904":[["Poison Point","Nome PT não consolidado",0],["Swift Swim","Nado Rápido",0],["Intimidate","Intimidação",1]],"905":[["Overcoat","Nome PT não consolidado",0]],"906":[["Overgrow","Supercrescimento",0],["Protean","Nome PT não consolidado",1]],"907":[["Overgrow","Supercrescimento",0],["Protean","Nome PT não consolidado",1]],"908":[["Overgrow","Supercrescimento",0],["Protean","Nome PT não consolidado",1]],"909":[["Blaze","Incêndio",0],["Unaware","Nome PT não consolidado",1]],"910":[["Blaze","Incêndio",0],["Unaware","Nome PT não consolidado",1]],"911":[["Blaze","Incêndio",0],["Unaware","Nome PT não consolidado",1]],"912":[["Torrent","Dilúvio",0],["Moxie","Nome PT não consolidado",1]],"913":[["Torrent","Dilúvio",0],["Moxie","Nome PT não consolidado",1]],"914":[["Torrent","Dilúvio",0],["Moxie","Nome PT não consolidado",1]],"915":[["Aroma Veil","Nome PT não consolidado",0],["Gluttony","Nome PT não consolidado",0],["Thick Fat","Gordura Espessa",1]],"916":[["Aroma Veil","Nome PT não consolidado",0],["Gluttony","Nome PT não consolidado",0],["Thick Fat","Gordura Espessa",1]],"917":[["Insomnia","Insônia",0],["Stakeout","Nome PT não consolidado",1]],"918":[["Insomnia","Insônia",0],["Stakeout","Nome PT não consolidado",1]],"919":[["Swarm","Nome PT não consolidado",0],["Tinted Lens","Nome PT não consolidado",1]],"920":[["Swarm","Nome PT não consolidado",0],["Tinted Lens","Nome PT não consolidado",1]],"921":[["Static","Nome PT não consolidado",0],["Natural Cure","Nome PT não consolidado",0],["Iron Fist","Nome PT não consolidado",1]],"922":[["Volt Absorb","Nome PT não consolidado",0],["Natural Cure","Nome PT não consolidado",0],["Iron Fist","Nome PT não consolidado",1]],"923":[["Volt Absorb","Nome PT não consolidado",0],["Natural Cure","Nome PT não consolidado",0],["Iron Fist","Nome PT não consolidado",1]],"924":[["Run Away","Nome PT não consolidado",0],["Pickup","Nome PT não consolidado",0],["Own Tempo","Nome PT não consolidado",1]],"925":[["Friend Guard","Nome PT não consolidado",0],["Cheek Pouch","Nome PT não consolidado",0],["Technician","Técnico",1]],"926":[["Own Tempo","Nome PT não consolidado",0],["Klutz","Nome PT não consolidado",1]],"927":[["Well-Baked Body","Nome PT não consolidado",0],["Aroma Veil","Nome PT não consolidado",1]],"928":[["Early Bird","Nome PT não consolidado",0],["Harvest","Nome PT não consolidado",1]],"929":[["Early Bird","Nome PT não consolidado",0],["Harvest","Nome PT não consolidado",1]],"930":[["Seed Sower","Nome PT não consolidado",0],["Harvest","Nome PT não consolidado",1]],"931":[["Intimidate","Intimidação",0],["Hustle","Nome PT não consolidado",0],["Sheer Force","Força Absoluta",1]],"932":[["Purifying Salt","Nome PT não consolidado",0],["Sturdy","Nome PT não consolidado",0],["Clear Body","Nome PT não consolidado",1]],"933":[["Purifying Salt","Nome PT não consolidado",0],["Sturdy","Nome PT não consolidado",0],["Clear Body","Nome PT não consolidado",1]],"934":[["Purifying Salt","Nome PT não consolidado",0],["Sturdy","Nome PT não consolidado",0],["Clear Body","Nome PT não consolidado",1]],"935":[["Flash Fire","Nome PT não consolidado",0],["Flame Body","Nome PT não consolidado",1]],"936":[["Flash Fire","Nome PT não consolidado",0],["Weak Armor","Nome PT não consolidado",1]],"937":[["Flash Fire","Nome PT não consolidado",0],["Weak Armor","Nome PT não consolidado",1]],"938":[["Own Tempo","Nome PT não consolidado",0],["Static","Nome PT não consolidado",0],["Damp","Nome PT não consolidado",1]],"939":[["Electromorphosis","Nome PT não consolidado",0],["Static","Nome PT não consolidado",0],["Damp","Nome PT não consolidado",1]],"940":[["Wind Power","Nome PT não consolidado",0],["Volt Absorb","Nome PT não consolidado",0],["Competitive","Nome PT não consolidado",1]],"941":[["Wind Power","Nome PT não consolidado",0],["Volt Absorb","Nome PT não consolidado",0],["Competitive","Nome PT não consolidado",1]],"942":[["Intimidate","Intimidação",0],["Run Away","Nome PT não consolidado",0],["Stakeout","Nome PT não consolidado",1]],"943":[["Intimidate","Intimidação",0],["Guard Dog","Nome PT não consolidado",0],["Stakeout","Nome PT não consolidado",1]],"944":[["Unburden","Nome PT não consolidado",0],["Pickpocket","Nome PT não consolidado",0],["Prankster","Travesso",1]],"945":[["Unburden","Nome PT não consolidado",0],["Poison Touch","Nome PT não consolidado",0],["Prankster","Travesso",1]],"946":[["Wind Rider","Nome PT não consolidado",0],["Infiltrator","Nome PT não consolidado",1]],"947":[["Wind Rider","Nome PT não consolidado",0],["Infiltrator","Nome PT não consolidado",1]],"948":[["Mycelium Might","Nome PT não consolidado",0]],"949":[["Mycelium Might","Nome PT não consolidado",0]],"950":[["Anger Shell","Nome PT não consolidado",0],["Shell Armor","Armadura de Concha",0],["Regenerator","Nome PT não consolidado",1]],"951":[["Chlorophyll","Nome PT não consolidado",0],["Insomnia","Insônia",0],["Klutz","Nome PT não consolidado",1]],"952":[["Spicy Spray","Nome PT não consolidado",0]],"953":[["Compound Eyes","Nome PT não consolidado",0],["Shed Skin","Nome PT não consolidado",1]],"954":[["Synchronize","Nome PT não consolidado",0],["Telepathy","Nome PT não consolidado",1]],"955":[["Anticipation","Nome PT não consolidado",0],["Frisk","Nome PT não consolidado",0],["Speed Boost","Impulso de Velocidade",1]],"956":[["Opportunist","Nome PT não consolidado",0],["Frisk","Nome PT não consolidado",0],["Speed Boost","Impulso de Velocidade",1]],"957":[["Mold Breaker","Quebra-moldes",0],["Own Tempo","Nome PT não consolidado",0],["Pickpocket","Nome PT não consolidado",1]],"958":[["Mold Breaker","Quebra-moldes",0],["Own Tempo","Nome PT não consolidado",0],["Pickpocket","Nome PT não consolidado",1]],"959":[["Mold Breaker","Quebra-moldes",0],["Own Tempo","Nome PT não consolidado",0],["Pickpocket","Nome PT não consolidado",1]],"960":[["Gooey","Nome PT não consolidado",0],["Rattled","Nome PT não consolidado",0],["Sand Veil","Nome PT não consolidado",1]],"961":[["Gooey","Nome PT não consolidado",0],["Rattled","Nome PT não consolidado",0],["Sand Veil","Nome PT não consolidado",1]],"962":[["Big Pecks","Nome PT não consolidado",0],["Keen Eye","Nome PT não consolidado",0],["Rocky Payload","Nome PT não consolidado",1]],"963":[["Water Veil","Nome PT não consolidado",0]],"964":[["Zero to Hero","Nome PT não consolidado",0]],"965":[["Overcoat","Nome PT não consolidado",0],["Slow Start","Nome PT não consolidado",1]],"966":[["Overcoat","Nome PT não consolidado",0],["Filter","Filtro",1]],"967":[["Shed Skin","Nome PT não consolidado",0],["Regenerator","Nome PT não consolidado",1]],"968":[["Earth Eater","Nome PT não consolidado",0],["Sand Veil","Nome PT não consolidado",1]],"969":[["Toxic Debris","Nome PT não consolidado",0],["Corrosion","Nome PT não consolidado",1]],"970":[["Adaptability","Adaptabilidade",0]],"971":[["Pickup","Nome PT não consolidado",0],["Fluffy","Nome PT não consolidado",1]],"972":[["Sand Rush","Nome PT não consolidado",0],["Fluffy","Nome PT não consolidado",1]],"973":[["Scrappy","Brigão",0],["Tangled Feet","Nome PT não consolidado",0],["Costar","Nome PT não consolidado",1]],"974":[["Thick Fat","Gordura Espessa",0],["Snow Cloak","Nome PT não consolidado",0],["Sheer Force","Força Absoluta",1]],"975":[["Thick Fat","Gordura Espessa",0],["Slush Rush","Nome PT não consolidado",0],["Sheer Force","Força Absoluta",1]],"976":[["Mold Breaker","Quebra-moldes",0],["Sharpness","Nome PT não consolidado",1]],"977":[["Unaware","Nome PT não consolidado",0],["Oblivious","Nome PT não consolidado",0],["Water Veil","Nome PT não consolidado",1]],"978":[["Commander","Nome PT não consolidado",0],["Storm Drain","Nome PT não consolidado",1]],"979":[["Vital Spirit","Nome PT não consolidado",0],["Inner Focus","Força Interior",0],["Defiant","Nome PT não consolidado",1]],"980":[["Poison Point","Nome PT não consolidado",0],["Water Absorb","Nome PT não consolidado",0],["Unaware","Nome PT não consolidado",1]],"981":[["Cud Chew","Nome PT não consolidado",0],["Armor Tail","Nome PT não consolidado",0],["Sap Sipper","Nome PT não consolidado",1]],"982":[["Serene Grace","Nome PT não consolidado",0],["Run Away","Nome PT não consolidado",0],["Rattled","Nome PT não consolidado",1]],"983":[["Defiant","Nome PT não consolidado",0],["Supreme Overlord","Nome PT não consolidado",0],["Pressure","Nome PT não consolidado",1]],"984":[["Protosynthesis","Nome PT não consolidado",0]],"985":[["Protosynthesis","Nome PT não consolidado",0]],"986":[["Protosynthesis","Nome PT não consolidado",0]],"987":[["Protosynthesis","Nome PT não consolidado",0]],"988":[["Protosynthesis","Nome PT não consolidado",0]],"989":[["Protosynthesis","Nome PT não consolidado",0]],"990":[["Quark Drive","Nome PT não consolidado",0]],"991":[["Quark Drive","Nome PT não consolidado",0]],"992":[["Quark Drive","Nome PT não consolidado",0]],"993":[["Quark Drive","Nome PT não consolidado",0]],"994":[["Quark Drive","Nome PT não consolidado",0]],"995":[["Quark Drive","Nome PT não consolidado",0]],"996":[["Thermal Exchange","Nome PT não consolidado",0],["Ice Body","Nome PT não consolidado",1]],"997":[["Thermal Exchange","Nome PT não consolidado",0],["Ice Body","Nome PT não consolidado",1]],"998":[["Thermal Exchange","Nome PT não consolidado",0],["Ice Body","Nome PT não consolidado",1]],"999":[["Run Away","Nome PT não consolidado",0]],"1000":[["Good as Gold","Nome PT não consolidado",0]],"1001":[["Tablets of Ruin","Nome PT não consolidado",0]],"1002":[["Sword of Ruin","Nome PT não consolidado",0]],"1003":[["Vessel of Ruin","Nome PT não consolidado",0]],"1004":[["Beads of Ruin","Nome PT não consolidado",0]],"1005":[["Protosynthesis","Nome PT não consolidado",0]],"1006":[["Quark Drive","Nome PT não consolidado",0]],"1007":[["Orichalcum Pulse","Nome PT não consolidado",0]],"1008":[["Hadron Engine","Nome PT não consolidado",0]],"1009":[["Protosynthesis","Nome PT não consolidado",0]],"1010":[["Quark Drive","Nome PT não consolidado",0]],"1011":[["Supersweet Syrup","Nome PT não consolidado",0],["Gluttony","Nome PT não consolidado",0],["Sticky Hold","Nome PT não consolidado",1]],"1012":[["Hospitality","Nome PT não consolidado",0],["Heatproof","Nome PT não consolidado",1]],"1013":[["Hospitality","Nome PT não consolidado",0],["Heatproof","Nome PT não consolidado",1]],"1014":[["Toxic Chain","Nome PT não consolidado",0],["Guard Dog","Nome PT não consolidado",1]],"1015":[["Toxic Chain","Nome PT não consolidado",0],["Frisk","Nome PT não consolidado",1]],"1016":[["Toxic Chain","Nome PT não consolidado",0],["Technician","Técnico",1]],"1017":[["Embody Aspect (Wellspring)","Nome PT não consolidado",0]],"1018":[["Stamina","Nome PT não consolidado",0],["Sturdy","Nome PT não consolidado",0],["Stalwart","Nome PT não consolidado",1]],"1019":[["Supersweet Syrup","Nome PT não consolidado",0],["Regenerator","Nome PT não consolidado",0],["Sticky Hold","Nome PT não consolidado",1]],"1020":[["Protosynthesis","Nome PT não consolidado",0]],"1021":[["Protosynthesis","Nome PT não consolidado",0]],"1022":[["Quark Drive","Nome PT não consolidado",0]],"1023":[["Quark Drive","Nome PT não consolidado",0]],"1024":[["Tera Shell","Nome PT não consolidado",0]],"1025":[["Poison Puppeteer","Nome PT não consolidado",0]]}};
const EGG_DB={"tipos":["Fada","Psíquico","Grama","Veneno","Normal","Fantasma","Sombrio","Voador","Dragão","Fogo","Aço","Lutador","Pedra","Água","Terrestre","Gelo","Elétrico","Inseto"],"golpes":[["Charm","",0],["Amnesia","Amnésia",1],["Grass Whistle","Apito de Grama",2],["Sludge","Ataque de Lama",3],["Power Whip","Chicote Poderoso",2],["Petal Dance","Dança das Pétalas",2],["Ingrain","Enraizar",2],["Magical Leaf","Folha Mágica",2],["Nature Power","Força da Natureza",4],["Giga Drain","Giga Dreno",2],["Grassy Terrain","Nome PT não consolidado",2],["Skull Bash","Quebra Crânio",4],["Endure","Resistência",4],["Safeguard","Salvaguarda",4],["Light Screen","Tela de Luz",1],["Leaf Storm","Tempestade de Folhas",2],["Curse","Tipo ??? (2ª a 4ª Ger) (5ª Ger em diante)",5],["Toxic","Tóxico",3],["Bite","",6],["Wing Attack","Ataque de Asa(s)",7],["Outrage","Atrocidade",8],["Flare Blitz","Bombardeio de Chamas",9],["Iron Tail","Cauda de Ferro",10],["Dragon Tail","Cauda do Dragão",8],["Counter","Contra Ataque",11],["Air Cutter","Cortador de Ar",7],["Swords Dance","Dança das Espadas",4],["Dragon Dance","Dança do Dragão",8],["Rock Slide","Deslizamento de Rochas",12],["Metal Claw","Garra de Metal",10],["Dragon Rush","Investida do Dragão",8],["Ancient Power","Poder Ancestral",12],["Dragon Pulse","Pulso do Dragão",8],["Focus Punch","Soco Focalizado (PT-BR) — Punho Focus",11],["Belly Drum","Tambor de Barriga",4],["Crunch","Triturar",6],["Beat Up","União de Equipe",6],["Muddy Water","Água Barrenta",13],["Aqua Ring","Anel d'Água",13],["Aqua Jet","Aqua Jato",13],["Yawn","Bocejo",4],["Mud Sport","Campo de Lama",14],["Mirror Coat","Casaco Espelhado",1],["Flail","Debater",4],["Aura Sphere","Esfera de Aura",11],["Fake Out","Fingimento",4],["Mist","Névoa",15],["Haze","Nevoeiro",15],["Life Dew","Nome PT não consolidado",13],["Foresight","Previsão",4],["Refresh","Refrescar",4],["Brine","Salmoura",13],["Water Spout","Tromba d'Água",13],["Steel Wing","Asa de Aço",10],["Feint Attack","Ataque de Traição",6],["Defog","Desneblinar",7],["Air Slash","Golpe de Ar",7],["Brave Bird","Pássaro Bravo",7],["Pursuit","Perseguição",6],["Uproar","Tumulto",4],["Screech","Agudo",4],["Snatch","Arrebatar",6],["Swagger","Arrogância",4],["Swallow","Engolir",4],["Stockpile","Estocagem",4],["Fury Swipes","Golpe(s) de Fúria",4],["Final Gambit","Luta Final",11],["Me First","Prioridade",4],["Reversal","Reversão",11],["Flame Wheel","Roda de Fogo",9],["Switcheroo","Troca Secreta",6],["Last Resort","Último Recurso",4],["Revenge","Vingança",11],["Astonish","Abismar",5],["Sky Attack","Ataque do Céu",7],["Quick Attack","Ataque Rápido",4],["Tri Attack","Ataque Triplo",4],["Scary Face","Cara Assustadora",4],["False Swipe","Corte Artificial",4],["Feather Dance","Dança das Penas",7],["Razor Wind","Lâmina de Vento",4],["Whirlwind","Rajada de Vento",4],["Spite","Ataque Rancoroso",5],["Poison Tail","Cauda Venenosa",3],["Disable","Desabilitar",4],["Slam","Pancada Brusca",4],["Poison Fang","Presa Venenosa",3],["Sucker Punch","Soco Surpresa",6],["Encore","Bis",4],["Charge","Carregar",16],["Tickle","Cócegas",4],["Bide","Contra-Dano",4],["Wish","Desejo",4],["Double Slap","Duplo Tapa",4],["Lucky Chant","Golpe de Sorte (PT-BR) — Cântico da Sorte (PT-PT)",4],["Volt Tackle","Investida Trovão",16],["Disarming Voice","Nome PT não consolidado",0],["Electric Terrain","Nome PT não consolidado",16],["Bestow","Oferenda",4],["Present","Presente",4],["Thunder Punch","Soco do Trovão",16],["Mud-Slap","Ataque de Lama",14],["Night Slash","Corte Noturno",6],["Rock Climb","Escalada",4],["Rototiller","Fertilizante",14],["Crush Claw","Garra Brutal",4],["Hone Claws","Garras Afiadas",6],["Rapid Spin","Giro Rápido",4],["Chip Away","Lapidar",4],["Mud Shot","Tiro de Lama (PT-BR)",14],["Focus Energy","Energia Focalizada",4],["Take Down","Golpe Baixo",4],["Venom Drench","Nome PT não consolidado",3],["Supersonic","Supersônico",4],["Head Smash","Bate-Cabeça (PT-BR)",12],["Horn Drill","Chifre Furadeira",4],["Confusion","Confusão",1],["Thrash","Espancar",4],["Aromatherapy","Aromaterapia",2],["Covet","Cobiça",4],["Fake Tears","Lágrimas de Crocodilo",6],["Metronome","Metrônomo",4],["Mimic","Mímica",4],["Misty Terrain","Nome PT não consolidado",0],["Stored Power","Poder Armazenado",1],["Splash","Splash",4],["Substitute","Substituição",4],["Heal Pulse","Vibração de Cura",1],["Agility","Agilidade",1],["Flame Charge","Ataque de Chamas",9],["Psych Up","Carga Psíquica",4],["Captivate","Cativar",4],["Healing Wish","Desejo de Cura (PT-BR) — Desejo Cura (PT-PT)",1],["Energy Ball","Esfera de Energia",2],["Moonblast","Explosão Lunar",0],["Extrasensory","Extrassensorial",1],["Hex","Feitiço",5],["Hypnosis","Hipnose",1],["Freeze-Dry","Liofilização",15],["Baby-Doll Eyes","Nome PT não consolidado",0],["Heat Wave","Onda de Calor",9],["Secret Power","Poder Secreto",4],["Roar","Rugido",4],["Memento","Sacrifício",6],["Tail Slap","Tapa de Cauda (PT-BR) — Palmada de Cauda (PT-PT)",4],["Power Swap","Troca de Poderes",1],["Howl","Uivo",4],["Sleep Talk","Ataque Sonâmbulo",4],["Perish Song","Canção do Perecer",4],["Gravity","Gravidade",1],["Punishment","Punição",6],["Rollout","Rolagem",12],["Gust","",7],["Zen Headbutt","Cabeçada Zen",1],["Nasty Plot","Trama Maldosa",6],["Teeter Dance","Dança do Balanço",4],["After You","Depois de Você",4],["Razor Leaf","Folha Navalha",2],["Strength Sap","Nome PT não consolidado",2],["Leech Seed","Semente Sanguessuga",2],["Synthesis","Síntese",2],["Sweet Scent","Aroma Doce",4],["Cross Poison","Corte Veneno",3],["Wide Guard","Defesa Aberta",12],["Fell Stinger","Nome PT não consolidado",17],["Bug Bite","Picada",17],["Natural Gift","Presente Natural",4],["Psybeam","Raio Psíquico",1],["Toxic Spikes","Espinhos Tóxicos",3],["Baton Pass","Passar o Bastão",4],["Rage Powder","Pó da Fúria",17],["Signal Beam","Sinalizador",17],["Morning Sun","Sol da Manhã (PT-BR)",4],["Skill Swap","Troca de Habilidade",1],["Venoshock","Venochoque",3],["Mud Bomb","Bomba de Lama",14],["Headbutt","Cabeçada",4],["Metal Sound","Som Metálico",10],["Assist","Ajudar",4],["Tail Whip","Chicote de Cauda",4],["Flatter","Comemoração (PT-BR)",6],["Odor Sleuth","Farejador",4],["Foul Play","Jogo Sujo",6],["Parting Shot","Nome PT não consolidado",6],["Synchronoise","Barulho Sincronizado",1],["Cross Chop","Golpe Cruzado",11],["Clear Smog","Limpar Nebli-maça (Neblina + Fumaça)",3],["Psychic","Psíquico",1],["Confuse Ray","Raio Confusão",5],["Simple Beam","Raio Simplificador",4],["Future Sight","Visão Futura",1],["Meditate","Meditação",1],["Close Combat","Multi-Soco",11],["Power Trip","Nome PT não consolidado",6],["Smelling Salts","Nome PT não consolidado",4],["Fire Spin","Chama Furacão",9],["Double Kick","Chute Duplo",11],["Double-Edge","Corte Duplo",4],["Body Slam","Jogo de Corpo",4],["Burn Up","Nome PT não consolidado",9],["Raging Fury","Nome PT não consolidado",9],["Ice Ball","Esfera de Gelo",15],["Endeavor","Esforço",4],["Water Sport","Esporte Aquático",13],["Mind Reader","Leitura Mental",4],["Water Pulse","Pulso d'Água",13],["Bubble Beam","Rajada de Bolhas",13],["Barrier","Barreira",1],["Knock Off","Derrubar",6],["Guard Split","Divisão de Defesa",1],["Psycho Shift","Mudança Psíquica",1],["Psychic Terrain","Nome PT não consolidado",1],["Fire Punch","Soco de Fogo",9],["Ice Punch","Soco de Gelo",15],["Magic Coat","Tela Mágica (PT-BR)",1],["Ally Switch","Troca Aliada",1],["Guard Swap","Troca de Defesas",1],["Power Trick","Truque da Troca (PT-BR) — Transferência",1],["Rolling Kick","Chute Giratório",11],["Quick Guard","Defesa Rápida",11],["Heavy Slam","Golpe Pesado",10],["Bullet Punch","Soco Projétil",10],["Submission","Submissão",11],["Weather Ball","*",4],["Belch","Arroto*",3],["Acid Spray","Bomba Ácida",3],["Bullet Seed","Projétil de Semente",2],["Reflect","Reflector",1],["Worry Seed","Semente Ruim",2],["Leech Life","Suga-Vidas",17],["Acupressure","Acupuntura",4],["Bubble","Bolha(s)",13],["Aurora Beam","Raio Aurora",15],["Autotomize","Autotomizar",10],["Block","Bloquear (PT-BR) — Bloqueio (PT-PT)",4],["Hammer Arm","Braço-Martelo",11],["Zap Cannon","Canhão Elétrico",16],["Magnet Rise","Levitação Magnética",16],["Mega Punch","Mega Soco",4],["Dynamic Punch","Soco Dinâmico",11],["Low Kick","Chute Baixo",11],["High Horsepower","Nome PT não consolidado",14],["Stomp","Pisotear",4],["Wonder Room","Quarto Maravilha",1],["Snore","Ronco",4],["Explosion","Explosão",4],["Electroweb","Teia Elétrica",16],["Mirror Move","Ataque Espalhado",7],["Trump Card","Coringa",4],["Roost","Empoleirar",7],["Feint","Fintar",4],["Leaf Blade","Lâmina de Folha* (PT-BR) - Espada Folha (PT-PT)",2],["First Impression","Nome PT não consolidado",17],["Assurance","Garantia",6],["Entrainment","Embarque",4],["Lick","Lamber",5],["Icicle Spear","Lança de Gelo (PT-BR) — Arpão de Gelo (PT-PT)",15],["Spit Up","Liberação",4],["Shadow Sneak","Furtividade nas Sombras",5],["Imprison","Nome PT não consolidado",1],["Power-Up Punch","Nome PT não consolidado",11],["Mean Look","Olhar Malvado",4],["Recycle","Reciclagem",4],["Shadow Punch","Soco Sombrio (PT-BR) — Soco Sombra (PT-PT)",5],["Twineedle","Agulhas Gêmeas",17],["Avalanche","Avalanche",15],["Rock Blast","Explosão de Rocha (PT-BR) — Carga de Pedras (PT-PT)",12],["Will-O-Wisp","Labareda",9],["Smog","Nevoeiro de Fumaça",3],["Psywave","Onda Psíquica",1],["Grudge","Rancor",5],["Reflect Type","Refletir Tipo",4],["Defense Curl","Espiral de Defesa",4],["Stealth Rock","Pedra Oculta (PT-BR) — Rocha Esquiva (PT-PT)",12],["Psycho Cut","Corte Psíquico",1],["Power Split","Divisão do Poder",1],["Role Play","Jogo Teatral",1],["Dig","Cavar",14],["Slash","Talho",4],["Moonlight","",0],["Stun Spore","Pó Atordoante",2],["Sleep Powder","Pó do Sono",2],["Poison Powder","Pó Venenoso",3],["Iron Head","Cabeça de Ferro",10],["Detect","Detectar",11],["Leer","Encarar",4],["Helping Hand","Mãozinha",4],["High Jump Kick","Nome PT não consolidado",11],["Vacuum Wave","Onda de Vácuo",11],["Mach Punch","Soco Rápido",11],["Magnitude","Magnitude",14],["Pain Split","Divisão de Dor",4],["Destiny Bond","Vínculo do Destino",5],["Metal Burst","Explosão de Metal",10],["Rock Polish","Polidor de Rocha",12],["Ice Fang","Presa de Gelo",15],["Thunder Fang","Presa do Trovão",16],["Fire Fang","Presa(s) de Fogo",9],["Seismic Toss","Arremesso Sísmico",11],["Heal Bell","Sino da Cura",4],["Mega Drain","Mega Dreno",2],["Wake-Up Slap","Tapa do Despertar",11],["Circle Throw","Lançamento Circular",11],["Dragon Rage","Fúria do Dragão",8],["Octazooka","Polvo-Canhão",13],["Dragon Breath","Sopro do Dragão",8],["Aqua Tail","Aqua Cauda",13],["Hydro Pump","Jato d'Água",13],["Magic Room","Sala Mágica",1],["Trick","Truque",1],["Icy Wind","Vento Gelado",15],["Silver Wind","Asa Prateada",17],["Bug Buzz","Zumbido de Inseto",17],["Miracle Eye","Olho Milagroso",1],["Karate Chop","Golpe Caratê",11],["Follow Me","Isca-Viva",4],["Fury Attack","Ataque de Fúria",4],["Superpower","Superpoder",11],["Fissure","Fissura",14],["Sparkling Aria","Nome PT não consolidado",13],["Whirlpool","Redemoinho",13],["Wring Out","Despedaçar",4],["Spikes","Tachinhas",14],["Tailwind","Cauda de Vento",7],["Gastro Acid","Ácido Gástrico",3],["Self-Destruct","Autodestruição",4],["Extreme Speed","Velocidade Extrema (PT-BR)",4],["Vine Whip","Chicote de Cipó",2],["Flame Burst","Rajada de Chamas*",9],["Dragon Claw","Garra do Dragão",8],["Tidy Up","Nome PT não consolidado",4],["Hurricane","Furacão",7],["Night Shade","Sombra Ofuscante",5],["Dizzy Punch","Soco Atordoante",4],["Drain Punch","Soco Drenagem",11],["Lunge","Estocada*",17],["Sonic Boom","Explosão Sônica",4],["Poison Jab","Injeção Venenosa",3],["Megahorn","Mega Chifre",17],["Soak","Ensopar",13],["Shock Wave","Onda de Choque",16],["Aerial Ace","Ás Aéreo",7],["Peck","Bicada",7],["Drill Peck","Bico Broca",7],["Sand Attack","",14],["Eerie Impulse","Nome PT não consolidado",16],["Camouflage","Camuflagem",4],["Sing","Cantar",4],["Copycat","Imitar",4],["Harden","Endurecer",4],["Sand Tomb","Fosso de Areia",14],["Seed Bomb","Bomba de Sementes (PT-BR) — Bomba Semente (PT-PT)",2],["Cotton Guard","Defesa de Algodão",2],["Bounce","Ricochetear",7],["Recover","Recuperação",4],["Ominous Wind","Vento Nefasto",5],["Psychic Fangs","Nome PT não consolidado",1],["Swift","Ataque Veloz",4],["Pin Missile","Míssil de Espinhos",17],["Retaliate","Retaliação",4],["Barb Barrage","Nome PT não consolidado",3],["Acid","Ácido",3],["Infestation","Infestação",17],["Double Hit","Batida Dupla",4],["Ice Shard","Caco de Gelo (PT-BR)",15],["Icicle Crash","Estaca de Gelo",15],["Throat Chop","Nome PT não consolidado",6],["Fury Cutter","Corte Furioso",17],["Play Rough","Nome PT não consolidado",0],["Acid Armor","Armadura Ácida",3],["Smokescreen","Cortina de Fumaça",4],["Earth Power","Geoforça",14],["Inferno","Inferno",9],["Liquidation","Aríete (PT-BR) — Liquidação (PT-PT)",13],["Thunder Wave","Onda Trovão",16],["Aurora Veil","Nome PT não consolidado",15],["Twister","Twister",8],["Rage","Ira",4],["Psyshield Bash","Nome PT não consolidado",1],["Heart Stamp","Estampa de Coração (Games)",1],["Iron Defense","Defesa de Ferro",10],["Absorb","Absorver",2],["Water Gun","Jato d'Água",13],["Boomburst","Ricochete*",4],["Mystical Fire","Nome PT não consolidado",9],["Cosmic Power","Poder Cósmico",1],["Torment","Tormento",6],["Discharge","Descarga",16],["Electro Ball","Esfera Elétrica",16],["Spark","Faísca",16],["Sweet Kiss","",0],["Tearful Look","Nome PT não consolidado",4],["Attract","Atração",4],["Growth","Crescimento",4],["Cotton Spore","Esporo(s) de Algodão",2],["Dream Eater","Comedor de Sonhos",1],["Stuff Cheeks","Nome PT não consolidado",4],["Gunk Shot","Tiro de Sujeira",3],["Eruption","Erupção",9],["Earthquake","Tremor de Terra",14],["Spotlight","Holofote*",4],["Hyper Voice","Hiper Voz",4],["Bind","Ligação",4],["Payback","Revide",6],["Phantom Force","SHADOW FORCE",5],["Dark Pulse","Pulso Sombrio",6],["Dragon Hammer","Nome PT não consolidado",8],["Crafty Shield","Nome PT não consolidado",0],["Shadow Claw","Garra Sombria",5],["Shell Smash","Destruição de Concha",4],["Blaze Kick","Chute Flamejante",9],["Ion Deluge","Nome PT não consolidado",16],["Flower Shield","Nome PT não consolidado",0],["Sky Uppercut","Direto no Queixo",11],["Nightmare","Pesadelo",5],["Meteor Mash","Esmaga-Meteoro",10],["Slack Off","Relaxar",4],["Glare","Olhar Paralisante",4],["Sacred Sword","Espada Sagrada",11],["Aqua Cutter","Nome PT não consolidado",13],["Pay Day","Dia do Pagamento",4],["Double Team","Time Duplo",4],["Spiky Shield","Nome PT não consolidado",2],["Lock-On","Mira",4],["Rock Tomb","Tumba de Rochas",12],["Draining Kiss","Nome PT não consolidado",0],["Force Palm","Palma da Força",11],["Comet Punch","Soco Cometa",4],["Last Respects","Nome PT não consolidado",5],["Incinerate","Incinerar",9],["Wood Hammer","Martelo de Madeira (PT-BR) — Malhar (PT-PT)",2],["Heal Block","Bloqueio de Cura",1],["Rock Throw","Lançamento de Rochas",12],["Dive","Mergulho",13],["Powder Snow","Neve em Pó",15],["Speed Swap","Nome PT não consolidado",1],["Horn Attack","Ataque de Chifre(s)",4],["Drill Run","Furação",14],["Constrict","Constrição",4],["Struggle Bug","Ira de Inseto",17],["Poison Sting","Picada Venenosa",3],["Teleport","Teleporte",1],["Frost Breath","Respiração de Gelo",15],["Vital Throw","Lançamento Vital",11],["Rock Smash","Batida de Pedra",11],["Wrap","Envolver",4],["String Shot","Tiro de Estilingue",17],["Super Fang","Super Presa",4],["Milk Drink","Leite da",4],["Quash","Retardar",6],["Storm Throw","Tempestade de Laçamento",11],["Work Up","Elaborar",4],["Sticky Web","Nome PT não consolidado",17],["Crabhammer","Martelo-Caranguejo",13],["Thief","Roubar (TCG",6],["Aromatic Mist","Nome PT não consolidado",0],["Pluck","Colher",7],["Quiver Dance","Dança Tremor",17],["Powder","Pólvora Explosiva",17],["Smack Down","Derrubada",12],["Mega Kick","Mega Chute",4],["Stomping Tantrum","Nome PT não consolidado",14],["Leaf Tornado","Tornado de Folhas",2],["Strength","Força",4],["Nuzzle","Chamego",16],["Fairy Wind","Nome PT não consolidado",0],["Petal Blizzard","Nome PT não consolidado",2],["Skitter Smack","Batida Escorregadia",17],["Power Gem","Gema Poderosa",12],["Parabolic Charge","Nome PT não consolidado",16],["Ice Hammer","Nome PT não consolidado",15],["Coil","Enroscar",3]],"dex":{"1":[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17],"2":[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17],"3":[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17],"4":[18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36],"5":[18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36],"6":[18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36],"7":[37,38,39,40,41,42,43,44,45,46,47,48,49,32,50,51,52],"8":[37,38,39,40,41,42,43,44,45,46,47,48,49,32,50,51,52],"9":[37,38,39,40,41,42,43,44,45,46,47,48,49,32,50,51,52],"16":[53,54,25,55,56,57,58,49,59],"17":[53,54,25,55,56,57,58,49,59],"18":[53,54,25,55,56,57,58,49,59],"19":[18,60,61,62,24,63,64,65,66,67,68,69,70,59,71,72],"20":[18,60,62,24,65,66,67,68,69,59,71,72],"21":[73,53,54,74,75,76,77,78,79,80,81,59],"22":[73,53,54,74,75,76,77,78,79,80,81,59],"23":[61,82,77,22,83,84,85,58,86,87,70,36],"24":[61,82,77,22,83,84,85,58,86,87,70,36],"25":[88,89,90,91,43,92,93,45,94,95,96,97,98,99,12,68,100],"26":[88,89,90,91,43,92,93,45,94,95,96,97,98,99,12,68,100],"27":[101,24,102,26,43,28,103,104,105,29,106,107,108,12,13,109],"28":[101,24,102,26,43,28,103,104,105,29,106,107,108,12,13,109],"29":[0,22,83,24,84,110,111,108,112,58,86,11,12,113,36],"30":[0,22,83,24,84,110,111,108,112,58,86,11,12,113,36],"31":[0,22,83,24,84,110,111,108,112,58,86,11,12,113,36],"32":[1,114,22,83,115,116,24,84,117,111,108,112,12,87,113,36],"33":[1,114,22,83,115,116,24,84,117,111,108,112,12,87,113,36],"34":[1,114,22,83,115,116,24,84,117,111,108,112,12,87,113,36],"35":[1,118,119,90,92,120,121,122,123,124,99,125,126,34,127],"36":[1,118,119,90,92,120,121,122,123,124,99,125,126,34,127],"37":[0,128,129,54,82,88,21,130,131,43,84,132,133,134,135,136,137,138,139,140,141,142,143,144,145,146],"38":[0,128,129,54,82,88,21,130,131,43,84,132,133,134,135,136,137,138,139,140,141,142,143,144,145,146],"39":[54,147,148,131,119,92,149,120,123,99,150,151,71,127],"40":[54,147,148,131,119,92,149,120,123,99,150,151,71,127],"41":[152,53,19,54,75,153,55,9,137,112,57,58,81,16,154],"42":[152,53,19,54,75,153,55,9,137,112,57,58,81,16,154],"43":[0,90,26,155,43,156,6,157,8,158,141,159,160],"44":[0,90,26,155,43,156,6,157,8,158,141,159,160],"45":[0,90,26,155,43,156,6,157,8,158,141,159,160],"46":[128,60,161,24,78,162,43,163,104,29,164,10,58,165,166,167,12,159,14],"47":[128,60,161,24,78,162,43,163,104,29,164,10,58,165,166,167,12,159,14],"48":[128,60,168,9,169,165,170,141,171,172,173,174],"49":[128,60,168,9,169,165,170,141,171,172,173,174],"50":[73,60,54,175,176,28,117,106,66,58,31,12,68,143,177,59,36],"51":[73,60,54,175,176,28,117,106,66,58,31,12,68,143,177,59,36],"52":[0,178,1,61,82,130,22,179,119,180,43,181,137,182,183,150,71],"53":[0,178,1,61,82,130,22,179,119,180,43,181,137,182,183,150,71],"54":[147,184,88,40,175,185,137,186,141,49,187,188,167,189,50,14,190],"55":[147,184,88,40,175,185,137,186,141,49,187,188,167,189,50,14,190],"56":[82,147,88,24,102,28,191,192,193,194,49,68,33,16,36,72],"57":[82,147,88,24,102,28,191,192,193,194,49,68,33,16,36,72],"58":[114,21,22,195,196,119,197,117,198,192,199,200,140,13,172,35,146],"59":[114,21,22,195,196,119,197,117,198,192,199,200,140,13,172,35,146],"60":[37,88,201,202,203,204,46,47,205,206,50,12,125,109],"61":[37,88,201,202,203,204,46,47,205,206,50,12,125,109],"62":[37,88,201,202,203,204,46,47,205,206,50,12,125,109],"63":[207,88,116,208,209,210,211,212,213,100,214,215,216,173,217],"64":[207,88,116,208,209,210,211,212,213,100,214,215,216,173,217],"65":[207,88,116,208,209,210,211,212,213,100,214,215,216,173,217],"66":[88,218,90,24,219,208,28,220,191,192,194,212,213,100,221,222,14,217],"67":[88,218,90,24,219,208,28,220,191,192,194,212,213,100,221,222,14,217],"68":[88,218,90,24,219,208,28,220,191,192,194,212,213,100,221,222,14,217],"69":[223,224,88,225,4,90,26,6,7,9,186,158,166,226,227,228,160,87,229],"70":[223,224,88,225,4,90,26,6,7,9,186,158,166,226,227,228,160,87,229],"71":[223,224,88,225,4,90,26,6,7,9,186,158,166,226,227,228,160,87,229],"72":[230,37,38,231,42,90,208,107,47,232,188,13],"73":[230,37,38,231,42,90,208,107,47,232,188,13],"74":[60,233,234,235,236,24,43,163,28,103,237,238,12,239,33,16],"75":[60,233,234,235,236,24,43,163,28,103,237,238,12,239,33,16],"76":[60,233,234,235,236,24,43,163,28,103,237,238,12,239,33,16],"77":[0,131,115,240,196,197,117,137,241,69,172,215],"78":[0,131,115,240,196,197,117,137,241,69,172,215],"79":[224,147,234,153,41,242,67,243,244,13,34,190],"80":[224,147,234,153,41,242,67,243,244,13,34,190],"81":[245,246],"82":[245,246],"83":[152,53,101,74,247,75,119,248,102,79,43,249,250,251,66,252,49,189,16,72],"84":[54,74,247,75,43,202,253,47,57,166,81,113],"85":[54,74,247,75,43,202,253,47,57,166,81,113],"86":[224,147,88,148,22,115,84,254,63,64,45,255,256,257,85,205,171],"87":[224,147,88,148,22,115,84,254,63,64,45,255,256,257,85,205,171],"88":[82,225,77,63,64,245,258,253,255,257,186,47,259,260,261,58,262,263,16],"89":[82,225,77,63,64,245,258,253,255,257,186,47,259,260,261,58,262,263,16],"90":[60,264,38,265,207,266,107,111,256,48,205,206,109],"91":[60,264,38,265,207,266,107,111,256,48,205,206,109],"92":[73,148,77,84,245,267,186,268,47,269,270,271,212,213,100,17],"93":[73,148,77,84,245,267,186,268,47,269,270,271,212,213,100,17],"94":[73,148,77,84,245,267,186,268,47,269,270,271,212,213,100,17],"95":[114,234,23,43,163,28,103,272,266,245,104,220,273,151],"96":[178,207,180,274,275,276,211,141,212,213,100,154,216,173],"97":[178,207,180,274,275,276,211,141,212,213,100,154,216,173],"98":[128,1,235,277,90,91,102,26,43,208,108,47,85,31,12,278,215],"99":[128,1,235,277,90,91,102,26,43,208,108,47,85,31,12,278,215],"100":[262,228,159,177],"101":[262,228,159,177],"102":[279,234,130,6,8,9,94,10,280,281,282,31,166,227,160,15,16,173,145],"103":[279,234,130,6,8,9,94,10,280,281,282,31,166,227,160,15,16,173,145],"104":[60,283,148,196,26,28,284,285,108,31,11,12,34,16],"105":[60,283,148,196,26,28,284,285,108,31,11,12,34,16],"106":[24,250,107,204,286,287,288,58,12,221,289],"107":[24,250,107,204,286,287,288,58,12,221,289],"108":[37,1,224,147,235,153,117,198,290,194,244,126,34,16],"109":[60,82,291,63,168,64,267,257,112,269,167,270,16,292],"110":[60,82,291,63,168,64,267,257,112,269,167,270,16,292],"111":[22,24,26,28,209,103,293,104,105,30,290,294,295,296,297,11,68,16,35],"112":[22,24,26,28,209,103,293,104,105,30,290,294,295,296,297,11,68,16,35],"113":[118,298,175,24,149,286,121,166,99,12,299,126,71],"114":[1,116,43,202,8,9,300,170,166,227,159,301,15,145],"115":[235,24,248,197,84,110,202,105,302,242,49,13,33,126,59],"116":[37,20,43,84,303,80,186,304,205,232,171,305,125],"117":[37,20,43,84,303,80,186,304,205,232,171,305,125],"118":[230,306,101,147,41,307,198,47,11,167,171,109],"119":[230,306,101,147,41,307,198,47,11,167,171,109],"122":[0,130,90,155,132,275,45,137,122,211,188,308,301,154,309,310,190],"123":[53,311,24,102,219,55,250,80,169,12,68,13,14,312],"124":[130,131,92,45,276,191,313,213,301,154],"125":[207,235,218,250,314,185,315,191,212,213,239,33],"126":[60,224,207,21,22,110,314,185,315,238,239,100,33,289,34,145],"127":[316,54,75,78,43,117,250,192,165,67,317],"128":[202,16],"131":[147,265,115,90,27,318,138,319,31,49,32,320,50,126,16,190],"133":[0,101,184,40,131,196,119,90,43,92,284,120,124,166,12,16],"134":[0,101,184,40,131,196,119,90,43,92,284,120,124,166,12,16],"135":[0,101,184,40,131,196,119,90,43,92,284,120,124,166,12,16],"136":[0,101,184,40,131,196,119,90,43,92,284,120,124,166,12,16],"138":[18,37,90,91,208,28,321,168,47,85,205,232,206,320,271,113,322],"139":[18,37,90,91,208,28,321,168,47,85,205,232,206,320,271,113,322],"140":[60,277,43,208,9,107,111,300,49,232,188,206,109,310],"141":[60,277,43,208,9,107,111,300,49,232,188,206,109,310],"142":[53,323,163,249,253,58,49,81,305,16],"143":[0,324,224,325,153,24,197,156,318,255,260,58,166,81,126,16],"147":[39,22,27,30,46,47,205,32,305,113,14,326],"148":[39,22,27,30,46,47,205,32,305,113,14,326],"149":[39,22,27,30,46,47,205,32,305,113,14,326],"152":[2,118,327,24,43,321,6,8,198,10,31,50,159,15,127],"153":[2,118,327,24,43,321,6,8,198,10,31,50,159,15,127],"154":[2,118,327,24,43,321,6,8,198,10,31,50,159,15,127],"155":[75,21,196,119,197,117,135,8,105,65,49,328,68,16,146],"156":[75,21,196,119,197,117,135,8,105,65,49,328,68,16,146],"157":[75,21,196,119,197,117,135,8,105,65,49,328,68,16,146],"158":[39,234,41,180,24,27,28,117,203,29,329,307,120,31,205,213,35],"159":[39,234,41,180,24,27,28,117,203,29,329,307,120,31,205,213,35],"160":[39,234,41,180,24,27,28,117,203,29,329,307,120,31,205,213,35],"161":[0,178,131,22,119,197,110,139,330,58,166,68,126,278,309,71],"162":[0,178,131,22,119,197,110,139,330,58,166,68,126,278,309,71],"163":[128,19,54,74,247,79,55,331,261,81,332,113],"164":[128,19,54,74,247,79,55,331,261,81,332,113],"165":[60,311,88,323,24,91,208,165,167,12,333,334,33,312],"166":[60,311,88,323,24,91,208,165,167,12,333,334,33,312],"167":[264,102,84,168,335,336,337,338,169,58,170,167,171,246],"168":[264,102,84,168,335,336,337,338,169,58,170,167,171,246],"169":[152,53,19,54,75,153,55,9,137,112,57,58,81,16,154],"170":[128,60,1,43,339,46,340,205,167,320,51,87],"171":[128,60,1,43,339,46,340,205,167,320,51,87],"172":[88,89,90,91,43,92,93,45,94,95,96,97,98,99,12,68,100],"173":[1,118,119,90,92,120,121,122,123,124,99,125,126,34,127],"174":[54,147,148,131,119,92,149,120,123,99,150,151,71,127],"175":[341,247,342,130,135,94,210,124,141,99,49,172,126,154,190],"176":[341,247,342,130,135,94,210,124,141,99,49,172,126,154,190],"177":[53,54,75,184,343,153,130,79,249,47,189,50,87,215,173],"178":[53,54,75,184,343,153,130,79,249,47,189,50,87,215,173],"179":[344,128,60,89,22,180,156,181,111,198,345,97,227,13,246],"180":[344,128,60,89,22,180,156,181,111,198,345,97,227,13,246],"181":[344,128,60,89,22,180,156,181,111,198,345,97,227,13,246],"182":[0,90,26,155,43,156,6,157,8,158,141,159,160],"183":[37,1,39,88,346,148,347,90,339,203,348,198,120,85,99,50,126,317,113,34,14,190],"184":[37,1,39,88,346,148,347,90,339,203,348,198,120,85,99,50,126,317,113,34,14,190],"185":[325,176,349,272,350,273,294,12,151,16],"186":[37,88,201,202,203,204,46,47,205,206,50,12,125,109],"187":[1,118,88,351,130,116,197,352,286,10,158,170,227,12,228,70],"188":[1,118,88,351,130,116,197,352,286,10,158,170,227,12,228,70],"189":[1,118,88,351,130,116,197,352,286,10,158,170,227,12,228,70],"190":[128,60,82,22,119,24,219,93,45,85,58,353,144,70,36,72],"191":[2,161,88,91,6,8,286,10,166,12,159,172,16],"192":[2,161,88,91,6,8,286,10,166,12,159,172,16],"193":[311,54,197,250,58,141,81,68,171,229],"194":[147,88,225,41,196,24,156,63,64,198,257,46,47,345,260,31,354,13,16,216],"195":[147,88,225,41,196,24,156,63,64,198,257,345,260,31,354,13,16,216],"196":[0,101,184,40,131,196,119,90,43,92,284,120,124,166,12,16],"197":[0,101,184,40,131,196,119,90,43,92,284,120,124,166,12,16],"198":[60,19,54,74,247,343,148,180,79,249,253,210,57,188,81],"199":[224,147,234,153,41,242,67,243,244,13,34,190],"200":[60,82,130,258,259,67,243,143,87,16,154,173,355,292],"203":[1,130,42,196,92,111,80,356,211,261,141,49,214,215,173,59,36,190],"204":[357,24,197,43,168,350,358,273,227,12,217,72],"205":[357,24,197,43,168,350,358,273,227,12,217,72],"206":[18,73,128,306,147,176,91,248,28,136,31,141,244,214,16,71],"207":[128,19,83,24,197,102,162,103,250,350,29,80,169,217],"208":[114,234,23,43,163,28,103,272,266,245,104,220,273,151],"209":[54,24,197,120,121,122,192,194,295,296,297,99,227,359,244,299,33,35],"210":[54,24,197,120,121,122,192,194,295,296,297,99,227,359,244,299,33,35],"211":[73,306,39,325,225,43,337,47,360,205,206,51,171,113],"212":[53,311,24,102,219,55,250,80,169,12,68,13,14,312],"213":[361,230,161,101,119,208,272,266,350,362,66,286,17],"214":[298,91,78,197,102,43,349,266,250,111,338,58,33,72],"215":[18,178,82,265,363,364,24,365,45,250,105,366,58,49,150,227,213],"216":[298,147,40,24,197,367,102,29,111,185,120,108,192,368,34,35],"217":[298,147,40,24,197,367,102,29,111,185,120,108,192,368,34,35],"218":[369,370,63,64,371,372,257,140,151,143,16,216],"219":[369,370,63,64,371,372,257,140,151,143,16,216],"220":[18,265,197,28,365,318,111,198,256,138,273,31,16,109],"221":[18,265,197,28,365,318,111,198,256,138,273,31,16,109],"222":[60,1,38,373,207,114,346,91,28,6,8,256,46,47,205,188,16,292],"223":[60,357,225,43,254,266,47,374,304,205,232,244,113,109,52],"224":[60,357,225,43,254,266,47,374,304,205,232,244,113,109,52],"225":[75,364,24,201,45,107,138,375,98,232,143,213,125,322,310,292,190],"226":[1,41,42,323,163,28,203,307,47,85,188,171,125,376],"227":[74,343,25,102,249,250,253,57,273,58,81,12,16,216],"228":[82,195,24,250,377,267,58,296,297,150,68,87,154,36,292],"229":[82,195,24,250,377,267,58,296,297,150,68,87,154,36,292],"230":[37,20,43,84,303,80,186,304,205,232,171,305,125],"231":[101,114,364,24,110,202,318,220,198,241,368,31,244],"232":[101,114,364,24,110,202,318,220,198,241,368,31,244],"234":[18,62,82,153,41,130,196,84,117,135,377,338,378,67],"236":[24,250,107,204,286,287,288,58,12,221,289],"237":[24,250,107,204,286,287,288,58,12,221,289],"238":[130,131,92,45,276,191,313,213,301,154],"239":[207,235,218,250,314,185,315,191,212,213,239,33],"240":[60,224,207,21,22,110,314,185,315,238,239,100,33,289,34,145],"241":[298,224,147,235,130,197,379,286,166,99,150,12,68,333,33,16],"242":[118,298,175,24,149,286,121,166,99,12,299,126,71],"246":[20,283,22,27,380,110,253,273,58,242,31,16],"247":[20,283,22,27,380,110,253,273,58,242,31,16],"248":[20,283,22,27,380,110,253,273,58,242,31,16],"252":[381,2,41,196,102,202,7,105,80,10,166,226,228,159,160,305,278,15,35],"253":[381,2,41,196,102,202,7,105,80,10,166,226,228,159,160,305,278,15,35],"254":[381,2,41,196,102,202,7,105,80,10,166,226,228,159,160,305,278,15,35],"255":[128,62,342,240,24,102,79,28,250,105,194,169,328,12,68,16,71],"256":[128,62,342,240,24,102,79,28,250,105,194,169,328,12,68,16,71],"257":[128,62,342,240,24,102,79,28,250,105,194,169,328,12,68,16,71],"258":[18,101,3,265,207,40,175,42,24,197,163,201,242,31,320,50,16,59],"259":[18,101,3,265,207,40,175,42,24,197,163,201,242,31,320,50,16,59],"260":[18,101,3,265,207,40,175,42,24,197,163,201,242,31,320,50,16,59],"261":[73,61,147,40,119,285,368,295,296,86,297,67,87],"262":[73,61,147,40,119,285,368,295,296,86,297,67,87],"263":[0,101,147,90,219,208,103,286,183,58,189,126,309,326],"264":[0,101,147,90,219,208,103,286,183,58,189,126,309,326],"270":[161,90,24,155,43,157,9,382,159,160],"271":[161,90,24,155,43,157,9,382,159,160],"272":[161,90,24,155,43,157,9,382,159,160],"273":[1,75,78,102,55,111,182,80,10,226,228,159,154,145,36],"274":[1,75,78,102,55,111,182,80,10,226,228,159,154,145,36],"275":[1,75,78,102,55,111,182,80,10,226,228,159,154,145,36],"276":[53,74,247,55,249,331,377,57,58,81,50,383,113],"277":[53,74,247,55,249,331,377,57,58,81,50,383,113],"278":[152,128,38,341,25,163,208,249,339,203,46,51,376],"279":[152,128,38,341,25,163,208,249,339,203,46,51,376],"280":[184,88,208,84,258,267,123,384,261,188,270,143,215,173,292],"281":[184,88,208,84,258,267,123,384,261,188,270,143,215,173,292],"282":[184,88,208,84,258,267,123,384,261,188,270,143,215,173,292],"283":[39,275,335,307,204,164,165,49,167,12,171,109],"284":[39,275,335,307,204,164,165,49,167,12,171,109],"285":[0,62,351,78,120,286,166,226,228,334,33,301],"286":[0,62,351,78,120,286,166,226,228,334,33,301],"287":[147,235,90,102,156,105,198,58,244,278,16],"288":[147,235,90,102,156,105,198,58,244,278,16],"289":[147,235,90,102,156,105,198,58,244,278,16],"290":[152,311,54,102,43,66,165,12,312],"291":[152,311,54,102,43,66,165,12,312],"292":[152,311,54,102,43,66,165,12,312],"293":[62,235,370,202,135,111,120,302,96,194,81,244],"294":[62,235,370,202,135,111,120,302,96,194,81,244],"295":[62,235,370,202,135,111,120,302,96,194,81,244],"296":[54,24,163,284,250,185,108,286,49,239,33,221,301,72],"297":[54,24,163,284,250,185,108,286,49,239,33,221,301,72],"298":[37,39,88,346,148,347,90,339,203,348,198,120,85,99,50,113,34],"299":[114,234,197,163,245,290,273,12,151],"300":[175,153,130,131,90,92,45,120,286,169,385,189,87,126,59,71],"301":[175,153,130,131,90,92,45,120,286,169,385,189,87,126,59,71],"302":[279,130,131,180,293,250,259,261,354,87,386,154,309],"303":[298,130,131,90,78,26,293,123,260,85,31,295,296,86,297,150,87,216],"304":[60,101,114,283,202,30,198,194,273,242,68,317,16],"305":[60,101,114,283,202,30,198,194,273,242,68,317,16],"306":[60,101,114,283,202,30,198,194,273,242,68,317,16],"307":[274,219,45,169,141,49,212,213,239,100,334,221,216,145],"308":[274,219,45,169,141,49,212,213,239,100,334,221,216,145],"309":[357,176,387,388,389,345,340,295,296,297,328,16,35,70,59],"310":[357,176,387,388,389,345,340,295,296,297,328,16,35,70,59],"311":[390,0,347,387,92,94,120,391,126],"312":[390,0,347,387,92,94,120,391,126],"313":[298,62,311,88,24,249,335,169,333,309,312],"314":[118,311,392,88,131,393,249,120,169,188,312],"315":[2,351,4,394,135,157,9,204,358,48,281,166,226,160,322,15],"316":[369,101,395,291,186,268,396,112,16,397,292],"317":[369,101,395,291,186,268,396,112,16,397,292],"318":[357,197,117,307,356,31,205,51,292],"319":[357,197,117,307,356,31,205,51,292],"320":[38,62,147,153,90,197,339,117,272,318,198,186,151,244,16],"321":[38,62,147,153,90,197,339,117,272,318,198,186,151,244,16],"322":[40,175,283,77,393,63,272,64,220,198,257,140,242,31,12,151,146],"323":[40,175,283,77,393,63,272,64,220,198,257,140,242,31,12,151,146],"324":[147,40,43,398,318,186,31,11,328,12,317,399],"325":[1,153,42,135,94,189,81,12,126,173,309,190],"326":[1,153,42,135,94,189,81,12,126,173,309,190],"327":[178,88,274,84,92,28,209,45,107,400,276,120,210,194,169,205,309,310],"328":[152,75,367,43,110,250,371,252,165,12,171,109],"329":[152,75,367,43,110,250,371,252,165,12,171,109],"330":[152,75,367,43,110,250,371,252,165,12,171,109],"331":[361,2,224,234,351,240,24,155,84,104,7,164,260,194,228,239,154,70],"332":[361,2,224,234,351,240,24,155,84,104,7,164,260,194,228,239,154,70],"333":[73,128,53,323,79,55,249,401,30,377,47,368,58,145],"334":[73,128,53,323,79,55,249,401,30,377,47,368,58,145],"335":[363,22,196,24,102,43,219,84,250,29,65,80,66,142,34,16],"336":[77,22,102,321,63,64,253,198,257,66,150,70],"339":[37,27,43,117,389,371,111,307,320,109],"340":[37,27,43,117,389,371,111,307,320,109],"341":[39,41,248,197,27,208,202,29,198,108,31,317,278,70],"342":[39,41,248,197,27,208,202,29,198,108,31,317,278,70],"345":[207,42,90,28,321,402,300,273,354,12,16],"346":[207,42,90,28,321,402,300,273,354,12,16],"347":[344,60,39,162,26,380,208,28,107,205,16],"348":[344,60,39,162,26,380,208,28,107,205,16],"349":[41,42,131,22,90,137,46,47,32,188,51,305,14],"350":[41,42,131,22,90,137,46,47,32,188,51,305,14],"351":[1,130,84,136,94,186,385,271,216,355,190],"352":[61,346,84,45,182,260,354,333,214,154,173,309],"353":[73,84,258,259,58,49,188,403,404,397,355,292],"354":[73,84,258,259,58,49,188,403,404,397,355,292],"355":[54,291,47,259,405,270,143,173,355,292],"356":[54,291,47,259,405,270,143,173,355,292],"357":[176,27,8,251,80,406,85,166,226,159,160,15,16],"358":[148,395,84,92,137,407,124,385,262,354,16,215,173,190],"359":[18,54,153,148,197,136,250,253,338,368,261,169,67,150,87,126,214,16],"361":[223,265,234,91,84,365,136,120,151,322,70],"362":[223,265,234,91,84,365,136,120,151,322,70],"363":[38,147,40,28,63,203,64,318,257,205,151,171,34,16],"364":[38,147,40,28,63,203,64,318,257,205,151,171,34,16],"365":[38,147,40,28,63,203,64,318,257,205,151,171,34,16],"366":[37,38,207,41,198,205,188,50,12,51,113],"367":[37,38,207,41,198,205,188,50,12,51,113],"368":[37,38,207,41,198,205,188,50,12,51,113],"369":[37,1,306,101,147,153,28,203,290,11,244,51,109],"370":[38,39,41,131,254,203,51,125,113,127],"371":[27,117,272,303,408,30,307,297,32,12,376],"372":[27,117,272,303,408,30,307,297,32,12,376],"373":[27,117,272,303,408,30,307,297,32,12,376],"387":[1,351,90,197,393,163,409,63,117,64,350,371,220,198,257,10,228,317],"388":[1,351,90,197,393,163,409,63,117,64,350,371,220,198,257,10,228,317],"389":[1,351,90,197,393,163,409,63,117,64,350,371,220,198,257,10,228,317],"390":[178,88,196,410,24,219,110,45,286,260,140,212,100,33,222,70],"391":[178,88,196,410,24,219,110,45,286,260,140,212,100,33,222,70],"392":[178,88,196,410,24,219,110,45,286,260,140,212,100,33,222,70],"393":[128,38,101,363,40,41,91,79,43,249,307,193,244,113,310],"394":[128,38,101,363,40,41,91,79,43,249,307,193,244,113,310],"395":[128,38,101,363,40,41,91,79,43,249,307,193,244,113,310],"396":[344,73,53,316,247,197,79,284,249,58,49,59,72],"397":[344,73,53,316,247,197,79,284,249,58,49,59,72],"398":[344,73,53,316,247,197,79,284,249,58,49,59,72],"399":[306,75,147,41,197,103,272,203,181,65,11,12,151],"400":[306,75,147,41,197,103,272,203,181,65,11,12,151],"403":[75,357,196,102,111,120,286,139,345,340,295,296,297,171,146],"404":[75,357,196,102,111,120,286,139,345,340,295,296,297,171,146],"405":[75,357,196,102,111,120,286,139,345,340,295,296,297,171,146],"406":[2,351,394,135,157,9,204,358,48,281,166,160,322,15],"407":[2,351,4,394,135,157,9,204,358,48,281,166,226,160,322,15],"408":[235,283,22,197,285,117,85,242,81,16,35],"409":[235,283,22,197,285,117,85,242,81,16,35],"410":[60,176,77,24,197,163,209,110,266,318,198,273,16],"411":[60,176,77,24,197,163,209,110,266,318,198,273,16],"417":[18,89,22,179,119,180,43,272,315,120,139,411,98,151],"418":[38,306,101,176,367,93,339,181,65,286,169,67,278,144,70],"419":[38,306,101,176,367,93,339,181,65,286,169,67,278,144,70],"420":[223,2,161,118,351,90,132,272,157,8,412,10,166,151,127],"421":[223,2,161,118,351,90,132,272,157,8,412,10,166,151,127],"422":[1,369,3,40,42,24,248,63,64,318,257,186,46,143,51,16],"423":[1,369,3,40,42,24,248,63,64,318,257,186,46,143,51,16],"424":[128,60,82,22,119,24,219,93,45,85,58,353,144,70,36,72],"425":[223,323,84,55,137,198,186,47,143,292],"426":[223,323,84,55,137,198,186,47,143,292],"427":[390,392,363,88,41,240,155,43,413,45,348,120,302,260,385,212,213,100,33,70],"428":[390,392,363,88,41,240,155,43,413,45,348,120,302,260,385,212,213,100,33,70],"429":[60,82,130,258,259,67,243,143,87,16,154,173,355,292],"430":[60,19,54,74,247,343,148,180,79,249,253,210,57,188,81],"431":[18,344,61,75,179,43,253,120,301,71],"432":[18,344,61,75,179,43,253,120,301,71],"433":[395,84,92,137,124,385,262,354,16,215,173,190],"434":[73,77,22,197,285,182,268,47,368,58,150,328,278,35],"435":[73,77,22,197,285,182,268,47,368,58,150,328,278,35],"436":[149,262],"437":[149,262],"438":[325,176,349,272,350,273,294,12,151,16],"439":[0,130,90,155,132,275,45,137,122,211,188,308,301,154,309,310,190],"440":[118,298,175,24,149,286,121,166,99,12,299,126,71],"441":[128,53,147,88,25,55,383,332,113,154],"442":[131,370,84,291,258,182,259,414,270,215,292],"443":[20,283,77,22,197,103,117,350,29,198,305,109,376],"444":[20,283,77,22,197,103,117,350,29,198,305,109,376],"445":[20,283,77,22,197,103,117,350,29,198,305,109,376],"446":[0,224,325,153,24,197,156,318,255,58,166,81,126,16],"447":[18,128,240,410,380,284,413,415,185,315,302,204,287,288,221,35,146],"448":[18,128,240,410,380,284,413,415,185,315,302,204,287,288,221,35,146],"449":[147,63,64,350,198,257,81,416,16,72],"450":[147,63,64,350,198,257,81,416,16,72],"451":[344,128,60,264,54,22,83,102,58,188,81,278],"452":[344,128,60,264,54,22,83,102,58,188,81,278],"453":[230,176,24,219,45,250,185,191,194,288,67,239,334,221,301],"454":[230,176,24,219,45,250,185,191,194,288,67,239,334,221,301],"455":[2,225,7,157,9,85,280,170,281,228,159,160],"456":[390,0,128,306,90,43,232,188,167,51,171,125],"457":[390,0,128,306,90,43,232,188,167,51,171,125],"458":[1,41,42,323,163,28,203,307,47,85,188,171,125,376],"459":[223,265,351,197,393,7,46,242,166,226,11,159],"460":[223,265,351,197,393,7,46,242,166,226,11,159],"461":[18,178,82,265,363,364,24,365,45,250,105,366,58,49,150,227,213],"462":[245,246],"463":[37,1,224,147,235,153,117,198,290,194,244,126,34,16],"464":[22,24,26,28,209,103,293,104,105,30,290,294,295,296,297,11,68,16,35],"465":[1,116,43,202,8,9,300,170,166,227,159,301,15,145],"466":[207,235,218,250,314,185,315,191,212,213,239,33],"467":[60,224,207,21,22,110,314,185,315,238,239,100,33,289,34,145],"468":[341,247,342,130,135,94,210,124,141,99,49,172,126,154,190],"469":[311,54,197,250,58,141,81,68,171,229],"470":[0,101,184,40,131,196,119,90,43,92,284,120,124,166,12,16],"471":[0,101,184,40,131,196,119,90,43,92,284,120,124,166,12,16],"472":[128,19,83,24,197,102,162,103,250,350,29,80,169,217],"473":[18,265,197,28,365,318,111,198,256,138,273,31,16,109],"475":[184,88,208,84,258,267,123,384,261,188,270,143,215,173,292],"476":[114,234,197,163,245,290,273,12,151],"477":[54,291,47,259,405,270,143,173,355,292],"478":[223,265,234,91,84,365,136,120,151,322,70],"495":[161,42,131,22,7,10,261,417,58,166,160,376],"496":[161,42,131,22,7,10,261,417,58,166,160,376],"497":[161,42,131,22,7,10,261,417,58,166,160,376],"498":[147,40,119,202,117,220,198,290,199,87,317,16],"499":[147,40,119,202,117,220,198,290,199,87,317,16],"500":[147,40,119,202,117,220,198,290,199,87,317,16],"501":[60,248,102,208,284,418,253,56,348,419,51],"502":[60,248,102,208,284,418,253,56,348,419,51],"503":[60,248,102,208,284,418,253,56,348,419,51],"504":[60,22,43,253,391,58,49,226,72],"505":[60,22,43,253,391,58,49,226,72],"506":[344,0,101,40,119,156,255,356,58,295,296,297,12,146],"507":[344,0,101,40,119,156,255,356,58,295,296,297,12,146],"508":[344,0,101,40,119,156,255,356,58,295,296,297,12,146],"509":[0,54,75,88,40,119,420,348,182,120,278,421],"510":[0,54,75,88,40,119,420,348,182,120,278,421],"511":[73,2,240,119,90,7,276,96,422,226,15,154],"512":[73,2,240,119,90,7,276,96,422,226,15,154],"513":[73,224,147,21,195,240,119,90,276,96,140,212,154],"514":[73,224,147,21,195,240,119,90,276,96,140,212,154],"515":[73,38,306,41,240,119,90,307,276,96,154],"516":[73,38,306,41,240,119,90,307,276,96,154],"517":[147,357,207,132,336,286,169,141,214,16],"518":[147,357,207,132,336,286,169,141,214,16],"519":[53,102,92,55,94,137,98,172,59],"520":[53,102,92,55,94,137,98,172,59],"521":[53,102,92,55,94,137,98,172,59],"522":[344,60,61,196,197,250,111,377,340,67,12],"523":[344,60,61,196,197,250,111,377,340,67,12],"524":[233,163,111,220,149,290,423,16,424],"525":[233,163,111,220,149,290,423,16,424],"526":[233,163,111,220,149,290,423,16,424],"527":[0,184,131,180,208,249,120,286,210,112,124,113],"528":[0,184,131,180,208,249,120,286,210,112,124,113],"529":[380,103,105,371,107,11,177,222,278],"530":[380,103,105,371,107,11,177,222,278],"531":[390,1,147,88,40,132,92,94,425,98,299],"532":[24,163,55,284,260,194,426,49,12,68,427,334,289],"533":[24,163,55,284,260,194,426,49,12,68,427,334,289],"534":[24,163,55,284,260,194,426,49,12,68,427,334,289],"535":[101,147,175,41,156,371,46,112,205,50,244,17],"536":[101,147,175,41,156,371,46,112,205,50,244,17],"537":[101,147,175,41,156,371,46,112,205,50,244,17],"540":[128,60,311,346,56,80,204,10,169,67,244,228,160,70],"541":[128,60,311,346,56,80,204,10,169,67,244,228,160,70],"542":[128,60,311,346,56,80,204,10,169,67,244,228,160,70],"543":[18,264,367,103,168,111,358,322],"544":[18,264,367,103,168,111,358,322],"545":[18,264,367,103,168,111,358,322],"546":[2,88,131,90,8,120,123,166,143,228,70,36],"547":[2,88,131,90,8,120,123,166,143,228,70,36],"548":[0,2,161,88,91,132,6,166,12,228],"549":[0,2,161,88,91,132,6,166,12,228],"550":[128,37,357,114,202,377,428,206,320,51,109,72],"551":[306,82,24,197,110,103,193,261,58,296,297,67,59,36],"552":[306,82,24,197,110,103,193,261,58,296,297,67,59,36],"553":[306,82,24,197,110,103,193,261,58,296,297,67,59,36],"554":[61,147,88,40,235,110,135,111,429,138,260,12,69,33],"555":[61,147,88,40,235,110,135,111,12,69,33],"556":[2,351,430,10,226,353,228,159,322],"557":[234,24,102,163,380,208,104,350,12,322,16],"558":[234,24,102,163,380,208,104,350,12,322,16],"559":[1,54,225,153,24,27,219,284,45,260,212,213,100,334],"560":[1,54,225,153,24,27,219,284,45,260,212,213,100,334],"561":[53,249,210,31,124,173,190],"562":[431,84,168,120,407,259,414,12,143,154,215],"563":[431,84,168,120,407,259,414,12,143,154,215],"564":[373,234,91,43,380,208,198,432,85,205,320,151,216],"565":[373,234,91,43,380,208,198,432,85,205,320,151,216],"566":[18,53,114,208,55,371,32,421,215,70],"567":[18,53,114,208,55,371,32,421,215,70],"568":[344,325,233,41,266,47,151,322,16],"569":[344,325,233,41,266,47,151,322,16],"570":[61,131,24,284,135,348,405,143,87],"571":[61,131,24,284,135,348,405,143,87],"572":[306,101,147,22,179,43,208,120,330,12],"573":[306,101,147,22,179,43,208,120,330,12],"574":[42,131,45,261,313,405,386,59,127],"575":[42,131,45,261,313,405,386,59,127],"576":[42,131,45,261,313,405,386,59,127],"577":[73,369,286,259,141,188,332,309],"578":[73,369,286,259,141,188,332,309],"579":[73,369,286,259,141,188,332,309],"580":[152,39,53,247,41,25,202,94,433,67,51],"581":[152,39,53,247,41,25,202,94,433,67,51],"582":[233,364,380,365,245,237,434,375,259,166,205],"583":[233,364,380,365,245,237,434,375,259,166,205],"584":[233,364,380,365,245,237,434,375,259,166,205],"585":[128,2,147,176,181,120,169,166,228,160],"586":[128,2,147,176,181,120,169,166,228,160],"587":[0,73,22,119,90,55,249,56,411,435,340,169],"588":[60,436,54,24,102,208,437,338,58,165,278],"589":[60,436,54,24,102,208,437,338,58,165,278],"590":[324,393,272,198,280,282,12,151,228],"591":[324,393,272,198,280,282,12,151,228],"592":[369,438,291,46,158,188,206,354],"593":[369,438,291,46,158,188,206,354],"594":[42,90,291,46,50,12,353],"595":[54,346,162,84,103,335,362,439,358,58,440,421],"596":[54,346,162,84,103,335,362,439,358,58,440,421],"597":[225,351,208,103,149,273,226,228,159,322,17],"598":[225,351,208,103,149,273,226,228,159,322,17],"605":[73,207,130,84,385,441,154,215,216,173,145,292],"606":[73,207,130,84,385,441,154,215,216,173,145,292],"607":[361,369,131,275,186,47,140,12],"608":[361,369,131,275,186,47,140,12],"609":[361,369,131,275,186,47,140,12],"610":[306,22,24,102,349,110,202,80,252,32,12,68],"611":[306,22,24,102,349,110,202,80,252,32,12,68],"612":[306,22,24,102,349,110,202,80,252,32,12,68],"613":[147,265,88,40,102,253,368,213,33],"614":[147,265,88,40,102,253,368,213,33],"615":[245,375,442],"616":[101,88,197,209,168,250,204,169,58,12,322],"617":[101,88,197,209,168,250,204,169,58,12,322],"618":[73,82,147,40,24,291,389,371,402,345,340,67,271,16],"619":[240,208,250,443,194,169,67,12,33,215],"620":[240,208,250,443,194,169,67,12,33,215],"621":[61,54,22,83,102,105,29,417,58,296,297,87],"624":[176,274,219,261,273,58,87,72],"625":[176,274,219,261,273,58,87,72],"626":[1,224,101,283,176,352,103,202,242,11,109],"627":[444,249],"628":[444,249],"629":[53,77,208,249,182,120,261,17],"630":[53,77,208,249,182,120,261,17],"631":[224,54,147,90,102,445,198,140,58,87,16],"632":[60,54,43,103,293,362,439,252,169,296,12],"633":[73,60,224,114,363,253,371,295,296,297,405],"634":[73,60,224,114,363,253,371,295,296,297,405],"635":[73,60,224,114,363,253,371,295,296,297,405],"636":[381,153,349,117,237,49,12,172,446],"637":[381,153,349,117,237,49,12,172,446],"650":[163,219,272,260,151,160,447,322,34,16],"651":[163,219,272,260,151,160,447,322,34,16],"652":[163,219,272,260,151,160,447,322,34,16],"653":[92,137,348,211,140,308,214],"654":[92,137,348,211,140,308,214],"655":[92,137,348,211,140,308,214],"656":[41,346,24,168,203,204,260,98,359,322,70],"657":[41,346,24,168,203,204,260,98,359,322,70],"658":[41,346,24,168,203,204,260,98,359,322,70],"659":[272,151,322],"660":[272,151,322],"661":[61,129,323,219,55],"662":[61,129,323,219,55],"663":[61,129,323,219,55],"664":[280,170,282],"665":[280,170,282],"666":[280,170,282],"667":[61,40,21,195,254],"668":[61,40,21,195,254],"669":[346,131,202,348,391],"670":[346,131,202,348,391],"671":[346,131,202,348,391],"672":[272,448,10,151],"673":[272,448,10,151],"674":[298,219,182,193,67,449,450],"675":[298,219,182,193,67,449,450],"676":[131,451,276,122,50],"677":[178,207,40,90,309],"678":[178,207,40,90,309],"679":[234,163,258,177,292],"680":[234,163,258,177,292],"681":[234,163,258,177,292],"682":[131,156,84,92,50,154],"683":[131,156,84,92,50,154],"684":[40,156,348,452,34],"685":[40,156,348,452,34],"686":[230,346,180,84,275,189,216,292],"687":[230,346,180,84,275,189,216,292],"688":[344,90,102,203,286,70],"689":[344,90,102,203,286,70],"690":[369,23,168,47,368,112,376],"691":[369,23,168,47,368,112,376],"692":[306,39,254,286,453,206,12],"693":[306,39,254,286,453,206,12],"694":[128,346,23,30,97,417],"695":[128,346,23,30,97,417],"696":[27,432,294,295,296,86,297,16],"697":[27,432,294,295,296,86,297,16],"698":[207,42,387,111,432,237,47,375],"699":[207,42,387,111,432,237,47,375],"700":[0,101,184,40,131,196,119,90,43,92,284,120,124,166,12,16],"701":[128,41,219,55,254,250,185,261,169,67,215],"702":[119,237,286,345,391,166],"704":[369,22,83,24,48,12,16],"705":[369,22,83,24,48,12,16],"706":[369,22,83,24,48,12,16],"707":[380,237,423,454,70],"708":[84,259,260,112,98,270,87,215],"709":[84,259,260,112,98,270,87,215],"710":[84,98,16,292],"711":[84,98,16,292],"712":[207,42,46,375,354],"713":[207,42,46,375,354],"714":[61,20,323,55,30,70],"715":[61,20,323,55,30,70],"722":[208,55,249,47,169,188,421,16,355],"723":[208,55,249,47,169,188,421,16,355],"724":[208,55,249,47,169,188,421,16,355],"725":[45,198,183,193,140,154,35,72],"726":[45,198,183,193,140,154,35,72],"727":[45,198,183,193,140,154,35,72],"728":[0,1,38,148,455,48,243],"729":[0,1,38,148,455,48,243],"730":[0,1,38,148,455,48,243],"731":[74,247,323,57,383,397,59],"732":[74,247,323,57,383,397,59],"733":[74,247,323,57,383,397,59],"734":[202,295,296,297,71,72],"735":[202,295,296,297,71,72],"736":[387,349,12,246,109],"737":[387,349,12,246,109],"738":[387,349,12,246,109],"739":[1,163,202,33,317],"740":[1,163,202,33,317],"741":[392,131,323,456,457,55,13],"742":[134,455,435,452,98,169,458,173],"743":[134,455,435,452,98,169,458,173],"744":[202,117,105,296,297,87,71],"745":[202,117,105,296,297,87,71],"746":[37,203,111,46,205,320],"747":[63,64,362,257,47],"748":[63,64,362,257,47],"749":[175,197,459,202,318,198,290,192,142],"750":[175,197,459,202,318,198,290,192,142],"751":[275,64,257,452,232],"752":[275,64,257,452,232],"753":[223,118,55,9,228,317,15],"754":[223,118,55,9,228,317,15],"755":[1,393,280,282,159],"756":[1,393,280,282,159],"757":[344,61,224,101,208,45],"758":[344,61,224,101,208,45],"759":[163,272,460,461,426,242,12,151,213,100],"760":[163,272,460,461,426,242,12,151,213,100],"761":[0,230,2,202,250,368,160],"762":[0,230,2,202,250,368,160],"763":[0,230,2,202,250,368,160],"764":[1,156,94,12,228,462],"765":[40,395,135,211,243,71],"766":[298,75,283,24,219,208,250,443],"767":[39,163,349,29,151,322],"768":[39,163,349,29,151,322],"769":[1,63,64,257,31,16,292],"770":[1,63,64,257,31,16,292],"771":[62,82,42,90,112,98,12],"775":[0,347,92,368,317],"776":[114,195,163,107,16,72],"777":[264,88,90,43,92,45,96,99,68],"778":[414,270,16,292],"779":[377,295,86,205,447],"780":[90,331,30,80,46,368],"782":[24,68,33,305],"783":[24,68,33,305],"784":[24,68,33,305],"810":[235,393,45,8,463,228,159],"811":[235,393,45,8,463,228,159],"812":[235,393,45,8,463,228,159],"813":[344,287,87,447],"814":[344,287,87,447],"815":[344,287,87,447],"816":[38,39,364,46,47,164,421],"817":[38,39,364,46,47,164,421],"818":[38,39,364,46,47,164,421],"819":[272,151,34,71],"820":[272,151,34,71],"821":[344,74,82,444,323,55,249],"822":[344,74,82,444,323,55,249],"823":[344,74,82,444,323,55,249],"824":[362,452,354,113],"825":[362,452,354,113],"826":[362,452,354,113],"827":[219,208,386,146],"828":[219,208,386,146],"829":[393,280,281,282,228,159],"830":[393,280,281,282,228,159],"831":[62,24,242],"832":[62,24,242],"833":[324,23,409,11],"834":[324,23,409,11],"835":[344,129,197,387,146],"836":[344,129,197,387,146],"837":[101,234,245],"838":[101,234,245],"839":[101,234,245],"840":[272,262,151,87],"841":[272,262,151,87],"842":[272,262,151,87],"843":[224,101,83,30,71],"844":[224,101,83,30,71],"845":[38,341,79,55,249,419],"846":[230,102,117,278],"847":[230,102,117,278],"848":[202,260,177],"849":[202,260,177],"850":[208,272,439,151],"851":[208,272,439,151],"852":[298,291,339,302,260,87],"853":[298,291,339,302,260,87],"854":[215],"855":[215],"856":[464,156,455,384,449],"857":[464,156,455,384,449],"858":[464,156,455,384,449],"859":[183],"860":[183],"861":[183],"862":[219,208,183],"863":[82,119,197,102,43,16],"864":[114,8,47,205,188,292],"865":[74,75,119,24,197,102,43,219,250,189,16],"866":[0,130,90,155,132,275,45,137,122,211,188,308,301,154,309,310,190],"867":[143],"868":[139,71],"869":[139,71],"871":[143,87],"872":[42,465,165],"873":[42,465,165],"874":[31,16],"875":[38,114,197,339,365,34],"876":[130,135,45,210,127],"877":[62,89,90,45,107,183,449,447],"878":[62,224,197,272,318,85,81,16],"879":[62,224,197,272,318,85,81,16],"884":[42,102,278],"885":[23,84,188,270,87,421,16],"886":[23,84,188,270,87,421,16],"887":[23,84,188,270,87,421,16],"899":[18,62,82,153,41,130,196,84,117,135,377,338,378,67],"900":[53,311,24,102,219,55,250,80,169,12,68,13,14,312],"901":[298,147,40,24,197,367,102,29,111,185,120,108,192,368,34,35],"902":[202,428],"903":[363,24,102,219,45,250,70],"904":[73,306,39,325,225,43,47,205,206,113],"906":[348,466,159,87,215],"907":[348,466,159,87,215],"908":[348,466,159,87,215],"909":[224,88,416,16],"910":[224,88,416,16],"911":[224,88,416,16],"912":[284,249,107,71],"913":[284,249,107,71],"914":[284,249,107,71],"915":[63,202,64,257,396],"916":[63,202,64,257,396],"917":[335,252,143,87],"918":[335,252,143,87],"919":[467,24],"920":[467,24],"921":[390,92,45,289],"922":[390,92,45,289],"923":[390,92,45,289],"924":[18,90,156,250,169,70],"925":[18,90,156,250,169,70],"926":[161,40,92,348,146],"927":[161,40,92,348,146],"928":[223,158,143,160],"929":[223,158,143,160],"930":[223,158,143,160],"931":[180,197,66,183],"932":[318,468,31,16],"933":[318,468,31,16],"934":[318,468,31,16],"935":[82,84,292],"936":[82,84,292],"937":[82,84,292],"938":[37,339,469],"939":[37,339,469],"940":[223,79,63,202,64,257],"941":[223,79,63,202,64,257],"942":[202,368,359,292],"943":[202,368,359,292],"944":[62,162,348,183,447,17],"945":[62,162,348,183,447,17],"946":[234,258,158,159,36],"947":[234,258,158,159,36],"948":[230,42,90,208,107,170,159,17],"949":[230,42,90,208,107,170,159,17],"950":[208,202,453,31],"951":[6,170,151,228,159],"952":[6,170,151,228,159],"953":[223,385,354,143],"954":[223,385,354,143],"955":[249,137,215],"956":[249,137,215],"957":[250,470,449],"958":[250,470,449],"959":[250,470,449],"960":[66,143],"961":[66,143],"962":[74,79,249,193,87],"963":[90,24,47,383,353],"964":[90,24,47,383,353],"965":[325,47,183,386,17],"966":[325,47,183,386,17],"967":[306,22,4,208],"968":[471,293,16],"969":[245,143,17],"970":[245,143,17],"971":[40,84,258,143,215,146,292],"972":[40,84,258,143,215,146,292],"973":[74,219,421],"974":[40,254,365,317,34],"975":[40,254,365,317,34],"976":[117,354],"977":[40,117,318,16],"978":[24,107,169],"979":[82,147,88,24,102,28,191,192,193,194,49,68,33,16,36,72],"980":[225,196,24,156,63,64,257,46,47,31,354,16],"981":[1,130,42,196,92,111,80,356,211,261,141,49,214,215,173,59,36,190],"982":[18,73,128,306,147,176,91,248,28,136,31,141,244,214,16,71],"983":[176,274,219,261,273,58,87,72],"996":[306,30,256,138],"997":[306,30,256,138],"998":[306,30,256,138],"1011":[272,262,151,87],"1018":[42,102,278],"1019":[272,262,151,87]}};
function makeMon(id,lvl,obtained){
  return getSpecies(id).then(function(info){
    var ab=escolheHabilidade(id);
    var nat=Object.keys(ABIL_DB.nat)[ri(0,24)];
    var m=newMon({id:id,name:cap(info.name),types:info.types,base:info.base,iv:randomIV(),lvl:(lvl||3),
      obtained:obtained||"aventura",
      ability:ab?ab.en:null,
      abilityPt:ab?(ab.pt||ab.en):null,
      abilityOculta:!!(ab&&ab.oculta),
      nature:nat});
    m.shiny=Math.random()<0.02;
    levelUpMovesUpTo(info,m.lvl).slice(-4).forEach(function(x){
      if(m.moves.length<4){m.moves.push({name:x.name,url:x.url});m.learned.push(moveKey(x));}
    });
    if(!m.moves.length){m.moves.push({name:"tackle",url:"https://pokeapi.co/api/v2/move/tackle"});m.learned.push("tackle");}
    m.exp=xpForLevel(m.lvl);m.hp=maxHP(m);
    return m;
  });
}
function checkNewMoves(p){
  var info=SP[p.id];if(!info)return;
  p.learned=p.learned||[];
  var known=p.moves.map(moveKey);
  levelUpMovesUpTo(info,p.lvl).forEach(function(x){
    var k=moveKey(x);
    if(known.indexOf(k)>=0||p.learned.indexOf(k)>=0)return;
    if(p.moves.length<4){
      p.moves.push({name:x.name,url:x.url});p.learned.push(k);
      log("<b>"+p.name+"</b> aprendeu <b>"+ptName(x.name)+"</b>!","good");
    } else if(!(S.learnPool||[]).some(function(q){return q.uid===p.uid&&moveKey(q.move)===k;})){
      S.learnPool.push({uid:p.uid,monName:p.name,move:{name:x.name,url:x.url}});
    }
  });
}
function idFromUrl(u){var m=String(u).match(/\/(\d+)\/?$/);return m?parseInt(m[1],10):null;}
function findLink(node,id){
  if(idFromUrl(node.species.url)===id)return node;
  for(var i=0;i<(node.evolves_to||[]).length;i++){var r=findLink(node.evolves_to[i],id);if(r)return r;}
  return null;
}
function evolveInto(p,info){
  var old=p.name;p.id=info.id;p.name=cap(info.name);p.types=info.types;p.base=info.base;p.hp=maxHP(p);
  log("✨ <b>"+old+"</b> evoluiu para <b>"+p.name+"</b>!","evo");
  toasts("✨ <b>"+old+"</b> → <b>"+p.name+"</b>!","evo");
}
function checkEvolution(p){
  if(!p) return;
  /* guardas anti-loop: evita cascata de evolucoes */
  if(p._evoluindo) return;
  if(p._evoFeita && p._evoFeita[p.id]) return;

  return api("pokemon-species/"+p.id).then(function(sp){return fetchJSON(sp.evolution_chain.url);}).then(function(evo){
    var link=findLink(evo.chain,p.id); if(!link) return;

    for(var i=0;i<link.evolves_to.length;i++){
      var ev=link.evolves_to[i];
      /* Na PokeAPI, evolution_details fica no FILHO (ev), nao no pai. */
      var cond=(ev.evolution_details&&ev.evolution_details[0])||{};

      /* SEM nivel minimo informado = NAO evolui por nivel. Nada de inventar 20. */
      var min=cond.min_level;
      if(!min) continue;

      /* pedra/item/move/felicidade: nao evolui sozinho por nivel */
      if(cond.item||cond.held_item||cond.known_move||cond.known_move_type) continue;
      if(cond.min_happiness||cond.min_affection||cond.min_beauty) continue;
      if(cond.trigger&&cond.trigger.name!=="level-up") continue;
      if(cond.time_of_day) continue;

      if(p.lvl>=min){
        var alvo=idFromUrl(ev.species.url);
        if(!alvo||alvo===p.id) continue;
        if(p._evoFeita&&p._evoFeita[alvo]) continue;
        p._evoluindo=1;
        return getSpecies(alvo).then(function(i2){
          if(!i2){ p._evoluindo=0; return; }
          if(!p._evoFeita) p._evoFeita={};
          p._evoFeita[alvo]=1;
          p._evoluindo=0;
          evolveInto(p,i2);
        }).catch(function(){ p._evoluindo=0; });
      }
    }
  }).catch(function(){ p._evoluindo=0; });
}
function tryStoneEvo(p,item){
  if(!p||p._evoluindo) return Promise.resolve(false);
  return api("pokemon-species/"+p.id).then(function(sp){return fetchJSON(sp.evolution_chain.url);}).then(function(evo){
    var link=findLink(evo.chain,p.id); if(!link) return false;
    for(var i=0;i<link.evolves_to.length;i++){
      var ev=link.evolves_to[i];
      /* detalhes ficam no FILHO */
      var cond=(ev.evolution_details&&ev.evolution_details[0])||{};
      if(!cond.item||!cond.item.name) continue;
      if(cond.item.name!==item) continue;
      var alvo=idFromUrl(ev.species.url);
      if(!alvo||alvo===p.id) continue;
      if(p._evoFeita&&p._evoFeita[alvo]) return false;
      p._evoluindo=1;
      return getSpecies(alvo).then(function(i2){
        if(!p._evoFeita) p._evoFeita={};
        p._evoFeita[alvo]=1;
        p._evoluindo=0;
        evolveInto(p,i2);
        return true;
      }).catch(function(){ p._evoluindo=0; return false; });
    }
    return false;
  }).catch(function(){ p._evoluindo=0; return false; });
}
function hungerScale(p){return p.hunger>=70?1:p.hunger>=40?0.85:p.hunger>=15?0.65:0.45;}
function energyScale(p){return p.energy>=60?1:p.energy>=30?0.75:0.5;}
function gainEV(p,k,a){p.ev[k]=clamp(p.ev[k]+a,0,252);}
function gainExp(p,amount){
  var capLv=capLevel();
  if(p.lvl>=capLv){p.exp=Math.min(p.exp,xpForLevel(p.lvl+1)-1);return 0;}
  amount=Math.max(0,Math.round(amount*hungerScale(p)*energyScale(p)));
  p.exp+=amount;
  var before=p.lvl;
  while(p.exp>=xpForLevel(p.lvl+1)){
    if(p.lvl+1>capLv)break;
    p.lvl++;
  }
  if(p.lvl>before){
    log("<b>"+p.name+"</b> chegou ao nível <b>"+p.lvl+"</b>!","good");
    toasts("⬆ <b>"+p.name+"</b> → nível "+p.lvl+"!","good");
    checkNewMoves(p);
    /* avaliar evolucao fora do laco de EXP, para nao encadear evolucoes */
    setTimeout(function(){ try{ checkEvolution(p); }catch(e){} }, 0);
    if(p.lvl>=capLv)toasts("🔒 <b>"+p.name+"</b> bateu no <b>teto N"+capLv+"</b>. Vença o próximo ginásio!","bad");
  }
  return amount;
}
function toasts(msg,cls){
  cls=cls||"";
  var el=document.createElement("div");el.className="toast "+cls;el.innerHTML=msg;
  var box=$("#toasts");if(!box)return;box.appendChild(el);
  setTimeout(function(){el.style.transition="opacity .4s,transform .4s";el.style.opacity="0";el.style.transform="translateX(30px)";},2600);
  setTimeout(function(){if(el.parentNode)el.parentNode.removeChild(el);},3100);
}
function log(msg,cls){
  if(!S)return;cls=cls||"";
  var t=new Date().toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"});
  if(!S.log)S.log=[];
  S.log.unshift({t:t,m:msg,c:cls});
  if(S.log.length>120)S.log.length=120;
}
var MIN=60e3;
function ensureTimers(){if(S&&!S.timer)S.timer=setInterval(tick,1000);}
function tick(){
  if(!S)return;
  var now=Date.now(),dt=now-(S.lastTick||now);S.lastTick=now;
  var dtm=dt/MIN;
  (S.team||[]).forEach(function(m){
    /* fome cai sempre; dormindo cai mais devagar */
    m.hunger=clamp(m.hunger-(m.awake?0.55:0.18)*dtm,0,100);

    /* stamina: dormindo sobe rapido, acordado perde devagar por ficar parado */
    if(m.awake){
      m.energy=clamp(m.energy-0.42*dtm,0,100);
    } else {
      m.energy=clamp(m.energy+3.2*dtm,0,100);
    }

    /* HP regenera naturalmente quando esta bem alimentado e acordado */
    if(m.hp>0 && !m.fainted){
      var regen=(m.hunger>=50?0.55:0.25)*(m.awake?1:1.8)*dtm;
      var max=typeof maxHP==="function"?maxHP(m):m.hp;
      m.hp=clamp(Math.round((m.hp+regen)*100)/100,0,max);
    }

    /* vinculo: cai conforme a fome, em degraus */
    if(m.awake){
      var perda=0;
      if(m.hunger<15)      perda=1.20;
      else if(m.hunger<40) perda=0.60;
      else if(m.hunger<65) perda=0.25;
      if(perda>0) m.bond=clamp((m.bond||0)-perda*dtm,0,100);
      /* bem alimentado recupera um pouco */
      if(m.hunger>=85) m.bond=clamp((m.bond||0)+0.10*dtm,0,100);
    }

    /* doenca: contagem em tempo real (rodada 3 usa isto) */
    if(m.sickUntil && Date.now()>=m.sickUntil){ m.sickUntil=0; m.sick=null; }
    /* exaustao: dormir acelera a recuperacao */
    if(m.exaustoUntil){
      if(Date.now()>=m.exaustoUntil){ m.exaustoUntil=null; m.energy=Math.max(m.energy,35); log("😌 <b>"+m.name+"</b> se recuperou da exaustão!","good"); }
      else if(!m.awake){ m.exaustoUntil=Math.max(Date.now(), m.exaustoUntil-4000*dtm); }
    }
  });
  (S.eggs||[]).forEach(function(e){e.hatch=clamp(e.hatch+dtm*1.2,0,100);});
  /* treino extensivo roda em segundo plano */
  try{ tickTreino(Math.max(1, Math.round(dt/1000))); }catch(e){ console.error(e); }
  checkAdventure();checkEggs();
  render(true);save();
}
var resolving=false;
function checkAdventure(){
  if(!S||!S.adventure||resolving)return;
  if(Date.now()<S.adventure.endAt)return;
  resolving=true;
  resolveAdventure(S.adventure).catch(function(e){console.error(e);log("⚠ Erro na aventura.","bad");S.adventure=null;})
    .then(function(){resolving=false;render(true);});
}
var resolvingE=false;
function checkEggs(){
  if(!S||!(S.eggs||[]).length||resolvingE) return;
  var done=S.eggs.filter(function(e){ return e.hatch>=100; });
  if(!done.length) return;
  resolvingE=true;
  var novos=[];
  var ficaram=[];
  done.forEach(function(e){
    /* 1) gera o Pokemon ANTES de mexer na lista */
    if(!e.mon || !e.mon.name){
      e.mon=gerarDoOvo(e);
    }
    /* 2) se nao deu para gerar (catalogo vazio), MANTEM o ovo */
    if(!e.mon || !e.mon.name){
      ficaram.push(e);
      return;
    }
    /* 3) agora sim remove o ovo */
    S.eggs=S.eggs.filter(function(x){ return x!==e; });
    if((S.team||[]).length<MAX_TEAM){
      S.team.push(e.mon);
      log("🥚 O ovo chocou! Nasceu <b>"+esc(e.mon.name)+"</b> (IV "+ivTotal(e.mon)+"/186 · "+ivGrade(e.mon)+").","evo");
      toasts("🥚 Nasceu <b>"+esc(e.mon.name)+"</b>! Veja na equipe.","evo");
      novos.push(e.mon);
    } else {
      S.box=S.box||[]; S.box.push(e.mon);
      log("🥚 <b>"+esc(e.mon.name)+"</b> nasceu — equipe cheia, foi para o Box.","warn");
      toasts("🥚 "+esc(e.mon.name)+" nasceu e foi para o Box!","evo");
      novos.push(e.mon);
    }
  });
  if(novos.length){ save(); lastView=""; }
  if(ficaram.length && !window.__avisoOvo){ window.__avisoOvo=1; }
  if(ficaram.length){ log("⏳ "+ficaram.length+" ovo(s) esperando: carregando a lista de espécies…","info"); }
  resolvingE=false;
}
function gerarDoOvo(e){
  var cat=(typeof CATALOG!=="undefined"&&CATALOG&&CATALOG.length)?CATALOG:null;
  if(!cat){
    /* catalogo vazio: pede o carregamento e segura o ovo para o proximo tick */
    try{ fetchCatalog().then(function(c){ if(c&&c.length) CATALOG=c; }).catch(function(){}); }catch(err){}
    e.hatch=100;
    return null;
  }
  var tipo=e.eggType||null;
  var pool=cat.slice(1,900);
  /* ovo de tipo: procura um Pokemon daquele tipo */
  if(tipo){
    var achou=[];
    var amostra=[];
    for(var i=0;i<60 && i<pool.length;i++){
      var idx=Math.floor(Math.random()*pool.length);
      amostra.push(pool[idx]);
    }
    /* usa o cache SP se ja tiver o tipo */
    amostra.forEach(function(c){
      var info=SP[c.id];
      if(info&&info.types&&info.types.indexOf(tipo)>=0) achou.push(c);
    });
    if(achou.length) pool=achou;
  }
  var pick=pool[Math.floor(Math.random()*pool.length)];
  var m=newMon({
    id:pick.id, name:cap(pick.name), types:["normal"], base:[45,45,45,45,45,45],
    iv:randomIV(), lvl:1, obtained:"ovo",
    nature:Object.keys(ABIL_DB.nat)[ri(0,24)]
  });
  var ab=escolheHabilidade(pick.id);
  if(ab){ m.ability=ab.en; m.abilityPt=(ab.pt||ab.en); m.abilityOculta=!!ab.oculta; }
  m.shiny=Math.random()<0.02;
  m.moves=[{name:"tackle",url:"https://pokeapi.co/api/v2/move/tackle"}];
  m.learned=["tackle"];
  m.exp=xpForLevel(1); m.hp=maxHP(m);
  /* completa os dados reais da especie em segundo plano */
  getSpecies(pick.id).then(function(info){
    if(!info) return;
    m.name=cap(info.name); m.types=info.types; m.base=info.base;
    m.hp=maxHP(m);
    var lm=levelUpMovesUpTo(info,1);
    lm.slice(-2).forEach(function(x){
      if(m.moves.length<4&&!m.moves.some(function(y){return y.name===x.name;})){
        m.moves.push({name:x.name,url:x.url}); m.learned.push(moveKey(x));
      }
    });
    save();
  }).catch(function(){});
  return m;
}
function resolveAdventure(adv){
  var route=ROUTES.filter(function(r){return r.id===adv.routeId;})[0]||ROUTES[0];
  var party=(S.team||[]).filter(function(m){return adv.uids.indexOf(m.uid)>=0;});
  if(!party.length){S.adventure=null;return Promise.resolve();}
  var n=party.length,tier=PARTY_TIERS[clamp(n,1,6)-1];
  var enc=clamp(Math.round((adv.endAt-adv.startAt)/(route.rate||3.5*60e3)),1,7);
  var startLvls=party.map(function(m){return m.lvl;});
  var drops=[],capd=[],wins=0,xp=0,faint=false;
  party.forEach(function(m){if(m.fainted){m.fainted=false;m.hp=Math.max(1,Math.floor(maxHP(m)*0.3));}});
  function alive(){return party.filter(function(m){return m.hp>0;});}
  function loop(i){
    if(i>=enc||!alive().length)return Promise.resolve();
    return wildForRoute(route,tier).catch(function(){return null;}).then(function(w){
      if(!w)return loop(i+1);
      var m=alive()[0];
      m.energy=clamp(m.energy-ri(2,5),0,100);
      m.hunger=clamp(m.hunger-ri(2,4),0,100);
      return batalhaPokemon(m,w,{}).then(function(res){
        if(res.winA){
          wins++;xp+=res.expA;
          var rrEXP=expParaTodos(party.filter(function(x){return x.hp>0;}), w, tier.expMult, m);
          if(rrEXP.ganharam&&rrEXP.ganharam.length&&!faint){
            log("\u2b50 <b>"+rrEXP.ganharam.join(", ")+"</b> subiu de nivel na aventura!","good");
          }
          m.hp=Math.max(1,res.hpA);
          if(Math.random()<0.36)drops.push(pickOne(["Potion","Super Potion","Berry","Oran Berry","Revive","Nugget","Rare Candy","TM","Hyper Potion","Poké Ball","Great Ball","Fire Stone","Water Stone","Thunder Stone","Leaf Stone","Ice Stone","Moon Stone"]));
          if(Math.random()<0.05)drops.push("IV Crystal");
          capd.push(w);
        } else {
          m.hp=Math.max(0,res.hpA);
          if(m.hp<=0){m.fainted=true;faint=true;}
        }
        return loop(i+1);
      });
    });
  }
  return loop(0).then(function(){
    var maxNew=Math.max.apply(null,party.map(function(m,i){return m.lvl-startLvls[i];}));
    drops.forEach(function(d){
      S.items[d]=(S.items[d]||0)+1;
      if(d==="TM")S.tmTokens=(S.tmTokens||0)+1;
    });
    S.money=(S.money||0)+wins*ri(60,140)*(1+(n-1)*0.22);
    S.advReports=S.advReports||[];
    S.advReports.unshift({route:route.name,pt:route.pt,icon:route.icon,party:party.map(function(m){return m.name;}),
      n:n,tier:tier.label,wins:wins,xp:xp,lvls:Math.max(0,maxNew),drops:drops,faint:faint,
      time:new Date().toLocaleString("pt-BR"),captures:capd.length});
    if(S.advReports.length>15)S.advReports.length=15;
    /* doenca: quem voltou ferido (HP baixo) ou desmaiou fica doente */
    party.forEach(function(m){
      var max=maxHP(m);
      var ferido = m.fainted || (m.hp>0 && m.hp <= max*0.35);
      if(ferido && !estaDoente(m)){
        m.sickUntil = Date.now() + doencaDuracaoMs(m);
        m.sick = "Ferido na aventura";
      }
    });
    if(faint){
      log("💀 Sua equipe foi derrotada em <b>"+route.pt+"</b>. Os feridos ficam de repouso.","bad");
      toasts("💀 A equipe desmaiou na aventura!","bad");
      S.adventure=null;
    } else {
      log("🗺 <b>"+party.map(function(m){return m.name;}).join(", ")+"</b> voltaram de <b>"+route.pt+"</b>: "+wins+" vitória(s), +"+fmt(xp)+" EXP.","good");
      toasts("🗺 Aventura concluída — "+wins+" vitórias!","good");
      S.adventure=null;
      if(capd.length)openCapture(capd);
    }
    save();
  });
}
function wildForRoute(route,tier){
  /* pokemon REAIS da rota (dados do Anil) — peso igual para variedade */
  var lista=(route&&route.mons&&route.mons.length)?route.mons:null;
  var lvmin=route?route.lv[0]:2, lvmax=route?route.lv[1]:5;
  var lv=clamp(ri(lvmin,lvmax)+(tier?tier.cap:0), lvmin, lvmax+3);
  function porNome(nome){
    if(!CATALOG||!CATALOG.length) return null;
    var v=String(nome).toLowerCase();
    return CATALOG.filter(function(c){return c.name===v;})[0]||null;
  }
  function escolhe(i){
    var pool=CATALOG.slice(1,Math.min(CATALOG.length,801));
    if(!lista||i>=6) return pool.length?pool[ri(0,pool.length-1)]:{id:16,name:"pidgey"};
    var achou=porNome(lista[ri(0,lista.length-1)]);
    return achou?achou:escolhe(i+1);
  }
  var p=escolhe(0);
  return getSpecies(p.id).then(function(info){
    var w=newMon({id:p.id,name:cap(info.name),types:info.types,base:info.base,lvl:lv,iv:randomIV()});
    levelUpMovesUpTo(info,w.lvl).slice(-4).forEach(function(x){w.moves.push({name:x.name,url:x.url});});
    if(!w.moves.length)w.moves.push({name:"tackle",url:"https://pokeapi.co/api/v2/move/tackle"});
    w.hp=maxHP(w);return w;
  });
}

/* ===== PARTE 2/3 — combate (tela animada), treinos, ações, ovos, loja ===== */
/* (climas agora definidos no motor de batalha v2) */

/* dano efetivo de um golpe contra um alvo, considerando clima e STAB */
/* ===== ESTADO DA BATALHA (clima, turno, lados) ===== */
function abilitiesDe(id){ var d=ABIL_DB.ab[String(id)]; return d||[]; }
function natInfo(nome){
  if(!nome) return null;
  var k=Object.keys(ABIL_DB.nat).filter(function(x){ return x.toLowerCase()===String(nome).toLowerCase(); })[0];
  if(k) return {en:k, pt:ABIL_DB.nat[k].pt, ef:ABIL_DB.nat[k].ef};
  var k2=Object.keys(ABIL_DB.nat).filter(function(x){ return ABIL_DB.nat[x].pt.toLowerCase()===String(nome).toLowerCase(); })[0];
  return k2? {en:k2, pt:ABIL_DB.nat[k2].pt, ef:ABIL_DB.nat[k2].ef} : null;
}
/* valor da natureza: +10% no stat buffado, -10% no reduzido */
function natMulti(nome, idx){
  var n=natInfo(nome); if(!n) return 1;
  var v=n.ef[idx]||0;
  return v>0?1.1:(v<0?0.9:1);
}
function natResumo(nome){
  var n=natInfo(nome); if(!n) return "—";
  if(!n.ef||n.ef.every(function(x){return x===0;})) return n.pt+" (neutra)";
  var nomes=["Atk","Def","SpA","SpD","Spe"];
  var mais=[],menos=[];
  n.ef.forEach(function(v,i){ if(v>0)mais.push(nomes[i]); if(v<0)menos.push(nomes[i]); });
  return n.pt+(mais.length?(" +"+mais.join("/")):"")+(menos.length?(" −"+menos.join("/")):"");
}
/* sorteia a habilidade: 2 normais + 1 oculta (15% de chance de oculta) */
function escolheHabilidade(id){
  var arr=abilitiesDe(id); if(!arr.length) return null;
  var normais=arr.filter(function(a){ return !a[2]; });
  var ocultas=arr.filter(function(a){ return a[2]; });
  if(ocultas.length&&Math.random()<0.15) return {en:ocultas[0][0],pt:ocultas[0][1],oculta:true};
  var pool=normais.length?normais:arr;
  var a=pool[Math.floor(Math.random()*pool.length)];
  return {en:a[0],pt:a[1],oculta:false};
}
/* efeitos de habilidade aplicados na batalha */
function abilEntrada(mon, foe){
  var e=abilEfeito(mon); if(!e) return "";
  if(e.entrada==="atk-down"&&foe){
    foe.stages.atk=Math.max(0.5,(foe.stages.atk||1)*0.67);
    return "<b>"+mon.name+"</b> intimidou o oponente (Atk caiu)!";
  }
  if(e.turno==="spe"){
    mon.stages.spe=Math.min(4,(mon.stages.spe||1)+0.5);
    return "<b>"+mon.name+"</b> acelerou (Speed Boost)!";
  }
  return "";
}

function sinergiaClima(eu, climaId, foe){
  var c=CLIMAS[climaId]; if(!c) return 0;
  var time=(S.team||[]).filter(function(m){ return m!==eu && !m.fainted; });
  var n=0;
  time.forEach(function(m){
    if((m.types||[]).indexOf(c.bonus)>=0) n++;
  });
  /* bonus extra se o INIMIGO nao se beneficia */
  if(foe&&(foe.types||[]).indexOf(c.bonus)<0) n+=0.5;
  return n;
}
/* aplica o clima no estado da batalha */
function melhorTroca(atual, foe){
  var lista=(S.team||[]).filter(function(m){ return m!==atual && !m.fainted && m.hp>0; });
  if(!lista.length) return null;
  var atualScore=0, melhor=null, melhorScore=0;
  (atual.types||[]).forEach(function(t){ atualScore=Math.max(atualScore,typeEff(t,foe.types)); });
  lista.forEach(function(m){
    var s=0;
    (m.types||[]).forEach(function(t){ s=Math.max(s,typeEff(t,foe.types)); });
    /* resistencia importa */
    var def=0;
    (foe.types||[]).forEach(function(t){ def=Math.max(def,typeEff(t,m.types)); });
    s -= def*0.55;
    if(s>melhorScore){ melhorScore=s; melhor=m; }
  });
  /* so troca se o ganho for claro */
  if(melhor&&melhorScore>atualScore+0.7) return melhor;
  return null;
}
/* habilidade de entrada: aplica clima automatico quando o Pokemon entra */
function timeTemClima(){
  var achados=[];
  (S.team||[]).forEach(function(m){
    (m.moves||[]).forEach(function(mv){
      var id=String(mv.name||"").toLowerCase();
      if(MOV_CLIMA[id]&&achados.indexOf(MOV_CLIMA[id])<0) achados.push(MOV_CLIMA[id]);
    });
  });
  return achados;
}

/* compatibilidade: bestMove antigo delega para a nova IA */
function bestMove(mon){
  var list=(mon.moves&&mon.moves.length)?mon.moves:[{name:"tackle",url:"https://pokeapi.co/api/v2/move/tackle"}];
  return Promise.all(list.map(function(mv){return getMove(mv.url||mv.name).then(function(d){return {mv:mv,d:d};}).catch(function(){return null;});})).then(function(all){
    var best=null,score=-1;
    all.forEach(function(x){
      if(!x||!x.d)return;var d=x.d;
      var s=(d.power||30)*(mon.types.indexOf(d.type)>=0?1.3:1)*(d.dmgClass==="status"?0.3:1);
      if(s>score){score=s;best=x;}
    });
    return best||{mv:{name:"tackle"},d:fallbackMove()};
  });
}
function openBattle(opts){
  S.battle={party:opts.party,foes:opts.foes,partyIdx:0,foeIdx:0,log:[],busy:false,over:false,
    moves:null,kind:opts.kind||"wild",title:opts.title||"Batalha",trainer:opts.trainer||null,
    gym:opts.gym||null,balls:opts.balls||[],reward:opts.reward||null,canFlee:opts.kind==="wild"};
  renderBattle();loadBattleMoves();
  setTimeout(function(){if(S&&S.battle)startBattleRound();},60);
  render();
}
function bMine(){return S.battle.party[S.battle.partyIdx];}
function bFoe(){return S.battle.foes[S.battle.foeIdx];}
function bSay(t,c){S.battle.log.push({t:t,c:c||""});}
function startBattleRound(){
  var b=S.battle;if(!b)return;
  resetStages(bMine());resetStages(bFoe());
  b.mine={hp:maxHP(bMine())};b.foe={hp:maxHP(bFoe())};
  b.mine.ref=bMine(); b.foe.ref=bFoe();
  [bMine(),bFoe()].forEach(function(x){ if(!x)return; x._sashUsed=false; x._sitrusUsado=false; x._lumUsado=false; x._chestoUsado=false; x._whiteUsado=false; x._balaoUsado=false; x._fraquezaUsada=false; });
  b.log=[];
  if(b.kind==="wild")bSay("⚔ Um <b>"+bFoe().name+"</b> selvagem (Nv."+bFoe().lvl+") apareceu!","hl");
  else bSay("⚔ <b>"+b.trainer+"</b> enviou <b>"+bFoe().name+"</b> (Nv."+bFoe().lvl+")!","hl");
  bSay("Vai, <b>"+bMine().name+"</b>!");
  loadBattleMoves();renderBattle();
}
function loadBattleMoves(){
  var b=S.battle;if(!b)return;
  var mon=bMine();
  var list=(mon.moves&&mon.moves.length)?mon.moves:[{name:"tackle",url:"https://pokeapi.co/api/v2/move/tackle"}];
  Promise.all(list.map(function(mv){return getMove(mv.url||mv.name);})).then(function(ms){
    if(!S.battle)return;S.battle.moves=ms.slice(0,4);renderBattle();
  });
}
function renderBattle(){
  var b=S&&S.battle;if(!b)return;
  var ov=$("#battleOverlay");
  if(!ov){document.body.insertAdjacentHTML("beforeend","<div class='battle' id='battleOverlay'></div>");ov=$("#battleOverlay");}
  var mine=bMine(),foe=bFoe();
  var mMax=maxHP(mine),fMax=maxHP(foe);
  var mhp=b.mine?b.mine.hp:mMax,fhp=b.foe?b.foe.hp:fMax;
  var mvHTML=(b.moves&&b.moves.length)?b.moves.map(function(d,i){
    return "<button class='mvbtn' data-move='"+i+"' "+(b.busy||b.over?"disabled":"")+"><span class='mvn'>"+(d.pt||pretty(d.name))+" <span class='en'>"+pretty(d.name)+"</span></span>"+
    "<span class='mvs'><span class='type' style='background:"+(TYPE_COLORS[d.type]||"#888")+"'>"+(TYPE_PT[d.type]||d.type)+"</span> Poder "+(d.power||"—")+" • Prec. "+d.acc+"%</span></button>";
  }).join(""):"<div class='tiny' style='padding:10px'>Carregando golpes…</div>";
  var ballsHTML=(b.balls||[]).filter(function(x){return (S.items||{})[x]>0;}).map(function(x){
    return "<button class='btn sm' data-ball='"+x+"' "+(b.busy||b.over?"disabled":"")+">"+BALLS[x].icon+" "+x+" ("+S.items[x]+")</button>";
  }).join("");
  ov.innerHTML=
    "<div class='battlefield'><div class='platform foe'></div><div class='platform mine'></div>"+
      "<img class='bsprite foe' id='foeSpr' data-id='"+foe.id+"' data-back='0' src='"+spr(foe.id,false)+"' onerror='markSpriteFail("+foe.id+",false)'>"+
      "<img class='bsprite mine' id='mineSpr' data-id='"+mine.id+"' data-back='1' src='"+spr(mine.id,true)+"' onerror='markSpriteFail("+mine.id+",true)'>"+
      "<div class='hpbox foe'><div class='nm'>"+foe.name+(foe.shiny?" ✨":"")+" <span class='lv'>Nv."+foe.lvl+"</span><span class='tiny'>#"+String(foe.id).padStart(4,"0")+"</span></div>"+
        "<div class='bar hp "+(pct(fhp,fMax)<25?"low":pct(fhp,fMax)<55?"mid":"")+"'><i id='foeHp' style='width:"+pct(fhp,fMax)+"%'></i></div>"+
        "<div class='hpnum'><span>HP</span><span id='foeHpN'>"+Math.max(0,fhp)+"/"+fMax+"</span></div></div>"+
      "<div class='hpbox mine'><div class='nm'>"+mine.name+(mine.shiny?" ✨":"")+" <span class='lv'>Nv."+mine.lvl+"</span></div>"+
        "<div class='bar hp "+(pct(mhp,mMax)<25?"low":pct(mhp,mMax)<55?"mid":"")+"'><i id='mineHp' style='width:"+pct(mhp,mMax)+"%'></i></div>"+
        "<div class='hpnum'><span id='mineHpN'>"+Math.max(0,mhp)+"/"+mMax+"</span><span>XP "+fmt(mine.exp)+"</span></div></div>"+
      "<div style='position:absolute;left:14px;bottom:10px'>"+
        "<span class='tiny' style='font-weight:800;color:#eef2ff'>Equipe / Team:</span>"+
        "<div class='teamdots'>"+b.party.map(function(m){return "<span class='dot "+(m.fainted?"dead":(pct(m.hp,maxHP(m))<35?"hurt":"on"))+"'></span>";}).join("")+"</div>"+
        (b.foes.length>1?"<span class='tiny' style='font-weight:800;color:#eef2ff'>Adversário:</span><div class='teamdots'>"+b.foes.map(function(m,i){return "<span class='dot "+(m.hp<=0?"dead":(i===b.foeIdx?"on":""))+"'></span>";}).join("")+"</div>":"")+
      "</div>"+
      "<div style='position:absolute;top:12px;left:50%;transform:translateX(-50%)'><span class='chip'>"+b.title+"</span></div>"+
    "</div>"+
    "<div class='battlelog' id='blog'>"+b.log.map(function(l){return "<div class='"+(l.c||"")+"'>"+l.t+"</div>";}).join("")+"</div>"+
    "<div class='battlemenu'><div class='moves4'>"+mvHTML+"</div>"+
      "<div style='display:flex;flex-direction:column;gap:7px;min-width:178px'>"+
        "<div style='display:flex;gap:7px;flex-wrap:wrap'>"+ballsHTML+
          "<button class='btn sm' data-act='flee' "+(b.busy||b.over||!b.canFlee?"disabled":"")+">🏃 Fugir</button></div>"+
        (b.over?"<button class='btn sm primary' data-act='battleok' style='width:100%'>Encerrar</button>":"")+
      "</div></div>";
  var bl=$("#blog");if(bl)bl.scrollTop=bl.scrollHeight;
  hydrateBattleSprites();bindBattle();
}
function hydrateBattleSprites(){
  [["foeSpr",bFoe(),false],["mineSpr",bMine(),true]].forEach(function(pair){
    var el=$("#"+pair[0]);if(!el||!pair[1])return;
    var id=pair[1].id,back=pair[2];
    if(SPRITE_FAIL[back?(id+"b"):String(id)]){el.src=spriteURL(id,back);return;}
    var im=new Image();
    im.onload=function(){var e=$("#"+pair[0]);if(e)e.src=im.src;};
    im.onerror=function(){markSpriteFail(id,back);};
    im.src=animURL(id,back);
  });
}
function refreshLog(){
  var bl=$("#blog");if(!bl||!S||!S.battle)return;
  bl.innerHTML=S.battle.log.map(function(l){return "<div class='"+(l.c||"")+"'>"+l.t+"</div>";}).join("");
  bl.scrollTop=bl.scrollHeight;
  var mv=document.querySelectorAll(".mvbtn");
  for(var i=0;i<mv.length;i++){ mv[i].disabled=!!(S.battle.busy||S.battle.over); }
}
function floatText(id,txt,color){
  var el=$("#"+id),ov=$("#battleOverlay");if(!el||!ov)return;
  var r=el.getBoundingClientRect(),br=ov.getBoundingClientRect();
  var f=document.createElement("div");f.className="float";f.textContent=txt;
  f.style.left=(r.left-br.left+r.width/2-14)+"px";f.style.top=(r.top-br.top)+"px";f.style.color=color||"#fff";
  var bf=ov.querySelector(".battlefield");if(bf)bf.appendChild(f);
  setTimeout(function(){f.remove();},1000);
}
function wait(ms){return new Promise(function(r){setTimeout(r,vsFirst?ms:80);});}
function updateHp(){
  var b=S.battle;if(!b)return;
  var e1=$("#foeHp"),e2=$("#mineHp"),n1=$("#foeHpN"),n2=$("#mineHpN");
  if(e1)e1.style.width=pct(b.foe.hp,maxHP(bFoe()))+"%";
  if(e2)e2.style.width=pct(b.mine.hp,maxHP(bMine()))+"%";
  if(n1)n1.textContent=Math.max(0,b.foe.hp)+"/"+maxHP(bFoe());
  if(n2)n2.textContent=Math.max(0,b.mine.hp)+"/"+maxHP(bMine());
}
/* Efeitos de itens equipados fora do dano */
function heldTurno(p,reg){
  var h=heldDo(p); if(!h||!reg) return;
  var ef=h.efeito;
  if(ef==="turno" && reg.hp>0){
    reg.hp=Math.min(maxHP(p),reg.hp+Math.max(1,Math.round(maxHP(p)/16)));
  }
  if(ef==="lodo" && reg.hp>0){
    var veto=p.types.indexOf("poison")>=0;
    var d=Math.max(1,Math.round(maxHP(p)/16));
    reg.hp = veto ? Math.min(maxHP(p),reg.hp+d) : Math.max(0,reg.hp-d);
  }
  if(ef==="orbe" && reg.hp>0){
    var q=Math.max(1,Math.round(maxHP(p)/16));
    reg.hp=Math.max(0,reg.hp-q);
  }
  /* frutas de reação */
  if(ef==="sitrus" && !p._sitrusUsado && reg.hp>0 && reg.hp<=Math.round(maxHP(p)*0.5)){
    p._sitrusUsado=true;
    reg.hp=Math.min(maxHP(p),reg.hp+Math.round(maxHP(p)*0.25));
  }
  if(ef==="lum" && !p._lumUsado && (p.status||p.sick)){ p._lumUsado=true; p.status=null; p.sick=null; }
  if(ef==="chesto" && !p._chestoUsado && p.awake===false && !p.fainted){ p._chestoUsado=true; }
  if(ef==="white" && !p._whiteUsado){
    var menor=1.01;
    ["atk","def","spa","spd","spe"].forEach(function(k){ if(p.stages&&p.stages[k]<menor) menor=p.stages[k]; });
    if(menor<1){ p._whiteUsado=true;
      ["atk","def","spa","spd","spe"].forEach(function(k){ if(p.stages[k]<1) p.stages[k]=1; });
    }
  }
}
function heldPrioridade(p){
  var h=heldDo(p);
  return !!(h&&(h.efeito==="prioridade"||h.efeito==="vel50")&&Math.random()<(h.efeito==="vel50"?0.35:0.2));
}
function heldFocoSash(p,reg){
  var h=heldDo(p); if(!h||h.efeito!=="foco"||!reg) return false;
  if(reg.hp<=0 && !p._sashUsed){ p._sashUsed=true; reg.hp=1; return true; }
  return false;
}
function expComItem(p,base){
  var h=heldDo(p);
  return (h&&h.id==="Lucky Egg") ? Math.round(base*1.5) : base;
}
function dinheiroComItem(base){
  var tem=S.team.some(function(m){ var h=heldDo(m); return h&&h.id==="Amulet Coin"; });
  return tem ? base*2 : base;
}
function hit(att,def,d){
  var b=S.battle;
  bSay("<b>"+att.name+"</b> usou <b>"+(d.pt||pretty(d.name))+"</b>!");
  var acc=clamp((d.acc/100)*accuracy(att,def),0.3,1.05);
  if(Math.random()>acc){bSay("→ Errou! / Missed!","hl2");return 0;}
  if(!d.power){
    if(d.stat_changes&&d.stat_changes.length&&Math.random()<0.85){
      var k=statKey(d.stat_changes[0].stat);
      var tgt=d.stat_changes[0].change<0?def:att;
      if(k){
        var delta=(k==="acc"||k==="eva")?d.stat_changes[0].change/100:d.stat_changes[0].change;
        tgt.stages[k]=clamp((tgt.stages[k]||1)+delta,0.4,2.6);
        bSay("→ "+(delta>0?"subiu":"caiu")+" "+(STAT_LABEL[k]||k)+" de <b>"+tgt.name+"</b>!","hl2");
      }
    } else bSay("→ Mas nada aconteceu.");
    return 0;
  }
  var stab=att.types.indexOf(d.type)>=0?1.5:1,eff=typeEff(d.type,def.types),crit=Math.random()<1/16?1.5:1;
  var dmg=d.dmgClass==="special"?specDamage(att,def,d.power,eff,stab,crit):estDamage(att,def,d.power,eff,stab,crit);

  /* itens equipados do atacante */
  var hi=heldDo(att);
  if(hi){
    var efAt=hi.efeito;
    if(efAt==="atk50" && d.dmgClass!=="special") dmg=Math.round(dmg*1.5);
    if(efAt==="spa50" && d.dmgClass==="special") dmg=Math.round(dmg*1.5);
    if(efAt==="fis10" && d.dmgClass!=="special") dmg=Math.round(dmg*1.1);
    if(efAt==="esp10" && d.dmgClass==="special") dmg=Math.round(dmg*1.1);
    if(efAt==="super20" && eff>1.5) dmg=Math.round(dmg*1.2);
    if(efAt==="dano30recuo") dmg=Math.round(dmg*1.3);
    if(efAt==="soco" && /punch|soco|jab/i.test(String(d.name))) dmg=Math.round(dmg*1.2);
    if(efAt==="raiz" && d.drain) dmg=Math.round(dmg*1.15);
    if(efAt==="crit" && Math.random()<0.15) dmg=Math.round(dmg*1.5);
    if(efAt==="fraqueza" && !att._fraquezaUsada && eff>1.5){
      att._fraquezaUsada=true;
      att.stages.atk=clamp((att.stages.atk||1)+1,0.4,2.6);
      att.stages.spa=clamp((att.stages.spa||1)+1,0.4,2.6);
      bSay("→ O <b>Seguro Fraqueza</b> de "+att.name+" subiu os ataques!","hl2");
    }
  }
  /* itens equipados do defensor */
  var hd=heldDo(def);
  if(hd){
    var efDf=hd.efeito;
    if(efDf==="spd50" && d.dmgClass==="special") dmg=Math.round(dmg*0.67);
    if(efDf==="def50evolui") dmg=Math.round(dmg*0.75);
    if(efDf==="balao" && d.type==="ground" && !def._balaoUsado){
      def._balaoUsado=true;
      bSay("→ O <b>Balão de Ar</b> de "+def.name+" anulou o golpe Terrestre!","hl2");
      return 0;
    }
    if(efDf==="capacete" && d.dmgClass!=="special" && def.hp>0){
      var quem=(att===bFoe())?b.foe:b.mine;
      if(quem){ var danoCap=Math.max(1,Math.round(maxHP(att)/16)); quem.hp=Math.max(0,quem.hp-danoCap);
        bSay("→ O <b>Capacete Dentado</b> feriu "+att.name+" em "+danoCap+"!","hl2"); }
    }
  }
  /* precisão dos itens */
  if(hi && hi.efeito==="precisao") acc=clamp(acc*1.15,0.3,1.1);

dmg=Math.max(1,Math.floor(dmg*rnd(0.86,1)));
  /* o HP do combate vive no registro b.foe / b.mine, nao no pokemon */
  var regAlvo = (def===bFoe()) ? b.foe : (def===bMine() ? b.mine : null);
  var registro = regAlvo || def;
  registro.hp=Math.max(0,registro.hp-dmg);
  if(def && def!==registro){ def.hp=registro.hp; }
  if(crit>1)bSay("→ Acerto crítico!","crit");
  if(eff>1.5)bSay("→ É super eficaz! / Super effective!","hl");
  else if(eff<1&&eff>0)bSay("→ Não é muito eficaz...","hl2");
  else if(eff===0)bSay("→ Não afeta...","hl2");
  bSay("→ <b>"+dmg+"</b> de dano / damage.");

  if(hi&&hi.id==="lifeorb"){
    var recuo=Math.max(1,Math.round(dmg*0.1));
    var regR=(att===bFoe())?b.foe:b.mine;
    if(regR) regR.hp=Math.max(0,regR.hp-recuo);
    bSay("→ <b>"+att.name+"</b> sofreu "+recuo+" de recuo (Orbe da Vida).","hl2");
  }
  if(hi&&hi.id==="shellbell"){
    var cura=Math.max(1,Math.round(dmg/8));
    var regC=(att===bFoe())?b.foe:b.mine;
    if(regC) regC.hp=Math.min(maxHP(att),regC.hp+cura);
    bSay("→ <b>"+att.name+"</b> recuperou "+cura+" HP (Sino Concha).","hl2");
  }
  updateHp();
  return dmg;
}
function playerMove(i){
  var b=S.battle;if(!b||b.busy||b.over)return;
  b.busy=true;
  refreshLog();
  /* Restos e efeitos de inicio de turno */
  heldTurno(bMine(), b.mine);
  heldTurno(bFoe(), b.foe);
  updateHp();
  var mine=bMine(),foe=bFoe(),d=(b.moves||[])[i]||fallbackMove();
  b._prioridade = heldPrioridade(mine);
  return wait(200).then(function(){
    var dmg1=hit(mine,foe,d);
    var fs=$("#foeSpr");if(fs&&dmg1){fs.classList.add("hit");setTimeout(function(){fs.classList.remove("hit");},340);}
    if(dmg1)floatText("foeSpr","-"+dmg1,"#fca5a5");
    refreshLog();
    if(b.foe.hp<=0){ if(heldFocoSash(foe,b.foe)){ bSay("🎗️ <b>"+foe.name+"</b> aguentou com 1 HP!","hl"); updateHp(); } else { bSay("💀 <b>"+foe.name+"</b> desmaiou!","hl"); return foeDown(); } }
    return wait(220).then(function(){return melhorGolpe(foe,estadoBattle.eu,estadoBattle.clima,estadoBattle.turno);}).then(function(pick){
      if(b.over||b.foe.hp<=0)return;
      var dmg2=hit(foe,mine,pick.d);
      var ms=$("#mineSpr");if(ms&&dmg2){ms.classList.add("hit");setTimeout(function(){ms.classList.remove("hit");},340);}
      if(dmg2)floatText("mineSpr","-"+dmg2,"#86efac");
      refreshLog();
      if(b.mine.hp<=0){
        if(heldFocoSash(mine,b.mine)){ bSay("🎗️ <b>"+mine.name+"</b> aguentou com 1 HP!","hl"); updateHp(); b.busy=false; refreshLog(); return; }
        bSay("💀 <b>"+mine.name+"</b> desmaiou!","hl3");
        mine.fainted=true;
        var nxt=b.party.map(function(m,i){return {m:m,i:i};}).filter(function(x){return !x.m.fainted&&x.m.hp>0;})[0];
        if(!nxt){bSay("💀 Sua equipe caiu...","hl3");b.busy=false;b.over=true;renderBattle();return;}
        b.partyIdx=nxt.i;b.mine={hp:maxHP(bMine())};
        bSay("Vai, <b>"+bMine().name+"</b>!");loadBattleMoves();
      }
      b.busy=false;renderBattle();
    });
  });
}
function foeDown(){
  var b=S.battle,foe=bFoe(),lead=bMine();
  var mult=b.kind==="gym"?2.6:b.kind==="trainer"?2.0:1.0;
  var exp=Math.round(expYieldFor(foe)*mult*rnd(1,1.2));
  var gained=gainExp(lead,exp);
  foe.base.map(function(v,i){return {v:v,i:i};}).sort(function(x,y){return y.v-x.v;}).slice(0,2).forEach(function(o){
    gainEV(lead,STAT_KEYS[o.i],b.kind==="wild"?ri(1,2):ri(2,4));
  });
  if(gained)bSay("+<b>"+gained+"</b> EXP para <b>"+lead.name+"</b>.","hl2");
  b.busy=false;
  b.foe.hp=0;
  if(b.foeIdx<b.foes.length-1){
    b.foeIdx++;
    bSay("🧑‍🎤 <b>"+b.trainer+"</b> enviou <b>"+bFoe().name+"</b>!");
    b.foe={hp:maxHP(bFoe())};resetStages(bFoe());resetStages(bMine());
    loadBattleMoves();renderBattle();return;
  }
  b.over=true;battleWon();
}
function battleWon(){
  var b=S.battle;
  bSay("🏆 Você venceu <b>"+b.title+"</b>!","hl");
  if(b.reward){
    S.money=(S.money||0)+(b.reward.money||0);
    if(b.reward.item){
      S.items[b.reward.item]=(S.items[b.reward.item]||0)+1;
      if(b.reward.item==="TM")S.tmTokens=(S.tmTokens||0)+1;
    }
    bSay("💰 +"+fmt(b.reward.money||0)+" e item: <b>"+b.reward.item+"</b>.","hl2");
  }
  if(b.gym)gymWin(b.gym);
  if(b.alphaKey){
    S.alphaDone=S.alphaDone||{};
    var espera=alphaCooldownMs(b.alphaKey);
    S.alphaDone["alr_"+b.alphaKey]={ate:Date.now()+espera,once:true};
    var horas=Math.round(espera/3600000);
    /* ninho da poucos drops: 35% de chance de 1 item simples, cristal so as vezes */
    var premio=null;
    if(Math.random()<0.35){
      premio = pickOne(["Potion","Super Potion","Berry","Oran Berry","Poké Ball","Antidote","Revive"]);
      S.items[premio]=(S.items[premio]||0)+1;
    }
    var cristal=false;
    if(Math.random()<0.08){ S.ivCrystals=(S.ivCrystals||0)+1; cristal=true; }
    bSay("🔴 <b>Ninho Alfa dominado!</b>"+(premio?(" Achou <b>"+premio+"</b>."):" Nenhum item desta vez.")+(cristal?" E um <b>Cristal de IV</b>!":"")+" Reaparece em ~"+horas+"h.","hl");
  }
  if(b.bossId){
    var bo=BOSSES.filter(function(x){return x.id===b.bossId;})[0];
    if(bo)bossWin(bo);
  }
  if(b.gruntId){
    S.gruntDone=S.gruntDone||{};
    var gg=GRUNTS.filter(function(x){return x.id===b.gruntId;})[0];
    if(gg) S.gruntDone[gg.id]={ate:Date.now()+gCooldown(gg)};
    S.gruntsDone=S.gruntsDone||[];
    if(S.gruntsDone.indexOf(b.gruntId)<0)S.gruntsDone.push(b.gruntId);
    bSay("⏳ Este treinador reaparece em breve.","hl2");
  }
  if(b.eliteKey){
    S.elitesDone=S.elitesDone||[];
    if(S.elitesDone.indexOf(b.eliteKey)<0)S.elitesDone.push(b.eliteKey);
    S.ivCrystals=(S.ivCrystals||0)+3;
    bSay("🏆 <b>Elite dos 4 dominada!</b> +3 Cristais de IV.","hl");
  }
  if(b.regionGym){
    S.regionBadges=S.regionBadges||[];
    var tag=b.regionGym.region+" · "+b.regionGym.name;
    if(S.regionBadges.indexOf(tag)<0){
      S.regionBadges.push(tag);
      S.ivCrystals=(S.ivCrystals||0)+1;
      bSay("🏅 Insígnia regional de <b>"+b.regionGym.region+"</b>!","hl");
    }
  }
  if(b.kind==="wild")bSay("Use uma <b>Poké Ball</b> para capturar!","hl2");
  b.busy=false;b.over=true;renderBattle();
}
function throwBall(ball){
  var b=S.battle;if(!b||b.busy||b.over||b.kind!=="wild")return;
  if(!(S.items||{})[ball]){toasts("Você não tem "+ball+".","bad");return;}
  b.busy=true;renderBattle();
  var foe=bFoe();
  S.items[ball]--;if(S.items[ball]<=0)delete S.items[ball];
  bSay("🎯 Você lançou uma <b>"+ball+"</b>!","hl");
  return wait(700).then(function(){
    var chance=clamp((0.18+((maxHP(foe)*3-foe.hp*2)/(maxHP(foe)*3))*0.45)*BALLS[ball].rate,0.05,0.95);
    if(Math.random()<chance){
      bSay("✨ Gotcha! <b>"+foe.name+"</b> foi capturado!","hl");
      foe.obtained="captura";
      if(S.team.length<MAX_TEAM){S.team.push(foe);toasts("✨ <b>"+foe.name+"</b> entrou na equipe!","evo");}
      else {S.box=S.box||[];S.box.push(foe);toasts("✨ <b>"+foe.name+"</b> foi para o Box.","good");}
      log("✨ <b>"+foe.name+"</b> capturado (IV "+ivTotal(foe)+").","evo");
      b.over=true;b.busy=false;renderBattle();return;
    }
    bSay("A Poké Ball falhou...","hl2");
    return wait(250).then(function(){return melhorGolpe(foe,estadoBattle.eu,estadoBattle.clima,estadoBattle.turno);}).then(function(pick){
      hit(foe,bMine(),pick.d);updateHp();b.busy=false;
      if(b.mine.hp<=0){
        var mine=bMine();mine.fainted=true;
        var nxt=b.party.map(function(m,i){return {m:m,i:i};}).filter(function(x){return !x.m.fainted&&x.m.hp>0;})[0];
        if(!nxt){bSay("💀 Sua equipe caiu...","hl3");b.over=true;renderBattle();return;}
        b.partyIdx=nxt.i;b.mine={hp:maxHP(bMine())};loadBattleMoves();
      }
      renderBattle();
    });
  });
}
function closeBattle(){
  var b=S.battle;
  var ov=$("#battleOverlay");if(ov)ov.remove();
  /* devolve ao pokemon da equipe o HP real que ficou no combate */
  if(b&&b.party){
    b.party.forEach(function(m){
      var reg=(b.mine&&b.mine.ref===m)?b.mine:null;
      if(reg){ m.hp=Math.max(0,Math.round(reg.hp)); m.fainted=(m.hp<=0); }
      else if(m.fainted===undefined){ m.fainted=(m.hp<=0); }
    });
  }
  S.battle=null;save();lastView="";render();
}
/* ===== DELEGAÇÃO DE FECHAR =====
   modais que redesenham o proprio conteudo perdem os listeners.
   Este helper liga UM listener no modal que sobrevive a qualquer innerHTML. */
function ligarFechar(modal, aoFechar){
  if(!modal || modal.__fechando) return;
  modal.__fechando=1;
  function fechar(ev){
    if(ev){ ev.preventDefault(); ev.stopPropagation(); }
    modal.remove();
    if(typeof aoFechar==="function") aoFechar();
  }
  modal.addEventListener("click", function(ev){
    var t=ev.target;
    if(!t || !t.closest) return;
    if(t.closest("[data-close]")) fechar();
  }, false);
  modal.addEventListener("click", function(ev){
    if(ev.target===modal) fechar();
  }, false);
  var escFn=function(ev){
    if(ev.key==="Escape"){ fechar(); document.removeEventListener("keydown",escFn); }
  };
  document.addEventListener("keydown", escFn);
}

function openCapture(list){
  UI.captures={list:list};
  var modal=document.createElement("div");modal.className="overlay";
  function draw(){
    var flat=Object.keys(BALLS).filter(function(x){return (S.items||{})[x]>0;});
    modal.innerHTML="<div class='modal'><button class='btn sm ghost close' data-close>✕</button>"+
      "<h2>🎯 Capturar Pokémon encontrados</h2>"+
      "<div class='tiny' style='margin-bottom:11px'>Sua equipe enfraqueceu estes Pokémon. Quanto menor o HP, maior a chance. Equipe: "+S.team.length+"/"+MAX_TEAM+"</div>"+
      (UI.captures.list.length?UI.captures.list.map(function(w,i){
        var ch=Math.round(clamp(0.18+((maxHP(w)*3-w.hp*2)/(maxHP(w)*3))*0.45,0.05,0.95)*100);
        return "<div class='row'><img src='"+spr(w.id,false)+"' data-id='"+w.id+"' data-back='0' style='width:52px;height:52px;image-rendering:pixelated'>"+
          "<div class='grow'><div class='t'>"+w.name+" <span class='tiny'>Nv."+w.lvl+"</span></div>"+
          "<div class='s'>"+w.types.map(function(t){return TYPE_PT[t]||t;}).join("/")+" • HP "+w.hp+"/"+maxHP(w)+" • chance ~"+ch+"%</div>"+
          "<div style='display:flex;gap:6px;flex-wrap:wrap;margin-top:7px'>"+
            (flat.length?flat.map(function(bl){return "<button class='btn sm primary' data-cap='"+i+"' data-ball='"+bl+"'>"+BALLS[bl].icon+" "+bl+"</button>";}).join(""):"<span class='tiny'>Sem Poké Balls — compre na loja!</span>")+
            "<button class='btn sm ghost' data-skip='"+i+"'>Deixar ir</button>"+
          "</div></div></div>";
      }).join(""):"<div class='tiny'>Nenhum Pokémon restante.</div>")+
      "<div class='divider'></div><button class='btn wide ghost' data-close>Concluir</button></div>";
    hydrateImages(modal);
  }
  $("#modals").appendChild(modal);
  ligarFechar(modal);draw();
  modal.onclick=function(e){
    if(e.target===modal||e.target.closest("[data-close]")){modal.remove();UI.captures=null;save();lastView="";render();return;}
    var sk=e.target.closest("[data-skip]");
    if(sk){UI.captures.list.splice(parseInt(sk.dataset.skip,10),1);draw();return;}
    var cb=e.target.closest("[data-cap]");
    if(cb){
      var i=parseInt(cb.dataset.cap,10),w=UI.captures.list[i],ball=cb.dataset.ball;
      S.items[ball]--;if(S.items[ball]<=0)delete S.items[ball];
      var chance=clamp((0.18+((maxHP(w)*3-w.hp*2)/(maxHP(w)*3))*0.45)*BALLS[ball].rate,0.05,0.95);
      if(Math.random()<chance){
        w.obtained="captura";
        if(S.team.length<MAX_TEAM){S.team.push(w);toasts("✨ <b>"+w.name+"</b> capturado!","evo");log("✨ <b>"+w.name+"</b> capturado (IV "+ivTotal(w)+").","evo");}
        else {S.box=S.box||[];S.box.push(w);toasts("✨ <b>"+w.name+"</b> foi para o Box.","good");}
      } else toasts("A bola falhou — <b>"+w.name+"</b> fugiu.","bad");
      UI.captures.list.splice(i,1);save();draw();
    }
  };
}
function gymWin(g){
  S.gyms=S.gyms||[];S.badges=S.badges||[];
  if(S.gyms.indexOf(g.n)<0){
    S.gyms.push(g.n);S.badges.push("Insígnia "+g.n+" · "+g.name);
    var nc=capLevel();
    log("🏅 <b>Insígnia "+g.n+"</b> conquistada em "+g.city+"! Novo teto de nível: <b>N"+nc+"</b>.","evo");
    toasts("🏅 Insígnia "+g.n+"! Teto agora N"+nc,"evo");
    S.ivCrystals=(S.ivCrystals||0)+1;
    log("🎁 +1 <b>Cristal de IV</b>.","good");
  }
  save();
}
function gymIds(g,count){
  var base=WARM[g.n]||[g.n*3];
  var out=base.slice(0,count);
  while(out.length<count)out.push(pickOne(base));
  return out;
}
function bossWin(bo){
  S.bossesDone=S.bossesDone||[];
  if(S.bossesDone.indexOf(bo.id)<0)S.bossesDone.push(bo.id);
  save();
}
function leagueWin(){
  if(!S.champion){
    S.champion=true;
    log("🏆 <b>Você é o novo Campeão!</b> Ilhas Prisma liberadas (teto N"+POSTGAME.lv+").","evo");
    toasts("🏆 CAMPEÃO! Pós-jogo liberado.","evo");
    S.items["Master Ball"]=(S.items["Master Ball"]||0)+1;
    S.ivCrystals=(S.ivCrystals||0)+3;save();
  }
}
/* ---------------- ações ---------------- */
function actFeed(p){
  if(p.hunger>=95){toasts("🍖 Já está satisfeito!","bad");return;}
  p.hunger=clamp(p.hunger+ri(22,34),0,100);
  p.bond=clamp((p.bond||0)+2.5,0,100);
  if(p.hp>0){p.hp=clamp(p.hp+Math.floor(maxHP(p)*0.05),1,maxHP(p));p.fainted=false;}
  log("🍖 Você alimentou <b>"+p.name+"</b>.","good");
  toasts("🍖 <b>"+p.name+"</b> comeu bem!","good");
  save();render();
}
function actSleep(p){
  if(p.fainted){p.fainted=false;p.awake=false;p.hp=Math.floor(maxHP(p)*0.5);log("🌙 <b>"+p.name+"</b> foi dormir para se recuperar.","warn");save();render();return;}
  p.awake=!p.awake;
  log(p.awake?"☀️ <b>"+p.name+"</b> acordou!":"🌙 <b>"+p.name+"</b> foi dormir.","info");
  toasts(p.awake?"☀️ "+p.name+" acordou!":"💤 Boa noite, "+p.name+"!");
  save();render();
}
/* ---------- treino extensivo por tempo ----------
   Cada 90s consome 3 de stamina e rende ate 3 EV do status escolhido. */
function evCost(p){return p.lvl<=20?3:p.lvl<=45?4:5;}
function evGain(p){return p.lvl<=20?3:p.lvl<=45?2:1;}
function evXP(p){return Math.round(10+p.lvl*2.4);}
/* ======================================================================
   TREINO EXTENSIVO — roda no tick, sobrevive a fechar a janela
   Regra: cada ciclo de 90s consome 3 de stamina e rende ate 3 EV.
   O total e limitado pela stamina disponivel e pelo teto de 252 EV.
   ====================================================================== */
function ciclosTreino(segundos){ return Math.floor(segundos/90); }
function custoTreino(segundos){ return ciclosTreino(segundos)*3; }
/* maior duracao possivel agora, dada a stamina e o espaco de EV */
function maxTreino(p, k){
  if(!p) return 0;
  var porStamina=ciclosTreino(Math.floor(p.energy/3)*90);
  var espaco=Math.floor((252-(p.ev[k]||0))/3);
  var ciclos=Math.min(porStamina, espaco);
  return Math.max(0, ciclos*90);
}
function treinando(){ return !!(S && S.treino && S.treino.uid); }
function treinoDe(uid){ return treinando() && S.treino.uid===uid; }

/* inicia o treino — NAO abre modal de progresso, so registra no save */
function iniciarTreinoExtensivo(p,k,seg){
  if(!p) return;
  if(estaExausto(p)){ toasts("😵 "+esc(p.name)+" esta exausto e nao pode treinar agora.","bad"); return; }
  var max=maxTreino(p,k);
  if(max<90){ toasts("⚡ Stamina insuficiente para um ciclo (90s).","bad"); return; }
  seg=Math.min(seg, max);
  seg=Math.max(90, Math.floor(seg/90)*90);
  if(treinando()){ toasts("Já há um Pokémon treinando. Cancele antes.","bad"); return; }
  S.treino={
    uid:p.uid, nome:p.name, status:k,
    total:seg, restante:seg,
    inicio:Date.now(), ultimoCiclo:0, ganho:0, exp:0, cancelado:false
  };
  log("👊 <b>"+esc(p.name)+"</b> começou <b>"+DRILLS[k].name+"</b> por "+(seg/60)+" min. Pode deixar rodando!","info");
  toasts("👊 Treino iniciado — "+Math.round(seg/60)+" min em segundo plano!","good");
  save();
}

/* processa o treino no tick — chamado a cada segundo */
function tickTreino(dtSegundos){
  if(!treinando()) return;
  var t=S.treino;
  var p=(S.team||[]).filter(function(m){ return m.uid===t.uid; })[0];
  if(!p){ S.treino=null; return; }                 /* foi para o Box ou sumiu */
  var k=t.status;
  t.restante=Math.max(0, t.restante-dtSegundos);
  var feito=t.total-t.restante;
  var ciclos=Math.floor(feito/90);
  while(t.ultimoCiclo < ciclos){
    t.ultimoCiclo++;
    if(p.energy<3){
      terminarTreino("sem stamina");
      return;
    }
    var espaco=252-(p.ev[k]||0);
    if(espaco<=0){
      terminarTreino("EV no máximo");
      return;
    }
    p.energy=clamp(p.energy-3,0,100);
    var ganho=Math.min(3, espaco);
    gainEV(p,k,ganho);
    t.ganho+=ganho;
    p.hunger=clamp(p.hunger-1,0,100);
    var xp=Math.round(6+p.lvl*1.2);
    gainExp(p,xp);
    t.exp+=xp;
  }
  /* guarda o progresso no save a cada ciclo */
  if(t.ultimoCiclo>0 && t.ultimoCiclo % 2 === 0){ save(); }
  if(t.restante<=0) terminarTreino("concluído");
}

/* encerra o treino — sempre preserva o que ja rendeu */
function terminarTreino(motivo){
  if(!treinando()) return;
  var t=S.treino;
  var p=(S.team||[]).filter(function(m){ return m.uid===t.uid; })[0];
  S.treino=null;
  if(p){
    log("🏁 <b>"+esc(p.name)+"</b> terminou <b>"+DRILLS[t.status].name+"</b> ("+motivo+"): +"+t.ganho+" EV de "+STAT_LABEL[t.status]+", +"+fmt(t.exp)+" EXP.","good");
    toasts("🏁 Treino "+motivo+": +"+t.ganho+" EV de "+STAT_LABEL[t.status]+"!","good");
  }
  save(); lastView="";
  try{ render(); }catch(e){}
}

function openTreinoExtensivo(p,k){
  var d=DRILLS[k];
  var max=maxTreino(p,k);
  var maxMin=Math.floor(max/60);
  var presets=[90,180,300,600,900,1800,3600];
  var modal=document.createElement("div"); modal.className="overlay";
  modal.innerHTML="<div class='modal'><button class='btn sm ghost close' data-close>✕</button>"+
    "<h2>"+d.icon+" Treino extensivo — "+d.name+"</h2>"+
    "<div class='note'>O treino roda <b>em segundo plano</b>: você pode fechar esta tela, sair do site e voltar depois — o tempo continua correndo.<br>Cada <b>90s</b> consome <b>⚡3 stamina</b> e rende até <b>+3 EV</b> de "+STAT_LABEL[k]+".</div>"+
    "<div class='tiny' style='margin-bottom:8px'>Stamina: <b>"+Math.floor(p.energy)+"</b> • EV de "+STAT_LABEL[k]+": <b>"+(p.ev[k]||0)+"/252</b> • máximo agora: <b>"+maxMin+" min</b></div>"+
    "<div class='toolbar'>"+
      presets.map(function(s){
        var ok=s<=max;
        var lbl = s<60 ? (s+"s") : ((s/60)+"min");
        return "<button class='tf' data-seg='"+s+"' "+(ok?"":"disabled")+">"+lbl+" · ⚡"+(ciclosTreino(s)*3)+"</button>";
      }).join("")+
    "</div>"+
    "<div class='divider'></div>"+
    "<div class='tiny' style='margin-bottom:6px'>Ou escolha um tempo personalizado (múltiplos de 1,5 min):</div>"+
    "<div class='toolbar'>"+
      "<input class='inp' id='tmin' type='number' min='1.5' step='1.5' max='"+maxMin+"' value='"+Math.max(1.5,Math.min(maxMin,5))+"' style='width:120px'>"+
      "<span class='tiny'>minutos</span>"+
      "<button class='btn primary' id='tgo'>▶ Iniciar treino</button>"+
      "<button class='btn blue' id='tmax'>Usar o máximo ("+maxMin+" min)</button>"+
    "</div>"+
    "<div class='note' id='tprev'></div></div>";
  $("#modals").appendChild(modal);
  function prev(seg){
    var c=ciclosTreino(seg);
    var el=$("#tprev",modal);
    if(el) el.innerHTML="Serão <b>"+c+" ciclo(s)</b>: consome <b>⚡"+(c*3)+"</b> de stamina e rende até <b>+"+(c*3)+" EV</b>"+(c*3>252-(p.ev[k]||0)?" (limitado pelo teto de 252)":"")+".";
  }
  prev(300);
  var inp=$("#tmin",modal);
  if(inp) inp.oninput=function(){ var v=parseFloat(this.value)||0; prev(Math.floor(v*60)); };
  modal.addEventListener("click", function(ev){
    var t=ev.target; if(!t||!t.closest) return;
    if(t.closest("[data-close]")){ modal.remove(); return; }
    if(ev.target===modal){ modal.remove(); return; }
    if(t.closest("#tmax")){ if(inp) inp.value=Math.max(1.5,maxMin); prev(max); return; }
    if(t.closest("#tgo")){
      var v=parseFloat((inp&&inp.value)||0)||0;
      var seg=Math.max(90, Math.floor(v*60/90)*90);
      seg=Math.min(seg,max);
      if(seg<90){ toasts("Tempo mínimo: 1,5 min.","bad"); return; }
      modal.remove(); iniciarTreinoExtensivo(p,k,seg); lastView=""; render(); return;
    }
    var b=t.closest("[data-seg]");
    if(b){ var s=parseInt(b.dataset.seg,10); modal.remove(); iniciarTreinoExtensivo(p,k,Math.min(s,max)); lastView=""; render(); }
  }, false);
}
function openTrainEV(p){
  if(estaDoente(p)){ toasts("🤒 "+p.name+" está doente e precisa descansar.","bad"); return; }
  var modal=document.createElement("div");modal.className="overlay";
  modal.innerHTML="<div class='modal'><button class='btn sm ghost close' data-close>✕</button>"+
    "<h2>👊 Treino de EV — "+p.name+"</h2>"+
    "<div class='tiny' style='margin-bottom:11px'>Escolha <b>UM</b> status. Cada sessão custa <b>⚡"+evCost(p)+" stamina</b>, dá <b>+"+evGain(p)+" EV</b> só naquele status e apenas <b>"+evXP(p)+" EXP</b> — sem rush de nível.</div>"+
    STAT_KEYS.map(function(k){
      var d=DRILLS[k],ev=p.ev[k];
      return "<div class='opt' data-drill='"+k+"'><span style='font-size:20px'>"+d.icon+"</span>"+
        "<div class='grow'><div class='t'>"+d.name+" <span class='en'>"+d.en+"</span></div><div class='s'>"+
        STAT_LABEL[k]+" ("+STAT_EN[k]+") — EV "+ev+"/252"+(ev>=252?" • MÁXIMO":"")+"</div></div>"+
        "<button class='btn sm primary' data-drill='"+k+"'>Rápido</button>"+
        "<button class='btn sm blue' data-ext='"+k+"'>Extensivo</button></div>";
    }).join("")+
    "<div class='note'>Cada 4 EV = +1 ponto no status. EV só sobe no status treinado. Stamina regenera dormindo.</div></div>";
  $("#modals").appendChild(modal);
  modal.querySelector("[data-close]").onclick=function(){modal.remove();};
  modal.onclick=function(e){
    if(e.target===modal){modal.remove();return;}
    var ex=e.target.closest("[data-ext]");
    if(ex){ modal.remove(); openTreinoExtensivo(p, ex.dataset.ext); return; }
    var o=e.target.closest("[data-drill]");if(!o)return;
    modal.remove();doTrainEV(p,o.dataset.drill);
  };
}
function doTrainEV(p,k){
  if(p.energy<evCost(p)){toasts("⚡ Stamina insuficiente. Deixe-o dormir.","bad");return;}
  if(p.hunger<10){toasts("😫 Com muita fome para treinar.","bad");return;}
  if(p.ev[k]>=252){toasts("Este status já está no máximo de EV.","bad");return;}
  p.energy=clamp(p.energy-evCost(p),0,100);
  p.hunger=clamp(p.hunger-ri(3,7),0,100);
  gainEV(p,k,evGain(p));
  var xp=gainExp(p,evXP(p));
  p.bond=clamp((p.bond||0)+1,0,100);
  if(Math.random()<0.06){S.ivCrystals=(S.ivCrystals||0)+1;log("🎁 O treino rendeu um <b>Cristal de IV</b>!","good");}
  log("👊 <b>"+DRILLS[k].name+"</b>: <b>"+p.name+"</b> +"+evGain(p)+" EV em "+STAT_LABEL[k]+" e +"+xp+" EXP.","good");
  toasts("👊 "+p.name+": +"+evGain(p)+" EV "+STAT_LABEL[k],"good");
  save();render();
}
function openTrainIV(p){
  if(!(S.ivTokens>0)){toasts("🔒 Precisa de <b>1 token</b> — ganhe enviando uma aventura!","bad");return;}
  if(!(S.ivCrystals>0)){toasts("🔬 Precisa de <b>1 Cristal de IV</b> (aventuras, ginásios, loja).","bad");return;}
  var capNow=p.ivCap||0;
  if(capNow>=6){toasts("Este Pokémon já recebeu o máximo (6 treinos de IV).","bad");return;}
  var modal=document.createElement("div");modal.className="overlay";
  modal.innerHTML="<div class='modal'><button class='btn sm ghost close' data-close>✕</button>"+
    "<h2>🔬 Treino de IV — "+p.name+"</h2>"+
    "<div class='note'>Método <b>limitado</b>: 1 treino por aventura, gastando <b>1 token</b> + <b>1 Cristal de IV</b>. Máximo de <b>6</b> treinos por Pokémon (usados: "+capNow+"/6). Sobe 1 IV aleatório em +1 a +3 (nunca passa de 31).</div>"+
    "<div class='stats' style='margin-bottom:12px'>"+
      "<div class='stat'><div class='k'>Tokens</div><div class='v'>"+(S.ivTokens||0)+"</div></div>"+
      "<div class='stat'><div class='k'>Cristais</div><div class='v'>"+(S.ivCrystals||0)+"</div></div>"+
      "<div class='stat'><div class='k'>Treinos usados</div><div class='v'>"+capNow+"/6</div></div>"+
    "</div>"+
    "<button class='btn primary wide' id='goiv'>🔬 Fazer 1 Treino de IV (aleatório)</button></div>";
  $("#modals").appendChild(modal);
  modal.querySelector("[data-close]").onclick=function(){modal.remove();};
  modal.querySelector("#goiv").onclick=function(){
    var pool=STAT_KEYS.filter(function(x){return p.iv[x]<31;});
    if(!pool.length){toasts("Todos os IVs já estão em 31!","bad");return;}
    S.ivTokens--;S.ivCrystals--;p.ivCap=(p.ivCap||0)+1;
    var k=pickOne(pool);
    var gain=Math.min(31-p.iv[k],ri(1,3));
    p.iv[k]+=gain;
    log("🔬 <b>"+p.name+"</b>: IV de "+STAT_LABEL[k]+" +"+gain+" → "+p.iv[k]+". Treinos usados: "+p.ivCap+"/6.","evo");
    toasts("🔬 "+p.name+": IV "+STAT_LABEL[k]+" +"+gain+" → "+p.iv[k],"evo");
    modal.remove();save();render();
  };
}
function itemIcon(k){
  return BALLS[k]?BALLS[k].icon:(k==="Potion"||k==="Super Potion"||k==="Hyper Potion")?"🧪":
    (k==="Berry"||k==="Oran Berry")?"🍓":k==="Revive"?"💊":k==="Rare Candy"?"🍬":k==="TM"?"📀":
    k==="Nugget"?"🥇":k==="IV Crystal"?"🔬":EVO_ITEMS[k]?"🪨":"📦";
}
function useItem(p,k){
  var it=ITEMS.filter(function(x){ return x.en===k||x.id===k; })[0];
  /* ---- MINT: muda a natureza ---- */
  if(it&&it.cat==="mint"){
    if(!S.items[k]) return Promise.resolve();
    var antes=p.nature||"—";
    p.nature=it.mint; p._ganhouNat=0;
    S.items[k]--; if(S.items[k]<=0) delete S.items[k];
    log("\ud83c\udf3f <b>"+esc(p.name)+"</b> teve a natureza mudada de <b>"+esc(antes)+"</b> para <b>"+esc(it.mint)+"</b>!","evo");
    toasts("\ud83c\udf3f Natureza agora é <b>"+esc(natResumo(p.nature))+"</b>!","evo");
    save(); return Promise.resolve();
  }
  /* ---- CAPSULE: troca para outra habilidade normal ---- */
  if(it&&it.cat==="capsule"){
    var abs=abilitiesDe(p.id).filter(function(a){ return !a[2]; });
    if(abs.length<2){ toasts("Esta espécie só tem uma habilidade normal.","bad"); return Promise.resolve(); }
    var atual=p.ability;
    var nova=abs.filter(function(a){ return a[0]!==atual; })[0]||abs[0];
    p.ability=nova[0]; p.abilityPt=(nova[1]&&nova[1]!=="Nome PT não consolidado")?nova[1]:nova[0]; p.abilityOculta=false; p._ganhouAb=0;
    S.items[k]--; if(S.items[k]<=0) delete S.items[k];
    log("\ud83d\udc8a <b>"+esc(p.name)+"</b> trocou de habilidade: <b>"+esc(p.ability)+"</b>.","evo");
    toasts("\ud83d\udc8a Habilidade agora é <b>"+esc(p.abilityPt)+"</b>!","evo");
    save(); return Promise.resolve();
  }
  /* ---- PATCH: vira a habilidade oculta ---- */
  if(it&&it.cat==="patch"){
    var oc=abilitiesDe(p.id).filter(function(a){ return a[2]; })[0];
    if(!oc){ toasts("Esta espécie não tem habilidade oculta.","bad"); return Promise.resolve(); }
    p.ability=oc[0]; p.abilityPt=(oc[1]&&oc[1]!=="Nome PT não consolidado")?oc[1]:oc[0]; p.abilityOculta=true; p._ganhouAb=0;
    S.items[k]--; if(S.items[k]<=0) delete S.items[k];
    log("\ud83e\udd79 <b>"+esc(p.name)+"</b> ganhou a habilidade oculta <b>"+esc(p.ability)+"</b>!","evo");
    toasts("\ud83e\udd79 Habilidade oculta: <b>"+esc(p.abilityPt)+"</b>!","evo");
    save(); return Promise.resolve();
  }
  if(!S.items[k])return Promise.resolve();
  var it=ITEMS.filter(function(x){return x.en===k;})[0];
  /* fallback para itens antigos sem registro */
  if(!it){
    var heal0=CONSUME[k]||0;
    if(heal0){ p.hp=clamp(p.hp+heal0,0,maxHP(p)); if(p.hp>0)p.fainted=false; }
    else if(k==="Nugget"){ S.money=(S.money||0)+500; }
    else { toasts("Este item não pode ser usado aqui.","bad"); return Promise.resolve(); }
    S.items[k]--; if(S.items[k]<=0)delete S.items[k];
    return Promise.resolve();
  }
  /* frutas e vitaminas: mexem em EV */
  if(it.ev && it.evDelta){
    if(it.evDelta<0){
      if(p.ev[it.ev]<=0){ toasts("Esse status já está com 0 EV.","bad"); return Promise.resolve(); }
      p.ev[it.ev]=clamp(p.ev[it.ev]+it.evDelta,0,252);
      toasts("🍇 "+it.pt+": "+STAT_LABEL[it.ev]+" -10 EV","good");
    } else {
      if(p.ev[it.ev]>=252){ toasts("Esse status já está no máximo de EV.","bad"); return Promise.resolve(); }
      p.ev[it.ev]=clamp(p.ev[it.ev]+it.evDelta,0,252);
      toasts("💉 "+it.pt+": "+STAT_LABEL[it.ev]+" +10 EV","good");
    }
    log("🧪 <b>"+it.pt+"</b> usado em <b>"+p.name+"</b> ("+STAT_LABEL[it.ev]+").","good");
  }
  /* cura */
  else if(it.heal){
    p.hp=clamp(p.hp+(it.heal>=999?maxHP(p):it.heal),0,maxHP(p));
    if(p.hp>0)p.fainted=false;
    toasts("🧪 "+p.name+" recuperou HP!","good");
  }
  else if(it.revive!==undefined){
    if(!p.fainted){ toasts("Ele não está desmaiado.","bad"); return Promise.resolve(); }
    p.fainted=false; p.hp=Math.floor(maxHP(p)*it.revive);
    toasts("💊 "+p.name+" voltou!","good");
  }
  else if(it.cure){ toasts("🧼 Status de "+p.name+" curado.","good"); }
  /* pedra de evolução */
  else if(it.cat==="stone"){
    return tryStoneEvo(p,it.item||it.en).then(function(ok){
      if(!ok){ toasts("A pedra não teve efeito em "+p.name,"bad"); }
    });
  }
  /* nivel */
  else if(it.level){
    if(p.lvl>=capLevel()){ toasts("Teto de nível atingido!","bad"); return Promise.resolve(); }
    gainExp(p,Math.max(1,xpForLevel(p.lvl+1)-p.exp));
  }
  /* item de batalha / held: avisa que e usado no combate */
  else if(it.cat==="battle"||it.cat==="berry"&&it.heldBoost){
    toasts("Use este item em uma batalha.","bad"); return Promise.resolve();
  }
  else { toasts("Este item não pode ser usado aqui.","bad"); return Promise.resolve(); }
  S.items[k]--; if(S.items[k]<=0)delete S.items[k];
  return Promise.resolve();
}

/* ===== Criação fiel (Gen III+): egg group, gênero, 3 IVs a 25%, egg moves do pai ===== */
function sorteiaGenero(info){
  if(!info) return Math.random()<0.5?1:2;
  var gr=info.genderRate;
  if(gr===null||gr===undefined||gr<0) return Math.random()<0.5?1:2;
  var fem=gr/8;
  if(fem<=0) return 1; if(fem>=1) return 2;
  return Math.random()<fem?2:1;
}
function generoLabel(g){ return g===1?"♂":g===2?"♀":"⚲"; }
function ehDitto(id){ return Number(id)===132; }
/* ===== grupos de ovo ===== */
const EGG_PT={
  "monster":"Monstro","water1":"Água 1","bug":"Inseto","flying":"Voador",
  "field":"Campo","fairy":"Fada","grass":"Grama","human-like":"Humanoide",
  "water3":"Água 3","mineral":"Mineral","amorphous":"Amorfo","water2":"Água 2",
  "ditto":"Ditto","dragon":"Dragão","undiscovered":"Não descoberto"
};
function eggNome(g){ return EGG_PT[g]||cap(String(g).replace(/-/g," ")); }
/* quais dos MEUS pokemon sao compativeis com este (genero oposto + mesmo grupo) */
function compativeisCom(p){
  var arr=[];
  (S.team||[]).concat(S.box||[]).forEach(function(m){
    if(m===p) return;
    try{
      var okA=mesmoGrupo(p,m);
      var genOk=(ehDitto(p.id)||ehDitto(m.id)||(p.genero&&m.genero&&p.genero!==m.genero));
      if(okA&&genOk) arr.push(m.name+" "+generoLabel(m.genero)+" Nv."+m.lvl);
    }catch(e){}
  });
  return arr;
}

function mesmoGrupo(a,b){
  if(ehDitto(a.id)||ehDitto(b.id)) return true;
  var ia=SP[a.id], ib=SP[b.id];
  var ga=ia&&ia.eggGroups, gb=ib&&ib.eggGroups;
  if(!ga||!gb) return true;
  for(var i=0;i<ga.length;i++){ if(gb.indexOf(ga[i])>=0) return true; }
  return false;
}
function especieFilhote(a,b){
  if(ehDitto(a.id)&&!ehDitto(b.id)) return b.id;
  if(ehDitto(b.id)&&!ehDitto(a.id)) return a.id;
  if(a.genero===2) return a.id;
  if(b.genero===2) return b.id;
  return a.id;
}
function poolDeOvos(id){
  var d=(typeof EGG_DB!=="undefined")&&EGG_DB.dex[String(id)];
  if(!d) return [];
  return d.map(function(i){
    var g=EGG_DB.golpes[i];
    return {name:g[0], pt:g[1], tipo:EGG_DB.tipos[g[2]]};
  });
}
function paiTransmissor(a,b){
  if(ehDitto(a.id)) return b;
  if(ehDitto(b.id)) return a;
  if(a.genero===1) return a;
  if(b.genero===1) return b;
  return a;
}
function herdaIVs(a,b,destiny){
  var n=destiny?5:3, iv={};
  STAT_KEYS.forEach(function(k){ iv[k]=ri(0,31); });
  var r=Math.random(), deA, deB;
  if(r<0.25){deA=n;deB=0;} else if(r<0.5){deA=n-1;deB=1;}
  else if(r<0.75){deA=1;deB=n-1;} else {deA=0;deB=n;}
  var esc=[];
  for(var i=0;i<deA;i++) esc.push(["a",STAT_KEYS[ri(0,5)]]);
  for(var j=0;j<deB;j++) esc.push(["b",STAT_KEYS[ri(0,5)]]);
  esc.forEach(function(e){ var src=(e[0]==="a")?a:b; iv[e[1]]=src.iv[e[1]]; });
  return iv;
}
function herdaNatureza(a,b,everstone){
  if(everstone){
    var mae=(a.genero===2)?a:(b.genero===2?b:null);
    if(mae&&mae.nature&&Math.random()<0.5) return mae.nature;
  }
  return NATURES[ri(0,NATURES.length-1)];
}
function newEgg(a,b){
  var compat=mesmoGrupo(a,b);
  var genOk=(ehDitto(a.id)||ehDitto(b.id)||(a.genero&&b.genero&&a.genero!==b.genero));
  if(!compat) return {erro:"Grupos de ovo diferentes — não podem criar um ovo."};
  if(!genOk) return {erro:"Precisam ser de gêneros opostos (ou um Ditto)."};
  var idFilhote=especieFilhote(a,b);
  var infoF=SP[idFilhote]||SP[a.id];
  var destiny=(a.held==="Destiny Knot")||(b.held==="Destiny Knot");
  var ever=(a.held==="Everstone")||(b.held==="Everstone");
  var m=newMon({
    id:idFilhote, name:cap((infoF&&infoF.name)||a.name),
    types:(infoF&&infoF.types)||a.types, base:(infoF&&infoF.base)||a.base,
    iv:herdaIVs(a,b,destiny), lvl:1, nature:herdaNatureza(a,b,ever),
    moves:[], learned:[], obtained:"ovo"
  });
  m.genero=sorteiaGenero(infoF);
  m.ivCap=Math.max(a.ivCap||0,b.ivCap||0);
  m.shiny=Math.random()<0.02;
  /* egg moves: o pai transmissor passa o que o filhote pode aprender */
  var ovos=poolDeOvos(idFilhote), herdados=[];
  ovos.forEach(function(g){ if(Math.random()<0.5) herdados.push(g); });
  if(!herdados.length&&ovos.length) herdados.push(ovos[ri(0,ovos.length-1)]);
  var pai=paiTransmissor(a,b);
  if(pai&&pai.moves){
    pai.moves.forEach(function(mv){
      if(ovos.some(function(o){ return o.name===mv.name; })) herdados.push({name:mv.name,pt:"",tipo:""});
    });
  }
  herdados.slice(0,4).forEach(function(g){
    if(m.moves.length<4 && !m.moves.some(function(x){return x.name===g.name;})){
      m.moves.push({name:g.name,url:"https://pokeapi.co/api/v2/move/"+g.name});
      m.learned.push(g.name);
    }
  });
  if(!m.moves.length){ m.moves.push({name:"tackle",url:"https://pokeapi.co/api/v2/move/tackle"}); m.learned.push("tackle"); }
  m.exp=xpForLevel(1); m.hp=maxHP(m);
  return m;
}


/* ===== PARTE 3 — interface: perfis, painel, seções, modais, batalha auxiliar, boot ===== */
