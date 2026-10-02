/* ==========================================================================
   Pokémon Anil API — routes/pokemon.js
   Dados da PokeAPI + overlay das notas do Anil.
   ========================================================================== */
const express = require("express");
const router  = express.Router();
const { pokeFetch } = require("../middleware/cache");
const ANIL = require("../data/anil.json");

/* evolution_changes é um OBJETO { descricao, nota, lista:[...] },
   e cada item tem { pokemon, evolui_para } — nao um array de strings.
   Esta funcao extrai a lista com seguranca, aceitando os dois formatos. */
function listaEvoAlterada(){
  var ec = ANIL.evolution_changes;
  if(Array.isArray(ec)) return ec;
  if(ec && Array.isArray(ec.lista)) return ec.lista;
  return [];
}

/* notas do Anil por nome de Pokémon */
function notasAnil(nome){
  const n = String(nome || "").toLowerCase();
  const lista = listaEvoAlterada();

  /* nomes envolvidos nas evolucoes alteradas (o proprio e o alvo) */
  const nomes = [];
  lista.forEach(function(x){
    if(!x) return;
    if(x.pokemon)     nomes.push(String(x.pokemon).toLowerCase());
    if(x.evolui_para) nomes.push(String(x.evolui_para).toLowerCase());
  });

  const nota = {};
  if(nomes.indexOf(n) >= 0){
    var par = lista.filter(function(x){
      if(!x) return false;
      return String(x.pokemon||"").toLowerCase() === n
          || String(x.evolui_para||"").toLowerCase() === n;
    })[0];
    nota.evolucao_alterada = true;
    if(par){
      nota.observacao = "No Anil, " + par.pokemon + " evolui para " + par.evolui_para
        + " por level up (originalmente exigia troca).";
    } else {
      nota.observacao = "Evolui por level up no Anil (originalmente exigia troca).";
    }
  }
  var rates = ANIL.rates || (ANIL.info && ANIL.info.rates);
  if(rates && rates.shiny) nota.taxa_shiny = rates.shiny;
  return nota;
}

/* GET /pokemon/:id — dados + notas do Anil */
router.get("/:id", async (req, res) => {
  try{
    const id = req.params.id;
    const p = await pokeFetch("pokemon/" + id);

    /* egg groups vem da species */
    let eggGroups = null, genderRate = null, hatch = null;
    try{
      const sp = await pokeFetch("pokemon-species/" + id);
      eggGroups = (sp.egg_groups || []).map(function(g){ return g.name; });
      genderRate = (typeof sp.gender_rate === "number") ? sp.gender_rate : null;
      hatch = sp.hatch_counter || null;
    }catch(e){}

    res.json({
      id: p.id,
      name: p.name,
      nome_pt: null,
      types: p.types.map(function(t){ return t.type.name; }),
      baseStats: p.stats.map(function(s){ return s.base_stat; }),
      stats: {
        hp: p.stats[0] ? p.stats[0].base_stat : 45,
        atk: p.stats[1] ? p.stats[1].base_stat : 45,
        def: p.stats[2] ? p.stats[2].base_stat : 45,
        spa: p.stats[3] ? p.stats[3].base_stat : 45,
        spd: p.stats[4] ? p.stats[4].base_stat : 45,
        spe: p.stats[5] ? p.stats[5].base_stat : 45
      },
      height: p.height, weight: p.weight,
      /* Lista COMPLETA de golpes (level-up, machine, tutor, egg) — era o campo
         que faltava na resposta, e o motivo de os Pokémon chegarem sem golpes. */
      moves: (p.moves || []).map(function(m){
        return {
          name: m.move.name,
          url:  m.move.url,
          metodos: (m.version_group_details || []).map(function(d){
            return { metodo: d.move_learn_method.name, nivel: d.level_learned_at, jogo: d.version_group.name };
          })
        };
      }),
      totalMoves: (p.moves || []).length,
      abilities: (p.abilities || []).map(function(a){
        return { name: a.ability.name, oculta: !!a.is_hidden };
      }),
      eggGroups, genderRate, hatchCounter: hatch,
      sprite: (p.sprites && (p.sprites.front_default || (p.sprites.other && p.sprites.other["official-artwork"] && p.sprites.other["official-artwork"].front_default))) || null,
      anil: notasAnil(p.name)
    });
  }catch(err){
    res.status(404).json({ erro: "Pokémon não encontrado.", detalhe: err.message });
  }
});

/* GET /pokemon/:id/moves */
router.get("/:id/moves", async (req, res) => {
  try{
    const p = await pokeFetch("pokemon/" + req.params.id);
    res.json({
      id: p.id, name: p.name,
      total: (p.moves || []).length,
      moves: (p.moves || []).map(function(m){
        return {
          name: m.move.name,
          url: m.move.url,
          metodos: (m.version_group_details || []).map(function(d){
            return { metodo: d.move_learn_method.name, nivel: d.level_learned_at };
          })
        };
      })
    });
  }catch(err){
    res.status(404).json({ erro: "Pokémon não encontrado.", detalhe: err.message });
  }
});

/* GET /pokemon/:id/evolution */
router.get("/:id/evolution", async (req, res) => {
  try{
    const sp = await pokeFetch("pokemon-species/" + req.params.id);
    const chain = await pokeFetch(sp.evolution_chain.url);

    function idDaUrl(u){ const m = String(u).match(/\/(\d+)\/?$/); return m ? Number(m[1]) : null; }
    function monta(no, detalhesDoPai){
      const d = (detalhesDoPai || [])[0] || {};
      return {
        name: no.species.name,
        id: idDaUrl(no.species.url),
        condicao_propria: d.min_level ? ("Nível " + d.min_level)
                        : d.item ? ("Usar " + d.item.name)
                        : d.trigger ? d.trigger.name : null,
        evolui_para: (no.evolves_to || []).map(function(ev){
          return {
            name: ev.species.name,
            id: idDaUrl(ev.species.url),
            condicao: d.min_level ? ("Nível " + d.min_level)
                     : d.item ? ("Usar " + d.item.name)
                     : d.trigger ? d.trigger.name : null,
            nivel_minimo: d.min_level || null,
            item: d.item ? d.item.name : null,
            troca_alterada: listaEvoAlterada().some(function(x){
              if(!x) return false;
              return String(x.evolui_para||"").toLowerCase() === String(ev.species.name).toLowerCase();
            }),
            proximo: monta(ev)
          };
        })
      };
    }
    res.json({ cadeia: monta(chain.chain), anil_note: "No Anil, evoluções por troca viram level up." });
  }catch(err){
    res.status(404).json({ erro: "Cadeia evolutiva não encontrada.", detalhe: err.message });
  }
});

/* GET /pokemon/search/:name */
router.get("/search/:name", async (req, res) => {
  try{
    const q = String(req.params.name || "").toLowerCase();
    const cat = await pokeFetch("pokemon?limit=100000&offset=0");
    const achados = (cat.results || []).filter(function(x){ return x.name.indexOf(q) >= 0; }).slice(0, 50);
    res.json({ termo: q, total: achados.length, resultados: achados.map(function(x){
      const m = String(x.url).match(/\/(\d+)\/?$/);
      return { name: x.name, id: m ? Number(m[1]) : null };
    })});
  }catch(err){
    res.status(500).json({ erro: "Falha na busca.", detalhe: err.message });
  }
});

module.exports = router;
