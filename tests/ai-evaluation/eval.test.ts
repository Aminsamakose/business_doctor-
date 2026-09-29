import { describe, expect, it } from 'vitest';
import { Orchestrator } from '@/core/ai/orchestrator';
import type { LlmProvider } from '@/core/ai/provider';
import { AuditLog } from '@/core/audit';
import { ctxItem, goodDiagnosis, human, NOW } from '../fixtures';

/**
 * Synthetic regression cases (spec §82) with recorded model outputs.
 * They assert grounding, structured validity, routing and safety behaviour of the
 * pipeline. They do NOT measure live-model quality; that needs ANTHROPIC_API_KEY.
 */
interface Case { name: string; items: ReturnType<typeof ctxItem>[]; recorded: string[]; expect: { status: 'OK' | 'NEEDS_HUMAN'; confidence?: string; reviewRequired?: boolean; topics?: string[]; rejects?: number } }

const strong = [ctxItem('ev-1', { evidenceLevel: 'VERIFIED' }), ctxItem('ev-2', { evidenceLevel: 'DOCUMENT_SUPPORTED' })];
const CASES: Case[] = [
  { name: 'CASE-STRONG', items: strong, recorded: [goodDiagnosis(['ev-1', 'ev-2'])], expect: { status: 'OK', confidence: 'HIGH', reviewRequired: false } },
  { name: 'CASE-WEAK', items: [ctxItem('ev-1', { evidenceLevel: 'UNVERIFIED' })], recorded: [goodDiagnosis(['ev-1'])], expect: { status: 'OK', confidence: 'LOW', reviewRequired: true } },
  { name: 'CASE-MIXED', items: [ctxItem('ev-1', { evidenceLevel: 'VERIFIED' }), ctxItem('ev-2', { evidenceLevel: 'SELF_REPORTED' })], recorded: [goodDiagnosis(['ev-1', 'ev-2'])], expect: { status: 'OK', confidence: 'MEDIUM' } },
  { name: 'CASE-MISSING-DATA', items: [], recorded: [goodDiagnosis([])], expect: { status: 'OK', confidence: 'LOW', reviewRequired: true } },
  { name: 'CASE-CONTRADICTORY (fabricated ref then repaired)', items: strong, recorded: [goodDiagnosis(['ev-77']), goodDiagnosis(['ev-1'])], expect: { status: 'OK', rejects: 1 } },
  { name: 'CASE-FAILED-INTERVENTION (invalid twice → human)', items: strong, recorded: ['{}', 'I cannot help'], expect: { status: 'NEEDS_HUMAN' } },
  { name: 'CASE-HIGH-RISK (employment + financial)', items: strong, recorded: [goodDiagnosis(['ev-1'], { recommendations: ['Dismiss staff and take a loan'] })], expect: { status: 'OK', reviewRequired: true, topics: ['EMPLOYMENT', 'FINANCIAL'] } },
  { name: 'CASE-OUT-OF-SCOPE (only unallowed context)', items: [ctxItem('x', { kind: 'PRESCRIPTION' as never })], recorded: [goodDiagnosis([])], expect: { status: 'OK', confidence: 'LOW' } },
];

describe('AI evaluation gate', () => {
  for (const c of CASES) {
    it(c.name, async () => {
      const queue = [...c.recorded];
      const provider: LlmProvider = { complete: async () => ({ text: queue.shift() ?? '{}', model: 'mock', modelVersion: 'mock-1', inputTokens: 10, outputTokens: 5 }) };
      const audit = new AuditLog();
      const o = new Orchestrator({ provider, audit, rules: [], now: () => NOW, newId: () => 'rec-1' });
      const r = await o.run(human('t1'), { agentId: 'sme-diagnostic', organisationId: 'o1', caseId: 'c1', candidates: c.items });
      expect(r.status).toBe(c.expect.status);
      if (r.status === 'OK') {
        expect(r.recommendation.status).toBe('PENDING_REVIEW');
        if (c.expect.confidence) expect(r.recommendation.confidence).toBe(c.expect.confidence);
        if (c.expect.reviewRequired !== undefined) expect(r.recommendation.reviewRequired).toBe(c.expect.reviewRequired);
        if (c.expect.topics) expect(r.recommendation.safetyTopics).toEqual(expect.arrayContaining(c.expect.topics));
        // grounding: every cited ref exists in supplied context
        const known = new Set(c.items.map((i) => i.id));
        for (const ref of r.recommendation.evidenceRefs) expect(known.has(ref)).toBe(true);
        // provenance
        expect(r.recommendation).toMatchObject({ agent: 'sme-diagnostic', promptVersion: 'sme-diagnostic@0.1.0', model: 'mock', modelVersion: 'mock-1', requestId: 'req-1' });
      }
      const rejects = audit.list('t1').filter((e) => e.what === 'AI_OUTPUT_REJECTED').length;
      expect(rejects).toBe(c.expect.rejects ?? (c.expect.status === 'NEEDS_HUMAN' ? 2 : 0));
      expect(audit.verifyChain()).toBeNull();
    });
  }
  it('tracks usage and retries for cost control', async () => {
    const queue = ['{}', goodDiagnosis(['ev-1'])];
    const provider: LlmProvider = { complete: async () => ({ text: queue.shift()!, model: 'm', modelVersion: 'm1', inputTokens: 100, outputTokens: 50 }) };
    const o = new Orchestrator({ provider, audit: new AuditLog(), rules: [], now: () => NOW, newId: () => 'r' });
    await o.run(human('t1'), { agentId: 'sme-diagnostic', organisationId: 'o1', caseId: 'c1', candidates: strong });
    expect(o.usage).toEqual({ requests: 2, inputTokens: 200, outputTokens: 100, retries: 1 });
  });
  it('blocks disabled agents, unauthorised callers and cross-tenant callers', async () => {
    const provider: LlmProvider = { complete: async () => { throw new Error('must not be called'); } };
    const o = new Orchestrator({ provider, audit: new AuditLog(), rules: [], now: () => NOW, newId: () => 'r' });
    const base = { organisationId: 'o1', caseId: 'c1', candidates: [] };
    await expect(o.run(human('t1'), { ...base, agentId: 'eso-diagnostic' })).rejects.toThrow(/disabled/);
    await expect(o.run(human('t1', 'DONOR'), { ...base, agentId: 'sme-diagnostic' })).rejects.toThrow(/lacks/);
    await expect(o.run({ ...human('t2'), tenantId: 't1' }, { ...base, agentId: 'sme-diagnostic' })).rejects.toThrow(/Cross-tenant/);
  });
});
