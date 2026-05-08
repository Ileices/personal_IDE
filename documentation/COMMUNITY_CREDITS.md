# Community Credits & Companion Projects

This file acknowledges community members who have contributed ideas, tools, or integrations
that benefit personal_IDE users. Credited projects are not affiliated with personal_IDE — they
are independently maintained open-source tools that complement this project's goals.

---

## token-scavenger

| Field | Detail |
|-------|--------|
| **Project** | [token-scavenger](https://github.com/kabudu/token-scavenger) |
| **Author** | [@kabudu](https://github.com/kabudu) (Kamba) |
| **License** | MIT |
| **Language** | Rust |
| **Homepage** | [kabudu.github.io/token-scavenger](https://kabudu.github.io/token-scavenger/) |
| **Contact** | Discovered via [GitHub Copilot pricing discussion](https://github.com/orgs/community/discussions/192963) |
| **Credited** | May 2026 |

### What it does

token-scavenger is a self-hosted, single-binary LLM router written in Rust. It intelligently
routes AI inference requests through 14 free-tier providers first (Groq, Gemini, OpenRouter,
Cerebras, Mistral, NVIDIA NIM, Cloudflare Workers AI, DeepSeek, xAI Grok, HuggingFace,
SiliconFlow, ZAI/Zhipu, Cohere, GitHub Models) with configurable fallback to paid APIs.

It exposes a fully OpenAI-compatible API (`/v1/chat/completions`, `/v1/embeddings`,
`/v1/models`) — making it a drop-in replacement for any OpenAI SDK by changing one `base_url`.

Features include circuit breakers, health monitoring, Prometheus metrics, SQLite usage
accounting, an embedded 9-view operator web UI, an interactive setup wizard, and
system service installation.

### Why it's credited here

@kabudu independently solved the free-tier provider routing problem that personal_IDE faces
at the app layer. Their architecture — a compiled, zero-dependency sidecar that handles all
routing complexity — is the production-hardened complement to personal_IDE's TypeScript
provider management code.

See **[personal_IDE Discussion #9](https://github.com/Ileices/personal_IDE/discussions/9)**
for the full integration analysis covering 5 vectors:

1. **LLM Gateway** — token-scavenger as personal_IDE's sidecar provider router (drop-in via `base_url`)
2. **Provider Config Sync** — bridging both projects' provider registries and model catalogs
3. **Operator Dashboard** — embedding token-scavenger's 9-view UI into personal_IDE's settings panel
4. **NANO Local Models** — personal_IDE's NANO inference server as a token-scavenger local provider
5. **Toolchain Wizard** — Phase 1 setup wizard integration with auto-detect and one-click configure

### Recommended use

Users who want to maximize free AI inference can run token-scavenger as a sidecar alongside
personal_IDE. Point personal_IDE's "Custom Base URL" setting to `http://localhost:8000/v1`
and token-scavenger handles provider routing, circuit breaking, and fallback automatically.

```
# Install: download binary from https://github.com/kabudu/token-scavenger/releases/latest
# First run:
./tokenscavenger          # runs interactive setup wizard on first launch

# Then in personal_IDE settings:
# Provider > Custom Base URL: http://localhost:8000/v1
```

---

## How to Get Your Project Listed Here

If you've built a tool, library, or integration that directly benefits personal_IDE users,
open a [GitHub Discussion](https://github.com/Ileices/personal_IDE/discussions) in the
**General** or **Show and Tell** category describing your project and how it connects to
personal_IDE. Projects that fill genuine gaps in the stack — provider routing, local inference,
observability, deployment — are particularly welcome.

Credit is given to tools that are:
- Open source with a permissive license
- Genuinely useful to personal_IDE users today
- Maintained with at least one working release

Listing here does not imply endorsement, partnership, or support obligations on either side.
