// ============================================
// Server Entry Point - Fastify with all plugins
// ============================================
import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import { appConfig } from './config.js';
import { initDatabase } from './db/index.js';
import { authRoutes } from './routes/auth.js';
import { chatRoutes } from './routes/chat.js';
import { filesRoutes } from './routes/files.js';
import { memoryRoutes } from './routes/memory.js';
import { agentRoutes } from './routes/agent.js';
import { modelsRoutes } from './routes/models.js';
import { providersRoutes } from './routes/providers.js';
import { checkpointRoutes } from './routes/checkpoints.js';
import { errorRoutes } from './routes/errors.js';
import { knowledgeRoutes } from './routes/knowledge.js';
import { tierRoutes } from './routes/tiers.js';
import { conversationIndexRoutes } from './routes/conversationIndex.js';
import { ollamaRoutes } from './routes/ollama.js';
import { nanoRoutes } from './routes/nano.js';
import { midwifeRoutes } from './routes/midwife.js';
import { previewRoutes } from './routes/preview.js';
import { fleetRoutes } from './routes/fleet.js';
import { openclawRoutes } from './routes/openclaw.js';
import { terminalRoutes } from './routes/terminal.js';
import { healthRoutes } from './routes/health.js';
import { codeRoutes } from './routes/code.js';
import { corpusRoutes } from './routes/corpus.js';
import { codebaseRoutes } from './routes/codebase.js';
import { blameRoutes } from './routes/blame.js';
import { modelStrategyRoutes } from './routes/modelStrategy.js';
import { subsystemsRoutes } from './routes/subsystems.js';
import { tagRegistryRoutes } from './routes/tagRegistry.js';
import { forensicRoutes } from './routes/forensic.js';
import { spawnAuthorityRoutes } from './routes/spawnAuthority.js';
import { gapAnalysisRoutes } from './routes/gapAnalysis.js';
import { projectStateCrawlerRoutes } from './routes/projectStateCrawler.js';
import { suggestedJobsRoutes } from './routes/suggestedJobs.js';
import { godFactoryRoutes } from './routes/godFactory.js';
import { siliconFactoryRoutes } from './routes/siliconFactory.js';
import { projectFactoryRoutes } from './routes/projectFactory.js';
import { stabilityRoutes } from './routes/stability.js';
import { contextWindowRoutes } from './routes/contextWindow.js';
import { appUpdateRoutes } from './routes/appUpdate.js';
import { featuresRoutes } from './routes/features.js';
import { startNanoLiaisonAgent } from './services/nanoLiaison/index.js';
import { startSubsystemScheduler } from './services/subsystemScheduler.js';
import { startSiliconFactorySupervisor } from './services/siliconFactory/index.js';
import { runSuggestedJobsCrawlerTick, runSandboxTick } from './services/suggestedJobsCrawler/index.js';
import csrfPlugin from './plugins/csrf.js';
import { validationPlugin } from './plugins/validation.js';
import { registerGracefulShutdown } from './plugins/gracefulShutdown.js';

const LOCAL_DEV_ORIGIN_RE = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i;

