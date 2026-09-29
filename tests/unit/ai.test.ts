import { describe, expect, it } from 'vitest';
import { DiagnosisOutput } from '@/core/ai/schemas';
import { extractJson, validateOutput } from '@/core/ai/validate';
import { checkSafety } from '@/core/ai/safety';
import { buildContext } from '@/core/ai/context';
import { decide, type AiRecommendation } from '@/core/ai/recommendation';
import { AGENTS, agentEnabled } from '@/core/ai/agents';
import { aiCtx, ctxItem, goodDiagnosis, human, NOW } from '../fixtures';

const levels = { 'ev-1': 'DOCUMENT_SUPPORTED', 'ev-2': 'VERIFIED', 'ev-3': 'INFERRED' } as const;

describe('AI output validation', () => {
  it('accepts a grounded output', () => {
    const v = validateOutput(DiagnosisOutput, goodDiagnosis(['ev-1', 'ev-2']), levels);
    expect(v.ok && v.value.confidence).toBe('HIGH');
  });
  it('tolerates code fences', () => expect(extractJson('Here:\n```json\n{"a":1}\n```')).toEqual({ a: 1 }));
  it('rejects unparseable and schema-invalid output', () => {
    expect(validateOutput(DiagnosisOutput, 'not json', levels).ok).toBe(false);
    const bad = validateOutput(DiagnosisOutput, JSON.stringify({ diagnosis: 'x' }), levels);
    expect(bad.ok).toBe(false);
  });
  it('rejects fabricated evidence references', () => {
    const v = validateOutput(DiagnosisOutput, goodDiagnosis(['ev-1', 'ev-999']), levels);
    expect(v).toMatchObject({ ok: false });
    expect(!v.ok && v.errors[0]).toMatch(/ev-999/);
  });
  it('caps confidence to weakest evidence and forces review', () => {
    const v = validateOutput(DiagnosisOutput, goodDiagnosis(['ev-1', 'ev-3']), levels);
    expect(v.ok && v.value).toMatchObject({ confidence: 'LOW', reviewRequired: true });
    expect(v.ok && v.confidenceCapped).toBe(true);
  });
  it('no evidence at all forces review', () => {
    const v = validateOutput(DiagnosisOutput, goodDiagnosis([]), levels);
    expect(v.ok && v.value).toMatchObject({ confidence: 'LOW', reviewRequired: true });
  });
});

describe('safety guardrails', () => {
  it('flags high-impact topics and adds a disclaimer', () => {
    const s = checkSafety('Consider whether to dismiss staff and take on a loan');
    expect(s.topics).toEqual(expect.arrayContaining(['FINANCIAL', 'EMPLOYMENT']));
    expect(s.reviewRequired).toBe(true); expect(s.disclaimer).toMatch(/not professional/);
  });
  it('is quiet for benign text', () => expect(checkSafety('Improve shelf layout').reviewRequired).toBe(false));
});

describe('context builder', () => {
  it('respects kind, relevance floor and token budget; records omissions', () => {
    const pkg = buildContext([
      ctxItem('a', { relevance: 0.9 }), ctxItem('b', { relevance: 0.1 }), ctxItem('c', { kind: 'GOAL' }),
      ctxItem('d', { content: 'x'.repeat(4000), relevance: 0.5 }),
    ], { allowedKinds: ['EVIDENCE'], tokenBudget: 100 });
    expect(pkg.items.map((i) => i.id)).toEqual(['a']);
    expect(pkg.omitted.map((o) => o.reason).sort()).toEqual(['below relevance floor', 'kind not allowed for agent', 'token budget']);
    expect(pkg.totalTokens).toBeGreaterThan(0);
  });
});

describe('agents and flags', () => {
  it('MVP agents enabled, other verticals disabled', () => {
    expect(agentEnabled(AGENTS['sme-diagnostic'])).toBe(true);
    expect(agentEnabled(AGENTS['eso-diagnostic'])).toBe(false);
    expect(agentEnabled(AGENTS['eso-diagnostic'], { ESO360: true })).toBe(true);
  });
});

describe('human override', () => {
  const rec = (): AiRecommendation => ({ id: 'r1', tenantId: 't1', organisationId: 'o1', caseId: 'c1', requestId: 'q', agent: 'sme-diagnostic', task: 'diagnosis', model: 'm', modelVersion: 'mv', promptVersion: 'p', scoringVersion: '0.1.0', knowledgeSources: [], evidenceRefs: [], confidence: 'HIGH', reviewRequired: false, safetyTopics: [], disclaimer: null, createdAt: NOW.toISOString(), output: { diagnosis: 'AI view' }, status: 'PENDING_REVIEW' });
  it('AI cannot approve its own output', () => expect(() => decide(aiCtx(), rec(), 'APPROVED', 'ok', NOW)).toThrow(/human/));
  it('a coach cannot override; approval requires a reason', () => {
    expect(() => decide(human('t1', 'COACH'), rec(), 'APPROVED', 'ok', NOW)).toThrow(/lacks/);
    expect(() => decide(human('t1'), rec(), 'APPROVED', '  ', NOW)).toThrow(/reason/);
  });
  it('approve keeps AI output; edit stores the human version and preserves the AI snapshot', () => {
    const a = decide(human('t1'), rec(), 'APPROVED', 'agree', NOW);
    expect(a.decision.finalDecision).toEqual({ diagnosis: 'AI view' });
    const e = decide(human('t1'), rec(), 'EDITED', 'tweak', NOW, { diagnosis: 'Human view' });
    expect(e.decision.finalDecision).toEqual({ diagnosis: 'Human view' });
    expect(e.decision.aiSnapshot).toEqual({ diagnosis: 'AI view' });
    expect(() => decide(human('t1'), rec(), 'EDITED', 'x', NOW)).toThrow(/human version/);
  });
  it('override needs OVERRIDE permission; rejection yields no decision; tenant enforced', () => {
    expect(() => decide(human('t1', 'CONSULTANT' as never), rec(), 'OVERRIDDEN', 'x', NOW, {})).toThrow(/lacks OVERRIDE/);
    expect(decide(human('t1', 'PROGRAMME_MANAGER'), rec(), 'OVERRIDDEN', 'policy', NOW, { d: 1 }).recommendation.status).toBe('OVERRIDDEN');
    expect(decide(human('t1'), rec(), 'REJECTED', 'wrong', NOW).decision.finalDecision).toBeNull();
    expect(() => decide(human('t2', 'ADMINISTRATOR'), rec(), 'APPROVED', 'x', NOW)).toThrow(/Cross-tenant/);
  });
  it('cannot decide twice', () => {
    const { recommendation } = decide(human('t1'), rec(), 'APPROVED', 'ok', NOW);
    expect(() => decide(human('t1'), recommendation, 'REJECTED', 'again', NOW)).toThrow(/already/);
  });
});
