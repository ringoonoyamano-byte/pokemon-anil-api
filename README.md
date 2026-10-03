# 🎮 Pokémon Anil API

## Correções locais

### Novos endpoints locais

As etapas finais acrescentam `GET /pokemon` (q, type, ability, generation, min_bst), `POST /teams/import`, `GET /teams/:id/export?format=json|text`, `POST /teams/:id/validate`, `GET /anil/datasets` e `GET /anil/datasets/:id`.

Consulte [docs/API.md](docs/API.md) para todos os endpoints, exemplos e limites. A documentação também está em `/docs` e a especificação OpenAPI em `/openapi.json`. Bases históricas e metadados de mods são identificados separadamente; não há tabelas verificadas para todas as versões do Añil. Importação suporta um subconjunto explícito do formato texto de times, rejeitando linhas não suportadas.

| Endpoint | Descrição |
|---|---|
| `GET /health` | Estado do processo e versão da API |
| `GET /ready` | Verificação do banco; retorna 503 se indisponível |
| `GET /abilities?limit=50&offset=0` | Catálogo paginado de habilidades |
| `GET /abilities/:id` | Habilidade por nome ou número |
| `GET /items?limit=50&offset=0` | Catálogo paginado de itens |
| `GET /items/:id` | Item por nome ou número |
| `POST /stats/calculate` | Stats por Pokémon, nível, natureza, IVs e EVs |
| `GET /teams/:id/analysis` | Fraquezas, resistências e imunidades por slot |

Exemplo de stats: `{"pokemon":"pikachu","nivel":50,"natureza":"adamant","ivs":{"hp":0},"evs":{"atk":252,"spe":252}}`. IVs omitidos usam 31; EVs omitidos usam zero. A análise de times considera apenas tipos, sem habilidades, itens ou modo Inverso. Nenhum desses endpoints altera times ou grava histórico.

Catálogos retornam dados da PokeAPI e não confirmam regras do Añil. O cache compartilhado usa segundos: 6 horas para Pokémon/golpes, 24 horas para tipos/espécies e 1 hora para demais recursos. A correção aplica-se a novas gravações, sem apagar entradas antigas.

- Dados customizados validam campos textuais, categoria e conteúdo JSON. JSON malformado retorna 400 e corpo acima do limite retorna 413.
- Confrontos de tipos rejeitam tipos inexistentes e Estelar, que não segue a tabela padrão.
- Consultas de golpes e tipos têm timeout de 15 segundos e distinguem falhas externas de dados inexistentes.

- Times validam IVs (0–31), EVs (0–252 e total até 510), níveis, slots e até quatro golpes distintos; IV zero é preservado nos cálculos.
- `limit` aceita valores de 1 a 100 e `offset` aceita inteiros não negativos em consultas customizadas e histórico. Os times validam esses parâmetros, mas sua listagem ainda não é paginada.
- Consultas de Pokémon, inclusão de membros e calculadora distinguem ausência (404), falha externa (502) e timeout (504). A calculadora e os times utilizam o cache SQLite compartilhado.

- Execute `npm test` (ou `npm.cmd test` no PowerShell) para os testes de regressão sem alterar o banco local.
- A calculadora corrige os stats físicos e a aplicação de queimadura, valida parâmetros e identifica seu modelo simplificado. Não considera habilidades, itens, danos fixos nem todas as regras especiais de golpes.
- As evoluções retornam condições da PokeAPI em `condicoes`, preservando alternativas; alterações do Añil continuam sendo marcações históricas.
- Golpes não usam nomes alemães como tradução. `traducao_disponivel` indica quando existe um nome em português na fonte.
- `/pokemon/:id/moves?version=red-blue` filtra métodos por grupo de versão da PokeAPI. Essa versão não é uma edição do Añil.
- Escritas em `/custom`, `/teams` e `/calculator` aceitam apenas conexões locais quando `API_WRITE_KEY` não está definida. Para escritas remotas, configure a variável no servidor e envie `Authorization: Bearer <chave>`. Quando definida, a chave também é exigida localmente. Consultas continuam públicas. A chave compartilhada não separa dados por usuário; conexões através de proxy local exigem configurar a chave.

API REST que combina dados da **PokeAPI** com informações exclusivas do **Pokémon Anil (PT-BR)** — fan game criado por EricLostie.

---

## 🚀 Instalação e Uso

```bash
# 1. Instalar dependências
npm install

# 2. Rodar em produção
npm start

# 3. Rodar em desenvolvimento (hot-reload)
npm run dev
```

> Requer Node.js >= 18.0.0

