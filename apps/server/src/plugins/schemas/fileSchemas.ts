import { z } from 'zod';

export const fileSchemas: Record<string, z.ZodType> = {
  'POST /write': z.object({
    root: z.string().min(1),
    path: z.string().min(1),
    content: z.string(),
    backup: z.boolean().optional(),
  }),
  'POST /create': z.object({
    root: z.string().min(1),
    path: z.string().min(1),
    content: z.string().optional(),
  }),
  'DELETE /delete': z.object({
    root: z.string().min(1),
    path: z.string().min(1),
  }),
  'POST /rename': z.object({
    root: z.string().min(1),
    oldPath: z.string().min(1),
    newPath: z.string().min(1),
  }),
};
