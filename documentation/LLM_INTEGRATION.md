# LLM Integration — Complete Provider & Model Reference

## 1. Multi-Provider Architecture

The LLM subsystem is designed to work with **11 providers** simultaneously. Every provider is accessed through the OpenAI SDK's `createChatCompletion` interface — each provider implements an OpenAI-compatible REST endpoint.

### 1.1 Provider Registry

| Provider | Base URL | Auth Method | Local? | Notes |
|----------|----------|-------------|--------|-------|
| **GitHub Models** | `https://models.github.ai/inference` | `Bearer {PAT}` | No | Free tier: 150 RPD low / 50 RPD high |
| **Ollama** | `http://localhost:11434/v1` | None | Yes | Unlimited local, no API key needed |
| **Nano Sea** | `http://localhost:5100/v1` | None | Yes | Custom micro-model inference |
| **Groq** | `https://api.groq.com/openai/v1` | `Bearer {key}` | No | Fast inference, generous free tier |
| **HuggingFace** | `https://api-inference.huggingface.co/v1` | `Bearer {key}` | No | Wide model selection |
| **Cohere** | `https://api.cohere.ai/v1` | `Bearer {key}` | No | Command-R models |
| **Mistral** | `https://api.mistral.ai/v1` | `Bearer {key}` | No | Codestral, Mistral Large |
| **Google Gemini** | `https://generativelanguage.googleapis.com/v1beta/openai` | `Bearer {key}` | No | Gemini 2.5 Pro/Flash |
| **Together** | `https://api.together.xyz/v1` | `Bearer {key}` | No | Open-source model hosting |
| **OpenRouter** | `https://openrouter.ai/api/v1` | `Bearer {key}` | No | Multi-provider aggregator |
| **LM Studio** | `http://localhost:1234/v1` | None | Yes | GUI-based local models |

### 1.2 Client Factory (`providers.ts`)

```typescript
getClientFromDb(provider: string, db: Database): Promise<OpenAI>
```

This function:
1. Looks up provider config in SQLite `provider_configs` table
2. Decrypts stored API key using `appConfig.security.encryptKey` (XOR cipher)
3. Creates and returns an `OpenAI` client instance with provider-specific base URL

Token encryption uses a simple XOR cipher sufficient for local-only storage:
```
encrypt(text, key) → base64(xor(utf8(text), repeat(utf8(key))))
decrypt(cipher, key) → utf8(xor(base64decode(cipher), repeat(utf8(key))))
```

---

## 2. Model Definitions

### 2.1 Complete Model Registry (`packages/shared/src/constants/models.ts`)

| Model ID | Provider | Context Window | Rate Tier | Max Output |
|----------|----------|---------------|-----------|------------|
| `openai/gpt-4.1` | GitHub | 1,048,576 | high | 32,768 |
| `openai/gpt-4.1-mini` | GitHub | 1,048,576 | low | 32,768 |
| `openai/gpt-4.1-nano` | GitHub | 1,048,576 | low | 16,384 |
| `openai/gpt-4o` | GitHub | 128,000 | low | 16,384 |
| `openai/gpt-4o-mini` | GitHub | 128,000 | low | 16,384 |
| `openai/o4-mini` | GitHub | 200,000 | low | 100,000 |
| `meta/llama-4-scout` | GitHub | 524,288 | low | 8,192 |
| `mistral/mistral-large-2411` | GitHub | 128,000 | low | 4,096 |
| `cohere/command-a` | GitHub | 256,000 | low | 4,096 |
| `deepseek/deepseek-r1` | GitHub | 64,000 | high | 8,192 |
| `ai21/jamba-1.6-large` | GitHub | 256,000 | low | 4,096 |

### 2.2 Rate Limit Tiers

GitHub Models free tier has strict per-model limits:

| Tier | Requests/min | Requests/day | Tokens/min | Tokens/day |
|------|-------------|-------------|------------|------------|
| **Low** | 15 | 150 | 150,000 | 300,000 |
| **High** | 10 | 50 | 150,000 | 300,000 |

The `RATE_LIMITS` constant maps model IDs to their tier configuration.

### 2.3 Fallback Chain Logic

When a model is unavailable (404, rate-limited, or erroring), the system cascades:

