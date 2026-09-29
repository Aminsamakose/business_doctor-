import { describe, expect, it } from 'vitest';
import { computeScore, maturityGap, assertScorable } from '@/core/scoring/engine';
import { SME360_SCORING_V0_1 as C } from '@/core/scoring/sme360';
import { answersAll, NOW } from '../fixtures';
import { ValidationError } from '@/core/domain';

describe('scoring engine', () => {
  it('is deterministic', () => {
    const a = computeScore(C, answersAll(3), NOW);
    const b = computeScore(C, answersAll(3), NOW);
    expect(a).toEqual(b);
    expect(a.overall).toBe(3);
    expect(a.maturity?.name).toBe('Growth');
  });
  it('records version, formula, inputs, timestamp', () => {
    const s = computeScore(C, answersAll(2), NOW);
    expect(s.scoringVersion).toBe('0.1.0');
    expect(s.formula).toContain('Σ');
    expect(s.inputs).toHaveLength(C.questions.length);
    expect(s.computedAt).toBe(NOW.toISOString());
  });
  it('does not impute zero for unanswered questions; reports coverage', () => {
    const half = answersAll(4).filter((_, i) => i % 2 === 0);
    const s = computeScore(C, half, NOW);
    expect(s.overall).toBe(4);
    expect(s.coverage).toBe(0.5);
  });
  it('returns null when nothing is answered', () => {
    const s = computeScore(C, [], NOW);
    expect(s.overall).toBeNull();
    expect(s.maturity).toBeNull();
  });
  it('penalises weakly evidenced answers where evidence is required', () => {
    const strong = computeScore(C, answersAll(4, 'VERIFIED'), NOW).dimensions.find((d) => d.dimension === 'FINANCE')!.score!;
    const weak = computeScore(C, answersAll(4, 'UNVERIFIED'), NOW).dimensions.find((d) => d.dimension === 'FINANCE')!.score!;
    expect(weak).toBeLessThan(strong);
  });
  it('historical snapshots are unaffected by a new config version', () => {
    const before = computeScore(C, answersAll(3), NOW);
    const v2 = { ...C, version: '0.2.0', dimensions: C.dimensions.map((d) => ({ ...d, weight: d.id === 'FINANCE' ? 5 : 1 })) };
    const after = computeScore(v2, answersAll(1).map((a) => ({ ...a, value: a.questionId.startsWith('FINANCE') ? 5 : 1 })), NOW);
    expect(before.overall).toBe(3);
    expect(before.scoringVersion).toBe('0.1.0');
    expect(after.scoringVersion).toBe('0.2.0');
  });
  it('rejects invalid input', () => {
    expect(() => computeScore(C, [{ questionId: 'nope', value: 1, evidenceLevel: 'VERIFIED' }], NOW)).toThrow(ValidationError);
    expect(() => computeScore(C, [{ questionId: C.questions[0].id, value: 9 as never, evidenceLevel: 'VERIFIED' }], NOW)).toThrow(ValidationError);
    const d = { questionId: C.questions[0].id, value: 1 as const, evidenceLevel: 'VERIFIED' as const };
    expect(() => computeScore(C, [d, d], NOW)).toThrow(/Duplicate/);
  });
  it('supports inverted questions', () => {
    const cfg = { ...C, questions: [{ id: 'x', dimension: 'FINANCE', weight: 1, inverted: true }] };
    expect(computeScore(cfg, [{ questionId: 'x', value: 5, evidenceLevel: 'VERIFIED' }], NOW).overall).toBe(0);
  });
  it('maturity gap and config sanity', () => {
    expect(maturityGap(C, 2, 5)).toEqual({ gap: 3, reached: false });
    expect(() => maturityGap(C, 2, 99)).toThrow(ValidationError);
    expect(() => assertScorable({ ...C, status: 'RETIRED' })).toThrow();
    expect(() => assertScorable(C)).not.toThrow();
  });
});
