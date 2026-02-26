// ============================================
// Loop Detector - Detects when agent is stuck
// repeating the same actions and forces creative
// self-prompting to break out
// ============================================
import * as crypto from 'crypto';

interface LoopEntry {
  iteration: number;
  taskHash: string;
  responseHash: string;
  summary: string;
  timestamp: number;
}

export class LoopDetector {
  private history: LoopEntry[] = [];
  private maxHistory = 20;
  private repeatThreshold = 3; // Same hash N times = stuck

  /** Record an iteration's task and response */
  record(iteration: number, task: string, response: string, summary: string): void {
    const taskHash = this.hash(this.normalize(task));
    const responseHash = this.hash(this.normalize(response).slice(0, 2000));

    this.history.push({
      iteration,
      taskHash,
      responseHash,
      summary: summary.slice(0, 200),
      timestamp: Date.now(),
    });

    // Keep only recent history
    if (this.history.length > this.maxHistory) {
      this.history = this.history.slice(-this.maxHistory);
    }
  }

  /** Check if the agent is stuck in a loop */
  isStuck(): { stuck: boolean; pattern?: string; count?: number } {
    if (this.history.length < this.repeatThreshold) {
      return { stuck: false };
    }

    // Check for repeated task hashes
    const recentTasks = this.history.slice(-6).map(h => h.taskHash);
    const taskCounts = this.countOccurrences(recentTasks);
    for (const [hash, count] of Object.entries(taskCounts)) {
      if (count >= this.repeatThreshold) {
        const example = this.history.find(h => h.taskHash === hash);
        return {
          stuck: true,
          pattern: `Repeated task ${count} times: "${example?.summary || 'unknown'}"`,
          count,
        };
      }
    }

    // Check for repeated response hashes
    const recentResponses = this.history.slice(-6).map(h => h.responseHash);
    const responseCounts = this.countOccurrences(recentResponses);
    for (const [hash, count] of Object.entries(responseCounts)) {
      if (count >= this.repeatThreshold) {
        return {
          stuck: true,
          pattern: `Repeated response pattern ${count} times`,
          count,
        };
      }
    }

    // Check for alternating pattern (A-B-A-B)
    if (this.history.length >= 4) {
      const last4 = this.history.slice(-4);
      if (
        last4[0].taskHash === last4[2].taskHash &&
        last4[1].taskHash === last4[3].taskHash &&
        last4[0].taskHash !== last4[1].taskHash
      ) {
        return {
          stuck: true,
          pattern: 'Alternating between two tasks (ping-pong loop)',
          count: 4,
        };
      }
    }

    return { stuck: false };
  }

  /** Generate a creative breakout prompt when stuck */
  generateBreakoutPrompt(
    projectRoot: string,
    originalTask: string,
    loopPattern: string,
    codebaseOverview?: string
  ): string {
    const prompts = [
      this.startMinimalPrompt(originalTask, loopPattern),  // Try simplest approach first
      this.expansionPrompt(originalTask, loopPattern, codebaseOverview),
      this.deepDivePrompt(originalTask, loopPattern),
      this.architecturePrompt(originalTask, loopPattern, codebaseOverview),
    ];

    // Rotate through breakout strategies based on how many times we've broken out
    const breakoutCount = this.history.filter(h => h.summary.includes('BREAKOUT')).length;
    const idx = breakoutCount % prompts.length;
    const prompt = prompts[idx];
    // startMinimal (idx 0) already includes format suffix; append to others
    return idx === 0 ? prompt : prompt + '\n' + this.formatSuffix();
  }

  private expansionPrompt(task: string, pattern: string, overview?: string): string {
    return [
      '⚠️ LOOP DETECTED: You have been repeating the same pattern: ' + pattern,
      '',
      'STOP what you are doing. You are stuck in a loop.',
      '',
      'MANDATORY BREAKOUT STRATEGY — FEATURE EXPANSION:',
      '1. Review the ENTIRE codebase structure and identify the weakest/thinnest feature area',
      '2. Pick ONE specific feature that currently has minimal implementation',
      '3. Plan and implement an ENTERPRISE-GRADE expansion of that feature:',
      '   - Add comprehensive error handling',
      '   - Add input validation',
      '   - Add edge case handling',
      '   - Add logging and observability',
      '   - Add configuration options',
      '   - Add documentation comments',
      '4. Your expanded implementation should be 3-5x the size of the current one',
      '5. Run tests to verify your changes work',
      '',
      overview ? 'Current codebase overview:\n' + overview.slice(0, 2000) : '',
      '',
      'Original task for context: ' + task.slice(0, 500),
      '',
      'DO NOT repeat your previous actions. Take a completely NEW approach.',
      'DO NOT apologize or explain — just write code and output the structured JSON block.',
    ].join('\n');
  }

