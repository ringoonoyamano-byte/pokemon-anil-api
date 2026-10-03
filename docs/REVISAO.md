# Revisão final local — 03/10/2026

O pacote principal de correções e melhorias foi concluído localmente. Não foi feito commit ou push nesta fase.

## Verificações

- 35 testes passaram, incluindo busca, cache, stats, evolução, validação, importação/exportação, atualização e clonagem.
- Importação e clonagem usam transações; falhas de gravação foram testadas com SQLite em memória.
- Paginação testada com totais filtrados, ordenação estável e contagem de membros.
- Sintaxe e `git diff --check` verificados.
- Documentação em `API.md` e `openapi.json`; relatório TXT ignorado pelo Git.

## Recursos entregues

Correções de cálculo, evolução, idioma, entradas, erros, cache e escrita remota. Catálogos de habilidades/itens, stats independentes, análise defensiva, busca avançada, importação/exportação e validação básica de times, datasets por edição/versão, saúde/prontidão e documentação.

## Limitações que exigem outra fase

- Validação exata do Añil, encontros, missões, raids e drops dependem de dados verificados do jogo.
- Integração multiplayer depende de interface fornecida pelos mantenedores.
- Calculadora de dano é simplificada, sem habilidades, itens ou todas as regras especiais.
- Validação de times não prova combinações competitivas de eventos/criação ou regras de plugins.
- Texto de times suporta os campos documentados, incluindo apelidos e formas; não implementa todo o formato Showdown.
- Busca por geração/stats pode fazer muitas consultas no cache frio; catálogo limitado a 2000 registros.
- A proteção de escrita usa chave compartilhada, sem contas individuais.
- Entradas antigas do cache foram preservadas; prazos corrigidos aplicam-se às novas gravações.
