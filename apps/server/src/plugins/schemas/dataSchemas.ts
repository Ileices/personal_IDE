import { z } from 'zod';
import { projectIdStr, projectRootStr } from './common.js';

export const providerSchemas: Record<string, z.ZodType> = {
  'POST /:id': z.object({
    apiKey: z.string().optional(),
    baseUrl: z.string().url().optional(),
    enabled: z.boolean().optional(),
  }),
};

export const checkpointSchemas: Record<string, z.ZodType> = {
  'POST /:projectId/create': z.object({
    projectRoot: projectRootStr,
    description: z.string().optional(),
  }),
  'POST /:projectId/restore': z.object({
    checkpointId: z.string().min(1),
    projectRoot: projectRootStr,
  }),
};

export const errorSchemas: Record<string, z.ZodType> = {
  'POST /check': z.object({ projectRoot: projectRootStr }),
  'POST /test': z.object({ projectRoot: projectRootStr }),
  'POST /stack': z.object({ projectRoot: projectRootStr }),
  'POST /comprehensive': z.object({
    projectId: projectIdStr,
    projectRoot: projectRootStr,
    tokenBudget: z.number().int().positive().optional(),
  }),
  'POST /analysis/scan': z.object({ projectRoot: projectRootStr }),
  'POST /task-plan': z.object({
    projectId: projectIdStr,
    agentRunId: z.string().optional(),
    title: z.string().min(1),
    subtasks: z.array(z.object({
      title: z.string().min(1),
      description: z.string().min(1),
      targetFiles: z.array(z.string()).optional(),
      language: z.string().optional(),
      tokenBudget: z.number().int().positive().optional(),
    })),
  }),
  'PATCH /tasks/:taskId/subtasks/:subtaskIndex': z.object({
    status: z.string().optional(),
    result: z.string().optional(),
    errorOutput: z.string().optional(),
    tokensUsed: z.number().int().optional(),
  }),
};

export const knowledgeSchemas: Record<string, z.ZodType> = {
  'POST /scan': z.object({
    projectId: projectIdStr,
    projectRoot: projectRootStr,
  }),
};

export const tierSchemas: Record<string, z.ZodType> = {
  'POST /detect': z.object({
    projectId: projectIdStr,
    projectRoot: projectRootStr,
  }),
  'POST /decide-language': z.object({
    taskDescription: z.string().min(1),
  }),
};

export const conversationIndexSchemas: Record<string, z.ZodType> = {
  'POST /index': z.object({
    projectId: projectIdStr,
    conversationId: z.string().min(1),
  }),
};
