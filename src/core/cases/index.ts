import { InvalidTransitionError } from '../domain';

export type CaseState =
  | 'NEW' | 'DIAGNOSTIC' | 'DIAGNOSED' | 'PRESCRIBED' | 'PENDING_APPROVAL' | 'IN_EXECUTION'
  | 'COACHING' | 'MONITORING' | 'AT_RISK' | 'STALLED' | 'MIDLINE' | 'ENDLINE' | 'FOLLOW_UP'
  | 'GRADUATED' | 'RE_ENTRY' | 'CLOSED';

export type ActorKind = 'HUMAN' | 'SYSTEM' | 'AI';

export interface CaseFacts {
  hasScore?: boolean;
  diagnosisApproved?: boolean;
  prescriptionApproved?: boolean;
  hasCoach?: boolean;
  openCriticalRisk?: boolean;
  outcomesVerified?: boolean;
}

export interface Transition {
  trigger: string;
  from: CaseState;
  to: CaseState;
  actors: ActorKind[];
  /** Human-readable guard; the predicate enforces it. */
  condition: string;
  guard: (f: CaseFacts) => boolean;
  requiredEvidence: string[];
  action: string;
}

const always = () => true;
const T = (t: Omit<Transition, 'guard' | 'requiredEvidence'> & Partial<Pick<Transition, 'guard' | 'requiredEvidence'>>): Transition => ({
  guard: always,
  requiredEvidence: [],
  ...t,
});

