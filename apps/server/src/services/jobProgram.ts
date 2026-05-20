// apps/server/src/services/jobProgram.ts
// ============================================
// Job Program Service - Manage and run fix jobs
// ============================================

type FixJob = () => Promise<void> | void;

export class JobProgramService {
  private jobs: Map<string, FixJob> = new Map();

  /**
   * Register a fix job with a unique name.
   * @param name Unique job name
   * @param job Function implementing the fix job
   */
  registerJob(name: string, job: FixJob): void {
    if (this.jobs.has(name)) {
      throw new Error(`Job with name '${name}' is already registered.`);
    }
    this.jobs.set(name, job);
  }

  /**
   * Run a registered fix job by name.
   * @param name Job name
   */
  async runJob(name: string): Promise<void> {
    const job = this.jobs.get(name);
    if (!job) {
      throw new Error(`No job registered with name '${name}'.`);
    }
    try {
      await job();
      console.log(`Job '${name}' completed successfully.`);
    } catch (err) {
      console.error(`Job '${name}' failed:`, err);
      throw err;
    }
  }

  /**
   * Run all registered fix jobs sequentially.
   */
  async runAllJobs(): Promise<void> {
    for (const [name, job] of this.jobs.entries()) {
      await this.runJob(name);
    }
  }

  /**
   * List all registered job names.
   */
  listJobs(): string[] {
    return Array.from(this.jobs.keys());
  }
}

export const jobProgramService = new JobProgramService();
