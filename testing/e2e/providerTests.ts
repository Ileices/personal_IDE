// ============================================
// E2E Test Scaffolding — Provider + Mode Tests
// Tests all LLM providers, 24/7 mode, and fleet mode
// Run with: npx tsx testing/e2e/providerTests.ts
// ============================================

interface TestResult {
  name: string;
  provider: string;
  model: string;
  status: 'pass' | 'fail' | 'skip';
  durationMs: number;
  error?: string;
  response?: string;
}

interface TestSuite {
  results: TestResult[];
  totalPass: number;
  totalFail: number;
  totalSkip: number;
  startedAt: string;
  finishedAt?: string;
}

// ── Provider Configurations ──
// Each provider needs API key in env or .env file

const PROVIDERS = [
  { name: 'copilot', models: ['gpt-4.1', 'gpt-4o', 'o3-mini', 'o4-mini'], keyEnv: 'GITHUB_TOKEN' },
  { name: 'openai', models: ['gpt-4o-mini'], keyEnv: 'OPENAI_API_KEY' },
  { name: 'ollama', models: ['llama3.2:1b'], keyEnv: null }, // local, no key
  { name: 'groq', models: ['llama-3.3-70b-versatile'], keyEnv: 'GROQ_API_KEY' },
  { name: 'together', models: ['meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo'], keyEnv: 'TOGETHER_API_KEY' },
  { name: 'openrouter', models: ['meta-llama/llama-3.3-70b-instruct'], keyEnv: 'OPENROUTER_API_KEY' },
  { name: 'mistral', models: ['mistral-small-latest'], keyEnv: 'MISTRAL_API_KEY' },
  { name: 'huggingface', models: ['meta-llama/Meta-Llama-3-8B-Instruct'], keyEnv: 'HUGGINGFACE_API_KEY' },
  { name: 'lmstudio', models: ['local-model'], keyEnv: null },
  { name: 'nano', models: ['nano-code'], keyEnv: null },
  { name: 'anthropic', models: ['claude-sonnet-4-20250514'], keyEnv: 'ANTHROPIC_API_KEY' },
] as const;

const API_BASE = process.env.API_BASE || 'http://localhost:3001';

// ── Test Functions ──

async function testProviderChat(
  provider: string,
  model: string,
  keyEnv: string | null,
): Promise<TestResult> {
  const name = `${provider}/${model} chat`;
  const start = Date.now();

  // Check if key is available
  if (keyEnv && !process.env[keyEnv]) {
    return {
      name, provider, model,
      status: 'skip',
      durationMs: Date.now() - start,
      error: `Missing env: ${keyEnv}`,
    };
  }

  try {
    const res = await fetch(`${API_BASE}/api/chat/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conversationId: `test-${provider}-${Date.now()}`,
        message: 'Reply with only the word "hello". Nothing else.',
        mode: 'ask',
        provider,
        model,
      }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      return {
        name, provider, model,
        status: 'fail',
        durationMs: Date.now() - start,
        error: `HTTP ${res.status}: ${errBody.slice(0, 200)}`,
      };
    }

    // Stream response
    const reader = res.body?.getReader();
    let fullResponse = '';
    if (reader) {
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        fullResponse += decoder.decode(value, { stream: true });
      }
    }

    const hasContent = fullResponse.toLowerCase().includes('hello');
    return {
      name, provider, model,
      status: hasContent ? 'pass' : 'fail',
      durationMs: Date.now() - start,
      response: fullResponse.slice(0, 200),
      error: hasContent ? undefined : 'Response did not contain "hello"',
    };
  } catch (err: any) {
    return {
      name, provider, model,
      status: 'fail',
      durationMs: Date.now() - start,
      error: err.message,
    };
  }
}

async function testAgentMode(): Promise<TestResult> {
  const start = Date.now();
  try {
    const res = await fetch(`${API_BASE}/api/agent/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        task: 'Create a file called test_output.txt that contains "E2E test pass"',
        projectRoot: process.cwd(),
        maxIterations: 2,
        provider: 'copilot',
        model: 'gpt-4.1',
      }),
    });

    return {
      name: 'Agent mode start',
      provider: 'copilot', model: 'gpt-4.1',
      status: res.ok ? 'pass' : 'fail',
      durationMs: Date.now() - start,
      error: res.ok ? undefined : `HTTP ${res.status}`,
    };
  } catch (err: any) {
    return {
      name: 'Agent mode start',
      provider: 'copilot', model: 'gpt-4.1',
      status: 'fail',
      durationMs: Date.now() - start,
      error: err.message,
    };
  }
}

