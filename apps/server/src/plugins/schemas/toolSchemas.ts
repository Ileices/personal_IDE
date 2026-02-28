import { z } from 'zod';

export const previewSchemas: Record<string, z.ZodType> = {
  'POST /run': z.object({
    command: z.string().min(1),
    cwd: z.string().optional(),
    timeoutMs: z.number().int().positive().max(300000).optional(),
    stdin: z.string().optional(),
  }),
  'POST /script': z.object({
    language: z.enum(['python', 'node', 'typescript', 'bash', 'powershell']),
    code: z.string().min(1),
    cwd: z.string().optional(),
    timeoutMs: z.number().int().positive().max(300000).optional(),
    args: z.array(z.string()).optional(),
  }),
  'POST /compile': z.object({
    language: z.enum(['cpp', 'c', 'rust', 'go', 'java']),
    sourceFile: z.string().min(1),
    cwd: z.string().optional(),
    timeoutMs: z.number().int().positive().max(300000).optional(),
    args: z.array(z.string()).optional(),
  }),
  'POST /url': z.object({
    url: z.string().url(),
    waitMs: z.number().int().positive().max(30000).optional(),
  }),
};

export const openclawSchemas: Record<string, z.ZodType> = {
  'POST /skills/install': z.object({
    source: z.string().min(1),
  }),
  'POST /skills/execute': z.object({
    skillId: z.string().min(1),
    input: z.record(z.any()).optional(),
  }),
  'POST /workflows': z.object({
    name: z.string().min(1),
    description: z.string().optional(),
    steps: z.array(z.object({
      skillId: z.string(),
      input: z.record(z.any()).optional(),
    })),
  }),
  'POST /workflows/:id/execute': z.object({
    input: z.record(z.any()).optional(),
  }).optional().default({}),
};

export const terminalSchemas: Record<string, z.ZodType> = {
  'POST /sessions': z.object({
    shell: z.string().optional(),
    cwd: z.string().optional(),
    cols: z.number().int().positive().optional(),
    rows: z.number().int().positive().optional(),
  }).optional().default({}),
  'POST /write': z.object({
    sessionId: z.string().min(1),
    input: z.string(),
  }),
  'POST /exec': z.object({
    sessionId: z.string().min(1),
    command: z.string().min(1),
    timeout: z.number().int().positive().optional(),
  }),
  'POST /resize': z.object({
    sessionId: z.string().min(1),
    cols: z.number().int().positive(),
    rows: z.number().int().positive(),
  }),
};
