import { z } from 'zod';

const confidence = z.enum(['LOW', 'MEDIUM', 'HIGH']);
const evidenceRefs = z.array(z.string().min(1));

export const DiagnosisOutput = z.object({
  diagnosis: z.string().min(1),
  reasoningSummary: z.string().min(1).max(1200),
  rootCauses: z.array(z.object({ cause: z.string().min(1), evidenceRefs })).min(0),
  priorities: z.array(z.object({ dimension: z.string().min(1), reason: z.string().min(1) })),
  evidence: evidenceRefs,
  risks: z.array(z.object({ risk: z.string().min(1), severity: z.enum(['LOW', 'MEDIUM', 'HIGH']) })),
  uncertainties: z.array(z.string()),
  recommendations: z.array(z.string()),
  confidence,
  reviewRequired: z.boolean(),
  knowledgeSources: z.array(z.string()),
});
export type DiagnosisOutput = z.infer<typeof DiagnosisOutput>;

export const PrescriptionOutput = z.object({
  problem: z.string().min(1),
  intervention: z.string().min(1),
  rationale: z.string().min(1).max(1200),
  evidence: evidenceRefs,
  prerequisites: z.array(z.string()),
  dependencies: z.array(z.string()),
  actions: z.array(z.object({ title: z.string().min(1), owner: z.string().min(1), deadline: z.string().min(1) })).min(1),
  owners: z.array(z.string()),
  deadlines: z.array(z.string()),
  kpis: z.array(z.object({ name: z.string().min(1), baseline: z.number().nullable(), target: z.number().nullable() })),
  resources: z.array(z.string()),
  risks: z.array(z.string()),
  confidence,
  reviewRequired: z.boolean(),
});
export type PrescriptionOutput = z.infer<typeof PrescriptionOutput>;

export const SCHEMAS = { diagnosis: DiagnosisOutput, prescription: PrescriptionOutput } as const;
export type TaskKind = keyof typeof SCHEMAS;
