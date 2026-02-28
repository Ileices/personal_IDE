// ─── Schema barrel — aggregates all route schema modules ───
import { z } from 'zod';
import { agentSchemas, authSchemas, chatSchemas, fleetSchemas } from './agentSchemas.js';
import { fileSchemas } from './fileSchemas.js';
import { memorySchemas } from './memorySchemas.js';
import {
  providerSchemas, checkpointSchemas, errorSchemas,
  knowledgeSchemas, tierSchemas, conversationIndexSchemas,
} from './dataSchemas.js';
import { ollamaSchemas, nanoSchemas, midwifeSchemas } from './infraSchemas.js';
import { previewSchemas, openclawSchemas, terminalSchemas } from './toolSchemas.js';

// Re-export individual groups for targeted imports
export {
  agentSchemas, authSchemas, chatSchemas, fleetSchemas,
  fileSchemas, memorySchemas,
  providerSchemas, checkpointSchemas, errorSchemas,
  knowledgeSchemas, tierSchemas, conversationIndexSchemas,
  ollamaSchemas, nanoSchemas, midwifeSchemas,
  previewSchemas, openclawSchemas, terminalSchemas,
};

/** Master schema map: API prefix → { "METHOD path" → schema } */
export const schemaMap: Record<string, Record<string, z.ZodType>> = {
  '/api/agent':              agentSchemas,
  '/api/auth':               authSchemas,
  '/api/chat':               chatSchemas,
  '/api/files':              fileSchemas,
  '/api/memory':             memorySchemas,
  '/api/fleet':              fleetSchemas,
  '/api/providers':          providerSchemas,
  '/api/checkpoints':        checkpointSchemas,
  '/api/errors':             errorSchemas,
  '/api/knowledge':          knowledgeSchemas,
  '/api/tiers':              tierSchemas,
  '/api/conversation-index': conversationIndexSchemas,
  '/api/ollama':             ollamaSchemas,
  '/api/nano':               nanoSchemas,
  '/api/midwife':            midwifeSchemas,
  '/api/preview':            previewSchemas,
  '/api/openclaw':           openclawSchemas,
  '/api/terminal':           terminalSchemas,
};
