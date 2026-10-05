const { source, datasetId, version: gameVersion } = require('../lib/game-data');
/* ==========================================================================
   Pokémon Anil API — routes/pokemon.js
   Dados locais extraídos do jogo.
   ========================================================================== */
const express = require("express");
const router  = express.Router();
const { pokeFetch } = require("../middleware/cache");

const upstreamError = require('../middleware/upstream-error');

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
      fonte: source, dataset_id: datasetId,
      game_id: p.game_id, form: p.form, dados_jogo: p.dados_jogo,
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
          url:  `/moves/${m.move.name}`,
          metodos: (m.version_group_details || []).map(function(d){
            return { metodo: d.move_learn_method.name, nivel: d.level_learned_at, jogo: d.version_group.name };
          })
        };
      }),
      totalMoves: (p.moves || []).length,
      abilities: (p.abilities || []).map(function(a){
        return { name: a.ability.name, oculta: !!a.is_hidden };
      }),
      eggGroups, genderRate, hatchCounter: hatch, hatchSteps: p.dados_jogo?.hatch_steps ?? null,
      sprite: (p.sprites && (p.sprites.front_default || (p.sprites.other && p.sprites.other["official-artwork"] && p.sprites.other["official-artwork"].front_default))) || null,
      anil: { dataset_id: datasetId, evolucoes: p.dados_jogo?.evolutions || [] }
    });
  }catch(err){
    upstreamError(res, err, "Pokémon não encontrado.");
  }
});

/* GET /pokemon/:id/moves */
router.get("/:id/moves", async (req, res) => {
  const version = req.query.version;
  if (version !== undefined && (typeof version !== 'string' || !/^[a-z0-9-]+$/.test(version))) {
    return res.status(400).json({ erro: 'version deve ser um identificador do jogo, como azul-4-0-6.' });
  }
  try{
    const p = await pokeFetch("pokemon/" + req.params.id);
    const moves = (p.moves || []).map(m => ({
      name: m.move.name,
      url: `/moves/${m.move.name}`,
      metodos: (m.version_group_details || [])
        .filter(d => !version || d.version_group.name === version)
        .map(d => ({ metodo: d.move_learn_method.name, nivel: d.level_learned_at, jogo: d.version_group.name }))
    })).filter(m => m.metodos.length > 0);
    res.json({
      id: p.id, name: p.name,
      fonte: source, dataset_id: datasetId, versao: version || null,
      total: moves.length,
      moves
    });
  }catch(err){
    upstreamError(res, err, "Pokémon não encontrado.");
  }
});

/* GET /pokemon/:id/evolution */
router.get("/:id/evolution", async (req, res) => {
  try{
    const pokemon = await pokeFetch("pokemon/" + req.params.id);
    const sp = await pokeFetch(pokemon.species.url);
    const chain = await pokeFetch(sp.evolution_chain.url);

    function idDaUrl(u){ const m = String(u).match(/\/(\d+)\/?$/); return m ? Number(m[1]) : null; }
    function monta(no){
      const d = (no.evolution_details || [])[0] || {};
      return {
        name: no.species.name,
        id: idDaUrl(no.species.url),
        condicao_propria: d.min_level ? ("Nível " + d.min_level)
                        : d.item ? ("Usar " + d.item.name)
                        : d.trigger ? d.trigger.name : null,
        evolui_para: (no.evolves_to || []).map(function(ev){
          const d = (ev.evolution_details || [])[0] || {};
          return {
            name: ev.species.name,
            id: idDaUrl(ev.species.url),
            condicao: d.min_level ? ("Nível " + d.min_level)
                     : d.item ? ("Usar " + d.item.name)
                     : d.trigger ? d.trigger.name : null,
            nivel_minimo: d.min_level || null,
            item: d.item ? d.item.name : null,
            condicoes: ev.evolution_details || [],
            troca_alterada: false,
            proximo: monta(ev)
          };
        })
      };
    }
    res.json({ cadeia: monta(chain.chain), fonte: source, dataset_id: datasetId, anil_note: "Condições extraídas do jogo; metodo_jogo e parametro_jogo preservam as regras originais." });
  }catch(err){
    upstreamError(res, err, "Cadeia evolutiva não encontrada.");
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
