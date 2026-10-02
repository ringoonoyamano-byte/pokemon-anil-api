/* ==========================================================================
   PokéTama Añil — api_local.js
   Adaptador para a Pokemon Anil API (Node + SQLite, porta 3000).

   Substitui as chamadas à PokéAPI externa. O mapeamento é TOLERANTE:
   aceita nomes em inglês (types, baseStats) e em português (tipos, stats),
   e devolve SEMPRE o formato que o resto do jogo já espera:
       { id, name, types:[], base:[6], learn:[], eggGroups, genderRate, ... }
   ========================================================================== */

/* ---- configuração ---- */
const API_LOCAL = {
  ativo: true,                          /* desligue para voltar à PokéAPI */
  base: "http://localhost:3000",        /* onde o server.js está rodando */
  timeoutMs: 6000                       /* se demorar, cai na PokéAPI */
};

/* ---- utilitários de leitura tolerante ---- */
function pick2(obj, a, b, padrao){
  if(!obj) return padrao;
  if(obj[a] !== undefined && obj[a] !== null) return obj[a];
  if(b && obj[b] !== undefined && obj[b] !== null) return obj[b];
  return padrao;
}
/* normaliza um valor que pode vir como string, array de strings ou array de objetos */
function lista(valor){
  if(!valor) return [];
  if(Array.isArray(valor)){
    return valor.map(function(x){
      if(typeof x === "string") return x;
      if(x && typeof x === "object") return x.name || x.nome || x.type || x.tipo || String(x);
      return String(x);
    }).filter(Boolean);
  }
  if(typeof valor === "string") return [valor];
  return [];
}
function num(v, padrao){ var n = Number(v); return isNaN(n) ? (padrao||0) : n; }

/* ---- fetch com timeout e cache curto ---- */
const _cacheLocal = {};
function fetchLocal(url){
  if(_cacheLocal[url]) return Promise.resolve(_cacheLocal[url]);
  return new Promise(function(resolve, reject){
    var acabou = false;
    var t = setTimeout(function(){
      if(!acabou){ acabou = true; reject(new Error("timeout")); }
    }, API_LOCAL.timeoutMs);
    fetch(url).then(function(r){
      if(!r.ok) throw new Error("http " + r.status);
      return r.json();
    }).then(function(j){
      if(acabou) return;
      acabou = true; clearTimeout(t);
      _cacheLocal[url] = j;
      resolve(j);
    }).catch(function(e){
      if(acabou) return;
      acabou = true; clearTimeout(t);
      reject(e);
    });
  });
}

/* ---- adapta a resposta de /pokemon/:id ao formato do jogo ---- */
function adaptaPokemon(bruto, id){
  if(!bruto) return null;
  var tipos = lista(pick2(bruto, "types", "tipos", []));
  /* stats base: aceita objeto {hp, atk, ...} ou array [hp, atk, ...] */
  var st = pick2(bruto, "baseStats", "stats", pick2(bruto, "base_stats", "base", null));
  var base = [45,45,45,45,45,45];
  if(Array.isArray(st) && st.length >= 6){
    base = st.slice(0,6).map(function(x){ return num(x, 45); });
  } else if(st && typeof st === "object"){
    base = [
      num(pick2(st,"hp","Hp",45),45),
      num(pick2(st,"atk","attack",45),45),
      num(pick2(st,"def","defense",45),45),
      num(pick2(st,"spa","special-attack",45),45),
      num(pick2(st,"spd","special-defense",45),45),
      num(pick2(st,"spe","speed",45),45)
    ];
  }
  /* golpes */
  var mv = pick2(bruto, "moves", "golpes", pick2(bruto, "movePool", "learnset", []));
  var learn = [];
  if(Array.isArray(mv)){
    learn = mv.map(function(m){
      if(typeof m === "string") return { name: m, url: null, methods: [] };
      var nome = m.name || m.nome || m.move || "";
      var lvl = num(pick2(m, "level", "nivel", pick2(m, "lv", "n", 0)), 0);
      return { name: nome, url: m.url || null, methods: [{ m: lvl > 0 ? "level-up" : "machine", lv: lvl }] };
    }).filter(function(x){ return x.name; });
  }
  /* grupos de ovo */
  var eg = pick2(bruto, "eggGroups", "egg_groups", pick2(bruto, "gruposOvos","grupoOvo", null));
  var gender = pick2(bruto, "genderRate", "gender_rate", null);
  return {
    id: num(pick2(bruto, "id", "dex", id), id),
    name: pick2(bruto, "name", "nome", ("pokemon-"+id)),
    types: tipos.length ? tipos : ["normal"],
    base: base,
    learn: learn,
    eggGroups: eg ? lista(eg) : null,
    genderRate: (typeof gender === "number") ? gender : null,
    origemAnil: true
  };
}

/* ---- adapta /moves/:name ---- */
function adaptaGolpe(bruto, nome){
  if(!bruto) return null;
  return {
    id: num(pick2(bruto,"id","num",0), 0),
    name: pick2(bruto, "name", "nome", nome),
    power: num(pick2(bruto,"power","poder",0), 0),
    acc: num(pick2(bruto,"accuracy","precisao",100), 100),
    type: pick2(bruto, "type", "tipo", "normal"),
    dmgClass: pick2(bruto, "damageClass", "damage_class", pick2(bruto,"classe","category","physical")),
    pp: num(pick2(bruto,"pp",10), 10),
    effect: pick2(bruto, "effect", "efeito", ""),
    stat_changes: pick2(bruto, "statChanges", "stat_changes", []),
    drain: num(pick2(bruto,"drain",0),0),
  };
}

/* ==========================================================================
   API PUBLICA — o jogo usa estas quatro
   Todas caem para a PokéAPI se a API local falhar.
   ========================================================================== */

/* busca um Pokémon: tenta a API local, cai na PokéAPI */
function getSpeciesLocal(id, falbackPokéAPI){
  if(!API_LOCAL.ativo) return falbackPokéAPI(id);
  return fetchLocal(API_LOCAL.base + "/pokemon/" + id)
    .then(function(j){
      var m = adaptaPokemon(j, id);
      if(m && m.base && m.types && m.types.length) return m;
      throw new Error("formato inesperado");
    })
    .catch(function(err){
      console.warn("[api_local] usando PokéAPI para #" + id + ":", err.message || err);
      return falbackPokéAPI(id);
    });
}

/* busca um golpe */
function getMoveLocal(nome, falbackPokéAPI){
  if(!API_LOCAL.ativo) return falbackPokéAPI(nome);
  return fetchLocal(API_LOCAL.base + "/moves/" + encodeURIComponent(nome))
    .then(function(j){
      var m = adaptaGolpe(j, nome);
      if(m && m.name) return m;
      throw new Error("formato inesperado");
    })
    .catch(function(err){
      return falbackPokéAPI(nome);
    });
}

/* testa se a API local esta de pe (usado no boot) */
function testaAPILocal(){
  if(!API_LOCAL.ativo) return Promise.resolve(false);
  return fetchLocal(API_LOCAL.base + "/")
    .then(function(j){
      var ok = !!(j && (j.nome || j.endpoints || j.versao));
      if(ok) console.log("[api_local] ✅ Pokemon Anil API conectada (v" + (j.versao||"?") + ")");
      return ok;
    })
    .catch(function(){
      console.warn("[api_local] ⚠️ API local offline — usando PokéAPI direta.");
      return false;
    });
}
