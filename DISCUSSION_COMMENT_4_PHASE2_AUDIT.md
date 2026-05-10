## 🔍 Phase 2 Audit — 31 Total Dependabot Alerts Discovered & Categorized

> **Status:** ✅ COMPLETE | **Commit:** `bc516ff` | **Date:** May 10, 2026

After the initial 12-vulnerability fix in the previous session, a deeper audit revealed **31 total open Dependabot alerts**. Here's the full picture:

---

### 📊 Alert Breakdown

| Category | Count | Action |
|----------|-------|--------|
| ✅ Already fixed — stale alerts | 9 | Pushed to trigger rescan |
| ✅ NANO corpus — training data | 6 | Dismissed as `not_used` |
| ✅ New fix applied (postcss) | 1 | Override added → 8.5.14 locked |
| 🔄 Stale (rescan pending) | 15 | Auto-close after push |

### 🚨 New Fix: postcss XSS (GHSA-qx2v-qp2m-jg93)

Our lockfile had `postcss@8.5.6`. This version fails to escape `</style>` appearing in CSS comment content, enabling XSS when output is embedded in HTML. Vite's CSS pipeline uses postcss.

**Fix:** Added `"postcss": ">=8.5.10"` to `pnpm.overrides` in [package.json](../blob/main/package.json)
**Result:** `postcss@8.5.14` now locked in [pnpm-lock.yaml](../blob/main/pnpm-lock.yaml)

```
pnpm audit --production
→ No known vulnerabilities found ✅
```

### 🗂 NANO Corpus Dismissals (Alerts 7, 8, 10, 13, 14, 17)

These alerts pointed to `NANO_train/NANO_corpus/AIOS_compute_share_prototype/package-lock.json` — a **read-only training data corpus directory**. These packages are never installed in the production environment.

Dismissed via GitHub API as `not_used` with detailed comment explaining the corpus architecture.

---

> 🎲 **Fun Fact:** The NANO corpus directory contains 3 prototype AI system implementations (AIOS, compute share, and an inference prototype) collected as training reference material. That's a miniature AI museum sitting inside a bigger AI system!

---

**Related commits:** [`91675a7`](../commit/91675a7) (Phase 1) → [`5629a3c`](../commit/5629a3c) → [`bc516ff`](../commit/bc516ff) (Phase 2)
