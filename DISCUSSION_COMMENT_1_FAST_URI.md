**Comment 1: fast-uri Vulnerability Analysis and Fix**

---

Focused on the two fast-uri vulnerabilities (both HIGH severity). These are in the Fastify validation chain, so they're critical for the server.

**What was the problem?**

fast-uri had two bugs:
1. **Path Traversal (CVE-q3j6-qgpj-74h6)**: Percent-encoded dots (%2e%2e) weren't validated as path traversal attempts. An attacker could craft a URI like `/api/files/../../../etc/passwd` with dots encoded as `%2e` and bypass path normalization checks.
2. **Host Confusion (CVE-v39h-62p7-jpjc)**: Authority delimiters (@, :) could be percent-encoded (%40, %3a), confusing the host parser. This could trick the URI parser into thinking `attacker.com:@legitimate.com` is from `legitimate.com`, bypassing CORS.

Both are transitive dependencies through Fastify's @fastify/ajv-compiler, so they affect request validation.

**How was it fixed?**

Added pnpm override rule:
```json
"fast-uri": ">=3.1.2"
```

This ensures every package in the dependency tree uses fast-uri 3.1.2+:
- 3.1.1 fixed the first issue (dots)
- 3.1.2 fixed the second issue (authority delimiters)

**Verification:**

- Pre-fix: `pnpm audit` listed both as HIGH
- Post-fix: Both cleared; no errors in `pnpm audit --production`
- Build: `pnpm build` succeeds; no TypeScript regressions
- Tests: No functional changes to server routes

**Confidence**: High. This is a dependency-only fix with no surface changes.

---

**Impact Summary**: Server request validation now properly rejects malformed URIs that attempt to bypass path/host restrictions.
