// ============================================
// Code Analysis Helpers — purity scoring and
// domain classification for extracted symbols
// Extracted from relationshipIndex.ts for modularity
// ============================================

/**
 * Estimate the purity score for a symbol (0..1, 1 = pure).
 * Checks for side-effect indicators in the function body.
 */
export function estimatePurityScore(code: string, symbolName: string, _language: string): number {
  const bodyMatch = new RegExp(`(?:function|def|fn|func)\\s+${symbolName}[^{]*\\{([\\s\\S]*?)\\}`, 'i').exec(code);
  const body = bodyMatch?.[1] || '';

  let score = 1.0;

  const sideEffects = [
    /\b(?:console|print|write|log|emit|dispatch|send|post|put|delete|fetch|request)\b/i,
    /\b(?:fs|file|socket|net|http|database|db|sql|query)\b/i,
    /\b(?:global|window|document|process|env|this\.)\b/i,
    /\b(?:Math\.random|Date\.now|new Date)\b/i,
    /\b(?:throw|error|reject|abort)\b/i,
    /\b(?:setState|setStore|dispatch|commit|mutate)\b/i,
  ];

  for (const pattern of sideEffects) {
    if (pattern.test(body)) score -= 0.15;
  }

  return Math.max(0, Math.min(1, score));
}

/**
 * Classify the domain of a symbol based on file path and name.
 * Returns a domain string like 'auth', 'database', 'ui', etc.
 */
export function detectDomain(filePath: string, symbolName: string): string {
  const path = filePath.toLowerCase();
  const name = symbolName.toLowerCase();
  const combined = path + ' ' + name;

  const domainPatterns: Record<string, RegExp> = {
    'auth': /auth|login|logout|session|token|permission|role|oauth|jwt/,
    'database': /db|database|sql|query|model|schema|migration|repository|dao/,
    'api': /api|route|endpoint|controller|handler|middleware|rest|graphql/,
    'ui': /component|view|page|layout|widget|render|style|css|theme|ui/,
    'testing': /test|spec|mock|stub|fixture|assert|expect/,
    'config': /config|setting|env|option|preference/,
    'networking': /http|fetch|request|socket|websocket|stream|client/,
    'filesystem': /file|fs|path|dir|read|write|io/,
    'crypto': /crypt|hash|encrypt|decrypt|sign|verify|cipher/,
    'rendering': /render|draw|paint|canvas|gl|shader|mesh|scene|camera/,
    'physics': /physics|collision|body|force|velocity|gravity|rigidbody/,
    'audio': /audio|sound|music|play|volume|tone|synth/,
    'ai': /ai|model|predict|train|neural|embed|vector|llm|agent/,
    'data': /parse|serialize|json|xml|csv|yaml|format|transform/,
    'util': /util|helper|common|shared|lib|tool|misc/,
    'state': /store|state|reducer|action|context|signal|observable/,
    'build': /build|compile|bundle|pack|webpack|vite|rollup/,
    'deploy': /deploy|ci|cd|docker|container|k8s|cloud/,
  };

  for (const [domain, pattern] of Object.entries(domainPatterns)) {
    if (pattern.test(combined)) return domain;
  }

  return 'general';
}
