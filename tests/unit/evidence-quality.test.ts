import { describe, expect, it } from 'vitest';
import { canUpgrade, capConfidence, upgradeEvidence, weakestLevel, type EvidenceItem } from '@/core/evidence';
import { detectQualityIssues } from '@/core/quality';
import { NOW } from '../fixtures';

const item: EvidenceItem = { id: 'e1', claim: 'Revenue 100k', level: 'SELF_REPORTED', source: 'form', date: '2026-09-01', owner: 'owner' };

describe('evidence', () => {
  it('AI cannot upgrade evidence', () => {
    expect(canUpgrade('SELF_REPORTED', 'VERIFIED', { kind: 'AI' })).toBe(false);
    expect(() => upgradeEvidence(item, 'DOCUMENT_SUPPORTED', { kind: 'AI' })).toThrow();
  });
  it('only humans grant VERIFIED', () => {
    expect(canUpgrade('SELF_REPORTED', 'VERIFIED', { kind: 'SYSTEM' })).toBe(false);
    expect(upgradeEvidence(item, 'VERIFIED', { kind: 'HUMAN', userId: 'u1' }).verifiedBy).toBe('u1');
  });
  it('downgrades are always allowed', () => expect(canUpgrade('VERIFIED', 'UNVERIFIED', { kind: 'AI' })).toBe(true));
  it('confidence is capped by weakest evidence', () => {
    expect(weakestLevel(['VERIFIED', 'INFERRED'])).toBe('INFERRED');
    expect(capConfidence('HIGH', ['VERIFIED', 'INFERRED'])).toBe('LOW');
    expect(capConfidence('HIGH', ['SELF_REPORTED'])).toBe('MEDIUM');
    expect(capConfidence('HIGH', ['DOCUMENT_SUPPORTED'])).toBe('HIGH');
    expect(capConfidence('HIGH', [])).toBe('LOW');
  });
});

describe('data quality', () => {
  it('flags missing, contradictory (preserving both), impossible, stale, unsupported', () => {
    const issues = detectQualityIssues({
      now: NOW,
      requiredKeys: ['employees', 'annual_revenue'],
      facts: [
        { key: 'employees', value: 10, source: 'form', date: '2026-09-01' },
        { key: 'employees', value: 25, source: 'doc', date: '2026-09-02' },
        { key: 'customer_count', value: -3, source: 'form', date: '2026-09-01' },
        { key: 'female_share_percent', value: 140, source: 'form', date: '2026-09-01' },
        { key: 'sector', value: 'retail', source: 'form', date: '2020-01-01' },
      ],
      evidence: [{ ...item, level: 'UNVERIFIED' }],
    });
    const p = issues.map((i) => i.problem).join('|');
    expect(p).toMatch(/Missing required information: annual_revenue/);
    const contra = issues.find((i) => i.problem.startsWith('Contradictory'))!;
    expect(contra.preserved).toHaveLength(2);
    expect(contra.severity).toBe('HIGH');
    expect(p).toMatch(/Impossible negative/);
    expect(p).toMatch(/Percentage out of range/);
    expect(p).toMatch(/Stale data/);
    expect(p).toMatch(/Unsupported claim/);
    expect(issues.every((i) => i.status === 'OPEN')).toBe(true);
  });
  it('clean data yields no issues', () => {
    expect(detectQualityIssues({ now: NOW, requiredKeys: ['employees'], facts: [{ key: 'employees', value: 4, source: 'f', date: '2026-09-01' }], evidence: [] })).toEqual([]);
  });
});
