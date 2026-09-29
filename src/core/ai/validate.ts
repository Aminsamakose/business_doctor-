import type { ZodType } from 'zod';
import type { EvidenceLevel } from '../domain';
import { capConfidence, type Confidence } from '../evidence';

export type Validation<T> =
  | { ok: true; value: T; confidenceCapped: boolean }
  | { ok: false; errors: string[] };

/** Pull a JSON object out of model text (tolerates code fences / preamble). */
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('No JSON object found');
  return JSON.parse(body.slice(start, end + 1));
}

/**
 * Validate untrusted model output:
 *  1. strict schema
 *  2. every cited evidence ref must exist in the supplied context (anti-fabrication)
 *  3. stated confidence is capped by the weakest cited evidence (AI cannot upgrade evidence)
 *  4. weak/absent evidence forces human review
 */
export function validateOutput<T extends { evidence: string[]; confidence: Confidence; reviewRequired: boolean }>(
  schema: ZodType<T>,
  raw: string,
  evidenceLevels: Record<string, EvidenceLevel>,
): Validation<T> {
  let json: unknown;
  try {
    json = extractJson(raw);
  } catch (e) {
    return { ok: false, errors: [`Unparseable output: ${(e as Error).message}`] };
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) return { ok: false, errors: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) };

  const value = parsed.data;
  const allRefs = new Set<string>(value.evidence);
  const nested = (value as unknown as { rootCauses?: { evidenceRefs: string[] }[] }).rootCauses;
  nested?.forEach((r) => r.evidenceRefs.forEach((x) => allRefs.add(x)));
  const unknown = [...allRefs].filter((r) => !(r in evidenceLevels));
  if (unknown.length) return { ok: false, errors: [`Unknown evidence references: ${unknown.join(', ')}`] };

  const levels = [...allRefs].map((r) => evidenceLevels[r]);
  const capped = capConfidence(value.confidence, levels);
  const weak = levels.length === 0 || capped === 'LOW';
  return {
    ok: true,
    confidenceCapped: capped !== value.confidence,
    value: { ...value, confidence: capped, reviewRequired: value.reviewRequired || weak },
  };
}
