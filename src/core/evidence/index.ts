import type { EvidenceLevel } from '../domain';

/** Strength ordering, strongest first. */
export const EVIDENCE_RANK: Record<EvidenceLevel, number> = {
  VERIFIED: 6,
  EXPERT_VALIDATED: 5,
  DOCUMENT_SUPPORTED: 4,
  SELF_REPORTED: 3,
  INFERRED: 2,
  UNVERIFIED: 1,
  MISSING: 0,
};

export interface EvidenceItem {
  id: string;
  claim: string;
  level: EvidenceLevel;
  source: string;
  date: string;
  owner: string;
  verifiedBy?: string;
}

/** Levels that only a human reviewer may grant. */
const HUMAN_ONLY: EvidenceLevel[] = ['VERIFIED', 'EXPERT_VALIDATED'];

export type UpgradeActor = { kind: 'AI' | 'SYSTEM' } | { kind: 'HUMAN'; userId: string };

/**
 * Evidence may be raised only by a human (or by the system when a document is attached).
 * The AI can never upgrade confidence by itself (spec §12).
 */
export function canUpgrade(from: EvidenceLevel, to: EvidenceLevel, actor: UpgradeActor): boolean {
  if (EVIDENCE_RANK[to] <= EVIDENCE_RANK[from]) return true; // downgrades always allowed
  if (actor.kind === 'AI') return false;
  if (HUMAN_ONLY.includes(to)) return actor.kind === 'HUMAN';
  return true;
}

export function upgradeEvidence(item: EvidenceItem, to: EvidenceLevel, actor: UpgradeActor): EvidenceItem {
  if (!canUpgrade(item.level, to, actor)) {
    throw new Error(`${actor.kind} may not upgrade evidence from ${item.level} to ${to}`);
  }
  return { ...item, level: to, verifiedBy: actor.kind === 'HUMAN' ? actor.userId : item.verifiedBy };
}

export function weakestLevel(levels: EvidenceLevel[]): EvidenceLevel {
  if (!levels.length) return 'MISSING';
  return levels.reduce((w, l) => (EVIDENCE_RANK[l] < EVIDENCE_RANK[w] ? l : w));
}

export type Confidence = 'LOW' | 'MEDIUM' | 'HIGH';
const CONF_RANK: Record<Confidence, number> = { LOW: 0, MEDIUM: 1, HIGH: 2 };

/** Ceiling on stated confidence given the weakest cited evidence. */
export function confidenceCeiling(levels: EvidenceLevel[]): Confidence {
  const w = EVIDENCE_RANK[weakestLevel(levels)];
  if (w >= EVIDENCE_RANK.DOCUMENT_SUPPORTED) return 'HIGH';
  if (w >= EVIDENCE_RANK.SELF_REPORTED) return 'MEDIUM';
  return 'LOW';
}

export const capConfidence = (stated: Confidence, levels: EvidenceLevel[]): Confidence => {
  const ceil = confidenceCeiling(levels);
  return CONF_RANK[stated] > CONF_RANK[ceil] ? ceil : stated;
};
