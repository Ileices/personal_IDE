import { z } from 'zod';

export const ollamaSchemas: Record<string, z.ZodType> = {
  'POST /test-connection': z.object({
    baseUrl: z.string().optional(),
  }).optional().default({}),
  'POST /pull': z.object({
    model: z.string().min(1),
  }),
  'POST /set-base-url': z.object({
    baseUrl: z.string().min(1),
  }),
};

export const nanoSchemas: Record<string, z.ZodType> = {
  'POST /start': z.object({
    port: z.number().int().positive().optional(),
    host: z.string().optional(),
    checkpointDir: z.string().optional(),
    enableMesh: z.boolean().optional(),
    meshPort: z.number().int().positive().optional(),
    enableGlobalPool: z.boolean().optional(),
    globalPoolUrl: z.string().optional(),
    nanoCategories: z.array(z.string()).optional(),
  }).optional().default({}),
  'POST /restart': z.object({
    port: z.number().int().positive().optional(),
    host: z.string().optional(),
    checkpointDir: z.string().optional(),
    enableMesh: z.boolean().optional(),
    meshPort: z.number().int().positive().optional(),
    enableGlobalPool: z.boolean().optional(),
    globalPoolUrl: z.string().optional(),
    nanoCategories: z.array(z.string()).optional(),
  }).optional().default({}),
  'PUT /config': z.object({
    port: z.number().int().positive().optional(),
    host: z.string().optional(),
    checkpointDir: z.string().optional(),
    enableMesh: z.boolean().optional(),
    meshPort: z.number().int().positive().optional(),
    enableGlobalPool: z.boolean().optional(),
    globalPoolUrl: z.string().optional(),
    nanoCategories: z.array(z.string()).optional(),
  }).optional().default({}),
};

export const midwifeSchemas: Record<string, z.ZodType> = {
  'PUT /config': z.object({
    enabled: z.boolean().optional(),
    checkIntervalMs: z.number().int().positive().optional(),
    maxRetries: z.number().int().min(0).optional(),
    notifyOnRecovery: z.boolean().optional(),
  }),
  'PUT /tasks/:taskType': z.object({
    enabled: z.boolean().optional(),
    intervalMs: z.number().int().positive().optional(),
    config: z.record(z.any()).optional(),
  }),
};
