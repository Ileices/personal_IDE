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
import { spawn, execSync } from 'child_process';
import path from 'path';
import fs from 'fs';

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

const isWindows = process.platform === 'win32';

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

  // ── Run arbitrary command ──
  app.post('/run', async (req: FastifyRequest) => {
    const body = req.body as RunCommandRequest;
    if (!body.command) return { error: 'command is required' };

    const cwd = body.cwd || process.cwd();
    const timeoutMs = Math.min(body.timeoutMs || 30000, 120000); // max 2 minutes

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

  // ── Start a dev server for preview ──
  app.post<{ Body: { command: string; cwd?: string; port?: number } }>('/preview/start-server', async (request) => {
    const { command, cwd, port = 5173 } = request.body;
    const projectRoot = cwd || process.cwd();

    // Check if something is already running on this port
    try {
      const response = await fetch(`http://localhost:${port}/`, { signal: AbortSignal.timeout(2000) });
      return { running: true, url: `http://localhost:${port}`, port, alreadyRunning: true };
    } catch {
      // Port is free, start the server
    }

    return new Promise((resolve) => {
      const proc = spawn(isWindows ? 'cmd' : 'sh', isWindows ? ['/c', command] : ['-c', command], {
        cwd: projectRoot,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, PORT: String(port) },
        detached: false,
      });

      let output = '';
      let started = false;

      proc.stdout?.on('data', (d: Buffer) => { output += d.toString(); });
      proc.stderr?.on('data', (d: Buffer) => { output += d.toString(); });

      proc.on('error', (err) => {
        if (!started) {
          started = true;
          resolve({ running: false, error: err.message, output: output.slice(-1000) });
        }
      });

      // Poll for the server to be ready
      const startTime = Date.now();
      const poller = setInterval(async () => {
        if (Date.now() - startTime > 30000) {
          clearInterval(poller);
          if (!started) {
            started = true;
            resolve({ running: false, error: 'Timeout: server not ready after 30s', output: output.slice(-1000) });
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
}
