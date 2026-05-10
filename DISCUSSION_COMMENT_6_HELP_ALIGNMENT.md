## 📖 Help Registry as Canonical Truth — Codebase Alignment Protocol

> **Status:** ✅ UPDATED | **File:** `apps/web/src/help/helpRegistry.ts` | **Date:** May 10, 2026

One of the core principles of this project is: **the help registry IS the roadmap**. If the help section describes a feature, that feature is either implemented or on the implementation path. When a gap exists between the help and the codebase, the gap gets closed in the codebase.

---

### 📝 Help Registry Updates (This Session)

Added a new `security-advisories-phase2` entry covering:
- Full categorization of all 31 Dependabot alerts
- Detailed CVE write-ups for fastify, picomatch, and postcss vulnerabilities  
- Explanation of the NANO corpus dismissal rationale
- Documentation of all new GitHub infrastructure files
- Verification records (audit output, lockfile versions, commit hashes)

The security section now documents **31 alerts** (up from 12), giving users a complete audit history.

---

### 🗺 Help Registry as Feature Map

The help registry contains sections that describe features at various stages:

| Feature | Help Status | Codebase Status |
|---------|-------------|-----------------|
| God Factory / Studio | ✅ Documented | ✅ Implemented |
| Fleet Agents | ✅ Documented | ⚠️ Partial (messaging stubs not wired) |
| NANO Training / Midwife | ✅ Documented | ✅ Implemented |
| GitHub Community Integration | ✅ Documented (Phase 9) | 🔄 Being implemented |
| Gap Analysis System | ✅ Documented | ✅ Implemented |
| Blame Crawler | ✅ Documented | ✅ Implemented |
| Project State Crawler | ✅ Documented | ✅ Implemented |
| Suggested Jobs System | ✅ Documented | ✅ Implemented |

When fleet messaging stubs are eventually wired, the help section `fleet.agent-card` already describes the expected UX precisely — no documentation gap will exist.

---

### 🔗 Security Docs Now Linked Throughout

The chain of security documentation spans:
1. [`SECURITY.md`](../blob/main/SECURITY.md) — public policy + disclosure
2. [`helpRegistry.ts` section `security-advisories`](../blob/main/apps/web/src/help/helpRegistry.ts) — 12 vulnerabilities (Phase 1)
3. [`helpRegistry.ts` section `security-advisories-phase2`](../blob/main/apps/web/src/help/helpRegistry.ts) — 31 alerts (Phase 2)
4. Discussion #10 comments — live narrative of resolution as it happened
5. Commit messages with full audit details

---

> 🎲 **Fun Fact:** The `helpRegistry.ts` file has **17 distinct `status` variants** across help entries — documenting everything from `active` features to `planned` future capabilities to `partial` implementations. The in-app help system is essentially a living architecture document. Future developers can read the help and instantly understand not just *how* to use the IDE but *why* each system was built the way it was.

---

This living documentation approach means the help system doubles as developer onboarding material, user manual, and architectural reference simultaneously.