async function test247Mode(): Promise<TestResult> {
  const start = Date.now();
  try {
    const res = await fetch(`${API_BASE}/api/agent/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        task: 'Monitor project health',
        projectRoot: process.cwd(),
        maxIterations: 1,
        provider: 'copilot',
        model: 'gpt-4.1',
        continuousMode: true,
      }),
    });

    // Immediately stop after verifying it started
    if (res.ok) {
      await new Promise(r => setTimeout(r, 1000));
      await fetch(`${API_BASE}/api/agent/stop`, { method: 'POST' });
    }

    return {
      name: '24/7 continuous mode',
      provider: 'copilot', model: 'gpt-4.1',
      status: res.ok ? 'pass' : 'fail',
      durationMs: Date.now() - start,
      error: res.ok ? undefined : `HTTP ${res.status}`,
    };
  } catch (err: any) {
    return {
      name: '24/7 continuous mode',
      provider: 'copilot', model: 'gpt-4.1',
      status: 'fail',
      durationMs: Date.now() - start,
      error: err.message,
    };
  }
}

async function testFleetMode(): Promise<TestResult> {
  const start = Date.now();
  try {
    const res = await fetch(`${API_BASE}/api/fleet/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        task: 'Review project structure',
        projectRoot: process.cwd(),
        agentCount: 2,
        maxIterationsPerAgent: 1,
      }),
    });

    // Stop fleet after verifying it started
    if (res.ok) {
      await new Promise(r => setTimeout(r, 1000));
      await fetch(`${API_BASE}/api/fleet/stop`, { method: 'POST' });
    }

    return {
      name: 'Fleet mode',
      provider: 'multi', model: 'fleet',
      status: res.ok ? 'pass' : 'fail',
      durationMs: Date.now() - start,
      error: res.ok ? undefined : `HTTP ${res.status}`,
    };
  } catch (err: any) {
    return {
      name: 'Fleet mode',
      provider: 'multi', model: 'fleet',
      status: 'fail',
      durationMs: Date.now() - start,
      error: err.message,
    };
  }
}

// ── Terminal Tests ──

async function testTerminalCreation(): Promise<TestResult> {
  const start = Date.now();
  try {
    const res = await fetch(`${API_BASE}/api/terminal/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ owner: 'agent', label: 'E2E Test' }),
    });
    const data = await res.json();

    if (!data.session?.id) throw new Error('No session ID returned');

    // Run a command
    const execRes = await fetch(`${API_BASE}/api/terminal/exec`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: data.session.id, command: 'echo E2E_OK' }),
    });
    const execData = await execRes.json();

    // Cleanup
    await fetch(`${API_BASE}/api/terminal/sessions/${data.session.id}`, { method: 'DELETE' });

    return {
      name: 'Terminal create + exec',
      provider: 'system', model: 'terminal',
      status: execData.output?.includes('E2E_OK') ? 'pass' : 'fail',
      durationMs: Date.now() - start,
      response: execData.output?.slice(0, 100),
    };
  } catch (err: any) {
    return {
      name: 'Terminal create + exec',
      provider: 'system', model: 'terminal',
      status: 'fail',
      durationMs: Date.now() - start,
      error: err.message,
    };
  }
}

// ── OpenClaw Tests ──

async function testOpenClawSkills(): Promise<TestResult> {
  const start = Date.now();
  try {
    const res = await fetch(`${API_BASE}/api/openclaw/skills`);
    const data = await res.json();

    return {
      name: 'OpenClaw skill listing',
      provider: 'system', model: 'openclaw',
      status: Array.isArray(data.skills) && data.skills.length > 0 ? 'pass' : 'fail',
      durationMs: Date.now() - start,
      response: `${data.skills?.length || 0} skills found`,
    };
  } catch (err: any) {
    return {
      name: 'OpenClaw skill listing',
      provider: 'system', model: 'openclaw',
      status: 'fail',
      durationMs: Date.now() - start,
      error: err.message,
    };
  }
}

// ── Main Runner ──

async function runAllTests(): Promise<TestSuite> {
  const suite: TestSuite = {
    results: [],
    totalPass: 0,
    totalFail: 0,
    totalSkip: 0,
    startedAt: new Date().toISOString(),
  };

  console.log('╔══════════════════════════════════════════╗');
  console.log('║   Personal IDE — E2E Test Suite          ║');
  console.log('╚══════════════════════════════════════════╝\n');

  // 1. Health check
  console.log('🏥 Checking server health...');
  try {
    const health = await fetch(`${API_BASE}/api/health`);
    if (!health.ok) {
      console.error('❌ Server not running. Start it with: pnpm dev');
      process.exit(1);
    }
    console.log('✅ Server is healthy\n');
  } catch {
    console.error('❌ Cannot reach server at', API_BASE);
    process.exit(1);
  }

  // 2. System tests
  console.log('🔧 System tests...');
  suite.results.push(await testTerminalCreation());
  suite.results.push(await testOpenClawSkills());

  // 3. Provider tests
  console.log('\n🤖 Provider tests...');
  for (const provider of PROVIDERS) {
    for (const model of provider.models) {
      console.log(`  Testing ${provider.name}/${model}...`);
      const result = await testProviderChat(provider.name, model, provider.keyEnv);
      suite.results.push(result);
      const icon = result.status === 'pass' ? '✅' : result.status === 'skip' ? '⏭️' : '❌';
      console.log(`  ${icon} ${result.name} (${result.durationMs}ms)${result.error ? ` — ${result.error}` : ''}`);
    }
  }

  // 4. Mode tests
  console.log('\n🚀 Mode tests...');
  suite.results.push(await testAgentMode());
  suite.results.push(await test247Mode());
  suite.results.push(await testFleetMode());

  // Summary
  suite.finishedAt = new Date().toISOString();
  for (const r of suite.results) {
    if (r.status === 'pass') suite.totalPass++;
    else if (r.status === 'fail') suite.totalFail++;
    else suite.totalSkip++;
  }

  console.log('\n╔══════════════════════════════════════════╗');
  console.log(`║ Results: ✅ ${suite.totalPass} pass │ ❌ ${suite.totalFail} fail │ ⏭️ ${suite.totalSkip} skip ║`);
  console.log('╚══════════════════════════════════════════╝');

  if (suite.totalFail > 0) {
    console.log('\nFailed tests:');
    for (const r of suite.results.filter(r => r.status === 'fail')) {
      console.log(`  ❌ ${r.name}: ${r.error}`);
    }
  }

  return suite;
}

// Run if executed directly
runAllTests().catch(console.error);
