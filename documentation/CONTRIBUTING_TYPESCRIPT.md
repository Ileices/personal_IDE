# TypeScript Contributor Guide — Backend & Frontend

This guide is for developers working on the **Node.js backend** (Fastify 5) or **React frontend** (Vite 6). If you're working on the Python Nano Sea, see [CONTRIBUTING_PYTHON.md](./CONTRIBUTING_PYTHON.md).

---

## 1. Project Layout

```
apps/
├── server/                     ← Fastify 5 backend (TypeScript, ESM)
│   ├── src/
│   │   ├── index.ts            ← Entry point: register routes, start server
│   │   ├── config.ts           ← loadConfig() — reads .env into typed AppConfig
│   │   ├── routes/             ← 17 Fastify route modules (REST + SSE)
│   │   └── services/           ← 9 service directories (business logic)
│   └── tsconfig.json
├── web/                        ← React 19 frontend (TypeScript, Vite 6)
│   ├── src/
│   │   ├── App.tsx             ← Root component, three-panel layout
│   │   ├── components/         ← 15 React components
│   │   ├── stores/             ← 7 Zustand stores
│   │   └── data/               ← Static data (mega-prompts, etc.)
│   └── vite.config.ts
packages/
└── shared/                     ← Shared types + constants
    └── src/
        └── constants/models.ts ← Model definitions + rate limits
```

## 2. Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Runtime | Node.js | 20+ |
| Package Manager | pnpm | 9+ (workspaces) |
| Backend Framework | Fastify | 5.2 |
| Database | better-sqlite3 | Latest |
| LLM Client | OpenAI SDK | 4.x |
| Frontend Framework | React | 19 |
| Build Tool | Vite | 6 |
| State Management | Zustand | 5 |
| Styling | Tailwind CSS | 3.4 |
| Editor | Monaco Editor | Latest |
| Language | TypeScript | 5.7 (ESM throughout) |

## 3. Setting Up for Development

```powershell
# From project root
pnpm install                           # Install all workspace dependencies
pnpm -F @personal-ide/shared build     # Build shared types first

# Terminal 1: Backend
cd apps/server
pnpm dev                               # Fastify at http://localhost:3001

# Terminal 2: Frontend
cd apps/web
pnpm dev                               # Vite at http://localhost:5173
```

The Vite dev server proxies `/api` requests to `:3001` (configured in `vite.config.ts`).

## 4. Backend Architecture

### 4.1 Route → Service Pattern

Every route file in `routes/` is a thin HTTP handler that delegates to a service:

```typescript
// routes/chat.ts — thin route
import { streamChatResponse } from '../services/llm/streaming.js';

fastify.post('/send', async (req, reply) => {
  const { model, messages, mode } = req.body;
  const client = await getClientFromDb(provider, db);
  // ... delegate to service
});
```

### 4.2 Key Services to Understand

| Service | File | What It Does |
|---------|------|-------------|
| **EnhancedAgentLoop** | `services/agent/enhancedLoop.ts` (~1100 lines) | Core autonomous agent: plan → execute → evaluate → iterate. Handles rate limits, 404 fallback, connection errors, checkpoints. |
| **AgentFleet** | `services/agent/fleet.ts` (~700 lines) | Multi-agent orchestrator: decomposes tasks into roles (lead/implementer/debugger/tester/reviewer), stagger-launches agents. |
| **ChunkingPipeline** | `services/llm/chunkingPipeline.ts` (~527 lines) | Splits oversized prompts into chunks that fit the model's context window. Generates bridge summaries between chunks. |
| **RateLimiter** | `services/llm/rateLimiter.ts` | Per-model token/request tracking, exponential backoff, smart fallback selection. |
| **Providers** | `services/llm/providers.ts` (~403 lines) | Multi-provider OpenAI client factory. Token encryption/decryption. 11 providers supported. |
| **MemoryService** | `services/memory/index.ts` | SQLite-backed project memory: CRUD notes, semantic search, auto-cleanup. |

### 4.3 SSE Streaming Pattern

The agent and chat endpoints use Server-Sent Events. Pattern:

```typescript
// In the route handler:
reply.raw.writeHead(200, {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache',
  'Connection': 'keep-alive',
});

// Send events:
reply.raw.write(`data: ${JSON.stringify({ type: 'token', content: chunk })}\n\n`);

// End stream:
reply.raw.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
reply.raw.end();
```

### 4.4 Database Access

All DB access is via `better-sqlite3` (synchronous):

```typescript
// Pattern used throughout:
const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
const rows = db.prepare('SELECT * FROM memory_notes WHERE project_id = ?').all(projectId);
db.prepare('INSERT INTO memory_notes (project_id, title, body) VALUES (?, ?, ?)').run(pid, title, body);
```

## 5. Frontend Architecture

### 5.1 Component → Store Pattern

Components read from Zustand stores and dispatch actions:

```tsx
// Component reads store
const { messages, isStreaming } = useChatStore();
const { sendMessage } = useChatStore();

// Store calls API
sendMessage: async (model, content) => {
  const res = await fetch(`${API_BASE}/api/chat/send`, { ... });
  // Process SSE stream
}
```

### 5.2 API Base URL

```typescript
// Defined in most components:
const API_BASE = import.meta.env.VITE_API_URL || '';
// In dev: empty string (Vite proxy handles /api → :3001)
// In production: set VITE_API_URL if backend is on different host
```

### 5.3 Tailwind Theme

Custom IDE colors in `tailwind.config.js`:
- `ide-bg`, `ide-surface`, `ide-border` — background layers
- `ide-text`, `ide-text-muted` — text colors
- `ide-accent` — primary action color

## 6. Common Tasks

### Add a New API Endpoint

1. Create route file in `apps/server/src/routes/yourRoute.ts`
2. Register in `index.ts`: `fastify.register(yourRoutes, { prefix: '/api/your-prefix' })`
3. Add service logic in `apps/server/src/services/yourService/`

### Add a New React Component

1. Create `apps/web/src/components/YourComponent.tsx`
2. If it needs state, add to relevant Zustand store or create new one in `stores/`
3. Wire into `App.tsx` layout

### Add a New LLM Provider

1. Add provider config to `services/llm/providers.ts` `getClientFromDb()` switch
2. Add default base URL to the provider's factory case
3. Add model definitions to `packages/shared/src/constants/models.ts`
4. Rebuild shared package: `pnpm -F @personal-ide/shared build`

### Add a New Model

1. Add entry to `MODELS` array in `packages/shared/src/constants/models.ts`
2. Set `provider`, `contextWindow`, `maxOutput`, `rateTier`, `fallback`
3. Rebuild shared: `pnpm -F @personal-ide/shared build`

## 7. Code Style & Conventions

- **ESM only** — all imports use `.js` extensions: `import { foo } from './bar.js'`
- **No semicolons** enforcement — the codebase uses semicolons, stay consistent
- **Async/await** over `.then()` chains
- **Error handling**: Always catch LLM calls, always check for 429/404 status codes
- **Logging**: Use the structured log system (`logWriter.ts`) for agent/fleet events
- **Types**: Import shared types from `@personal-ide/shared`

## 8. Testing

Currently no test runner is configured (this is a TODO). When adding tests:
- Backend: Vitest recommended (same Vite pipeline)
- Frontend: Vitest + React Testing Library
- Run: `pnpm test` (once configured)

## 9. Build for Production

```powershell
pnpm build
# Frontend → apps/web/dist/
# Backend → apps/server/dist/
# Shared → packages/shared/dist/

# Run production:
cd apps/server
node dist/index.js
# Serves both API and static frontend files
```