A API estará em: `http://localhost:3000`

---

## 📁 Estrutura do Projeto

```
pokemon-anil-api/
├── server.js            ← Servidor Express principal
├── package.json
├── data/
│   └── anil.json        ← Todos os dados estáticos do Pokémon Anil
└── routes/
    ├── pokemon.js       ← Rotas de Pokémon (PokeAPI + Anil)
    ├── moves.js         ← Rotas de Golpes (PokeAPI)
    ├── types.js         ← Rotas de Tipos (PokeAPI)
    └── anil.js          ← Rotas exclusivas do Anil
```

---

## 📖 Endpoints

### 📘 Pokémon (PokeAPI + overlay Anil)

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| GET | `/pokemon/:id` | Dados do Pokémon por nome ou número, com notas do Anil |
| GET | `/pokemon/:id/moves` | Todos os golpes que o Pokémon pode aprender |
| GET | `/pokemon/:id/evolution` | Cadeia evolutiva com alterações do Anil |
| GET | `/pokemon/search/:name` | Busca por nome |

**Exemplos:**
```
GET /pokemon/pikachu
GET /pokemon/25
GET /pokemon/gengar/evolution
GET /pokemon/bulbasaur/moves
GET /pokemon/search/charizard
```

---

### ⚔️ Golpes (PokeAPI)

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| GET | `/moves/:name` | Dados completos de um golpe |
| GET | `/moves/type/:type` | Golpes de um tipo específico |
| GET | `/moves/category/:cat` | Golpes por categoria: `physical`, `special`, `status` |

**Exemplos:**
```
GET /moves/thunderbolt
GET /moves/surf
GET /moves/type/fire
GET /moves/category/special
```

---

### 🔥 Tipos (PokeAPI)

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| GET | `/types` | Lista todos os tipos |
| GET | `/types/:name` | Efetividade de um tipo |
| GET | `/types/matchup/:atk/:def` | Multiplicador: tipo atacante vs. defensor |

**Exemplos:**
```
GET /types
GET /types/water
GET /types/fire
GET /types/matchup/fire/water   → 0.5×
GET /types/matchup/water/fire   → 2×
GET /types/matchup/ghost/normal → 0×
```

---

### 🎮 Pokémon Anil (Dados Exclusivos)

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| GET | `/anil` | Visão geral + mapa de endpoints |
| GET | `/anil/modes` | Todos os modos de jogo |
| GET | `/anil/modes/:id` | Um modo específico |
| GET | `/anil/starters` | Todos os 27 starters (Gen 1–9) |
| GET | `/anil/starters/:gen` | Starters de uma geração |
| GET | `/anil/mechanics` | Mecânicas exclusivas do jogo |
| GET | `/anil/mechanics/:id` | Uma mecânica específica |
| GET | `/anil/evolution-changes` | Evoluções por troca → level-up |
| GET | `/anil/evolution-changes/:name` | Alteração de evolução de um Pokémon |
| GET | `/anil/key-items` | Itens-chave que substituem os HMs |
| GET | `/anil/characters` | Protagonistas e personagens novos/alterados |
| GET | `/anil/locations` | Locais exclusivos e reimaginados |
| GET | `/anil/gyms` | Ginásios e nível cap por insígnia |
| GET | `/anil/postgame` | Conteúdo do pós-jogo |
| GET | `/anil/rates` | Taxas (shiny, exp cap) |
| GET | `/anil/faq` | Perguntas frequentes |
| GET | `/anil/faq/search?q=texto` | Busca no FAQ |

**Exemplos:**
```
GET /anil/modes/radical
GET /anil/starters/gen9
GET /anil/mechanics/pokevial
GET /anil/evolution-changes/kadabra
GET /anil/evolution-changes/gengar
GET /anil/gyms
GET /anil/faq/search?q=shiny
GET /anil/faq/search?q=online
```

---

## 🎮 Modos de ID para `/anil/modes/:id`

| ID | Modo |
|----|------|
| `classic` | Modo Clássico (Gen 1-2) |
| `complete` | Modo Completo (Gen 1-9) |
| `radical` | Modo Radical (difícil) |
| `nuzlocke` | Modo Nuzlocke |
| `nuzlocke_assistido` | Nuzlocke Assistido (com Cinzas Sagradas) |
| `randomizer` | Modo Randomizer |
| `monotype` | Modo Monotype |

---

## ⚙️ IDs para `/anil/mechanics/:id`

