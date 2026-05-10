# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.1.x (main) | ✅ Yes |

## Reporting a Vulnerability

We take security seriously. If you discover a vulnerability in this codebase, please follow responsible disclosure:

### How to Report

**For sensitive security issues**, do NOT open a public GitHub issue. Instead:

1. **Email**: Open a private security advisory at https://github.com/Ileices/personal_IDE/security/advisories/new
2. **Include**:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Your suggested fix (if any)

### Response Timeline

- **Acknowledgment**: Within 48 hours
- **Initial assessment**: Within 5 business days
- **Fix timeline**: Depends on severity — critical issues receive priority treatment
- **Disclosure**: We coordinate disclosure with the reporter once a fix is available

## Security Architecture

### What This Project Does with Your Data

- **API keys** are stored locally in SQLite (never transmitted or logged)
- **Code and project files** remain on your local machine
- **Conversations** are stored locally in SQLite via better-sqlite3
- **No telemetry** is collected or sent externally
- **No analytics** are embedded

### Known Security Boundaries

- This is a **developer tool** designed to run locally
- The server (`apps/server`) listens on `localhost:3001` only by default
- LLM API calls are made directly from the server to third-party providers using your configured API keys
- The Monaco editor uses DOMPurify for sanitization (see dependency security notes)
- The agent loop executes shell commands — review agent tasks before enabling `autoApproveChanges`

### Dependency Security

We actively monitor and resolve dependency vulnerabilities via:
- **GitHub Dependabot** alerts (auto-enabled for this repo)
- **pnpm overrides** for transitive dependency patching
- **Weekly security audits** in GitHub Actions (`pnpm audit --production`)
- **GitHub Security Advisories** tracking via Discussions

#### Recent Security Fixes (May 2026)
- 12 vulnerabilities resolved: fast-uri (2 HIGH), DOMPurify (7 MODERATE), uuid (MODERATE), prismjs (MODERATE)
- See: https://github.com/Ileices/personal_IDE/discussions/10

## Security Best Practices When Using This Tool

1. **Never commit API keys** to the project files you create
2. **Review agent tasks** before enabling `autoApproveChanges` mode
3. **Keep the server on localhost** — do not expose port 3001 publicly
4. **Rotate API keys** if you suspect compromise via the Providers settings panel
5. **Use the Security & Auth panel** in the UI for authentication configuration guidance
