# API: endpoint reference

All routes are listed below. PokeAPI records describe the main series. Anil datasets are historical rules or announced metadata, not validated game extracts.

| Method | Endpoint |
|---|---|
| GET | `/docs` |
| GET | `/openapi.json` |
| GET | `/` |
| GET | `/abilities` |
| GET | `/abilities/{id}` |
| GET | `/anil` |
| GET | `/anil/characters` |
| GET | `/anil/datasets` |
| GET | `/anil/datasets/{id}` |
| GET | `/anil/editions` |
| GET | `/anil/evolution-changes` |
| GET | `/anil/evolution-changes/{pokemon}` |
| GET | `/anil/faq` |
| GET | `/anil/faq/search` |
| GET | `/anil/gyms` |
| GET | `/anil/key-items` |
| GET | `/anil/locations` |
| GET | `/anil/mechanics` |
| GET | `/anil/mechanics/{id}` |
| GET | `/anil/modes` |
| GET | `/anil/modes/{id}` |
| GET | `/anil/online` |
| GET | `/anil/postgame` |
| GET | `/anil/rates` |
| GET | `/anil/sources` |
| GET | `/anil/starters` |
| GET | `/anil/starters/{gen}` |
| POST | `/calculator` |
| GET | `/calculator/history` |
| DELETE | `/calculator/history` |
| GET | `/calculator/history/{id}` |
| GET | `/custom` |
| POST | `/custom` |
| GET | `/custom/categorias` |
| GET | `/custom/{chave}` |
| PUT | `/custom/{chave}` |
| DELETE | `/custom/{chave}` |
| GET | `/health` |
| GET | `/items` |
| GET | `/items/{id}` |
| GET | `/moves/category/{category}` |
| GET | `/moves/type/{type}` |
| GET | `/moves/{name}` |
| GET | `/pokemon` |
| GET | `/pokemon/search/{name}` |
| GET | `/pokemon/{id}` |
| GET | `/pokemon/{id}/evolution` |
| GET | `/pokemon/{id}/moves` |
| GET | `/ready` |
| POST | `/stats/calculate` |
| GET | `/teams` |
| POST | `/teams` |
| POST | `/teams/import` |
| GET | `/teams/{id}` |
| PUT | `/teams/{id}` |
| DELETE | `/teams/{id}` |
| GET | `/teams/{id}/analysis` |
| POST | `/teams/{id}/clone` |
| GET | `/teams/{id}/export` |
| POST | `/teams/{id}/members` |
| DELETE | `/teams/{id}/members/{slot}` |
| GET | `/teams/{id}/stats` |
| POST | `/teams/{id}/validate` |
| GET | `/types` |
| GET | `/types/matchup/{atk}/{def}` |
| GET | `/types/{name}` |

## Payload examples

### Team import
```json
{"nome":"Example","modo_anil":"complete","membros":[{"pokemon":"pikachu","nivel":50,"natureza":"jolly","moves":["thunderbolt"],"ivs":{"hp":0},"evs":{"atk":252,"spe":252}}]}
```

Text import uses `{"nome":"Example","texto":"..."}`. Supported lines: species @ item, Ability, Level, Nature, EVs, IVs and up to four moves. Unsupported text lines are rejected. Text import/export preserves nicknames using Nickname (species), including form identifiers. JSON preserves the supported fields and slots.

### Stats
```json
{"pokemon":"pikachu","nivel":50,"natureza":"adamant","ivs":{"hp":0},"evs":{"atk":252,"spe":252}}
```

### Damage
```json
{"atacante":"pikachu","defensor":"bulbasaur","move":"tackle","nivel":50}
```

### Validation
```json
{"version":"red-blue"}
```

Validation reports `valido_base` and `validacao_anil: pendente`. It is not a full competitive legality checker: breeding/event combinations, items and plugin rules are not proven.

### Existing writes

- POST /teams: nome, modo_anil (optional), descricao (optional). PUT uses the same fields.
- POST /teams/{id}/members: slot, pokemon; optional apelido, nivel, natureza, habilidade, item, moves, evs, ivs.
- POST /teams/{id}/clone: optional nome.
- POST /custom: categoria, chave, nome, dados (object), optional fonte. PUT updates nome, dados, categoria, fonte.

## Filters and errors

Search: q, type, ability, generation, min_bst, limit, offset. Generation and BST filters can require many upstream requests on a cold cache. The catalog scan is limited to 2000 records.

Catalog/custom pagination: limit 1?100, offset >= 0. Team list uses modo, limit and offset, with total and total_pagina. Moves use version (PokeAPI version group). Datasets use edition and version. FAQ search uses q. History uses limit, offset, atacante and defensor.

400 invalid input; 401 missing/wrong write key; 403 remote writes disabled; 404 missing record; 409 duplicate custom key; 413 oversized body; 429 rate limit; 500 internal failure; 502 upstream failure; 503 database not ready; 504 upstream timeout.

Configure API_WRITE_KEY and send Authorization: Bearer <key> for remote writes. Shared keys do not separate users. POST /stats/calculate does not persist data and does not require this write key.

## Local verification

Run npm.cmd test on PowerShell. Tests use fixtures and a temporary in-memory SQLite database. Real PokeAPI smoke checks are separate. No deployment or Git push is part of local tests.
