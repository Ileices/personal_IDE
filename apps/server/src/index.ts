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
import csrfPlugin from './plugins/csrf.js';
import { validationPlugin } from './plugins/validation.js';
import { registerGracefulShutdown } from './plugins/gracefulShutdown.js';

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
      if (!origin || allowed.includes(origin)) {
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
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
