import { z } from 'zod';
import { projectIdStr, providerType } from './common.js';

export const agentSchemas: Record<string, z.ZodType> = {
  'POST /start': z.object({
    projectId: projectIdStr,
    task: z.string().min(1, 'task is required'),
    model: z.string().optional(),
    maxIterations: z.number().int().min(1).max(10000).optional(),
    stepDelayMs: z.number().int().min(0).optional(),
    autoApproveChanges: z.boolean().optional(),
    autoAnswerQuestions: z.boolean().optional(),
    continuousMode: z.boolean().optional(),
    cooldownMs: z.number().int().min(0).optional(),
    bypassRateLimits: z.boolean().optional(),
    enableSmartChunking: z.boolean().optional(),
    provider: providerType,
    contextWindow: z.number().int().positive().optional(),
    checkpointEvery: z.number().int().min(1).optional(),
    autoFixErrors: z.boolean().optional(),
    autoRunTests: z.boolean().optional(),
    analyzeCodebase: z.boolean().optional(),
  }),
  'POST /message': z.object({
    message: z.string().min(1),
    priority: z.enum(['normal', 'high']).optional(),
  }),
};

export const authSchemas: Record<string, z.ZodType> = {
  'POST /guest': z.object({
    displayName: z.string().max(100).optional(),
  }).optional().default({}),
  'POST /login': z.object({
    pat: z.string().min(1, 'Personal Access Token is required'),
  }),
  'POST /switch': z.object({
    githubUserId: z.number().int().positive(),
  }),
};

export const chatSchemas: Record<string, z.ZodType> = {
  'POST /send': z.object({
    conversationId: z.string().optional(),
    projectId: projectIdStr,
    message: z.string().min(1, 'message is required'),
    model: z.string().min(1, 'model is required'),
    mode: z.string().min(1, 'mode is required'),
    contextFiles: z.array(z.string()).optional(),
    contextMemoryIds: z.array(z.string()).optional(),
    autoInjectMemory: z.boolean().optional(),
  }),
};

export const fleetSchemas: Record<string, z.ZodType> = {
  'POST /start': z.object({
    projectId: projectIdStr,
    task: z.string().min(1, 'task is required'),
    model: z.string().optional(),
    executionMode: z.enum(['local', 'cloud', 'hybrid']).optional(),
    localModelPool: z.array(z.string().min(1)).max(32).optional(),
    cloudModelPool: z.array(z.string().min(1)).max(32).optional(),
    roleModelOverrides: z.record(z.string().min(1)).optional(),
    agentCount: z.number().int().min(2).max(20).optional(),
    continuousMode: z.boolean().optional(),
    cooldownMs: z.number().int().min(0).optional(),
    bypassRateLimits: z.boolean().optional(),
    enableSmartChunking: z.boolean().optional(),
    provider: providerType,
    contextWindow: z.number().int().positive().optional(),
    maxIterationsPerAgent: z.number().int().min(1).optional(),
    enableSubAgents: z.boolean().optional(),
  }),
  'POST /message': z.object({
    message: z.string().min(1),
    agentId: z.string().optional(),
    priority: z.enum(['normal', 'high']).optional(),
  }),
};
