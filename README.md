# Pokémon Añil API

API própria para os sites que usam Pokémon Añil/PT-BR. As rotas de jogo leem os
JSONs locais; não consultam a PokéAPI nem usam respostas antigas do cache SQLite.
A base ativa vem da compilação fornecida pelo usuário **Azul/PT-BR 4.0.6**, com
versão interna **4.0.3**. Essa identificação registra a origem dos dados.

## Executar

Requer Node.js >= 18.

```powershell
npm.cmd install
npm.cmd start
```

Endereço padrão: `http://localhost:3000`. Reinicie o processo após atualizar o código.
Use `npm.cmd test` para verificar a API sem alterar os times existentes.

## Rotas para os sites

| Rota | Conteúdo |
| --- | --- |
| `/pokemon?type=fire&limit=50` | Busca por nome, tipo, habilidade, geração e stats |
| `/pokemon/pikachu` | Stats, tipos, habilidades, golpes e dados originais do jogo |
| `/pokemon/charizard_1` | Forma específica usando o identificador do jogo |
| `/pokemon/bulbasaur/moves` | Golpes por nível, tutor e criação |
| `/pokemon/bulbasaur/evolution` | Cadeia evolutiva extraída do jogo |
| `/moves` e `/moves/thunderbolt` | Catálogo e detalhes dos golpes |
| `/abilities` e `/abilities/overgrow` | Habilidades do jogo |
| `/items` e `/items/repel` | Itens, preços e propriedades do jogo |
| `/types` | Tipos e relações de dano da compilação |
| `/anil` | Base ativa e resumo |
| `/anil/encounters` | Encontros por mapa, método e nível |
| `/anil/trainers?limit=50` | Treinadores e equipes |
| `/anil/locations` | Mapas e regiões |
| `/anil/raids` | Equipes das raids |
| `/anil/mechanics`, `/anil/modes`, `/anil/rates` | Regras extraídas da compilação |
| `/stats/calculate`, `/calculator`, `/teams` | Cálculos e gerenciamento de times |

Documentação: [docs/API.md](docs/API.md), `/docs` e `/openapi.json`.
O catálogo completo dos arquivos originais continua disponível em
`/anil/datasets/azul-4.0.6-extracted-game-data`; seus sites podem usar diretamente
as rotas principais, sem escolher uma base a cada consulta.

## Identificadores e limites

Pokémon aceitam nome, ID do jogo e número local da API. Formas têm IDs numéricos
locais próprios; use `game_id` para integração estável com o jogo. Golpes,
habilidades e itens usam identificadores textuais, com comparação sem distinguir
maiúsculas, hífens ou sublinhados. Números desses catálogos da PokéAPI não são aceitos.
O número local de espécies deriva da ordem dos registros base no pacote, e não de
uma consulta à PokéAPI. Guarde o identificador textual para portabilidade.

O ZIP não contém sprites: `sprite` retorna `null`. Os textos disponíveis em
espanhol permanecem identificados como espanhol; traduções ausentes não são
inventadas. O filtro de golpes aceita `version=azul-4-0-6`.

A calculadora usa stats, poder e tipos do jogo, mas seu modelo continua
simplificado: não cobre todos os efeitos de habilidades, itens ou scripts.
A validação de times confere habilidades e golpes na base local, sem garantir
legalidade completa de eventos e criação. A compilação força modo Completo;
perfis históricos de times continuam como filtros do usuário.

Ginásios, FAQ, personagens e outros conteúdos sem confirmação no pacote permanecem
como referência histórica e retornam `referencia_historica: true`. Não devem ser
aplicados como regras atuais. Histórico e metadados antigos ficam disponíveis
nas rotas de datasets para consulta.

## Escritas e banco

O SQLite mantém times, dados customizados e histórico da calculadora. As leituras
dos catálogos de jogo usam os JSONs locais. Nenhum time foi convertido ou apagado.

Configure `API_WRITE_KEY` e envie `Authorization: Bearer <chave>` para escritas
remotas em times, dados customizados e histórico. Sem chave, somente conexões
locais podem escrever. `POST /stats/calculate` não grava dados.
