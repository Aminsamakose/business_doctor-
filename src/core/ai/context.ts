import type { EvidenceLevel } from '../domain';

export type ContextKind =
  | 'PROFILE' | 'SCORE' | 'EVIDENCE' | 'MATURITY' | 'GOAL' | 'RISK' | 'HISTORY' | 'KPI' | 'PROGRAMME' | 'RULE' | 'KNOWLEDGE';

export interface ContextItem {
  id: string;
  kind: ContextKind;
  source: string;
  timestamp: string;
  /** 0..1, set by the retriever. */
  relevance: number;
  content: string;
  evidenceLevel?: EvidenceLevel;
}

export interface ContextPackage {
  items: (ContextItem & { tokens: number })[];
  omitted: { id: string; reason: string }[];
  totalTokens: number;
  evidenceLevels: Record<string, EvidenceLevel>;
}

/** Cheap, deterministic estimate (~4 chars/token). */
export const estimateTokens = (s: string) => Math.ceil(s.length / 4);

/**
 * Select the most relevant items within a token budget. Never sends everything:
 * items over budget or below the relevance floor are recorded as omitted.
 */
export function buildContext(
  candidates: ContextItem[],
  opts: { allowedKinds: ContextKind[]; tokenBudget: number; minRelevance?: number },
): ContextPackage {
  const floor = opts.minRelevance ?? 0.2;
  const omitted: ContextPackage['omitted'] = [];
  const items: ContextPackage['items'] = [];
  let total = 0;
  const sorted = [...candidates].sort((a, b) => b.relevance - a.relevance || a.id.localeCompare(b.id));
  for (const c of sorted) {
    if (!opts.allowedKinds.includes(c.kind)) { omitted.push({ id: c.id, reason: 'kind not allowed for agent' }); continue; }
    if (c.relevance < floor) { omitted.push({ id: c.id, reason: 'below relevance floor' }); continue; }
    const tokens = estimateTokens(c.content);
    if (total + tokens > opts.tokenBudget) { omitted.push({ id: c.id, reason: 'token budget' }); continue; }
    items.push({ ...c, tokens });
    total += tokens;
  }
  const evidenceLevels: Record<string, EvidenceLevel> = {};
  for (const i of items) evidenceLevels[i.id] = i.evidenceLevel ?? 'UNVERIFIED';
  return { items, omitted, totalTokens: total, evidenceLevels };
}

export const renderContext = (p: ContextPackage) =>
  p.items.map((i) => `[${i.id}] (${i.kind}, ${i.evidenceLevel ?? 'n/a'}, ${i.timestamp}, src=${i.source})\n${i.content}`).join('\n\n');
