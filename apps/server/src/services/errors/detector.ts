// ============================================
// Error Detection Service
// Runs language-specific linters/compilers to
// detect errors, then feeds them back to the agent
// ============================================
import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { join, extname } from 'path';
import type { CodeError, TestResult, TestFailure } from '@personal-ide/shared';

/** Detect which languages/tools are available in a project */
export function detectProjectStack(rootPath: string): {
  languages: string[];
  tools: Record<string, string>;
  testCommands: string[];
  lintCommands: string[];
} {
  const result = {
    languages: [] as string[],
    tools: {} as Record<string, string>,
    testCommands: [] as string[],
    lintCommands: [] as string[],
  };

  // Node.js / TypeScript / JavaScript
  if (existsSync(join(rootPath, 'package.json'))) {
    result.languages.push('javascript', 'typescript');
    result.tools['node'] = 'node';
    if (existsSync(join(rootPath, 'tsconfig.json'))) {
      result.lintCommands.push('npx tsc --noEmit --pretty 2>&1');
      result.languages.push('typescript');
    }
    if (existsSync(join(rootPath, 'node_modules/.bin/eslint'))) {
      result.lintCommands.push('npx eslint . --format json 2>&1');
    }
    // Test detection
    try {
      const pkg = JSON.parse(require('fs').readFileSync(join(rootPath, 'package.json'), 'utf8'));
      if (pkg.scripts?.test) result.testCommands.push('npm test 2>&1');
      if (pkg.scripts?.['test:unit']) result.testCommands.push('npm run test:unit 2>&1');
      if (pkg.devDependencies?.vitest || pkg.dependencies?.vitest) result.testCommands.push('npx vitest run 2>&1');
      if (pkg.devDependencies?.jest || pkg.dependencies?.jest) result.testCommands.push('npx jest --json 2>&1');
    } catch { /* ignore */ }
  }

  // Python
  if (existsSync(join(rootPath, 'requirements.txt')) || existsSync(join(rootPath, 'pyproject.toml')) || existsSync(join(rootPath, 'setup.py'))) {
    result.languages.push('python');
    result.lintCommands.push('python -m py_compile 2>&1');
    if (existsSync(join(rootPath, 'pyproject.toml'))) {
      result.lintCommands.push('python -m mypy . --ignore-missing-imports 2>&1');
    }
    result.testCommands.push('python -m pytest --tb=short 2>&1');
  }

  // Rust
  if (existsSync(join(rootPath, 'Cargo.toml'))) {
    result.languages.push('rust');
    result.lintCommands.push('cargo check --message-format=json 2>&1');
    result.testCommands.push('cargo test 2>&1');
  }

  // Go
  if (existsSync(join(rootPath, 'go.mod'))) {
    result.languages.push('go');
    result.lintCommands.push('go vet ./... 2>&1');
    result.testCommands.push('go test ./... 2>&1');
  }

  // C/C++
  if (existsSync(join(rootPath, 'CMakeLists.txt')) || existsSync(join(rootPath, 'Makefile'))) {
    result.languages.push('c', 'cpp');
    if (existsSync(join(rootPath, 'CMakeLists.txt'))) {
      result.lintCommands.push('cmake --build build 2>&1');
    }
  }

  // C# / .NET
  if (existsSync(join(rootPath, '*.csproj')) || existsSync(join(rootPath, '*.sln'))) {
    result.languages.push('csharp');
    result.lintCommands.push('dotnet build 2>&1');
    result.testCommands.push('dotnet test 2>&1');
  }

  // Java
  if (existsSync(join(rootPath, 'pom.xml')) || existsSync(join(rootPath, 'build.gradle'))) {
    result.languages.push('java');
    if (existsSync(join(rootPath, 'pom.xml'))) {
      result.lintCommands.push('mvn compile 2>&1');
      result.testCommands.push('mvn test 2>&1');
    } else {
      result.lintCommands.push('gradle build 2>&1');
      result.testCommands.push('gradle test 2>&1');
    }
  }

  return result;
}

