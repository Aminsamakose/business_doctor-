import { ForbiddenError, ValidationError, type TenantContext } from '../domain';
import { authorize } from '../auth';

export type ReviewStatus = 'PENDING_REVIEW' | 'APPROVED' | 'EDITED' | 'REJECTED' | 'DEFERRED' | 'OVERRIDDEN';

export interface AiRecommendation {
  id: string;
  tenantId: string;
  organisationId: string;
  caseId: string;
  requestId: string;
  agent: string;
  task: string;
  model: string;
  modelVersion: string;
  promptVersion: string;
  scoringVersion: string | null;
  knowledgeSources: string[];
  evidenceRefs: string[];
  confidence: 'LOW' | 'MEDIUM' | 'HIGH';
  reviewRequired: boolean;
  safetyTopics: string[];
  disclaimer: string | null;
  createdAt: string;
  output: unknown;
  status: ReviewStatus;
}

export interface Decision {
  recommendationId: string;
  action: Exclude<ReviewStatus, 'PENDING_REVIEW'>;
  reason: string;
  decidedBy: string;
  decidedAt: string;
  /** The authoritative result. For approve = AI output; for edit/override = the human version. */
  finalDecision: unknown;
  aiSnapshot: unknown;
}

/**
 * Human decision on an AI recommendation. AI output is never authoritative on its own:
 * only a Decision (with actor, reason and date) produces a final result. The original AI
 * output is preserved beside it.
 */
export function decide(
  ctx: TenantContext,
  rec: AiRecommendation,
  action: Decision['action'],
  reason: string,
  now: Date,
  humanVersion?: unknown,
): { recommendation: AiRecommendation; decision: Decision } {
  if (ctx.actor.kind !== 'HUMAN') throw new ForbiddenError('Only a human can decide on an AI recommendation');
  authorize(ctx, action === 'OVERRIDDEN' ? 'OVERRIDE' : 'APPROVE', { tenantId: rec.tenantId, organisationId: rec.organisationId });
  if (rec.status !== 'PENDING_REVIEW' && rec.status !== 'DEFERRED') throw new ValidationError(`Recommendation already ${rec.status}`);
  if (!reason.trim()) throw new ValidationError('A reason is required');
  if ((action === 'EDITED' || action === 'OVERRIDDEN') && humanVersion === undefined)
    throw new ValidationError(`${action} requires the human version`);
  const final = action === 'APPROVED' ? rec.output : action === 'REJECTED' || action === 'DEFERRED' ? null : humanVersion;
  return {
    recommendation: { ...rec, status: action },
    decision: { recommendationId: rec.id, action, reason, decidedBy: ctx.actor.userId, decidedAt: now.toISOString(), finalDecision: final, aiSnapshot: rec.output },
  };
}