export const TRANSITIONS: Transition[] = [
  T({ trigger: 'StartDiagnostic', from: 'NEW', to: 'DIAGNOSTIC', actors: ['HUMAN', 'SYSTEM'], condition: 'Profile exists', action: 'open diagnostic' }),
  T({ trigger: 'DiagnosticCompleted', from: 'DIAGNOSTIC', to: 'DIAGNOSED', actors: ['SYSTEM'], condition: 'Deterministic score computed', guard: (f) => !!f.hasScore, requiredEvidence: ['HealthScore'], action: 'create AI analysis + review task' }),
  T({ trigger: 'PrescriptionGenerated', from: 'DIAGNOSED', to: 'PRESCRIBED', actors: ['SYSTEM', 'HUMAN'], condition: 'Diagnosis approved by a human', guard: (f) => !!f.diagnosisApproved, requiredEvidence: ['Approval'], action: 'draft prescription' }),
  T({ trigger: 'SubmitForApproval', from: 'PRESCRIBED', to: 'PENDING_APPROVAL', actors: ['HUMAN'], condition: 'Prescription drafted', action: 'create approval task' }),
  T({ trigger: 'PrescriptionApproved', from: 'PENDING_APPROVAL', to: 'IN_EXECUTION', actors: ['HUMAN'], condition: 'Human approval recorded', guard: (f) => !!f.prescriptionApproved, requiredEvidence: ['Approval'], action: 'create action plan' }),
  T({ trigger: 'PrescriptionRejected', from: 'PENDING_APPROVAL', to: 'DIAGNOSED', actors: ['HUMAN'], condition: 'Rejected with reason', action: 'reopen prescription' }),
  T({ trigger: 'CoachAssigned', from: 'IN_EXECUTION', to: 'COACHING', actors: ['HUMAN', 'SYSTEM'], condition: 'Coach assigned', guard: (f) => !!f.hasCoach, action: 'schedule first session' }),
  T({ trigger: 'BeginMonitoring', from: 'COACHING', to: 'MONITORING', actors: ['HUMAN', 'SYSTEM'], condition: 'Actions underway', action: 'start KPI tracking' }),
  ...(['IN_EXECUTION', 'COACHING', 'MONITORING'] as CaseState[]).map((from) =>
    T({ trigger: 'RiskDetected', from, to: 'AT_RISK', actors: ['SYSTEM', 'HUMAN'], condition: 'Risk at AT_RISK or CRITICAL', action: 'notify coach and manager' })),
  T({ trigger: 'RiskCleared', from: 'AT_RISK', to: 'MONITORING', actors: ['HUMAN'], condition: 'No open critical risk', guard: (f) => !f.openCriticalRisk, action: 'resume monitoring' }),
  ...(['IN_EXECUTION', 'COACHING', 'MONITORING', 'AT_RISK'] as CaseState[]).map((from) =>
    T({ trigger: 'ClientInactive', from, to: 'STALLED', actors: ['SYSTEM'], condition: 'Inactivity threshold exceeded', action: 'escalate' })),
  T({ trigger: 'Reengage', from: 'STALLED', to: 'IN_EXECUTION', actors: ['HUMAN'], condition: 'Client re-engaged', action: 'review plan' }),
  T({ trigger: 'MidlineDue', from: 'MONITORING', to: 'MIDLINE', actors: ['SYSTEM', 'HUMAN'], condition: 'Programme milestone', action: 'repeat diagnostic' }),
  T({ trigger: 'MidlineDone', from: 'MIDLINE', to: 'MONITORING', actors: ['HUMAN', 'SYSTEM'], condition: 'Midline scored', action: 'update plan' }),
  T({ trigger: 'EndlineDue', from: 'MONITORING', to: 'ENDLINE', actors: ['SYSTEM', 'HUMAN'], condition: 'Programme end', action: 'repeat diagnostic' }),
  T({ trigger: 'EndlineDone', from: 'ENDLINE', to: 'FOLLOW_UP', actors: ['HUMAN'], condition: 'Outcomes reviewed', guard: (f) => !!f.outcomesVerified, action: 'schedule follow-up' }),
  T({ trigger: 'Graduate', from: 'FOLLOW_UP', to: 'GRADUATED', actors: ['HUMAN'], condition: 'Follow-up complete', action: 'issue endline report' }),
  T({ trigger: 'ReEnter', from: 'GRADUATED', to: 'RE_ENTRY', actors: ['HUMAN'], condition: 'New need identified', action: 're-diagnose' }),
  T({ trigger: 'RestartDiagnostic', from: 'RE_ENTRY', to: 'DIAGNOSTIC', actors: ['HUMAN', 'SYSTEM'], condition: 'Re-entry approved', action: 'open diagnostic' }),
  ...(['NEW','DIAGNOSTIC','DIAGNOSED','PRESCRIBED','PENDING_APPROVAL','IN_EXECUTION','COACHING','MONITORING','AT_RISK','STALLED','MIDLINE','ENDLINE','FOLLOW_UP','GRADUATED','RE_ENTRY'] as CaseState[]).map((from) =>
    T({ trigger: 'Close', from, to: 'CLOSED', actors: ['HUMAN'], condition: 'Closure reason recorded', action: 'archive case' })),
];

export interface AppliedTransition {
  from: CaseState;
  to: CaseState;
  trigger: string;
  actor: ActorKind;
  action: string;
  at: string;
}

/** Only declared transitions are allowed; anything else throws. */
export function applyTransition(
  current: CaseState,
  trigger: string,
  actor: ActorKind,
  facts: CaseFacts,
  now: Date,
): AppliedTransition {
  const candidates = TRANSITIONS.filter((t) => t.from === current && t.trigger === trigger);
  if (!candidates.length) throw new InvalidTransitionError(`No transition '${trigger}' from ${current}`);
  const t = candidates.find((c) => c.actors.includes(actor));
  if (!t) throw new InvalidTransitionError(`${actor} may not perform '${trigger}' from ${current}`);
  if (!t.guard(facts)) throw new InvalidTransitionError(`Condition not met for '${trigger}': ${t.condition}`);
  return { from: current, to: t.to, trigger, actor, action: t.action, at: now.toISOString() };
}

export const allowedTriggers = (state: CaseState) => [...new Set(TRANSITIONS.filter((t) => t.from === state).map((t) => t.trigger))];
