import { z } from 'zod';
import { isEnabled, type FeatureFlag, type Permission } from '../domain';
import { SCHEMAS, type TaskKind } from './schemas';
import type { ContextKind } from './context';

export interface AgentDef {
  id: string;
  purpose: string;
  task: TaskKind;
  allowedContext: ContextKind[];
  outputSchema: z.ZodType;
  permissions: Permission[];
  escalation: string[];
  promptVersion: string;
  systemPrompt: string;
  flag: FeatureFlag;
  tokenBudget: number;
}

const BASE_RULES = `You are a bounded analyst for Samakose. Use ONLY the supplied context items. Never invent facts, figures or evidence.
Cite evidence by the bracketed item id (e.g. "ev-3"). If evidence is weak, missing or contradictory, say so in "uncertainties" and lower confidence.
Do not claim causality without evidence. Do not give legal, financial, investment or employment advice as fact; flag it for professional review.
Give a short reasoningSummary of the evidence-to-conclusion link. Do not reveal step-by-step reasoning.
Respond with ONE JSON object only, matching the requested schema.`;

export const AGENTS: Record<string, AgentDef> = {
  'sme-diagnostic': {
    id: 'sme-diagnostic',
    purpose: 'Interpret an SME360 deterministic score and evidence into a draft diagnosis',
    task: 'diagnosis',
    allowedContext: ['PROFILE', 'SCORE', 'EVIDENCE', 'MATURITY', 'RISK', 'HISTORY', 'KPI', 'PROGRAMME', 'RULE', 'KNOWLEDGE'],
    outputSchema: SCHEMAS.diagnosis,
    permissions: ['VIEW', 'CREATE'],
    escalation: ['contradictory evidence', 'confidence LOW', 'safety topic detected'],
    promptVersion: 'sme-diagnostic@0.1.0',
    systemPrompt: `${BASE_RULES}\nTask: draft a diagnosis JSON with keys diagnosis, reasoningSummary, rootCauses[{cause,evidenceRefs}], priorities[{dimension,reason}], evidence[], risks[{risk,severity}], uncertainties[], recommendations[], confidence(LOW|MEDIUM|HIGH), reviewRequired, knowledgeSources[].`,
    flag: 'SME360',
    tokenBudget: 6000,
  },
  'intervention': {
    id: 'intervention',
    purpose: 'Draft a prescription from an APPROVED diagnosis',
    task: 'prescription',
    allowedContext: ['PROFILE', 'SCORE', 'EVIDENCE', 'GOAL', 'RISK', 'HISTORY', 'KPI', 'PROGRAMME', 'RULE', 'KNOWLEDGE'],
    outputSchema: SCHEMAS.prescription,
    permissions: ['VIEW', 'CREATE'],
    escalation: ['confidence LOW', 'safety topic detected', 'resource availability unverified'],
    promptVersion: 'intervention@0.1.0',
    systemPrompt: `${BASE_RULES}\nTask: draft a prescription JSON with keys problem, intervention, rationale, evidence[], prerequisites[], dependencies[], actions[{title,owner,deadline}], owners[], deadlines[], kpis[{name,baseline,target}], resources[], risks[], confidence, reviewRequired. Do not promise resources or outcomes.`,
    flag: 'SME360',
    tokenBudget: 6000,
  },
  // Registered but disabled until their verticals ship (spec §16, §69).
  'agrifood-value-chain': {
    id: 'agrifood-value-chain', purpose: 'AgriFood360 value-chain diagnosis', task: 'diagnosis', allowedContext: [],
    outputSchema: SCHEMAS.diagnosis, permissions: ['VIEW', 'CREATE'], escalation: [], promptVersion: 'n/a', systemPrompt: '', flag: 'AGRIFOOD360', tokenBudget: 0,
  },
  'eso-diagnostic': {
    id: 'eso-diagnostic', purpose: 'ESO360 organisational diagnosis', task: 'diagnosis', allowedContext: [],
    outputSchema: SCHEMAS.diagnosis, permissions: ['VIEW', 'CREATE'], escalation: [], promptVersion: 'n/a', systemPrompt: '', flag: 'ESO360', tokenBudget: 0,
  },
};

export const agentEnabled = (a: AgentDef, overrides: Partial<Record<FeatureFlag, boolean>> = {}) => isEnabled(a.flag, overrides);
