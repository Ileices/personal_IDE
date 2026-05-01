// ============================================
// Preview Routes — App testing & execution
// 
// Allows the agent (and user) to:
// - Run shell commands and capture output
// - Execute Python scripts
// - Open URLs for web app testing
// - Compile and run code (C++, Rust, Go, etc.)
// ============================================
import { FastifyInstance, FastifyRequest } from 'fastify';
import { spawn, ChildProcess, execSync } from 'child_process';
import path from 'path';
import fs from 'fs';

const LOOPBACK_IPS = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

function isLoopbackIp(ip: string): boolean {
  return LOOPBACK_IPS.has(ip);
}

interface RunCommandRequest {
  command: string;
  cwd?: string;
  timeoutMs?: number;
  stdin?: string;
}

interface RunScriptRequest {
  language: 'python' | 'node' | 'typescript' | 'bash' | 'powershell';
  code: string;
  cwd?: string;
  timeoutMs?: number;
  args?: string[];
}

interface CompileAndRunRequest {
  language: 'cpp' | 'c' | 'rust' | 'go' | 'java';
  sourceFile: string;
  cwd?: string;
  timeoutMs?: number;
  args?: string[];
}

interface PreviewUrlRequest {
  url: string;
  waitMs?: number;
}

interface PreviewSmokeRequest {
  url: string;
  paths?: string[];
  requiredText?: string[];
  timeoutMs?: number;
}

const isWindows = process.platform === 'win32';

// ── Active server process registry (prevents leaks) ──
interface TrackedServer {
  pid: number;
  proc: ChildProcess;
  command: string;
  port: number;
  startedAt: string;
}
const activeServers = new Map<number, TrackedServer>();

/** Kill a tracked server by port */
function killTrackedServer(port: number): boolean {
  const entry = activeServers.get(port);
  if (!entry) return false;
  try {
    if (isWindows) {
      // Windows: taskkill with /T to kill the entire tree
      try { execSync(`taskkill /pid ${entry.pid} /T /F`, { stdio: 'ignore', timeout: 5000 }); } catch { /* ignore */ }
    } else {
      // Unix: kill the process group
      try { process.kill(-entry.pid, 'SIGTERM'); } catch { /* ignore */ }
      setTimeout(() => { try { process.kill(-entry.pid, 'SIGKILL'); } catch { /* ignore */ } }, 3000);
    }
    entry.proc.kill('SIGKILL');
  } catch { /* ignore */ }
  activeServers.delete(port);
  return true;
}

// Cleanup all tracked servers on process exit
process.on('exit', () => {
  for (const [port] of activeServers) killTrackedServer(port);
});
process.on('SIGINT', () => {
  for (const [port] of activeServers) killTrackedServer(port);
  process.exit(0);
});
process.on('SIGTERM', () => {
  for (const [port] of activeServers) killTrackedServer(port);
  process.exit(0);
});

function execWithTimeout(cmd: string, cwd: string, timeoutMs: number, stdin?: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    const proc = spawn(isWindows ? 'cmd' : 'sh', isWindows ? ['/c', cmd] : ['-c', cmd], {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: timeoutMs,
      env: { ...process.env, PYTHONUNBUFFERED: '1' },
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
    proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });

    if (stdin) {
      proc.stdin.write(stdin);
      proc.stdin.end();
    }

    proc.on('close', (code) => {
      resolve({
        stdout: stdout.slice(0, 50000),
        stderr: stderr.slice(0, 50000),
        exitCode: code ?? -1,
      });
    });

    proc.on('error', (err) => {
      resolve({ stdout, stderr: stderr + '\n' + err.message, exitCode: -1 });
    });

    // Force kill on timeout
    setTimeout(() => {
      try { proc.kill('SIGKILL'); } catch {}
    }, timeoutMs + 1000);
  });
}

// ── Compiler Detection ──
function detectCompiler(lang: string): string | null {
  const compilers: Record<string, string[]> = {
    cpp: isWindows ? ['g++', 'cl', 'clang++'] : ['g++', 'clang++'],
    c: isWindows ? ['gcc', 'cl', 'clang'] : ['gcc', 'clang'],
    rust: ['rustc'],
    go: ['go'],
    java: ['javac'],
  };

  for (const compiler of compilers[lang] || []) {
    try {
      execSync(`${compiler} --version`, { stdio: 'ignore', timeout: 3000 });
      return compiler;
    } catch {
      // Try next
    }
  }
  return null;
}

