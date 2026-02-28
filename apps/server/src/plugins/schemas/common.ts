// ─── Reusable Zod fragments shared across all route schemas ───
import { z } from 'zod';

export const projectIdStr = z.string().min(1, 'projectId is required');
export const projectRootStr = z.string().min(1, 'projectRoot is required');
export const providerType = z.enum([
  'github', 'openai', 'anthropic', 'google', 'groq',
  'openrouter', 'ollama', 'custom',
]).optional();