/** Run a lint/compile check and parse errors */
export function runLintCheck(rootPath: string, command: string, timeoutMs: number = 60_000): CodeError[] {
  try {
    const output = execSync(command, {
      cwd: rootPath,
      timeout: timeoutMs,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return parseErrorOutput(output, command);
  } catch (err: any) {
    // Many linters exit non-zero when errors found
    const output = (err.stdout || '') + '\n' + (err.stderr || '');
    return parseErrorOutput(output, command);
  }
}

/** Parse error output from various tools */
function parseErrorOutput(output: string, command: string): CodeError[] {
  const errors: CodeError[] = [];

  // TypeScript errors: file(line,col): error TSxxxx: message
  const tsPattern = /(.+?)\((\d+),(\d+)\):\s*(error|warning)\s+(TS\d+):\s*(.+)/g;
  let match: RegExpExecArray | null;
  while ((match = tsPattern.exec(output)) !== null) {
    errors.push({
      file: match[1].trim(),
      line: parseInt(match[2]),
      column: parseInt(match[3]),
      severity: match[4] as 'error' | 'warning',
      message: match[6].trim(),
      source: 'typescript',
      code: match[5],
    });
  }

  // Generic: file:line:col: severity: message (gcc, rustc, python, go)
  const genericPattern = /^(.+?):(\d+):(\d+):\s*(error|warning|note|info|hint):\s*(.+)$/gm;
  while ((match = genericPattern.exec(output)) !== null) {
    if (errors.some(e => e.file === match![1] && e.line === parseInt(match![2]))) continue;
    errors.push({
      file: match![1].trim(),
      line: parseInt(match![2]),
      column: parseInt(match![3]),
      severity: (match![4] === 'note' || match![4] === 'info') ? 'info' : match![4] as any,
      message: match![5].trim(),
      source: command.includes('rustc') || command.includes('cargo') ? 'rust'
        : command.includes('python') ? 'python'
        : command.includes('go') ? 'go' : 'compiler',
    });
  }

  // ESLint JSON output
  if (command.includes('eslint') && command.includes('json')) {
    try {
      const jsonStart = output.indexOf('[');
      if (jsonStart >= 0) {
        const parsed = JSON.parse(output.slice(jsonStart));
        for (const file of parsed) {
          for (const msg of file.messages || []) {
            errors.push({
              file: file.filePath,
              line: msg.line || 1,
              column: msg.column || 1,
              endLine: msg.endLine,
              endColumn: msg.endColumn,
              severity: msg.severity === 2 ? 'error' : 'warning',
              message: msg.message,
              source: 'eslint',
              ruleId: msg.ruleId,
            });
          }
        }
      }
    } catch { /* not JSON, try generic */ }
  }

  // Python: file.py:line: SyntaxError: message
  const pyPattern = /File "(.+?)", line (\d+)[\s\S]*?(SyntaxError|IndentationError|NameError|TypeError|ImportError):\s*(.+)/g;
  while ((match = pyPattern.exec(output)) !== null) {
    errors.push({
      file: match[1].trim(),
      line: parseInt(match[2]),
      column: 1,
      severity: 'error',
      message: `${match[3]}: ${match[4].trim()}`,
      source: 'python',
    });
  }

  // Cargo/Rust JSON format
  if (command.includes('cargo') && command.includes('json')) {
    for (const line of output.split('\n')) {
      try {
        const msg = JSON.parse(line);
        if (msg.reason === 'compiler-message' && msg.message) {
          const span = msg.message.spans?.[0];
          if (span) {
            errors.push({
              file: span.file_name,
              line: span.line_start,
              column: span.column_start,
              endLine: span.line_end,
              endColumn: span.column_end,
              severity: msg.message.level === 'error' ? 'error' : 'warning',
              message: msg.message.message,
              source: 'rust',
              code: msg.message.code?.code,
            });
          }
        }
      } catch { /* not JSON line */ }
    }
  }

  return errors;
}

/** Run all available lint checks for a project */
export function runAllLintChecks(rootPath: string): CodeError[] {
  const stack = detectProjectStack(rootPath);
  const allErrors: CodeError[] = [];

  for (const cmd of stack.lintCommands) {
    try {
      const errors = runLintCheck(rootPath, cmd);
      allErrors.push(...errors);
    } catch { /* skip failed commands */ }
  }

  return allErrors;
}

/** Run tests and parse results */
export function runTests(rootPath: string, command?: string, timeoutMs: number = 120_000): TestResult {
  const stack = detectProjectStack(rootPath);
  const cmd = command || stack.testCommands[0];

  if (!cmd) {
    return {
      framework: 'none',
      command: '',
      passed: 0, failed: 0, skipped: 0, total: 0,
      duration: 0,
      failures: [],
      output: 'No test command detected for this project.',
    };
  }

  const start = Date.now();
  let output = '';
  let exitCode = 0;

  try {
    output = execSync(cmd, {
      cwd: rootPath,
      timeout: timeoutMs,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch (err: any) {
    output = (err.stdout || '') + '\n' + (err.stderr || '');
    exitCode = err.status || 1;
  }

  const duration = Date.now() - start;
  return parseTestOutput(output, cmd, duration, exitCode);
}

/** Parse test output into structured result */
function parseTestOutput(output: string, command: string, duration: number, exitCode: number): TestResult {
  const result: TestResult = {
    framework: 'unknown',
    command,
    passed: 0, failed: 0, skipped: 0, total: 0,
    duration,
    failures: [],
    output: output.slice(-5000), // Last 5K chars
  };

  // Jest JSON
  if (command.includes('jest') && command.includes('json')) {
    try {
      const json = JSON.parse(output);
      result.framework = 'jest';
      result.passed = json.numPassedTests || 0;
      result.failed = json.numFailedTests || 0;
      result.total = json.numTotalTests || 0;
      result.skipped = (json.numPendingTests || 0) + (json.numTodoTests || 0);
      for (const suite of json.testResults || []) {
        for (const test of suite.assertionResults || []) {
          if (test.status === 'failed') {
            result.failures.push({
              name: test.fullName || test.title,
              file: suite.name,
              message: (test.failureMessages || []).join('\n'),
            });
          }
        }
      }
      return result;
    } catch { /* not valid JSON */ }
  }

  // Generic test output parsing
  // pytest: X passed, Y failed, Z skipped
  const pytestMatch = output.match(/(\d+)\s+passed.*?(\d+)\s+failed|(\d+)\s+passed/);
  if (pytestMatch) {
    result.framework = 'pytest';
    result.passed = parseInt(pytestMatch[1] || pytestMatch[3] || '0');
    result.failed = parseInt(pytestMatch[2] || '0');
  }

  // vitest/mocha: X passing, Y failing
  const mochaMatch = output.match(/(\d+)\s+passing.*?(\d+)\s+failing|(\d+)\s+passing/);
  if (mochaMatch) {
    result.framework = 'vitest';
    result.passed = parseInt(mochaMatch[1] || mochaMatch[3] || '0');
    result.failed = parseInt(mochaMatch[2] || '0');
  }

  // cargo test: test result: ok/FAILED. X passed; Y failed
  const cargoMatch = output.match(/test result:.*?(\d+)\s+passed;\s+(\d+)\s+failed/);
  if (cargoMatch) {
    result.framework = 'cargo';
    result.passed = parseInt(cargoMatch[1]);
    result.failed = parseInt(cargoMatch[2]);
  }

  result.total = result.passed + result.failed + result.skipped;

  // Extract failure details from output
  if (result.failed > 0 && result.failures.length === 0) {
    const failPattern = /(?:FAIL|FAILED|ERROR|✗|✖|×)\s+(.+?)(?:\n|$)/g;
    let fMatch;
    while ((fMatch = failPattern.exec(output)) !== null) {
      result.failures.push({
        name: fMatch[1].trim(),
        message: fMatch[1].trim(),
      });
    }
  }

  return result;
}

/** Format errors for LLM consumption */
export function formatErrorsForLLM(errors: CodeError[]): string {
  if (errors.length === 0) return '✅ No errors detected.';

  const errorCount = errors.filter(e => e.severity === 'error').length;
  const warnCount = errors.filter(e => e.severity === 'warning').length;

  let out = `⚠️ Found ${errorCount} error(s) and ${warnCount} warning(s):\n\n`;

  // Group by file
  const byFile = new Map<string, CodeError[]>();
  for (const e of errors) {
    const list = byFile.get(e.file) || [];
    list.push(e);
    byFile.set(e.file, list);
  }

  for (const [file, fileErrors] of byFile) {
    out += `📄 ${file}:\n`;
    for (const e of fileErrors) {
      const icon = e.severity === 'error' ? '❌' : e.severity === 'warning' ? '⚠️' : 'ℹ️';
      out += `  ${icon} Line ${e.line}:${e.column} — ${e.message}`;
      if (e.code) out += ` [${e.code}]`;
      if (e.ruleId) out += ` (${e.ruleId})`;
      out += '\n';
    }
    out += '\n';
  }

  return out;
}

/** Format test results for LLM consumption */
export function formatTestsForLLM(result: TestResult): string {
  if (result.total === 0) return '🧪 No tests found or test framework not detected.';

  let out = result.failed > 0
    ? `❌ Tests FAILED: ${result.passed}/${result.total} passed, ${result.failed} failed`
    : `✅ Tests PASSED: ${result.passed}/${result.total} passed`;

  out += ` (${result.framework}, ${result.duration}ms)\n`;

  if (result.failures.length > 0) {
    out += '\nFailures:\n';
    for (const f of result.failures) {
      out += `\n  ❌ ${f.name}`;
      if (f.file) out += ` (${f.file})`;
      out += `\n     ${f.message.slice(0, 500)}`;
      if (f.expected && f.actual) out += `\n     Expected: ${f.expected}\n     Actual: ${f.actual}`;
      out += '\n';
    }
  }

  return out;
}