async function main() {
  // Initialize the database
  const db = initDatabase(appConfig.db.path);

  // Create Fastify instance
  const app = Fastify({
    logger: {
      level: 'info',
      transport: {
        target: 'pino-pretty',
        options: { colorize: true },
      },
    },
    bodyLimit: 10 * 1024 * 1024, // 10MB body limit
  });

  // CORS - allow frontend
  await app.register(cors, {
    origin: (origin, cb) => {
      // Allow configured frontend URL, same-origin (no origin header), and dev servers
      const allowed = [
        appConfig.frontend.url,
        'http://localhost:5173',
        'http://localhost:3000',
      ];
      if (!origin || allowed.includes(origin) || LOCAL_DEV_ORIGIN_RE.test(origin)) {
        cb(null, true);
      } else {
        cb(null, false);
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  });

  // CSRF protection — validates Origin/Referer on state-changing requests
  await app.register(csrfPlugin, {
    allowedOrigins: [
      appConfig.frontend.url,
      'http://localhost:5173',
      'http://localhost:3000',
    ],
    exemptPaths: ['/api/health'],
  });

  // Decorate with shared dependencies
  app.decorate('db', db);
  app.decorate('config', appConfig);

  // WebSocket support for real-time agent/fleet events
  await app.register(websocket);

  // Zod request body validation for all routes
  await app.register(validationPlugin);

  // Register route modules
  await app.register(authRoutes, { prefix: '/api/auth' });
  await app.register(chatRoutes, { prefix: '/api/chat' });
  await app.register(filesRoutes, { prefix: '/api/files' });
  await app.register(memoryRoutes, { prefix: '/api/memory' });
  await app.register(agentRoutes, { prefix: '/api/agent' });
  await app.register(modelsRoutes, { prefix: '/api/models' });
  await app.register(providersRoutes, { prefix: '/api/providers' });
  await app.register(checkpointRoutes, { prefix: '/api/checkpoints' });
  await app.register(errorRoutes, { prefix: '/api/errors' });
  await app.register(knowledgeRoutes, { prefix: '/api/knowledge' });
  await app.register(tierRoutes, { prefix: '/api/tiers' });
  await app.register(conversationIndexRoutes, { prefix: '/api/conversation-index' });
  await app.register(ollamaRoutes, { prefix: '/api/ollama' });
  await app.register(nanoRoutes, { prefix: '/api/nano' });
  await app.register(midwifeRoutes, { prefix: '/api/midwife' });
  await app.register(previewRoutes, { prefix: '/api/preview' });
  await app.register(fleetRoutes, { prefix: '/api/fleet' });
  await app.register(openclawRoutes, { prefix: '/api/openclaw' });
  await app.register(terminalRoutes, { prefix: '/api/terminal' });

  // Code intelligence + corpus endpoints
  await app.register(codeRoutes, { prefix: '/api/code' });
  await app.register(corpusRoutes, { prefix: '/api/corpus' });

  // THE GOD FACTORY — IDE self-modification API (codebase read/search/write/exec)
  await app.register(codebaseRoutes, { prefix: '/api/codebase' });

  // BLAME — model attribution + quality forensics
  await app.register(blameRoutes, { prefix: '/api/blame' });

  // Model strategy — authoritative fallback and primary-model settings
  await app.register(modelStrategyRoutes, { prefix: '/api/model-strategy' });

  // Subsystems — unified control plane for crawlers/analysis
  await app.register(subsystemsRoutes, { prefix: '/api/subsystems' });

  // Tag Registry — devtags, plantags, buildtags, relationship validation
  await app.register(tagRegistryRoutes, { prefix: '/api/tags' });

  // Forensic — all forensic table reads + sub-agent invocations
  await app.register(forensicRoutes, { prefix: '/api/forensic' });

  // Spawn Authority — check spawn permissions, view violations
  await app.register(spawnAuthorityRoutes, { prefix: '/api/spawn' });

  // Gap Analysis — coverage, patterns, debt, tag system, agent performance
  await app.register(gapAnalysisRoutes, { prefix: '/api/gap' });

  // Project State Crawler — deterministic devtag extraction + drift detection
  await app.register(projectStateCrawlerRoutes, { prefix: '/api/project-state-crawler' });

  // Suggested Jobs System — codebase review protocols + implementation pipeline
  await app.register(suggestedJobsRoutes, { prefix: '/api/suggested-jobs' });

  // God Factory Agent — notification queue, idle suggestions, brainstorm, model/background status
  await app.register(godFactoryRoutes, { prefix: '/api/god-factory' });

  // Silicon Factory — autonomous task ledger, handshake protocol, cold-boot recovery
  await app.register(siliconFactoryRoutes, { prefix: '/api/silicon-factory' });

  // Project Factory — scaffold, import analysis, milestone/quality history
  await app.register(projectFactoryRoutes, { prefix: '/api/project-factory' });

  // Stability Monitor — rolling 10-cycle health window, auto-rollback triggers
  await app.register(stabilityRoutes, { prefix: '/api/stability' });

  // Context Window Manager — priority-based context assembly with budget enforcement
  await app.register(contextWindowRoutes, { prefix: '/api/context-window' });

  // App Update — git pull from GitHub origin/main
  await app.register(appUpdateRoutes);

  // Feature Flags — runtime toggle for security-gated capabilities
  await app.register(featuresRoutes);

  // Health — rich diagnostic endpoint (replaces inline handler)
  await app.register(healthRoutes);

  // Start server
  try {
    await app.listen({
      port: appConfig.server.port,
      host: appConfig.server.host,
    });

    // Register graceful shutdown handlers after server starts
    registerGracefulShutdown(app);

    console.log(`\n🚀 Personal IDE Server running at http://localhost:${appConfig.server.port}`);
    console.log(`📂 API docs: http://localhost:${appConfig.server.port}/api/health`);
    console.log(`🌐 Frontend: ${appConfig.frontend.url}\n`);

    startSubsystemScheduler(db);
    try {
      startNanoLiaisonAgent(db, { nanoPort: 5100 });
    } catch (err) {
      app.log.warn('Nano Liaison Agent did not start: ' + err);
    }
    try {
      startSiliconFactorySupervisor(db);
    } catch (err) {
      app.log.error(err);
      app.log.warn('Silicon Factory supervisor did not start (migration likely pending or failed).');
    }

    // Suggested Jobs Crawler — runs every 2 minutes, alternating crawler ticks + sandbox ticks
    let sjTickCounter = 0;
    setInterval(() => {
      try {
        if (sjTickCounter % 2 === 0) {
          runSuggestedJobsCrawlerTick(db);
        } else {
          runSandboxTick(db);
        }
        sjTickCounter++;
      } catch { /* non-fatal */ }
    }, 2 * 60 * 1000);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