  private deepDivePrompt(task: string, pattern: string): string {
    return [
      '⚠️ LOOP DETECTED: ' + pattern,
      '',
      'STOP. Take a completely different approach.',
      '',
      'MANDATORY BREAKOUT STRATEGY — DEEP QUALITY REVIEW:',
      '1. Read through every file you have changed so far',
      '2. For each file, identify:',
      '   - Missing error handling',
      '   - Missing input validation',
      '   - Hardcoded values that should be configurable',
      '   - Missing type safety',
      '   - Performance bottlenecks',
      '   - Missing documentation',
      '3. Fix ALL identified issues',
      '4. Add comprehensive unit tests for edge cases',
      '5. Ensure all tests pass',
      '',
      'Original task: ' + task.slice(0, 500),
      '',
      'DO NOT attempt the same approach you just tried. Review and improve quality instead.',
      'DO NOT apologize or explain — just write code and output the structured JSON block.',
    ].join('\n');
  }

  private architecturePrompt(task: string, pattern: string, overview?: string): string {
    return [
      '⚠️ LOOP DETECTED: ' + pattern,
      '',
      'STOP. You need to rethink your approach entirely.',
      '',
      'MANDATORY BREAKOUT STRATEGY — ARCHITECTURAL IMPROVEMENT:',
      '1. Step back and analyze the project architecture',
      '2. Identify architectural weaknesses:',
      '   - Tight coupling between modules',
      '   - Missing abstraction layers',
      '   - Missing error boundaries',
      '   - Missing retry/resilience patterns',
      '   - Missing configuration management',
      '3. Implement ONE significant architectural improvement',
      '4. Refactor existing code to use the new architecture',
      '5. Verify everything still works',
      '',
      overview ? 'Codebase:\n' + overview.slice(0, 1500) : '',
      '',
      'Original task: ' + task.slice(0, 500),
      '',
      'DO NOT apologize or explain — just write code and output the structured JSON block.',
    ].join('\n');
  }

  /** Simple "just create one file" breakout for when the LLM can't follow complex instructions */
  private startMinimalPrompt(task: string, pattern: string): string {
    return [
      'STOP. You are stuck in a loop (' + pattern + ').',
      '',
      'Take the SIMPLEST possible action: create exactly ONE file with code.',
      '',
      'Task: ' + task.slice(0, 500),
      '',
      'Create ONE file with a basic implementation. Do NOT try to do everything at once.',
      'Do NOT apologize. Do NOT explain. Just output code and JSON.',
      this.formatSuffix(),
    ].join('\n');
  }

  /** Schema format examples appended to breakout prompts */
  private formatSuffix(): string {
    return [
      '',
      'YOUR RESPONSE MUST FOLLOW THIS EXACT PATTERN:',
      '--- FILE: src/main.ts ---',
      '```typescript',
      '// your code here',
      '```',
      '--- END FILE ---',
      '',
      '```json:structured_output',
      '{"summary":"Created initial implementation","filesChanged":[{"path":"src/main.ts","action":"created","summary":"Basic implementation"}],"nextSteps":[{"stepNumber":1,"action":"Expand","target":"src/main.ts","detail":"Add features","priority":"high"}],"questionsForUser":[],"done":false,"confidence":70}',
      '```',
    ].join('\n');
  }

  /** Reset the loop detector */
  reset(): void {
    this.history = [];
  }

  private hash(text: string): string {
    return crypto.createHash('md5').update(text).digest('hex').slice(0, 12);
  }

  private normalize(text: string): string {
    return text
      .replace(/\s+/g, ' ')
      .replace(/\d+/g, 'N') // Normalize numbers
      .toLowerCase()
      .trim();
  }

  private countOccurrences(arr: string[]): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const item of arr) {
      counts[item] = (counts[item] || 0) + 1;
    }
    return counts;
  }
}
