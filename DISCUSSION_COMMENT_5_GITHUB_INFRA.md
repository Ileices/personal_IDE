## 🏗 GitHub Infrastructure Added — CI, Security Policy, Dependabot Config

> **Status:** ✅ MERGED | **Commit:** `bc516ff` | **Date:** May 10, 2026

This project now has production-grade GitHub infrastructure for ongoing security monitoring and community contributions.

---

### 📋 What Was Added

#### `.github/workflows/security-audit.yml` — [View File](../blob/main/.github/workflows/security-audit.yml)
GitHub Actions CI workflow that runs on **every push to main** and **every pull request**:

```yaml
jobs:
  audit: pnpm audit --production  # ← zero-vulnerability gate
  typecheck: tsc --noEmit         # ← TypeScript correctness gate
```

Also runs on a **weekly schedule (Mondays 9 AM UTC)** to catch new advisories proactively.

#### `.github/dependabot.yml` — [View File](../blob/main/.github/dependabot.yml)
Automated dependency monitoring for 3 package ecosystems:
- `/` (root workspace) — weekly, labeled `dependencies`+`security`
- `/apps/server` — weekly, labeled `dependencies`+`server`
- `/apps/web` — weekly, labeled `dependencies`+`frontend`

#### `SECURITY.md` — [View File](../blob/main/SECURITY.md)
Public security policy including:
- ✅ Responsible disclosure process (private advisory link)
- ✅ 48-hour acknowledgment SLA
- ✅ Data handling documentation (local-only, zero telemetry)
- ✅ Security architecture notes (localhost-only server, DOMPurify, agent task review)

#### `.github/PULL_REQUEST_TEMPLATE.md` — [View File](../blob/main/.github/PULL_REQUEST_TEMPLATE.md)
Security checklist required for all PRs:
- No API keys/tokens in code
- No `eval()`, `innerHTML` direct assignments
- `pnpm audit --production` passing
- CORS/auth changes flagged for review

---

### 🌐 Repository Visibility Improvements

The repo was also updated for discoverability:
- **README badges:** CI status, pnpm 10, Node 20, TypeScript 5.7, License, Discussions, Security
- **Repo description:** Updated to highlight The God Factory, agent fleets, NANO training, devtag forensics
- **Repo homepage:** Now points to Discussions (the community hub)
- **GitHub Topics (10):** `ai-agent`, `autonomous-agents`, `coding-assistant`, `fastify`, `llm`, `monaco-editor`, `multi-agent-systems`, `react`, `self-improving`, `typescript`

---

> 🎲 **Fun Fact:** The help registry (`helpRegistry.ts`) contains **over 3,400 lines** of in-app documentation — that's more documentation than many entire projects have in their entire codebase. It's essentially a full product manual embedded directly into the running application!

---

The combination of CI audits + Dependabot + SECURITY.md creates a **zero-gap security monitoring loop** for the project going forward.
