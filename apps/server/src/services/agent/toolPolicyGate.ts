// ============================================================
// ToolPolicyGate
// Central policy object that sits between the planner (LLM)
// and the action layer (tool execution).
//
// Every agent tool call MUST pass through evaluatePolicy() before
// execution. The gate can ALLOW, DENY, or REQUIRE_APPROVAL for
// any action based on who is calling, what tool is targeted, and
// what the source context is.
//
// This is the primary defense against prompt-injection attacks
// where malicious web content or user input tries to make the
// agent perform unintended file writes, network calls, etc.
// ============================================================

export type ToolName =
  | 'read_file'
  | 'write_file'
  | 'delete_file'
  | 'create_file'
  | 'web_search'
  | 'fetch_page'
  | 'run_tests'
  | 'run_lint'
  | 'run_shell'
  | 'nano_train'
  | 'mesh_connect'
  | 'spawn_agent'
  | 'execute_skill';

export type ActorId = 'agent' | 'user' | 'nano' | 'system' | 'midwife' | 'peer';

/**
 * The "taint level" of the context that generated this tool request.
 * Instructions from web content are highest-risk (web/peer).
 * Instructions from the local project files are lower risk (local_file).
 * Instructions from the authenticated user are trusted (user).
 */
export type ContextTaint =
  | 'user'          // Came from an authenticated user session
  | 'local_file'    // Came from reading a local project file
  | 'model_output'  // Came from an LLM response (no web involvement)
  | 'web'           // Came from web-fetched content — HIGH RISK
  | 'peer';         // Came from a mesh peer — HIGH RISK

export interface PolicyRequest {
  actor: ActorId;
  tool: ToolName;
  /** Path, URL, peer ID, or other target identifier */
  target: string;
  /** Human-readable reason the agent is trying to use this tool */
  reason: string;
  /** Taint level of the context that produced this request */
  sourceContext: ContextTaint;
}

export interface PolicyDecision {
  allow: boolean;
  requiresApproval: boolean;
  reason: string;
  /** Any redactions that were or should be applied */
  redactionsApplied: string[];
  /** Unique ID for audit log correlation */
  auditId: string;
}

// ─── Tools that must be explicitly enabled and never run by default ──────────
// These are "high-blast-radius" tools: web network access, mesh connectivity,
// agent spawning. They default to off to minimise the attack surface.
const DEFAULT_DISABLED_TOOLS: Set<ToolName> = new Set([
  'web_search',
  'fetch_page',
  'mesh_connect',
  'spawn_agent',
  'run_shell',
]);

// ─── Tools that require human approval when context is tainted ───────────────
const APPROVAL_REQUIRED_WHEN_TAINTED: Set<ToolName> = new Set([
  'write_file',
  'delete_file',
  'create_file',
  'run_tests',
  'run_lint',
  'nano_train',
]);

// ─── Runtime feature flags (can be toggled per-project in config) ────────────
const enabledTools: Set<ToolName> = new Set([
  'read_file',
  'write_file',
  'delete_file',
  'create_file',
  'run_tests',
  'run_lint',
  'nano_train',
  'execute_skill',  // skill execution is low blast-radius — enabled by default
]);

/** Enable a previously-disabled tool at runtime (e.g. user turns on web search) */
export function enableTool(tool: ToolName): void {
  enabledTools.add(tool);
}

/** Disable a tool at runtime */
export function disableTool(tool: ToolName): void {
  enabledTools.delete(tool);
}

/** Check if a tool is currently enabled */
export function isToolEnabled(tool: ToolName): boolean {
  if (DEFAULT_DISABLED_TOOLS.has(tool)) {
    return enabledTools.has(tool);
  }
  return true; // non-risky tools are on by default
}

let _auditCounter = 0;
function nextAuditId(): string {
  return `pol-${Date.now()}-${(++_auditCounter).toString(36)}`;
}

/**
 * Central policy evaluation function.
 * Call this before every agent tool invocation.
 *
 * @example
 * const decision = evaluatePolicy({ actor: 'agent', tool: 'write_file', target: 'src/foo.ts', reason: 'fix lint', sourceContext: 'model_output' });
 * if (!decision.allow) throw new Error(decision.reason);
 */
export function evaluatePolicy(req: PolicyRequest): PolicyDecision {
  const auditId = nextAuditId();
  const redactionsApplied: string[] = [];

  // 1. Tool must be enabled
  if (!isToolEnabled(req.tool)) {
    return {
      allow: false,
      requiresApproval: false,
      reason: `Tool '${req.tool}' is disabled by default. Enable it explicitly in settings before the agent can use it.`,
      redactionsApplied,
      auditId,
    };
  }

  // 2. Tainted context (from web/peer) + destructive tool = require approval
  const tainted = req.sourceContext === 'web' || req.sourceContext === 'peer';
  if (tainted && APPROVAL_REQUIRED_WHEN_TAINTED.has(req.tool)) {
    return {
      allow: false,
      requiresApproval: true,
      reason: `Tool '${req.tool}' on '${req.target}' was requested from a tainted context (${req.sourceContext}). Human approval required to prevent prompt-injection exploitation.`,
      redactionsApplied,
      auditId,
    };
  }

  // 3. Nano / peer actors cannot directly write files
  if ((req.actor === 'nano' || req.actor === 'peer') && (req.tool === 'write_file' || req.tool === 'delete_file')) {
    return {
      allow: false,
      requiresApproval: true,
      reason: `Actor '${req.actor}' is not permitted to '${req.tool}' without explicit user approval.`,
      redactionsApplied,
      auditId,
    };
  }

  // 4. Shell execution is only allowed for 'system' or 'user' actors
  if (req.tool === 'run_shell' && req.actor !== 'system' && req.actor !== 'user') {
    return {
      allow: false,
      requiresApproval: true,
      reason: `Shell execution requested by '${req.actor}' — only 'user' or 'system' actors may run shell commands.`,
      redactionsApplied,
      auditId,
    };
  }

  // All checks passed
  return {
    allow: true,
    requiresApproval: false,
    reason: 'allowed',
    redactionsApplied,
    auditId,
  };
}
