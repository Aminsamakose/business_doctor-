import type { EvidenceItem } from '../evidence';

export type IssueStatus = 'OPEN' | 'UNDER_REVIEW' | 'CORRECTED' | 'ACCEPTED' | 'EXCLUDED' | 'CLOSED';
export type Severity = 'LOW' | 'MEDIUM' | 'HIGH';

export interface QualityIssue {
  id: string;
  source: string;
  problem: string;
  severity: Severity;
  impact: string;
  recommendedFix: string;
  owner: string | null;
  status: IssueStatus;
  /** Both conflicting values are preserved, never silently reconciled. */
  preserved?: unknown[];
}

export interface Fact {
  key: string;
  value: number | string | boolean | null;
  source: string;
  date: string;
}

const issue = (
  id: string,
  x: Omit<QualityIssue, 'id' | 'owner' | 'status'>,
): QualityIssue => ({ id, owner: null, status: 'OPEN', ...x });

export function detectQualityIssues(input: {
  facts: Fact[];
  requiredKeys: string[];
  evidence: EvidenceItem[];
  now: Date;
  staleAfterDays?: number;
}): QualityIssue[] {
  const out: QualityIssue[] = [];
  const stale = (input.staleAfterDays ?? 365) * 86_400_000;
  let n = 0;
  const next = () => `dq-${++n}`;

  for (const k of input.requiredKeys) {
    if (!input.facts.some((f) => f.key === k && f.value !== null && f.value !== ''))
      out.push(issue(next(), { source: k, problem: `Missing required information: ${k}`, severity: 'MEDIUM', impact: 'Score coverage reduced', recommendedFix: 'Request the value from the organisation' }));
  }

  const byKey = new Map<string, Fact[]>();
  for (const f of input.facts) byKey.set(f.key, [...(byKey.get(f.key) ?? []), f]);
  for (const [key, fs] of byKey) {
    const distinct = new Set(fs.map((f) => JSON.stringify(f.value)));
    if (distinct.size > 1)
      out.push(issue(next(), { source: key, problem: `Contradictory values for ${key}`, severity: 'HIGH', impact: 'Downstream scores and diagnosis may be unreliable', recommendedFix: 'Request review and record the resolution decision', preserved: fs }));
    for (const f of fs) {
      if (typeof f.value === 'number' && f.value < 0 && /revenue|employees|customers|count|area|yield/i.test(key))
        out.push(issue(next(), { source: key, problem: `Impossible negative value for ${key}: ${f.value}`, severity: 'HIGH', impact: 'Invalid input', recommendedFix: 'Correct the value at source' }));
      if (typeof f.value === 'number' && /percent|share|rate/i.test(key) && (f.value < 0 || f.value > 100))
        out.push(issue(next(), { source: key, problem: `Percentage out of range for ${key}: ${f.value}`, severity: 'MEDIUM', impact: 'Invalid input', recommendedFix: 'Correct the value at source' }));
      if (input.now.getTime() - new Date(f.date).getTime() > stale)
        out.push(issue(next(), { source: key, problem: `Stale data for ${key} (${f.date})`, severity: 'LOW', impact: 'May not reflect current state', recommendedFix: 'Refresh the value' }));
    }
  }

  for (const e of input.evidence) {
    if (e.level === 'UNVERIFIED' || e.level === 'MISSING')
      out.push(issue(next(), { source: e.id, problem: `Unsupported claim: ${e.claim}`, severity: 'MEDIUM', impact: 'Cannot be relied on for high-impact decisions', recommendedFix: 'Request a supporting document' }));
  }
  return out;
}