| ID | Mecânica |
|----|----------|
| `level_cap` | Limite de nível por insígnia |
| `pokevial` | PokéVial (cura total portátil) |
| `pokerider` | PokéRider (fast travel) |
| `super_training` | Treino de EVs no Dojo |
| `tms_reutilizaveis` | TMs de uso infinito |
| `sem_hms` | HMs substituídos por itens-chave |
| `evolucao_trade` | Evoluções por troca → level-up |
| `shiny_rate` | Taxa de shiny: 1/1000 |
| `tipos_visiveis` | Tipos visíveis em batalha |
| `aprendedor_de_moves` | Move relearner em todo Centro |
| `loja_no_centro` | PokéMart integrado ao Centro |
| `fast_forward` | Modo acelerado (tecla Alt) |
| `pokeradar` | PokéRadar disponível |
| `mega_evolucoes` | Mega Evoluções no pós-jogo |
| `pokedex_bulbapedia` | Pokédex estilo Bulbapedia |
| `rare_candy_infinito` | Rare Candies infinitos |
| `cinzas_sagradas` | Cinzas Sagradas (Nuzlocke Assistido) |

---

## 🛡️ Limites e Cache

- **Rate limit:** 100 requisições por minuto por IP
- **Cache:** Dados da PokeAPI são armazenados em memória por 1 hora

---

## 📦 Dependências

| Pacote | Versão | Uso |
|--------|--------|-----|
| `express` | ^4.21.2 | Servidor HTTP |
| `axios` | ^1.7.9 | Chamadas à PokeAPI |
| `cors` | ^2.8.5 | Cross-Origin Resource Sharing |
| `express-rate-limit` | ^7.5.0 | Rate limiting |
| `node-cache` | ^5.1.2 | Cache em memória |
| `nodemon` | ^3.1.9 | Hot-reload (dev) |

---

## 📚 Fontes de Dados

- **PokeAPI:** https://pokeapi.co — Dados base de Pokémon, golpes e tipos
- **Pokémon Anil Oficial:** https://pokemonanil.com
- **Mod Pokémon Azul PT-BR:** https://pokemonanilbr.netlify.app/
- **TV Tropes Anil:** https://tvtropes.org/pmwiki/pmwiki.php/VideoGame/PokemonAnil

---

## ⚠️ Aviso

Esta é uma API **não-oficial**, criada para fins educacionais.  
Pokémon Anil é um **fan game** desenvolvido por **EricLostie** usando RPG Maker XP + Pokémon Essentials.  
Pokémon e todos os personagens relacionados são marcas registradas da **The Pokémon Company**.

## Revisão das informações (01/10/2026)

A base histórica em `data/anil.json` descrevia a versão 3.06. `versao_atual` e `online` agora são `null` quando não há confirmação para o original. As regras históricas de encontros, evoluções, taxas e ginásios ainda precisam ser conferidas na edição utilizada. Dados da PokeAPI descrevem a série principal e não confirmam alterações do fangame.

A [página do mod Pokémon Azul PT-BR](https://pokemonanilbr.netlify.app/) anuncia a versão 4.0.7c e multiplayer em beta fechado. Essa numeração pertence ao mod. A [página do criador](https://lostiefangames.blogspot.com/) é a referência para a distribuição original. `pokemonanil.com` não foi confirmado como site oficial do criador.

| Endpoint | Conteúdo |
|---|---|
| `GET /anil/editions` | Original e mod PT-BR, com escopo e fontes |
| `GET /anil/online` | Recursos e atalhos anunciados pelo mod |
| `GET /anil/sources` | Fontes, data e limites da revisão |

A pesquisa não testa servidores nem integra esta API ao multiplayer. `data/anil.json` é a base das rotas `/anil`; o `anil.json` da raiz é um arquivo separado com outro formato. O seed atual não importa as novas seções e não foi executado nesta revisão, preservando o banco local.

## Melhorias de 03/10/2026

- Times: `GET /teams?limit=50&offset=0&modo=complete`, com total filtrado e contagem de membros.
- Histórico: `GET /calculator/history?limit=20&offset=0`, com ordenação estável.
- Consultas simultâneas ao mesmo recurso compartilham a chamada à PokeAPI.
- Naturezas inválidas na calculadora retornam HTTP 400.

## Melhorias de importação e atualização

Texto de times preserva apelidos no formato `Apelido (especie)` e identificadores de formas como `rotom-wash`. Stats repetidos e cabeçalhos ambíguos são rejeitados. Em `PUT /teams/:id`, `descricao: null` limpa o campo; em `PUT /custom/:chave`, `fonte: null` limpa a fonte. Campos omitidos preservam os valores anteriores.
