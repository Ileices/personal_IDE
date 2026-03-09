// ============================================
// Game Test Harness — Lightweight test runner
// for games and interactive apps built by the agent.
//
// Uses child_process (NOT Playwright/Puppeteer).
// Starts a dev server, waits for it to be ready,
// injects console logging capture, and reports results.
// ============================================
import { spawn, ChildProcess, execSync } from 'child_process';
import { createServer } from 'http';

type EmitFn = (event: any) => void;

const isWindows = process.platform === 'win32';

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
      detached: !isWindows, // For Unix process group kill
    });

    let serverOutput = '';
    let processCrashed = false;

    serverProcess.stdout?.on('data', (data: Buffer) => {
      serverOutput += data.toString();
      if (serverOutput.length > 50000) serverOutput = serverOutput.slice(-20000);
    });
    serverProcess.stderr?.on('data', (data: Buffer) => {
      const text = data.toString();
      serverOutput += text;
      if (serverOutput.length > 50000) serverOutput = serverOutput.slice(-20000);
      // Capture error lines
      if (text.toLowerCase().includes('error') || text.toLowerCase().includes('failed')) {
        result.consoleErrors.push(text.trim().slice(0, 500));
      }
    });

    // Detect early crashes (process exits before server is ready)
    serverProcess.on('exit', (code, signal) => {
      processCrashed = true;
      emit({
        type: 'game_test_crash',
        port,
        exitCode: code,
        signal,
        output: serverOutput.slice(-500),
      });
    });

    serverProcess.on('error', (err) => {
      processCrashed = true;
      result.consoleErrors.push('Process error: ' + err.message);
      emit({ type: 'game_test_error', port, error: err.message });
    });

    // Wait for the server to be ready by polling the port
    const serverReady = await waitForPort(port, startupTimeoutMs, () => processCrashed);
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
    // Clean up the server process — Windows-safe
    if (serverProcess) {
      const pid = serverProcess.pid;
      try {
        if (isWindows && pid) {
          // Windows: taskkill /T kills the entire process tree
          try { execSync(`taskkill /pid ${pid} /T /F`, { stdio: 'ignore', timeout: 5000 }); } catch { /* ignore */ }
        } else if (pid) {
          // Unix: kill the process group
          try { process.kill(-pid, 'SIGTERM'); } catch { /* ignore */ }
          setTimeout(() => {
            try { process.kill(-pid, 'SIGKILL'); } catch { /* ignore */ }
          }, 3000);
        }
        serverProcess.kill('SIGKILL');
      } catch { /* ignore */ }
    }
  }

  return result;
}

/**
 * Poll a TCP port until it's accepting connections, timeout, or early crash.
 */
async function waitForPort(port: number, timeoutMs: number, hasCrashed?: () => boolean): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    // Short-circuit if the process has already crashed
    if (hasCrashed?.()) return false;
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
