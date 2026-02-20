// ============================================
// Server Entry Point - Fastify with all plugins
// ============================================
import Fastify from 'fastify';
import cors from '@fastify/cors';
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
    origin: [appConfig.frontend.url, 'http://localhost:5173', 'http://localhost:3000'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  });

  // Decorate with shared dependencies
  app.decorate('db', db);
  app.decorate('config', appConfig);

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
  // Health check
  app.get('/api/health', async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '0.1.0',
  }));

  // Start server
  try {
    await app.listen({
      port: appConfig.server.port,
      host: appConfig.server.host,
    });
    console.log(`\n🚀 Personal IDE Server running at http://localhost:${appConfig.server.port}`);
    console.log(`📂 API docs: http://localhost:${appConfig.server.port}/api/health`);
    console.log(`🌐 Frontend: ${appConfig.frontend.url}\n`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
