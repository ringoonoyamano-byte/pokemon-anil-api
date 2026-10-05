# Comparação e integração do pacote Azul 4.0.6

Fonte: `Pokemon-Anil-JSON-Comparacao.zip`, fornecido pelo usuário em 05/10/2026.
Os JSONs foram importados sem executar os scripts incluídos no arquivo.

A API possuía apenas regras históricas 3.06 e metadados anunciados 4.0.7c.
Agora registra também `azul-4.0.6-extracted-game-data`, edição
`azul_ptbr_online`, versão externa 4.0.6 e interna 4.0.3.
Os dados são extraídos da compilação fornecida; não representam Añil original 4.1.1.

## Dados adicionados

| Recurso | Registros |
| --- | ---: |
| Espécies e formas | 1519 |
| Golpes | 851 |
| Habilidades | 328 |
| Itens | 933 |
| Tipos | 19 |
| Tabelas de encontros | 103 |
| Treinadores | 685 |
| Mapas | 225 |
| Regiões | 2 |
| Conjuntos de raids | 7 |

Também foram incluídos dexes regionais, montarias, naturezas, listas de
treinadores, diálogos de revanche e definições de animações de batalha.
Os nomes, identificadores e estruturas originais dos JSONs são preservados.

## Consulta

- `GET /anil/datasets?edition=azul_ptbr_online&version=4.0.6`
- `GET /anil/datasets/azul-4.0.6-extracted-game-data`: metadados e catálogo de recursos.
- `GET /anil/datasets/azul-4.0.6-extracted-game-data/species?limit=50&offset=0&q=bulbasaur`
- `GET /anil/datasets/azul-4.0.6-extracted-game-data/species/BULBASAUR`
- `GET /anil/datasets/azul-4.0.6-extracted-game-data/encounters/2_0`
- `GET /anil/datasets/azul-4.0.6-extracted-game-data/raid_teams/blaine`
- `GET /anil/datasets/azul-4.0.6-extracted-game-data/mechanics_detected`

Listas retornam `total`, `limit`, `offset` e `dados`; limite padrão 50,
máximo 200. `q` busca texto em qualquer campo do registro, sem distinguir
maiúsculas. Objetos retornam `dados` completo, sem paginação ou busca.
Consulta individual usa o campo `id` em listas ou a chave em objetos.
IDs compostos de treinadores usam os componentes separados por vírgula
(codifique o segmento da URL). Listas sem `id` são consultadas pela página.
Todos os recursos retornam `dataset_id` para identificar a compilação.

## Divergências preservadas por edição

- Shiny: histórico `1/1000`; compilação extraída `6/65536`, com possível
  alteração pelo servidor multiplayer.
- Modos: compilação força Completo e desativa desafios e Randomizer.
- TMs: o pacote relata um módulo de TMs consumíveis/vendáveis; comportamento
  ainda depende de verificação em execução. Não foi convertido em regra confirmada.
- Versões 4.0.6 externa e 4.0.3 interna não substituem metadados de 4.0.7c.

As rotas principais de Pokémon, golpes, tipos, habilidades e itens agora usam
a compilação local como fonte padrão, sem consultas externas. Stats, calculadora
e validação de times também leem essa base. A calculadora mantém seu modelo
simplificado e a validação é básica, sem cobrir todos os efeitos dos scripts.
As rotas versionadas continuam disponíveis para inspeção dos JSONs originais.
Os relatórios de comparação incluídos no ZIP documentam uma comparação anterior;
esta tabela registra a comparação local e a integração realizada.
