// ============================================
// DEPRECATED: Legacy GitHub-only LLM Client
// Superseded by providers.ts which supports ALL providers.
// This file re-exports from providers.ts for backward compatibility.
// All new code should import from providers.ts directly.
// ============================================
export {
  createGitHubClient as createLLMClient,
  getClientFromDb,
  getAvailableModels,
} from './providers.js';
