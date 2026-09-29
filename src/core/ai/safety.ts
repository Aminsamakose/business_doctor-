export type SafetyTopic = 'FINANCIAL' | 'LEGAL' | 'INVESTMENT' | 'EMPLOYMENT' | 'PERSONAL_DATA' | 'REGULATORY';

const PATTERNS: Record<SafetyTopic, RegExp> = {
  FINANCIAL: /\b(loan|borrow|debt|credit facility|take on finance|cash ?flow decision)\b/i,
  LEGAL: /\b(lawsuit|litigation|contract dispute|sue|legal advice|liabilit(?:y|ies))\b/i,
  INVESTMENT: /\b(invest(?:ment)? decision|equity stake|valuation|raise capital|buy shares)\b/i,
  EMPLOYMENT: /\b(dismiss|fire (?:staff|employee)|redundan|terminate (?:staff|employee|employment)|lay ?off)\b/i,
  PERSONAL_DATA: /\b(national id|ghana card|passport number|medical record|bank account number|password)\b/i,
  REGULATORY: /\b(tax filing|compliance|licen[cs]e|regulator|gra\b|fda\b|environmental permit)\b/i,
};

export interface SafetyResult { topics: SafetyTopic[]; reviewRequired: boolean; disclaimer: string | null }

export const DISCLAIMER =
  'This output is decision support, not professional legal, financial, investment, employment or regulatory advice. Consult a qualified professional before acting.';

export function checkSafety(...texts: string[]): SafetyResult {
  const joined = texts.join('\n');
  const topics = (Object.keys(PATTERNS) as SafetyTopic[]).filter((t) => PATTERNS[t].test(joined));
  return { topics, reviewRequired: topics.length > 0, disclaimer: topics.length ? DISCLAIMER : null };
}
