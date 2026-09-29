import type { Answer, ScoreValue } from '@/core/scoring/types';
import { SME360_SCORING_V0_1 as C } from '@/core/scoring/sme360';
import type { ContextItem } from '@/core/ai/context';
import type { Role, TenantContext } from '@/core/domain';

export const NOW = new Date('2026-09-29T10:00:00Z');

export const answersAll = (v: ScoreValue, level: Answer['evidenceLevel'] = 'DOCUMENT_SUPPORTED'): Answer[] =>
  C.questions.map((q) => ({ questionId: q.id, value: v, evidenceLevel: level }));

export const human = (tenantId = 't1', role: Role = 'CONSULTANT'): TenantContext => ({
  actor: { kind: 'HUMAN', userId: `u-${role}`, role, tenantId }, tenantId, requestId: 'req-1',
});
export const aiCtx = (tenantId = 't1'): TenantContext => ({ actor: { kind: 'AI', agent: 'sme-diagnostic', tenantId }, tenantId, requestId: 'req-2' });

export const ctxItem = (id: string, o: Partial<ContextItem> = {}): ContextItem => ({
  id, kind: 'EVIDENCE', source: 'test', timestamp: NOW.toISOString(), relevance: 0.9, content: `content of ${id}`, evidenceLevel: 'DOCUMENT_SUPPORTED', ...o,
});

export const goodDiagnosis = (refs: string[], over: Record<string, unknown> = {}) => JSON.stringify({
  diagnosis: 'Finance controls are informal.', reasoningSummary: 'Bank statements show irregular reconciliation.',
  rootCauses: [{ cause: 'No monthly reconciliation', evidenceRefs: refs }], priorities: [{ dimension: 'FINANCE', reason: 'Lowest score' }],
  evidence: refs, risks: [{ risk: 'Cash visibility', severity: 'MEDIUM' }], uncertainties: [], recommendations: ['Introduce monthly reconciliation'],
  confidence: 'HIGH', reviewRequired: false, knowledgeSources: [], ...over,
});
