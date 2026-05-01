// ============================================
// Integration Verification Sub-Agent
// After Builder Agent writes a file and Diff Sub-Agent
// promotes the pending partition to active,
// crawls all relationship tags connected to the
// modified devtags and verifies connectivity.
// ============================================
import { v4 as uuid } from 'uuid';
import type Database from 'better-sqlite3';
import type { TagRegistryService, Devtag } from '../../tagRegistry/index.js';

export interface IntegrationResult {
  build_step_id: string;
  verified: number;
  failures: IntegrationFailure[];
  status: 'ok' | 'integration-incomplete' | 'critical' | 'fatal';
}

export interface IntegrationFailure {
  new_devtag: string;
  missing_connected_devtag: string;
  relationship_type: string;
  file: string;
  severity: 'info' | 'warning' | 'error' | 'critical' | 'fatal';
}

// Relationship tag types defined in the addendum spec
const RELATIONSHIP_TAG_TYPES = [
  'calls', 'inherits', 'implements', 'composes', 'depends_on',
  'injected_into', 'overrides', 'extends', 'mixes_in',
  'subscribes_to', 'publishes', 'reads_from', 'writes_to',
  'proxies', 'wraps', 'delegates_to',
];

export class IntegrationVerificationSubAgent {
  constructor(
    private db: Database.Database,
    private tagRegistry: TagRegistryService
  ) {}

  /**
   * Verify integration for all devtags modified in a build step.
   * Crawls their relationship tags and checks referenced devtags exist.
   */
  async verify(opts: {
    modified_devtag_ids: string[];
    cycle_id: string;
    agent_id: string;
    build_step_id: string;
  }): Promise<IntegrationResult> {
    const { modified_devtag_ids, cycle_id, agent_id, build_step_id } = opts;
    const failures: IntegrationFailure[] = [];
    let verified = 0;

    for (const devtag_id of modified_devtag_ids) {
      const devtag = this.tagRegistry.getDevtagById(devtag_id);
      if (!devtag) continue;

      // Find all relationship tags that reference this devtag
      const relationshipTags = this.tagRegistry.listDevtags({
        tag_type: undefined,
        status: 'active',
      }).filter((dt: Devtag) =>
        RELATIONSHIP_TAG_TYPES.includes(dt.tag_type) &&
        (
          dt.tag_key.includes(`:${devtag.tag_key}:`) ||
          dt.tag_key.endsWith(`:${devtag.tag_key}`)
        )
      );

      for (const relTag of relationshipTags) {
        verified++;
        const connectedKey = this.extractConnectedTagKey(relTag.tag_key, relTag.tag_type, devtag.tag_key);
        if (!connectedKey) continue;

        const connected = this.tagRegistry.resolveDevtag(connectedKey);
        if (!connected || connected.status !== 'active') {
          const severity = this.determineSeverity(devtag, relTag);
          const failure: IntegrationFailure = {
            new_devtag: devtag.tag_key,
            missing_connected_devtag: connectedKey,
            relationship_type: relTag.tag_type,
            file: devtag.file_path ?? '',
            severity,
          };
          failures.push(failure);

          // Write to forensic DB
          this.db.prepare(`
            INSERT INTO integration_failures (entry_id, new_devtag, missing_connected_devtag, relationship_type, file, agent_id, severity, cycle_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `).run(uuid(), failure.new_devtag, failure.missing_connected_devtag, failure.relationship_type, failure.file, agent_id, severity, cycle_id);
        }
      }
    }

    // Determine overall status
    const hasFatal = failures.some(f => f.severity === 'fatal');
    const hasCritical = failures.some(f => f.severity === 'critical');

    let status: IntegrationResult['status'] = 'ok';
    if (hasFatal) status = 'fatal';
    else if (hasCritical) status = 'critical';
    else if (failures.length > 0) status = 'integration-incomplete';

    return { build_step_id, verified, failures, status };
  }

  /**
   * Extract the connected tag key from a relationship tag.
   * e.g. devtag:calls:FooService:BarService → given "FooService" as the modified, extract "BarService"
   */
  private extractConnectedTagKey(tag_key: string, tag_type: string, modified_key: string): string | null {
    const parts = tag_key.split(':');
    // Format: devtag:relationship_type:part_a:part_b
    if (parts.length < 4) return null;
    const partA = parts[2];
    const partB = parts[3];
    if (partA === modified_key) return partB;
    if (partB === modified_key) return partA;
    return null;
  }

  private determineSeverity(devtag: Devtag, relTag: Devtag): IntegrationFailure['severity'] {
    const meta = devtag.metadata as Record<string, unknown>;
    if (meta?.perf_critical || meta?.security_requirement) return 'critical';
    if (relTag.tag_type === 'inherits' || relTag.tag_type === 'implements') return 'error';
    return 'warning';
  }

  /**
   * Get integration failure history.
   */
  getFailures(opts: { cycle_id?: string; severity?: string; limit?: number } = {}): any[] {
    let query = 'SELECT * FROM integration_failures WHERE 1=1';
    const params: any[] = [];
    if (opts.cycle_id) { query += ' AND cycle_id = ?'; params.push(opts.cycle_id); }
    if (opts.severity) { query += ' AND severity = ?'; params.push(opts.severity); }
    query += ' ORDER BY created_at DESC';
    if (opts.limit) query += ` LIMIT ${opts.limit}`;
    return this.db.prepare(query).all(...params) as any[];
  }
}
