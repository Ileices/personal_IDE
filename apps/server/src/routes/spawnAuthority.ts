// ============================================
// Spawn Authority Routes
// Check spawn authority and list violations.
// ============================================
import { FastifyInstance, FastifyRequest } from 'fastify';
import { SpawnAuthorityService } from '../services/spawnAuthority/index.js';
import { safeRoute } from '../plugins/safeRoute.js';

export async function spawnAuthorityRoutes(app: FastifyInstance) {
  const db = (app as any).db;
  const spawnService = new SpawnAuthorityService(db);

  // Check whether an agent is authorized to spawn a sub-agent
  app.post('/check', safeRoute(async (req: FastifyRequest) => {
    const body = req.body as any;
    const result = spawnService.checkSpawnAuthority(
      body.requesting_agent_id,
      body.requesting_agent_type,
      body.requested_sub_agent
    );
    return result;
  }));

  // Get all spawn violations
  app.get('/violations', safeRoute(async (req: FastifyRequest) => {
    const q = req.query as any;
    const violations = spawnService.getViolations(q.agent_id);
    return { violations };
  }));

  // Get model tier for an agent role
  app.get('/model-tier', safeRoute(async (req: FastifyRequest) => {
    const { agent_role } = req.query as { agent_role: string };
    const tier = SpawnAuthorityService.getModelTier(agent_role ?? 'agent_loop');
    return tier;
  }));

  // Get the full authority chart
  app.get('/chart', safeRoute(async () => {
    return {
      chart: {
        god_factory: '*',
        chat_agent: ['memory_crawler', 'project_description_crawler', 'context_window_manager'],
        agent_loop: ['memory_crawler', 'project_description_crawler', 'waiting_sub_agent', 'context_window_manager', 'diff_sub_agent', 'integration_verification_sub_agent'],
        midwife_bird_feeding: ['memory_crawler', 'context_window_manager'],
        agent_router: '*',
        fleet_agent: ['memory_crawler', 'project_description_crawler', 'context_window_manager', 'diff_sub_agent', 'integration_verification_sub_agent'],
        fleet_agent_nano: ['memory_crawler', 'project_description_crawler', 'context_window_manager', 'diff_sub_agent'],
        blame_crawler: ['dead_tag_sub_agent', 'regression_sub_agent'],
        help_agent: ['memory_crawler', 'context_window_manager'],
        skeptic_agent: ['memory_crawler', 'project_description_crawler', 'context_window_manager', 'diff_sub_agent', 'integration_verification_sub_agent', 'regression_sub_agent', 'dead_tag_sub_agent', 'conflict_sub_agent'],
        command_agent: ['sub_command_agent', 'conflict_sub_agent'],
        builder_agent: ['diff_sub_agent', 'integration_verification_sub_agent'],
        parallel_coordinator_agent: ['conflict_sub_agent'],
        regression_agent: ['regression_sub_agent', 'dead_tag_sub_agent'],
        nano_liaison_agent: ['memory_crawler', 'context_window_manager'],
      },
      tier_assignments: {
        fleet_agent_nano: { tier: 1, safe_ceiling_tokens: 2000 },
        memory_crawler: { tier: 2, safe_ceiling_tokens: 6000 },
        fleet_agent: { tier: 3, safe_ceiling_tokens: 16000 },
        waiting_sub_agent: { tier: 3, safe_ceiling_tokens: 16000 },
        nano_liaison_agent: { tier: 3, safe_ceiling_tokens: 16000 },
        agent_loop: { tier: 4, safe_ceiling_tokens: 80000 },
        skeptic_agent: { tier: 4, safe_ceiling_tokens: 80000 },
        command_agent: { tier: 4, safe_ceiling_tokens: 80000 },
        blame_crawler: { tier: 4, safe_ceiling_tokens: 80000 },
        god_factory: { tier: 5, safe_ceiling_tokens: 160000 },
      },
    };
  }));
}
