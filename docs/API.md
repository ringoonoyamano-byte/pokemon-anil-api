# API: endpoint reference

As rotas principais usam os dados locais extraídos do Pokémon Añil/PT-BR, compilação Azul 4.0.6 (interna 4.0.3). Não há consulta à PokéAPI. Consulte README.md para identificadores, origem e limitações.

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
| GET | `/anil/encounters` |
| GET | `/anil/trainers` |
| GET | `/anil/raids` |
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
| GET | `/moves` |
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
{"version":"azul-4-0-6"}
```

Validation reports `valido_base` and `validacao_anil: basica_dados_do_jogo`. It is not a full competitive legality checker: breeding/event combinations, items and plugin rules are not proven.

### Existing writes

- POST /teams: nome, modo_anil (optional), descricao (optional). PUT uses the same fields.
- POST /teams/{id}/members: slot, pokemon; optional apelido, nivel, natureza, habilidade, item, moves, evs, ivs.
- POST /teams/{id}/clone: optional nome.
- POST /custom: categoria, chave, nome, dados (object), optional fonte. PUT updates nome, dados, categoria, fonte.

## Filters and errors

Search: q, type, ability, generation, min_bst, limit, offset. Filtros são aplicados aos 1519 registros locais, sem consultas externas.

Catalog/custom pagination: limit 1–100, offset >= 0. Team list uses modo, limit and offset, with total and total_pagina. Moves use version=azul-4-0-6 (compilação ativa). Datasets use edition and version. FAQ search uses q. History uses limit, offset, atacante and defensor.

400 invalid input; 401 missing/wrong write key; 403 remote writes disabled; 404 missing record; 409 duplicate custom key; 413 oversized body; 429 rate limit; 500 internal failure; 502 upstream failure; 503 database not ready; 504 upstream timeout.

Configure API_WRITE_KEY and send Authorization: Bearer <key> for remote writes. Shared keys do not separate users. POST /stats/calculate does not persist data and does not require this write key.

## Local verification

Run npm.cmd test on PowerShell. Tests use fixtures and a temporary in-memory SQLite database. Os testes tamb?m verificam as rotas principais com os JSONs reais do jogo. No deployment or Git push is part of local tests.

## Dados extraídos do Azul/PT-BR 4.0.6

A base `azul-4.0.6-extracted-game-data` disponibiliza os dados do jogo em
`/anil/datasets/:id/:resource`, com paginação e busca em listas, e consultas
por identificador em `/anil/datasets/:id/:resource/:record`.
Consulte [comparação e exemplos](COMPARACAO-AZUL-4.0.6.md) para recursos,
diferenças de regras e limites de integração.

FUSÃO COM A POKEAPI
GET /fusion/pokemon/bulbasaur
GET /fusion/move/vine-whip
GET /fusion/ability/overgrow
GET /fusion/item/potion
GET /fusion/type/fire

A resposta inclui dados (prioridade do jogo), referencia_pokeapi, fontes,
complementos_pokeapi e status_pokeapi. Imagens/sons de Pokémon e textos
externos complementam a base local; stats, golpes, tipos, habilidades e
regras permanecem os extraídos do jogo. Referências externas não confirmam
mecânicas do Añil. Formas locais não são associadas automaticamente a formas
oficiais. Falhas externas retornam os dados locais com status indisponivel.
Cache externo SQLite: 24 horas; timeout: 10 segundos; chamadas simultâneas
iguais compartilham a consulta. Nenhuma consulta modifica times ou datasets.
