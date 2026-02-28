import { z } from 'zod';
import { projectIdStr } from './common.js';

export const memorySchemas: Record<string, z.ZodType> = {
  'POST /projects': z.object({
    name: z.string().min(1),
    rootPath: z.string().min(1),
    description: z.string().optional(),
  }),
  'POST /notes': z.object({
    projectId: projectIdStr,
    content: z.string().min(1),
    source: z.string().optional(),
    tags: z.array(z.string()).optional(),
    category: z.string().optional(),
    importance: z.number().min(0).max(1).optional(),
  }),
  'POST /notes/search': z.object({
    projectId: projectIdStr,
    query: z.string().min(1),
    sources: z.array(z.string()).optional(),
    tags: z.array(z.string()).optional(),
    limit: z.number().int().positive().optional(),
  }),
  'PUT /notes/:noteId': z.object({
    content: z.string().optional(),
    tags: z.array(z.string()).optional(),
    category: z.string().optional(),
    importance: z.number().min(0).max(1).optional(),
  }),
  'POST /questions/:questionId/resolve': z.object({
    resolution: z.string().min(1),
    answer: z.string().optional(),
  }),
};
