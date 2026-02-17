// ============================================
// Fastify type augmentations
// ============================================
import type Database from 'better-sqlite3';
import type { AppConfig } from './config.js';

declare module 'fastify' {
  interface FastifyInstance {
    db: Database.Database;
    config: AppConfig;
  }
}
