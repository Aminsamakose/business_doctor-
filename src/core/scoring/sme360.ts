import type { ScoringConfig } from './types';

/**
 * SME360 scoring v0.1 - DRAFT. Dimensions follow the spec (§8). Weights are equal
 * placeholders pending review by a Samakose domain lead; status stays DRAFT until
 * approved through the release gate.
 */
const dims = [
  ['STRATEGY', 'Strategy'],
  ['BUSINESS_MODEL', 'Business Model'],
  ['SALES_MARKETING', 'Sales & Marketing'],
  ['FINANCE', 'Finance'],
  ['OPERATIONS', 'Operations'],
  ['PEOPLE', 'People'],
  ['GOVERNANCE', 'Governance'],
  ['MARKET', 'Market'],
  ['DIGITAL', 'Digital'],
  ['INNOVATION', 'Innovation'],
  ['RESILIENCE', 'Resilience'],
  ['GROWTH_INVESTMENT', 'Growth & Investment'],
] as const;

export const SME360_SCORING_V0_1: ScoringConfig = {
  id: 'sme360-scoring',
  version: '0.1.0',
  status: 'DRAFT',
  product: 'SME360',
  dimensions: dims.map(([id, name]) => ({ id, name, weight: 1 })),
  // Two questions per dimension keeps the seed small; the real bank is programme configuration.
  questions: dims.flatMap(([id]) => [
    { id: `${id}_1`, dimension: id, weight: 1 },
    { id: `${id}_2`, dimension: id, weight: 1, requiresEvidence: id === 'FINANCE' },
  ]),
  maturity: [
    { level: 1, name: 'Survival', minScore: 0 },
    { level: 2, name: 'Foundation', minScore: 1 },
    { level: 3, name: 'Functional', minScore: 2 },
    { level: 4, name: 'Growth', minScore: 3 },
    { level: 5, name: 'Scalable', minScore: 4 },
    { level: 6, name: 'Ecosystem Leader', minScore: 4.6 },
  ],
  evidencePenalty: { SELF_REPORTED: 0.8, UNVERIFIED: 0.6, INFERRED: 0.6, MISSING: 0 },
};
