export type ToolPolicyDecision = 'allowed' | 'requires_review' | 'blocked';

export interface ToolPolicyAssessmentInput {
  toolName: string;
  actionType?: string;
  command?: string;
  targetPath?: string;
  writeOperation?: boolean;
  networkOperation?: boolean;
}

export interface ToolPolicyAssessment {
  decision: ToolPolicyDecision;
  reasons: string[];
  riskScore: number;
  normalized: {
    toolName: string;
    actionType: string;
  };
}

const BLOCKED_COMMAND_PATTERNS: RegExp[] = [
  /\brm\s+-rf\b/i,
  /\bgit\s+reset\s+--hard\b/i,
  /\bgit\s+checkout\s+--\b/i,
  /\bdel\s+\/f\s+\/s\s+\/q\b/i,
  /\bformat\s+[a-z]:\b/i,
];

const HIGH_RISK_PATH_PATTERNS: RegExp[] = [
  /\.env(\.|$)/i,
  /id_rsa/i,
  /secrets?/i,
  /credentials?/i,
  /token/i,
];

function normalizeActionType(input: ToolPolicyAssessmentInput): string {
  if (input.actionType?.trim()) return input.actionType.trim().toLowerCase();
  if (input.writeOperation) return 'write';
  if (input.command?.trim()) return 'command';
  return 'read';
}

export function assessToolPolicy(input: ToolPolicyAssessmentInput): ToolPolicyAssessment {
  const reasons: string[] = [];
  let riskScore = 0;
  const actionType = normalizeActionType(input);
  const toolName = input.toolName.trim();

  const command = input.command?.trim() ?? '';
  if (command) {
    riskScore += 10;
    if (BLOCKED_COMMAND_PATTERNS.some((pattern) => pattern.test(command))) {
      reasons.push('Command contains blocked destructive pattern.');
      return {
        decision: 'blocked',
        reasons,
        riskScore: 100,
        normalized: { toolName, actionType },
      };
    }

    if (/\b(npm|pnpm|yarn)\s+(install|add)\b/i.test(command)) {
      riskScore += 20;
      reasons.push('Dependency mutation command should be reviewed.');
    }
  }

  if (input.writeOperation || actionType === 'write' || actionType === 'delete') {
    riskScore += 25;
    reasons.push('Write/delete action detected.');
  }

  if (input.networkOperation) {
    riskScore += 15;
    reasons.push('Network operation detected.');
  }

  const targetPath = input.targetPath?.trim() ?? '';
  if (targetPath) {
    if (targetPath.includes('..')) {
      riskScore += 40;
      reasons.push('Path traversal pattern detected.');
    }

    if (HIGH_RISK_PATH_PATTERNS.some((pattern) => pattern.test(targetPath))) {
      riskScore += 35;
      reasons.push('Target path appears sensitive.');
    }
  }

  if (riskScore >= 70) {
    return {
      decision: 'blocked',
      reasons: reasons.length ? reasons : ['Policy blocked due to high combined risk.'],
      riskScore,
      normalized: { toolName, actionType },
    };
  }

  if (riskScore >= 25) {
    return {
      decision: 'requires_review',
      reasons: reasons.length ? reasons : ['Policy requires manual review.'],
      riskScore,
      normalized: { toolName, actionType },
    };
  }

  return {
    decision: 'allowed',
    reasons: reasons.length ? reasons : ['No policy issues detected.'],
    riskScore,
    normalized: { toolName, actionType },
  };
}

export function getToolPolicySnapshot() {
  return {
    blockedCommandPatterns: [
      'rm -rf',
      'git reset --hard',
      'git checkout --',
      'del /f /s /q',
      'format <drive>',
    ],
    highRiskPathHints: ['.env', 'id_rsa', 'secret', 'credential', 'token'],
    decisions: ['allowed', 'requires_review', 'blocked'] as ToolPolicyDecision[],
  };
}
