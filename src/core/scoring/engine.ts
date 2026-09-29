import { ValidationError } from '../domain';
import type { Answer, DimensionResult, ScoreSnapshot, ScoringConfig } from './types';

export const FORMULA =
  'dimension = Σ(w·adj(v)) / Σ(w) over answered questions; overall = Σ(dw·dimension) / Σ(dw) over scored dimensions; adj(v)=v·evidencePenalty(level) when evidence required';

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Pure and deterministic: same config + answers + timestamp => same snapshot.
 * Unanswered questions are excluded and reported through coverage, never imputed as zero.
 * A snapshot embeds its inputs and version, so later rule changes cannot alter it.
 */
export function computeScore(config: ScoringConfig, answers: Answer[], now: Date): ScoreSnapshot {
  const qById = new Map(config.questions.map((q) => [q.id, q]));
  const seen = new Set<string>();
  for (const a of answers) {
    if (!qById.has(a.questionId)) throw new ValidationError(`Unknown question ${a.questionId}`);
    if (seen.has(a.questionId)) throw new ValidationError(`Duplicate answer for ${a.questionId}`);
    if (!Number.isInteger(a.value) || a.value < 0 || a.value > 5)
      throw new ValidationError(`Answer for ${a.questionId} must be an integer 0-5`);
    seen.add(a.questionId);
  }
  const answerById = new Map(answers.map((a) => [a.questionId, a]));

  const dimensions: DimensionResult[] = config.dimensions.map((d) => {
    const qs = config.questions.filter((q) => q.dimension === d.id);
    let num = 0;
    let den = 0;
    let answered = 0;
    for (const q of qs) {
      const a = answerById.get(q.id);
      if (!a) continue;
      answered++;
      let v: number = q.inverted ? 5 - a.value : a.value;
      if (q.requiresEvidence) v *= config.evidencePenalty[a.evidenceLevel] ?? 1;
      num += q.weight * v;
      den += q.weight;
    }
    return {
      dimension: d.id,
      score: den > 0 ? round2(num / den) : null,
      answered,
      total: qs.length,
      coverage: qs.length ? round2(answered / qs.length) : 0,
    };
  });

  let onum = 0;
  let oden = 0;
  for (const d of config.dimensions) {
    const r = dimensions.find((x) => x.dimension === d.id)!;
    if (r.score === null) continue;
    onum += d.weight * r.score;
    oden += d.weight;
  }
  const overall = oden > 0 ? round2(onum / oden) : null;

  const totalW = config.questions.reduce((s, q) => s + q.weight, 0);
  const answeredW = config.questions.filter((q) => answerById.has(q.id)).reduce((s, q) => s + q.weight, 0);

  return {
    scoringVersion: config.version,
    configId: config.id,
    formula: FORMULA,
    computedAt: now.toISOString(),
    inputs: answers.map((a) => ({ ...a })),
    dimensions,
    overall,
    coverage: totalW ? round2(answeredW / totalW) : 0,
    maturity: overall === null ? null : maturityFor(config, overall),
  };
}

export function maturityFor(config: ScoringConfig, overall: number) {
  const band = [...config.maturity].sort((a, b) => b.minScore - a.minScore).find((b) => overall >= b.minScore);
  return band ? { level: band.level, name: band.name } : null;
}

export function maturityGap(config: ScoringConfig, currentLevel: number, targetLevel: number) {
  const levels = config.maturity.map((m) => m.level);
  if (!levels.includes(currentLevel) || !levels.includes(targetLevel))
    throw new ValidationError('Unknown maturity level');
  return { gap: Math.max(0, targetLevel - currentLevel), reached: currentLevel >= targetLevel };
}

/** Configs are immutable once APPROVED; callers publish a new version instead. */
export function assertScorable(config: ScoringConfig) {
  if (config.status === 'RETIRED') throw new ValidationError('Scoring config is retired');
  const w = config.dimensions.reduce((s, d) => s + d.weight, 0);
  if (w <= 0) throw new ValidationError('Dimension weights must sum to > 0');
  for (const q of config.questions)
    if (!config.dimensions.some((d) => d.id === q.dimension))
      throw new ValidationError(`Question ${q.id} references unknown dimension ${q.dimension}`);
}
