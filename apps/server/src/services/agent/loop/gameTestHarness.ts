// ============================================
// Game Test Harness — Lightweight test runner
// for games and interactive apps built by the agent.
//
// Uses child_process (NOT Playwright/Puppeteer).
// Starts a dev server, waits for it to be ready,
// injects console logging capture, and reports results.
// ============================================
import { spawn, ChildProcess } from 'child_process';
import { createServer } from 'http';

type EmitFn = (event: any) => void;

export interface GameTestConfig {
  /** Project root where the game lives */
  projectRoot: string;
  /** Command to start the dev server (e.g., "npm run dev") */
  startCommand: string;
  /** Port the server listens on */
  port: number;
  /** How long to wait for server to be ready (ms) */
  startupTimeoutMs?: number;
  /** How long to let the game run before capturing results (ms) */
  runDurationMs?: number;
}

export interface GameTestResult {
  serverStarted: boolean;
  serverUrl: string;
  startupTimeMs: number;
  consoleErrors: string[];
  networkErrors: string[];
  serverOutput: string;
  timedOut: boolean;
}

/**
 * Run a lightweight game/app test:
 * 1. Start the dev server via child_process
 * 2. Wait for it to respond on the configured port
 * 3. Collect any stderr/error output
 * 4. Check if the port is reachable via HTTP
 * 5. Report results
 */
export async function runGameTest(
  config: GameTestConfig,
  emit: EmitFn,
): Promise<GameTestResult> {
  const {
    projectRoot,
    startCommand,
    port,
    startupTimeoutMs = 30000,
    runDurationMs = 5000,
  } = config;

  const result: GameTestResult = {
    serverStarted: false,
    serverUrl: `http://localhost:${port}`,
    startupTimeMs: 0,
    consoleErrors: [],
    networkErrors: [],
    serverOutput: '',
    timedOut: false,
  };

  let serverProcess: ChildProcess | null = null;

  try {
    emit({ type: 'game_test_start', command: startCommand, port });

    // Parse command
    const parts = startCommand.split(' ');
    const cmd = parts[0];
    const args = parts.slice(1);

    // Start the dev server
    const startTime = Date.now();
    serverProcess = spawn(cmd, args, {
      cwd: projectRoot,
      shell: true,
      env: { ...process.env, PORT: String(port) },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let serverOutput = '';
    serverProcess.stdout?.on('data', (data: Buffer) => {
      serverOutput += data.toString();
    });
    serverProcess.stderr?.on('data', (data: Buffer) => {
      const text = data.toString();
      serverOutput += text;
      // Capture error lines
      if (text.toLowerCase().includes('error') || text.toLowerCase().includes('failed')) {
        result.consoleErrors.push(text.trim().slice(0, 500));
      }
    });

    // Wait for the server to be ready by polling the port
    const serverReady = await waitForPort(port, startupTimeoutMs);
    result.startupTimeMs = Date.now() - startTime;

    if (!serverReady) {
      result.timedOut = true;
      result.serverOutput = serverOutput.slice(-2000);
      emit({ type: 'game_test_timeout', port, timeMs: result.startupTimeMs });
      return result;
    }

    result.serverStarted = true;
    emit({ type: 'game_test_server_ready', port, timeMs: result.startupTimeMs });

    // Let the server run for a bit to collect any runtime errors
    await new Promise(r => setTimeout(r, runDurationMs));

    // Try an HTTP GET to verify it's serving content
    try {
      const response = await fetch(`http://localhost:${port}/`);
      if (!response.ok) {
        result.networkErrors.push(`HTTP ${response.status}: ${response.statusText}`);
      }
    } catch (fetchErr: any) {
      result.networkErrors.push(`Fetch error: ${fetchErr.message}`);
    }

    result.serverOutput = serverOutput.slice(-2000);

    emit({
      type: 'game_test_complete',
      serverStarted: true,
      errors: result.consoleErrors.length + result.networkErrors.length,
      startupTimeMs: result.startupTimeMs,
    });

  } finally {
    // Clean up the server process
    if (serverProcess && !serverProcess.killed) {
      serverProcess.kill('SIGTERM');
      // Force kill after 3s if it doesn't exit
      setTimeout(() => {
        if (serverProcess && !serverProcess.killed) {
          serverProcess.kill('SIGKILL');
        }
      }, 3000);
    }
  }

  return result;
}

/**
 * Poll a TCP port until it's accepting connections or timeout.
 */
async function waitForPort(port: number, timeoutMs: number): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(`http://localhost:${port}/`, {
        signal: AbortSignal.timeout(2000),
      });
      // Any response means the server is up (even 404)
      return true;
    } catch {
      // Not ready yet — wait and retry
      await new Promise(r => setTimeout(r, 1000));
    }
  }
  return false;
}

/**
 * Format game test results for LLM consumption.
 */
export function formatGameTestForLLM(result: GameTestResult): string {
  let output = '\n--- GAME TEST RESULTS ---\n';
  output += `Server URL: ${result.serverUrl}\n`;
  output += `Server started: ${result.serverStarted ? '✅ Yes' : '❌ No'}\n`;
  output += `Startup time: ${result.startupTimeMs}ms\n`;

  if (result.timedOut) {
    output += '⚠️ Server failed to start within timeout period.\n';
  }

  if (result.consoleErrors.length > 0) {
    output += `\nConsole Errors (${result.consoleErrors.length}):\n`;
    for (const err of result.consoleErrors.slice(0, 5)) {
      output += `  ❌ ${err}\n`;
    }
  }

  if (result.networkErrors.length > 0) {
    output += `\nNetwork Errors (${result.networkErrors.length}):\n`;
    for (const err of result.networkErrors) {
      output += `  ❌ ${err}\n`;
    }
  }

  if (result.consoleErrors.length === 0 && result.networkErrors.length === 0 && result.serverStarted) {
    output += '✅ No errors detected. Server is running and serving content.\n';
  }

  if (result.serverOutput) {
    output += `\nServer Output (last 1000 chars):\n${result.serverOutput.slice(-1000)}\n`;
  }

  output += '--- END GAME TEST ---\n';
  return output;
}