1. **404 Handler** (enhancedLoop.ts): If a model returns HTTP 404:
   - Set model as unavailable in current session
   - Switch to the model's `fallback` field if defined
   - Ultimate fallback: `openai/gpt-4.1-mini`

2. **Rate Limit Handler**: If 429/403 with token limit:
   - Parse suggested max tokens from error
   - If suggested limit < 25% of model's actual context → treat as **rate-limit cap** (GitHub free tier)
   - Store per-request limit in `discoveredContextLimits` Map
   - Do NOT shrink the model's actual `contextWindow`
   - 16,000 token floor — never operate below this

3. **Smart Fallback Selection**: After 3 consecutive failures on a model:
   - Scan all configured models
   - Pick the model with the most remaining rate limit budget
   - Prefer models from different providers to avoid correlated limits

---

## 3. Streaming Architecture

### 3.1 Response Types

Two main functions in `streaming.ts`:

```typescript
// Non-streaming: complete response in one shot
completeChatResponse(params): Promise<{ content: string, usage: Usage }>

// Streaming: Server-Sent Events
streamChatResponse(params): AsyncGenerator<StreamChunk>
```

### 3.2 SSE Protocol

The chat and agent endpoints use Server-Sent Events for real-time streaming:

```
data: {"type":"token","content":"Hello"}
data: {"type":"token","content":" world"}
data: {"type":"thinking","content":"Planning next step..."}
data: {"type":"status","status":"executing","detail":"Writing file..."}
data: {"type":"error","message":"Rate limited"}
data: {"type":"done","usage":{"input":1234,"output":567}}
```

### 3.3 Timeout Handling

- Default request timeout: 120 seconds (configurable)
- Abort signal propagated to OpenAI client
- On timeout: emit error event, preserve partial content
- Streaming heartbeat: server sends `data: {"type":"ping"}` every 30s to keep connection alive

---

## 4. Smart Chunking Pipeline

### 4.1 Purpose

When the combined prompt (system + context + history) exceeds the model's context window, the `ChunkingPipeline` splits the work into manageable pieces.

### 4.2 Algorithm

```
Input: oversized content + token limit

1. Estimate tokens (chars / 3.5 heuristic)
2. If fits → return as single chunk
3. Split by semantic boundaries:
   a. File boundaries (highest priority)
   b. Function/class boundaries
   c. Paragraph breaks
   d. Line breaks (last resort)
4. Group chunks to fill ~80% of token budget
5. For each chunk:
   a. Process with LLM
   b. Generate bridge summary linking to next chunk
6. Combine chunk results
```

### 4.3 Recursion Guard

Sub-pipelines are created when individual chunks still exceed the limit. To prevent infinite recursion:

- `maxRecursionDepth`: 3 (default)
- `_currentDepth`: tracked per pipeline instance
- At max depth: returns error message instead of recursing
- Each sub-pipeline inherits parent's depth + 1

### 4.4 Bridge Summaries

Between chunks, the pipeline asks the LLM:
> "Summarize what was covered so far in 2-3 sentences to maintain context for the next chunk."

This summary is prepended to the next chunk, maintaining continuity.

---

## 5. Rate Limiter (`rateLimiter.ts`)

### 5.1 Features

- **Per-model tracking**: Separate token/request counters per model
- **Sliding window**: 1-minute and 1-day windows
- **Server header parsing**: Reads `x-ratelimit-remaining-*` and `retry-after` headers
- **Exponential backoff**: Starts at 2s, doubles up to 60s, resets after 3 successes
- **Preemptive checking**: `canMakeRequest(model)` checks before calling LLM
- **Budget reporting**: `getRemainingBudget(model)` returns tokens/requests remaining

### 5.2 Integration Points

The rate limiter is consulted at two points:
1. **Before request**: `canMakeRequest()` → if false, trigger fallback model selection
2. **After response**: `recordUsage()` → update counters from response headers or token counts

---

## 6. Provider Configuration UI

The `ProviderSettings` component allows users to:
- Enable/disable each of the 11 providers
- Enter API keys (stored encrypted in SQLite)
- Override base URLs for self-hosted instances
- Test connection with a probe request
- View which models are available per provider
- Set priority order for fallback chains
