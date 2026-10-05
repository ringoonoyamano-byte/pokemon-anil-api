const express    = require("express");
const cors       = require("cors");
const rateLimit  = require("express-rate-limit");
const { initDb, cacheClean } = require("./database/db");

// Rotas
const pokemonRoutes    = require("./routes/routes_pokemon");
const movesRoutes      = require("./routes/moves");
const typesRoutes      = require("./routes/types");
const anilRoutes       = require("./routes/anil");
const customRoutes     = require("./routes/custom");
const teamsRoutes      = require("./routes/teams");
const calculatorRoutes = require("./routes/calculator");

const app  = express();
const PORT = process.env.PORT || 3000;

// ─── Inicializa banco de dados ───────────────────────────────────────────────
initDb();

// Limpa cache expirado a cada 30 min
setInterval(() => {
  const removed = cacheClean();
  if (removed > 0) console.log(`🧹 Cache: ${removed} entradas expiradas removidas.`);
}, 30 * 60 * 1000);

// ─── Middlewares globais ─────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 600, // 600 req/min
  standardHeaders: true,
  legacyHeaders: false,
  message: { erro: "Muitas requisições. Aguarde 1 minuto.", limite: "600 req/min" },
});
app.use(limiter);
app.use(require('./routes/health'));
app.use(require('./routes/docs'));

app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  next();
});

// ─── Rotas ──────────────────────────────────────────────────────────────────
app.use('/pokemon', require('./routes/search'));
app.use("/pokemon",    pokemonRoutes);
app.use("/moves",      movesRoutes);
app.use("/types",      typesRoutes);
app.use('/abilities', require('./routes/catalog')('ability'));
app.use('/items', require('./routes/catalog')('item'));
app.use('/stats', require('./routes/stats'));
app.use("/anil",       anilRoutes);
const writeAccess = require('./middleware/write-access');
app.use("/custom",     writeAccess, customRoutes);
app.use('/teams', writeAccess, require('./routes/team-tools'));
app.use("/teams",      writeAccess, teamsRoutes);
app.use("/calculator", writeAccess, calculatorRoutes);

// ─── Root ────────────────────────────────────────────────────────────────────
app.get("/", (_req, res) => {
  res.json({
    nome: "🎮 Pokémon Anil API",
    versao: require('./package.json').version,
    descricao: "API própria do Pokémon Añil/PT-BR, com dados locais do jogo.",
    dataset_ativo: require('./lib/game-data').datasetId,
    compilacao: require('./lib/dataset-resources').loadResource('metadata'),
    base_url: `http://localhost:${PORT}`,
    endpoints: {
      "📘 Pokémon": {
        "GET /pokemon/:id":           "Dados extra?dos do jogo",
        "GET /pokemon/:id/moves":     "Todos os moves aprendíveis",
        "GET /pokemon/:id/evolution": "Cadeia evolutiva com mudanças do Anil",
        "GET /pokemon/search/:name":  "Busca por nome",
      },
      "⚔️  Golpes": {
        "GET /moves/:name":          "Dados completos de um golpe",
        "GET /moves/type/:type":     "Golpes por tipo",
        "GET /moves/category/:cat":  "physical | special | status",
      },
      "🔥 Tipos": {
        "GET /types":                    "Lista todos os tipos",
        "GET /types/:name":              "Efetividade de um tipo",
        "GET /types/matchup/:atk/:def":  "Multiplicador entre dois tipos",
      },
      "🎮 Pokémon Anil": {
        "GET /anil":                         "Visão geral",
        "GET /anil/modes/:id":               "Modos de jogo",
        "GET /anil/starters/:gen":           "Starters gen1–gen9",
        "GET /anil/mechanics/:id":           "Mecânicas exclusivas",
        "GET /anil/evolution-changes/:name": "Evoluções alteradas",
        "GET /anil/key-items":               "Substitutos dos HMs",
        "GET /anil/gyms":                    "Ginásios + level cap",
        "GET /anil/postgame":                "Pós-jogo",
        "GET /anil/faq/search?q=":          "Busca no FAQ",
      },
      "🗃️  Banco de Dados (Custom)": {
        "GET  /custom":            "Lista dados customizados (filtros: categoria, q)",
        "GET  /custom/categorias": "Categorias e contagens",
        "GET  /custom/:chave":     "Um registro por chave",
        "POST /custom":            "Criar registro { categoria, chave, nome, dados, fonte }",
        "PUT  /custom/:chave":     "Atualizar registro",
        "DEL  /custom/:chave":     "Remover registro",
      },
      "👥 Times": {
        "GET  /teams":                    "Listar times (filtro: modo)",
        "GET  /teams/:id":                "Time completo com membros",
        "GET  /teams/:id/stats":          "Stats reais calculados de cada membro",
        "POST /teams":                    "Criar time { nome, modo_anil, descricao }",
        "PUT  /teams/:id":                "Atualizar time",
        "POST /teams/:id/members":        "Adicionar/substituir membro no slot",
        "DEL  /teams/:id/members/:slot":  "Remover membro de um slot",
        "POST /teams/:id/clone":          "Clonar time",
        "DEL  /teams/:id":               "Deletar time",
      },
      "💥 Calculadora de Dano": {
        "POST /calculator":          "Calcular dano { atacante, defensor, move, nivel, critico... }",
        "GET  /calculator/history":  "Histórico de cálculos (filtros: atacante, defensor, limit)",
        "GET  /calculator/history/:id": "Resultado completo de um cálculo",
        "DEL  /calculator/history":  "Limpar histórico",
      },
    },
    banco_de_dados: "SQLite — pokemon_anil.db (criado automaticamente na pasta /database)",
    seed: "Execute 'node database/seed.js' para popular o banco com dados do anil.json",
    fontes: {
      dados_jogo: "Compilação fornecida pelo usuário: Azul/PT-BR 4.0.6 (interna 4.0.3)",
      pokemon_anil: "https://lostiefangames.blogspot.com/",
    },
  });
});

// ─── 404 ────────────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ erro: "Endpoint não encontrado.", dica: "GET / para ver todos os endpoints." });
});

// ─── Error handler ───────────────────────────────────────────────────────────
app.use(require('./middleware/error-handler'));

// ─── Start ───────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🎮 Pokémon Anil API v2.0 — http://localhost:${PORT}`);
  console.log(`📖 Docs:        GET /`);
  console.log(`💥 Calculadora: POST /calculator`);
  console.log(`👥 Times:       GET /teams`);
  console.log(`🗃️  Custom DB:   GET /custom\n`);
});

module.exports = app;
