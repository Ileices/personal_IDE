# Contributing to Personal IDE

Thank you for your interest in contributing to Personal IDE — an autonomous AI coding assistant built on the Silicon Factory agent architecture.

---

## Ways to Contribute

### Report a Bug
The best way to report a bug is directly from inside the app using the **🐛 Report a Problem** button in the toolbar. This automatically attaches your app version, OS, active model, and recent log output, and creates a structured GitHub Discussion that the community can respond to.

If you prefer to file a GitHub Issue manually, use the [Bug Report template](.github/ISSUE_TEMPLATE/bug_report.md).

### Request a Feature
Use the in-app **Report** button and select the **Feature Request** category, or open a [Feature Request issue](.github/ISSUE_TEMPLATE/feature_request.md).

Before requesting a feature, check the app's in-built **Help panel** — many planned features are already documented there as roadmap items under the relevant section.

### Share a Win
Built something cool? Use the **🎉 Share a Win** button in the app toolbar. This creates a GitHub Discussion in the Show and Tell category, which is the best place for showcases — more community-visible than a plain Issue.

### Contribute Code

#### Prerequisites
- Node.js 20+
- pnpm 8+
- Python 3.10+ (for the Nano Sea training system)
- Ollama or another local inference backend (for running agents locally)

#### Setup

```bash
# Clone the repo
git clone https://github.com/Ileices/personal_IDE.git
cd personal_IDE

# Install dependencies
pnpm install

# Start the development servers
pnpm dev
```

The app runs two servers:
- **Frontend (Vite):** http://127.0.0.1:5174
- **Backend (Fastify):** http://127.0.0.1:3000

#### Project Structure

```
apps/
  server/     # Fastify backend — agents, tools, routes, DB migrations
  web/        # React/Vite frontend — UI components, help registry
packages/
  shared/     # Shared types and utilities
NANO_train/   # Python Nano Sea training system
testing/      # Vitest test suite
```

For a full architecture overview, open the app's **Help panel** and read the **Silicon Factory** and **Agent Architecture** sections. The [architecture documentation](documentation/IDE_ARCHITECTURE.md) has additional detail.

#### Code Style

- TypeScript strict mode throughout
- Follow existing patterns in each file — read the file before editing it
- No full-file rewrites — surgical edits only, matching existing style
- No hardcoded tokens or credentials anywhere in source-controllable files
- All new backend routes follow the Fastify plugin pattern in `apps/server/src/routes/`
- All new UI components follow the Tailwind + React pattern in `apps/web/src/components/`

See [CONTRIBUTING_TYPESCRIPT.md](documentation/CONTRIBUTING_TYPESCRIPT.md) for the full TypeScript coding standards.

#### Running the Tests

```bash
# Backend type check
cd apps/server && npx tsc --noEmit

# Frontend type check
cd apps/web && npx tsc --noEmit

# Run the test suite
pnpm test
```

Smoke tests are in `scripts/smoke/`. They validate that the server and basic routes are responsive.

#### Submitting a Pull Request

1. Fork the repo and create a feature branch from `main`
2. Make your changes — keep them focused and atomic
3. Run the type checks (both server and web must pass with 0 errors)
4. Open a PR against `main` with a clear description of what changed and why
5. Reference any related Issues or Discussions in the PR description

---

## Code of Conduct

Be constructive. Be specific. Be kind. This is a solo-developer open-source project — detailed, actionable feedback is far more valuable than vague criticism.

---

## Security

If you discover a security vulnerability, do **not** open a public Issue. Please report it responsibly by emailing the maintainer directly or using GitHub's private security advisory feature. See [SECURITY_AUTH.md](documentation/SECURITY_AUTH.md) for the security architecture reference.

---

## Help & Questions

For questions about how the app works, how to use a specific feature, or anything that isn't a bug or code contribution:

- Use [GitHub Discussions](https://github.com/Ileices/personal_IDE/discussions) — post in the Q&A category
- Or use the in-app **Report** button and select the **Q&A** category to get community help

The in-app **Help panel** is the primary documentation source and is more comprehensive than this README. Open it from the Activity Bar (bottom of the left rail).
