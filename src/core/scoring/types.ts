import type { EvidenceLevel } from '../domain';

/** 0 absent · 1 very weak · 2 basic · 3 functional · 4 strong · 5 advanced */
export type ScoreValue = 0 | 1 | 2 | 3 | 4 | 5;

export interface ScoringQuestion {
  id: string;
  dimension: string;
  /** Relative weight inside its dimension. */
  weight: number;
  /** If true the answer is a reversed scale (5 becomes 0). */
  inverted?: boolean;
  /** Evidence level required before the answer counts at full value. */
  requiresEvidence?: boolean;
}

export interface MaturityBand {
  level: number;
  name: string;
  /** Inclusive lower bound on the 0-5 overall score. */
  minScore: number;
}

export interface ScoringConfig {
  id: string;
  version: string;
  status: 'DRAFT' | 'APPROVED' | 'RETIRED';
  product: 'SME360' | 'AGRIFOOD360' | 'ESO360';
  dimensions: { id: string; name: string; weight: number }[];
  questions: ScoringQuestion[];
  maturity: MaturityBand[];
  /** Multiplier applied when a question requires evidence and only weak evidence exists. */
  evidencePenalty: Partial<Record<EvidenceLevel, number>>;
}

export interface Answer {
  questionId: string;
  value: ScoreValue;
  evidenceLevel: EvidenceLevel;
}

export interface DimensionResult {
  dimension: string;
  score: number | null;
  answered: number;
  total: number;
  coverage: number;
}

export interface ScoreSnapshot {
  scoringVersion: string;
  configId: string;
  formula: string;
  computedAt: string;
  inputs: Answer[];
  dimensions: DimensionResult[];
  overall: number | null;
  /** Share of question weight that was answered. */
  coverage: number;
  maturity: { level: number; name: string } | null;
}