export async function previewRoutes(app: FastifyInstance) {
  // These endpoints can execute local commands; restrict access to loopback only.
  app.addHook('onRequest', async (req, reply) => {
    if (!isLoopbackIp(req.ip)) {
      return reply.status(403).send({ error: 'Preview endpoints are only available from localhost' });
    }
  });

  // ── Run arbitrary command ──
  app.post('/run', async (req: FastifyRequest) => {
    const body = req.body as RunCommandRequest;
    if (!body.command) return { error: 'command is required' };
    if (typeof body.command !== 'string' || body.command.length > 2000) {
      return { error: 'command must be a string under 2000 chars' };
    }

    // Validate cwd exists if provided
    const cwd = body.cwd || process.cwd();
    if (body.cwd && !fs.existsSync(body.cwd)) {
      return { error: 'cwd does not exist: ' + body.cwd };
    }

    const timeoutMs = Math.min(Math.max(body.timeoutMs || 30000, 1000), 120000);

    const result = await execWithTimeout(body.command, cwd, timeoutMs, body.stdin);
    return {
      success: result.exitCode === 0,
      ...result,
    };
  });

  // ── Run script in specific language ──
  app.post('/script', async (req: FastifyRequest) => {
    const body = req.body as RunScriptRequest;
    if (!body.language || !body.code) return { error: 'language and code are required' };

    const cwd = body.cwd || process.cwd();
    const timeoutMs = Math.min(body.timeoutMs || 30000, 120000);
    const args = (body.args || []).join(' ');

    let cmd: string;
    switch (body.language) {
      case 'python': {
        // Write to temp file
        const tmpFile = path.join(cwd, `_midwife_temp_${Date.now()}.py`);
        fs.writeFileSync(tmpFile, body.code, 'utf-8');
        cmd = `python "${tmpFile}" ${args}`;
        const result = await execWithTimeout(cmd, cwd, timeoutMs);
        try { fs.unlinkSync(tmpFile); } catch {}
        return { success: result.exitCode === 0, ...result };
      }
      case 'node': {
        const tmpFile = path.join(cwd, `_midwife_temp_${Date.now()}.mjs`);
        fs.writeFileSync(tmpFile, body.code, 'utf-8');
        cmd = `node "${tmpFile}" ${args}`;
        const result = await execWithTimeout(cmd, cwd, timeoutMs);
        try { fs.unlinkSync(tmpFile); } catch {}
        return { success: result.exitCode === 0, ...result };
      }
      case 'typescript': {
        const tmpFile = path.join(cwd, `_midwife_temp_${Date.now()}.ts`);
        fs.writeFileSync(tmpFile, body.code, 'utf-8');
        cmd = `npx tsx "${tmpFile}" ${args}`;
        const result = await execWithTimeout(cmd, cwd, timeoutMs);
        try { fs.unlinkSync(tmpFile); } catch {}
        return { success: result.exitCode === 0, ...result };
      }
      case 'bash':
        cmd = body.code;
        return { success: true, ...(await execWithTimeout(cmd, cwd, timeoutMs)) };
      case 'powershell':
        cmd = `powershell -NoProfile -Command "${body.code.replace(/"/g, '\\"')}"`;
        return { success: true, ...(await execWithTimeout(cmd, cwd, timeoutMs)) };
      default:
        return { error: `Unsupported language: ${body.language}` };
    }
  });

  // ── Compile and run ──
  app.post('/compile', async (req: FastifyRequest) => {
    const body = req.body as CompileAndRunRequest;
    if (!body.language || !body.sourceFile) return { error: 'language and sourceFile are required' };

    const cwd = body.cwd || path.dirname(body.sourceFile);
    const timeoutMs = Math.min(body.timeoutMs || 30000, 120000);
    const args = (body.args || []).join(' ');

    const compiler = detectCompiler(body.language);
    if (!compiler) {
      return { error: `No ${body.language} compiler found. Install one and add to PATH.`, compilers: { available: false } };
    }

    const srcFile = body.sourceFile;
    const baseName = path.basename(srcFile, path.extname(srcFile));
    const outFile = path.join(cwd, baseName + (isWindows ? '.exe' : ''));

    let compileCmd: string;
    let runCmd: string;

    switch (body.language) {
      case 'cpp':
      case 'c':
        compileCmd = `${compiler} -o "${outFile}" "${srcFile}" -std=${body.language === 'cpp' ? 'c++17' : 'c17'}`;
        runCmd = `"${outFile}" ${args}`;
        break;
      case 'rust':
        compileCmd = `rustc -o "${outFile}" "${srcFile}"`;
        runCmd = `"${outFile}" ${args}`;
        break;
      case 'go':
        compileCmd = `go build -o "${outFile}" "${srcFile}"`;
        runCmd = `"${outFile}" ${args}`;
        break;
      case 'java':
        compileCmd = `javac "${srcFile}"`;
        runCmd = `java -cp "${cwd}" ${baseName} ${args}`;
        break;
      default:
        return { error: `Unsupported compile language: ${body.language}` };
    }

    // Compile
    const compileResult = await execWithTimeout(compileCmd, cwd, timeoutMs);
    if (compileResult.exitCode !== 0) {
      return {
        success: false,
        phase: 'compile',
        compiler,
        ...compileResult,
      };
    }

    // Run
    const runResult = await execWithTimeout(runCmd, cwd, timeoutMs);

    // Cleanup binary
    try { if (body.language !== 'java') fs.unlinkSync(outFile); } catch {}

    return {
      success: runResult.exitCode === 0,
      phase: 'run',
      compiler,
      compile: compileResult,
      run: runResult,
    };
  });

  // ── Check URL accessibility ──
  app.post('/url', async (req: FastifyRequest) => {
    const body = req.body as PreviewUrlRequest;
    if (!body.url) return { error: 'url is required' };

    const waitMs = body.waitMs || 2000;

    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), waitMs);
      const res = await fetch(body.url, {
        signal: controller.signal,
        headers: { 'Accept': 'text/html,application/json,*/*' },
      });
      clearTimeout(t);

      const contentType = res.headers.get('content-type') || '';
      const text = await res.text();

      return {
        success: true,
        status: res.status,
        statusText: res.statusText,
        contentType,
        bodyLength: text.length,
        bodyPreview: text.slice(0, 5000),
        headers: Object.fromEntries(res.headers.entries()),
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.message,
        url: body.url,
      };
    }
  });

  // ── Smoke macro: check one or more routes and assert required text ──
  app.post('/macro/smoke', async (req: FastifyRequest) => {
    const body = req.body as PreviewSmokeRequest;
    if (!body?.url) return { success: false, error: 'url is required' };

    const timeoutMs = Math.min(Math.max(body.timeoutMs || 5000, 1000), 20000);
    const base = body.url.replace(/\/$/, '');
    const paths = (body.paths && body.paths.length > 0) ? body.paths : ['/'];
    const required = body.requiredText || [];

    const checks: Array<{ path: string; success: boolean; status?: number; error?: string; foundRequiredText: boolean }> = [];

    for (const p of paths.slice(0, 20)) {
      const fullUrl = `${base}${p.startsWith('/') ? p : `/${p}`}`;
      try {
        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), timeoutMs);
        const res = await fetch(fullUrl, { signal: controller.signal });
        clearTimeout(t);
        const text = await res.text();
        const foundRequiredText = required.every((needle) => text.toLowerCase().includes(String(needle).toLowerCase()));

        checks.push({
          path: p,
          success: res.status >= 200 && res.status < 400,
          status: res.status,
          foundRequiredText,
        });
      } catch (err: any) {
        checks.push({
          path: p,
          success: false,
          error: err.message,
          foundRequiredText: false,
        });
      }
    }

    const ok = checks.every(c => c.success && (required.length === 0 || c.foundRequiredText));
    return {
      success: ok,
      checks,
      summary: {
        total: checks.length,
        passed: checks.filter(c => c.success).length,
        failed: checks.filter(c => !c.success).length,
        requiredTextChecks: required.length,
      },
    };
  });

  // ── Detect available compilers/runtimes ──
  app.get('/capabilities', async () => {
    const capabilities: Record<string, { available: boolean; version?: string }> = {};

    const check = (name: string, cmd: string) => {
      try {
        const result = execSync(cmd, { stdio: ['ignore', 'pipe', 'pipe'], timeout: 3000 });
        capabilities[name] = { available: true, version: result.toString().trim().split('\n')[0] };
      } catch {
        capabilities[name] = { available: false };
      }
    };

    check('python', 'python --version');
    check('node', 'node --version');
    check('npm', 'npm --version');
    check('g++', 'g++ --version');
    check('gcc', 'gcc --version');
    check('rustc', 'rustc --version');
    check('go', 'go version');
    check('java', 'java --version');
    check('javac', 'javac --version');
    check('dotnet', 'dotnet --version');
    check('cmake', 'cmake --version');

    return { capabilities };
  });

  // ── Start a dev server for preview (PID-tracked) ──
  app.post<{ Body: { command: string; cwd?: string; port?: number } }>('/preview/start-server', async (request) => {
    const { command, cwd, port = 5173 } = request.body;

    // Input validation
    if (!command || typeof command !== 'string' || command.length > 1000) {
      return { error: 'command must be a non-empty string under 1000 chars' };
    }
    if (port < 1024 || port > 65535 || !Number.isInteger(port)) {
      return { error: 'port must be an integer between 1024 and 65535' };
    }

    const projectRoot = cwd || process.cwd();
    if (cwd && !fs.existsSync(cwd)) {
      return { error: 'cwd does not exist: ' + cwd };
    }

    // Kill any existing server on this port (tracked by us)
    if (activeServers.has(port)) {
      killTrackedServer(port);
      await new Promise(r => setTimeout(r, 1000)); // let port free up
    }

    // Check if something external is already running on this port
    try {
      await fetch(`http://localhost:${port}/`, { signal: AbortSignal.timeout(2000) });
      return { running: true, url: `http://localhost:${port}`, port, alreadyRunning: true };
    } catch {
      // Port is free, start the server
    }

    return new Promise((resolve) => {
      const proc = spawn(isWindows ? 'cmd' : 'sh', isWindows ? ['/c', command] : ['-c', command], {
        cwd: projectRoot,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, PORT: String(port) },
        detached: !isWindows, // Detach on Unix for process group kill
      });

      let output = '';
      let started = false;
      let crashed = false;

      proc.stdout?.on('data', (d: Buffer) => {
        output += d.toString();
        if (output.length > 50000) output = output.slice(-20000); // cap memory
      });
      proc.stderr?.on('data', (d: Buffer) => {
        output += d.toString();
        if (output.length > 50000) output = output.slice(-20000);
      });

      proc.on('error', (err) => {
        crashed = true;
        activeServers.delete(port);
        if (!started) {
          started = true;
          resolve({ running: false, error: err.message, output: output.slice(-1000) });
        }
      });

      proc.on('exit', (code, signal) => {
        crashed = true;
        activeServers.delete(port);
        if (!started) {
          started = true;
          resolve({ running: false, error: `Process exited early (code=${code}, signal=${signal})`, output: output.slice(-1000) });
        }
      });

      // Track the process immediately
      if (proc.pid) {
        activeServers.set(port, {
          pid: proc.pid,
          proc,
          command,
          port,
          startedAt: new Date().toISOString(),
        });
      }

      // Poll for the server to be ready
      const startTime = Date.now();
      const poller = setInterval(async () => {
        if (crashed) {
          clearInterval(poller);
          return; // Already resolved via exit/error handler
        }
        if (Date.now() - startTime > 30000) {
          clearInterval(poller);
          if (!started) {
            started = true;
            // Don't kill the server — it might still be building
            resolve({ running: false, error: 'Timeout: server not ready after 30s', output: output.slice(-1000), pid: proc.pid });
          }
          return;
        }
        try {
          await fetch(`http://localhost:${port}/`, { signal: AbortSignal.timeout(2000) });
          clearInterval(poller);
          if (!started) {
            started = true;
            resolve({
              running: true,
              url: `http://localhost:${port}`,
              port,
              startupTimeMs: Date.now() - startTime,
              pid: proc.pid,
            });
          }
        } catch { /* not ready yet */ }
      }, 1000);
    });
  });

  // ── Stop a tracked server ──
  app.post<{ Body: { port: number } }>('/preview/stop-server', async (request) => {
    const { port } = request.body;
    if (!port || typeof port !== 'number') {
      return { error: 'port is required (number)' };
    }
    const killed = killTrackedServer(port);
    return { stopped: killed, port };
  });

  // ── List all tracked servers ──
  app.get('/preview/servers', async () => {
    const servers: Array<{ port: number; pid: number; command: string; startedAt: string; alive: boolean }> = [];
    for (const [port, entry] of activeServers) {
      let alive = false;
      try {
        await fetch(`http://localhost:${port}/`, { signal: AbortSignal.timeout(2000) });
        alive = true;
      } catch { /* dead */ }
      servers.push({ port, pid: entry.pid, command: entry.command, startedAt: entry.startedAt, alive });
    }
    return { servers };
  });

  // ── Check server status ──
  app.get<{ Querystring: { port?: string } }>('/preview/status', async (request) => {
    const port = parseInt(request.query.port || '5173', 10);
    try {
      const response = await fetch(`http://localhost:${port}/`, { signal: AbortSignal.timeout(3000) });
      return {
        running: true,
        url: `http://localhost:${port}`,
        port,
        statusCode: response.status,
      };
    } catch (err: any) {
      return {
        running: false,
        url: `http://localhost:${port}`,
        port,
        error: err.message,
      };
    }
  });

  // -- Smart Start -- auto-detect project type and start dev server --
  app.post<{ Body: { projectRoot: string; port?: number } }>('/smart-start', async (request, reply) => {
    const { projectRoot, port = 5173 } = request.body;
    if (!projectRoot) return reply.status(400).send({ error: 'projectRoot is required' });
    if (!fs.existsSync(projectRoot)) return reply.status(400).send({ error: `Project directory not found: ${projectRoot}` });

    // Detect project type
    let command: string;
    let detectedType: string;

    const pkgPath = path.join(projectRoot, 'package.json');
    const cargoPath = path.join(projectRoot, 'Cargo.toml');
    const pyPath = path.join(projectRoot, 'main.py');
    const requirementsPath = path.join(projectRoot, 'requirements.txt');
    const goPath = path.join(projectRoot, 'go.mod');

    if (fs.existsSync(pkgPath)) {
      let scripts: Record<string, string> = {};
      try { scripts = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')).scripts || {}; } catch {}
      if (scripts.dev) { command = 'npm run dev'; detectedType = 'Node.js/Vite (dev)'; }
      else if (scripts.start) { command = 'npm start'; detectedType = 'Node.js (start)'; }
      else if (scripts.serve) { command = 'npm run serve'; detectedType = 'Node.js (serve)'; }
      else { command = 'npm run dev'; detectedType = 'Node.js'; }
    } else if (fs.existsSync(cargoPath)) {
      command = 'cargo run'; detectedType = 'Rust';
    } else if (fs.existsSync(goPath)) {
      command = 'go run .'; detectedType = 'Go';
    } else if (fs.existsSync(pyPath)) {
      const content = fs.readFileSync(pyPath, 'utf-8');
      if (content.includes('fastapi') || content.includes('uvicorn')) {
        command = `uvicorn main:app --reload --port ${port}`; detectedType = 'Python/FastAPI';
      } else if (content.includes('flask')) {
        command = 'python main.py'; detectedType = 'Python/Flask';
      } else {
        command = 'python main.py'; detectedType = 'Python';
      }
    } else if (fs.existsSync(requirementsPath)) {
      command = `python -m uvicorn main:app --reload --port ${port}`; detectedType = 'Python';
    } else {
      return reply.status(400).send({ error: 'Could not detect project type. No package.json, Cargo.toml, go.mod, or main.py found.' });
    }

    // Kill any existing server on the port
    killTrackedServer(port);

    // Start the server process
    const proc = spawn(isWindows ? 'cmd' : 'sh', isWindows ? ['/c', command] : ['-c', command], {
      cwd: projectRoot,
      stdio: 'pipe',
      detached: !isWindows,
      env: { ...process.env, PORT: String(port), VITE_PORT: String(port) },
    });

    if (!proc.pid) return reply.status(500).send({ error: 'Failed to start process', command, detectedType });

    activeServers.set(port, { pid: proc.pid, proc, command, port, startedAt: new Date().toISOString() });

    // Poll for server to come up (up to 8s)
    for (let i = 0; i < 16; i++) {
      await new Promise(r => setTimeout(r, 500));
      if (proc.exitCode !== null) {
        activeServers.delete(port);
        return reply.status(500).send({ error: `Process exited (code=${proc.exitCode})`, command, detectedType });
      }
      try {
        await fetch(`http://localhost:${port}/`, { signal: AbortSignal.timeout(1000) });
        return { ok: true, url: `http://localhost:${port}`, port, command, detectedType };
      } catch { /* still starting */ }
    }

    return { ok: true, url: `http://localhost:${port}`, port, command, detectedType, note: 'Server starting — may take a moment' };
  });
}
