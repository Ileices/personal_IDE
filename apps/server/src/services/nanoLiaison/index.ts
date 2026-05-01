// ============================================================
// Nano Liaison Agent
// Bridges the Python nano-sea live state into TypeScript
// devtag taxonomy and forensic records.
//
// Polls /v1/status (or /v1/training/status + /v1/health) every
// POLL_INTERVAL_MS, diffs nano states, and:
//   - Creates devtag records for new/changed nanos
//   - Creates forensic entries for absularity events
//   - Creates 'needs_refactor' status tags for declining nanos
// ============================================================

import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';

const POLL_INTERVAL_MS = 15_000;          // poll Python every 15s
const DECLINING_FITNESS_THRESHOLD = 0.15; // loss increase that triggers needs_refactor tag

interface NanoStat {
  name: string;
  training_steps: number;
  best_loss: number | null;
  last_loss: number | null;
}

interface NanoStatusSnapshot {
  nanos: NanoStat[];
  nano_count: number;
  timestamp: number;
}

export class NanoLiaisonAgent {
  private _running = false;
  private _timer: ReturnType<typeof setTimeout> | null = null;
  private _lastSnapshot: Map<string, NanoStat> = new Map();
  private _nanoPort: number;

  constructor(
    private db: Database.Database,
    opts: { nanoPort?: number } = {},
  ) {
    this._nanoPort = opts.nanoPort ?? 5100;
  }

  start(): void {
    if (this._running) return;
    this._running = true;
    this._schedulePoll();
  }

  stop(): void {
    this._running = false;
    if (this._timer) clearTimeout(this._timer);
    this._timer = null;
  }

  // ── Private ───────────────────────────────────────────────

  private _schedulePoll(): void {
    if (!this._running) return;
    this._timer = setTimeout(async () => {
      try {
        await this._poll();
      } catch { /* non-fatal */ }
      this._schedulePoll();
    }, POLL_INTERVAL_MS);
  }

  private async _poll(): Promise<void> {
    const snapshot = await this._fetchSnapshot();
    if (!snapshot) return;

    const current = new Map(snapshot.nanos.map(n => [n.name, n]));

    for (const [name, stat] of current) {
      const prev = this._lastSnapshot.get(name);

      if (!prev) {
        // New nano discovered — register a devtag
        this._upsertDevtag(name, 'nano', `nano:${name}:alive`);
      } else {
        // Check for absularity (steps dropped to 0 or nano disappeared from prior snapshot)
        const stepsDropped = stat.training_steps === 0 && prev.training_steps > 0;
        if (stepsDropped) {
          this._recordAbsularity(name, prev);
        }

        // Check for fitness decline
        if (prev.best_loss !== null && stat.best_loss !== null) {
          const lossIncrease = stat.best_loss - prev.best_loss;
          if (lossIncrease > DECLINING_FITNESS_THRESHOLD) {
            this._upsertDevtag(name, 'nano:status', `nano:${name}:needs_refactor`,
              `best_loss rose by ${lossIncrease.toFixed(4)} (${prev.best_loss.toFixed(4)} → ${stat.best_loss.toFixed(4)})`);
          }
        }
      }
    }

    // Detect nanos that disappeared (absularity without a training_steps=0 signal)
    for (const [name, prev] of this._lastSnapshot) {
      if (!current.has(name) && prev.training_steps > 0) {
        this._recordAbsularity(name, prev);
      }
    }

    this._lastSnapshot = current;
  }

  private async _fetchSnapshot(): Promise<NanoStatusSnapshot | null> {
    try {
      // Use Node's built-in fetch (Node 18+)
      const [health, training] = await Promise.allSettled([
        fetch(`http://127.0.0.1:${this._nanoPort}/v1/health`),
        fetch(`http://127.0.0.1:${this._nanoPort}/v1/training/status`),
      ]);

      const nanos: NanoStat[] = [];

      if (training.status === 'fulfilled' && training.value.ok) {
        const data = await training.value.json() as any;
        // The training status may contain per-nano metadata
        if (data.nanos && typeof data.nanos === 'object') {
          for (const [name, meta] of Object.entries(data.nanos as Record<string, any>)) {
            nanos.push({
              name,
              training_steps: meta.training_steps ?? 0,
              best_loss: meta.best_loss ?? null,
              last_loss: meta.last_loss ?? null,
            });
          }
        } else if (data.nano_count) {
          // Aggregate fallback — no per-nano detail
          nanos.push({
            name: 'sea:aggregate',
            training_steps: data.total_steps ?? 0,
            best_loss: data.best_loss ?? null,
            last_loss: null,
          });
        }
      }

      return { nanos, nano_count: nanos.length, timestamp: Date.now() };
    } catch {
      return null;
    }
  }

  private _upsertDevtag(
    nanoName: string,
    tagType: string,
    tagName: string,
    note?: string,
  ): void {
    try {
      this.db.prepare(`
        INSERT OR IGNORE INTO snapshot_devtags
          (devtag_id, devtag_type, devtag_name, file_path, snapshot_id, created_at)
        VALUES (?, ?, ?, '', 'nano_liaison', datetime('now'))
      `).run(randomUUID(), tagType, tagName);
    } catch { /* table may not exist */ }

    if (note) {
      this._enqueueNotification('info', 'nano_liaison',
        `[NanoLiaison] devtag ${tagName} updated: ${note}`);
    }
  }

  private _recordAbsularity(nanoName: string, lastStat: NanoStat): void {
    const entryId = randomUUID();
    try {
      // Record in blame_records as a lifecycle forensic entry
      this.db.prepare(`
        INSERT OR IGNORE INTO blame_records
          (entry_id, agent_id, agent_class, model, project_id, run_id,
           quality_score, notes, created_at)
        VALUES (?, 'nano_liaison_agent', 'nano_liaison_agent', ?, '',
                '', 0.0, ?, datetime('now'))
      `).run(
        entryId,
        nanoName,
        `Absularity event: nano '${nanoName}' stopped training. ` +
        `Last known steps=${lastStat.training_steps}, best_loss=${lastStat.best_loss ?? 'n/a'}`,
      );
    } catch { /* ignore */ }

    this._enqueueNotification('warning', 'nano_absularity',
      `[NanoLiaison] Nano '${nanoName}' underwent absularity after ${lastStat.training_steps} steps.`);

    // Tag the nano as inactive
    this._upsertDevtag(nanoName, 'nano:status', `nano:${nanoName}:absulated`);
  }

  private _enqueueNotification(
    severity: 'info' | 'warning' | 'critical',
    category: string,
    summary: string,
  ): void {
    try {
      this.db.prepare(`
        INSERT INTO notification_queue
          (notification_id, severity, category, natural_language_summary,
           summary_tags, presented_to_user, user_acknowledged, timestamp)
        VALUES (?, ?, ?, ?, ?, 0, 0, datetime('now'))
      `).run(
        randomUUID(),
        severity,
        category,
        summary,
        JSON.stringify([`source:nano_liaison`, `category:${category}`]),
      );
    } catch { /* non-critical */ }
  }
}

// Singleton lifecycle
let _agent: NanoLiaisonAgent | null = null;

export function startNanoLiaisonAgent(
  db: Database.Database,
  opts: { nanoPort?: number } = {},
): NanoLiaisonAgent {
  if (!_agent) {
    _agent = new NanoLiaisonAgent(db, opts);
  }
  _agent.start();
  return _agent;
}

export function stopNanoLiaisonAgent(): void {
  _agent?.stop();
}
