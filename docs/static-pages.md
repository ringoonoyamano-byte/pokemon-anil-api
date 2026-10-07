# Dados públicos no GitHub Pages

O workflow `.github/workflows/static-data.yml` exporta os dados em cada push para main e publica o artefato no GitHub Pages. Se a ativação automática for recusada, selecione Settings > Pages > Source > GitHub Actions e execute novamente o workflow.

URL prevista: https://ringoonoyamano-byte.github.io/pokemon-anil-api/

Arquivos: manifest.json, pokemon.json, moves.json, evolutions.json, species.json, raw-moves.json, types.json, abilities.json, items.json, metadata.json.

Esta publicação contém somente dados públicos do jogo. SQLite, usuários, equipes privadas, tokens e histórico não são exportados. Endpoints de escrita e calculadora não são serviços disponíveis no Pages. O servidor Node original continua funcionando.

Gerar localmente: `npm ci --ignore-scripts` e `node scripts/export-static.cjs public-data`. O exportador usa as mesmas funções e rotas de consulta do servidor sem iniciá-lo nem abrir SQLite.

O Poketama contém um snapshot em assets/data para não depender do estado da publicação externa. Após atualizar a API, reexporte os dados para a pasta assets/data do Poketama e publique o snapshot atualizado.
