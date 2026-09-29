import { authorize } from '../auth';
import type { AuditLog } from '../audit';
import { ValidationError, type FeatureFlag, type TenantContext } from '../domain';
import { evaluateRules, type RuleDef } from '../rules';
import { AGENTS, agentEnabled } from './agents';
import { buildContext, renderContext, type ContextItem } from './context';
import type { LlmProvider } from './provider';
import type { AiRecommendation } from './recommendation';
import { checkSafety } from './safety';
import { validateOutput } from './validate';

export interface AiRequest {
  agentId: string;
  organisationId: string;
  caseId: string;
  scoringVersion?: string | null;
  candidates: ContextItem[];
  ruleFacts?: Record<string, unknown>;
  /** Free-text the user typed; screened for out-of-scope use. */
  userQuestion?: string;
}

export interface AiUsage { requests: number; inputTokens: number; outputTokens: number; retries: number }

export type OrchestratorResult =
  | { status: 'OK'; recommendation: AiRecommendation }
  | { status: 'NEEDS_HUMAN'; reason: string; errors: string[] };

export interface OrchestratorDeps {
  provider: LlmProvider;
  audit: AuditLog;
  rules: RuleDef[];
  now: () => Date;
  newId: () => string;
  flags?: Partial<Record<FeatureFlag, boolean>>;
}

/**
 * REQUEST → AUTHORISE → RETRIEVE → RULES → AGENT → CLAUDE → VALIDATE → REVIEW → AUDIT.
 * Returns a PENDING_REVIEW recommendation; nothing is executed or published by the AI.
 */
export class Orchestrator {
  readonly usage: AiUsage = { requests: 0, inputTokens: 0, outputTokens: 0, retries: 0 };
  constructor(private deps: OrchestratorDeps) {}

  async run(ctx: TenantContext, req: AiRequest): Promise<OrchestratorResult> {
    const { audit, now } = this.deps;
    const agent = AGENTS[req.agentId];
    if (!agent) throw new ValidationError(`Unknown agent ${req.agentId}`);
    if (!agentEnabled(agent, this.deps.flags)) throw new ValidationError(`Agent ${agent.id} is disabled`);
    authorize(ctx, 'CREATE', { tenantId: ctx.tenantId, organisationId: req.organisationId });

    // Tenant fence on retrieved context is the caller's job (repository is tenant-scoped);
    // the orchestrator only sees what it is given and records what it used.
    const context = buildContext(req.candidates, { allowedKinds: agent.allowedContext, tokenBudget: agent.tokenBudget });
    const firings = evaluateRules(this.deps.rules, req.ruleFacts ?? {});
    const user = `${renderContext(context)}\n\nRULES FIRED (deterministic, authoritative):\n${JSON.stringify(firings)}\n${req.userQuestion ? `\nQuestion: ${req.userQuestion}` : ''}`;

    let errors: string[] = [];
    let prompt = user;
    for (let attempt = 0; attempt < 2; attempt++) {
      if (attempt > 0) {
        this.usage.retries++;
        prompt = `${user}\n\nYour previous output was rejected: ${errors.join('; ')}. Return corrected JSON only.`;
      }
      const res = await this.deps.provider.complete({ system: agent.systemPrompt, user: prompt, maxTokens: 3000 });
      this.usage.requests++;
      this.usage.inputTokens += res.inputTokens;
      this.usage.outputTokens += res.outputTokens;

      const v = validateOutput(agent.outputSchema as never, res.text, context.evidenceLevels);
      if (!v.ok) {
        errors = v.errors;
        audit.append({ tenantId: ctx.tenantId, who: `ai:${agent.id}`, what: 'AI_OUTPUT_REJECTED', entity: req.caseId, before: null, after: { errors, attempt }, why: null, source: ctx.requestId, approval: null }, now());
        continue;
      }
      const out = v.value as Record<string, unknown> & { evidence: string[]; confidence: 'LOW' | 'MEDIUM' | 'HIGH'; reviewRequired: boolean };
      const safety = checkSafety(JSON.stringify(out), req.userQuestion ?? '');
      const rec: AiRecommendation = {
        id: this.deps.newId(), tenantId: ctx.tenantId, organisationId: req.organisationId, caseId: req.caseId, requestId: ctx.requestId,
        agent: agent.id, task: agent.task, model: res.model, modelVersion: res.modelVersion, promptVersion: agent.promptVersion,
        scoringVersion: req.scoringVersion ?? null,
        knowledgeSources: context.items.filter((i) => i.kind === 'KNOWLEDGE').map((i) => i.source),
        evidenceRefs: out.evidence, confidence: out.confidence,
        reviewRequired: out.reviewRequired || safety.reviewRequired,
        safetyTopics: safety.topics, disclaimer: safety.disclaimer,
        createdAt: now().toISOString(), output: out, status: 'PENDING_REVIEW',
      };
      audit.append({ tenantId: ctx.tenantId, who: `ai:${agent.id}`, what: 'AI_RECOMMENDATION_CREATED', entity: rec.id, before: null, after: { agent: agent.id, promptVersion: agent.promptVersion, confidence: rec.confidence, contextItems: context.items.map((i) => ({ id: i.id, tokens: i.tokens })), omitted: context.omitted, rulesFired: firings }, why: null, source: ctx.requestId, approval: null }, now());
      return { status: 'OK', recommendation: rec };
    }
    return { status: 'NEEDS_HUMAN', reason: 'AI output failed validation after repair attempt', errors };
  }
}
