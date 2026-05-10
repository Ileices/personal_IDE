## 📌 Remaining Open Alerts Status — Now Isolated to Production Lockfile Scan

Live status after branch alignment and corpus cleanup:

- Open Dependabot alerts: **24**
- Manifest path distribution:
  - `pnpm-lock.yaml`: 24
  - NANO corpus paths: 0

### What was executed right now
1. Default branch confirmed as `main`.
2. Final corpus alert (`#1`, js-yaml under NANO corpus) dismissed as `not_used`.
3. Security queue now contains only lockfile-based alerts on active production dependency graph.

### Why alerts can still show open despite patched versions
Dependabot dismissal for fixed/stale items is tied to scan refresh timing. After branch/default-branch changes and lockfile updates, there is often lag before stale items auto-resolve.

### Next execution window
- Re-check alerts in the next scan cycle.
- For any alert still open:
  - compare advisory vulnerable range vs locked version in `pnpm-lock.yaml`
  - if vulnerable, patch and push immediately
  - if fixed, leave open for scan reconciliation and track in this thread

Fun Fact: the repo currently has both monorepo package orchestration and a separate model-training substrate, so security operations are effectively handling two ecosystems with different deployment semantics in one repository.
