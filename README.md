# 🎮 Pokémon Anil API

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
- **pkmnanil.com:** https://pkmnanil.com
- **TV Tropes Anil:** https://tvtropes.org/pmwiki/pmwiki.php/VideoGame/PokemonAnil

---

## ⚠️ Aviso

Esta é uma API **não-oficial**, criada para fins educacionais.  
Pokémon Anil é um **fan game** desenvolvido por **EricLostie** usando RPG Maker XP + Pokémon Essentials.  
Pokémon e todos os personagens relacionados são marcas registradas da **The Pokémon Company**.
