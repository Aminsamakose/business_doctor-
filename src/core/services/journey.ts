import { authorize } from '../auth';
import { AuditLog } from '../audit';
import { applyTransition, type CaseState } from '../cases';
import { decide, Orchestrator, type AiRecommendation, type ContextItem, type Decision } from '../ai';
import { ForbiddenError, ValidationError, type TenantContext } from '../domain';
import { EventBus } from '../events';
import { nextBestActions } from '../nba';
import { computeScore, assertScorable } from '../scoring/engine';
import type { Answer, ScoreSnapshot, ScoringConfig } from '../scoring/types';
import type { PrescriptionOutput } from '../ai/schemas';

export interface Org { id: string; tenantId: string; name: string; profile: Record<string, string | number> }
export interface CaseRec { id: string; tenantId: string; organisationId: string; state: CaseState; coachId: string | null; history: { from: CaseState; to: CaseState; trigger: string; at: string }[] }
export interface ActionRec { id: string; caseId: string; title: string; owner: string | null; deadline: string | null; status: 'OPEN' | 'DONE' | 'BLOCKED'; blockedBy?: string[] }
export interface KpiReading { caseId: string; kpi: string; value: number; at: string; baseline: number | null; target: number | null }
export type OutcomeStatus = 'REPORTED' | 'EVIDENCE_REQUESTED' | 'EVIDENCE_SUBMITTED' | 'UNDER_REVIEW' | 'VERIFIED' | 'REJECTED' | 'INSUFFICIENT_EVIDENCE';
export interface OutcomeRec { id: string; caseId: string; description: string; status: OutcomeStatus; evidenceRefs: string[]; verifiedBy: string | null; attribution: 'NOT_ASSESSED' | 'CONTRIBUTORY' }

/**
 * In-memory application service for the SME360 loop. Every method takes a TenantContext,
 * authorises against the resource tenant, writes an audit event, and never lets the AI
 * approve or advance state. A Postgres-backed repository replaces the Maps later.
 */
export class JourneyService {
  orgs = new Map<string, Org>();
  cases = new Map<string, CaseRec>();
  scores = new Map<string, ScoreSnapshot[]>();
  recs = new Map<string, AiRecommendation>();
  decisions: Decision[] = [];
  actions = new Map<string, ActionRec>();
  kpis: KpiReading[] = [];
  outcomes = new Map<string, OutcomeRec>();
  private n = 0;

  constructor(private d: { audit: AuditLog; bus: EventBus; orchestrator: Orchestrator; scoring: ScoringConfig; now: () => Date }) {}

  private id = (p: string) => `${p}-${++this.n}`;
  private log(ctx: TenantContext, what: string, entity: string, before: unknown, after: unknown, why: string | null = null, approval: string | null = null) {
    const who = ctx.actor.kind === 'HUMAN' ? ctx.actor.userId : ctx.actor.kind === 'AI' ? `ai:${ctx.actor.agent}` : `system:${ctx.actor.name}`;
    this.d.audit.append({ tenantId: ctx.tenantId, who, what, entity, before, after, why, source: ctx.requestId, approval }, this.d.now());
  }
  private org(ctx: TenantContext, id: string, p: Parameters<typeof authorize>[1]) {
    const o = this.orgs.get(id);
    if (!o) throw new ValidationError('Organisation not found');
    authorize(ctx, p, o);
    return o;
  }
  private caseOf(ctx: TenantContext, id: string, p: Parameters<typeof authorize>[1]) {
    const c = this.cases.get(id);
    if (!c) throw new ValidationError('Case not found');
    authorize(ctx, p, c);
    return c;
  }
  private move(ctx: TenantContext, c: CaseRec, trigger: string, facts: Parameters<typeof applyTransition>[3]) {
    const actor = ctx.actor.kind;
    const t = applyTransition(c.state, trigger, actor, facts, this.d.now());
    const before = c.state;
    c.state = t.to;
    c.history.push({ from: before, to: t.to, trigger, at: t.at });
    this.log(ctx, 'CASE_TRANSITION', c.id, { state: before }, { state: t.to, trigger, action: t.action });
  }

  createOrganisation(ctx: TenantContext, name: string, profile: Org['profile']) {
    authorize(ctx, 'CREATE', { tenantId: ctx.tenantId });
    const org: Org = { id: this.id('org'), tenantId: ctx.tenantId, name, profile };
    const c: CaseRec = { id: this.id('case'), tenantId: ctx.tenantId, organisationId: org.id, state: 'NEW', coachId: null, history: [] };
    this.orgs.set(org.id, org); this.cases.set(c.id, c);
    this.log(ctx, 'ORGANISATION_CREATED', org.id, null, { name, caseId: c.id });
    this.move(ctx, c, 'StartDiagnostic', {});
    return { org, case: c };
  }

  async submitDiagnostic(ctx: TenantContext, caseId: string, answers: Answer[]) {
    const c = this.caseOf(ctx, caseId, 'EDIT');
    assertScorable(this.d.scoring);
    const snap = computeScore(this.d.scoring, answers, this.d.now());
    this.scores.set(c.id, [...(this.scores.get(c.id) ?? []), snap]); // append-only history
    this.log(ctx, 'HEALTH_SCORE_COMPUTED', c.id, null, { overall: snap.overall, version: snap.scoringVersion, coverage: snap.coverage });
    // Score is engine output, so the SYSTEM (not the caller) advances the case.
    const sys: TenantContext = { ...ctx, actor: { kind: 'SYSTEM', name: 'diagnostic-workflow', tenantId: ctx.tenantId } };
    this.move(sys, c, 'DiagnosticCompleted', { hasScore: snap.overall !== null });
    await this.d.bus.publish({ id: this.id('ev'), type: 'DiagnosticCompleted', tenantId: ctx.tenantId, idempotencyKey: `diag:${c.id}:${snap.computedAt}`, payload: { caseId: c.id }, at: this.d.now().toISOString() });
    return snap;
  }

  latestScore = (caseId: string) => this.scores.get(caseId)?.at(-1) ?? null;

  async analyse(ctx: TenantContext, caseId: string, evidence: ContextItem[]) {
    const c = this.caseOf(ctx, caseId, 'CREATE');
    const score = this.latestScore(c.id);
    if (!score) throw new ValidationError('No score yet');
    const scoreItem: ContextItem = { id: 'score-1', kind: 'SCORE', source: `scoring@${score.scoringVersion}`, timestamp: score.computedAt, relevance: 1, content: JSON.stringify({ overall: score.overall, maturity: score.maturity, dimensions: score.dimensions, coverage: score.coverage }), evidenceLevel: 'VERIFIED' };
    const r = await this.d.orchestrator.run(ctx, { agentId: 'sme-diagnostic', organisationId: c.organisationId, caseId: c.id, scoringVersion: score.scoringVersion, candidates: [scoreItem, ...evidence] });
    if (r.status === 'OK') this.recs.set(r.recommendation.id, r.recommendation);
    return r;
  }

  review(ctx: TenantContext, recId: string, action: Decision['action'], reason: string, humanVersion?: unknown) {
    const rec = this.recs.get(recId);
    if (!rec) throw new ValidationError('Recommendation not found');
    const { recommendation, decision } = decide(ctx, rec, action, reason, this.d.now(), humanVersion);
    this.recs.set(recId, recommendation);
    this.decisions.push(decision);
    this.log(ctx, `AI_${action}`, recId, { status: rec.status }, { status: action, final: decision.finalDecision }, reason, decision.decidedBy);
    if (rec.task === 'diagnosis' && (action === 'APPROVED' || action === 'EDITED' || action === 'OVERRIDDEN')) {
      const c = this.cases.get(rec.caseId)!;
      const sys: TenantContext = { ...ctx, actor: { kind: 'SYSTEM', name: 'review-workflow', tenantId: ctx.tenantId } };
      this.move(sys, c, 'PrescriptionGenerated', { diagnosisApproved: true });
    }
    return decision;
  }

  /** Turn an approved prescription into actions; nothing executes until a human approves the prescription. */
  submitPrescription(ctx: TenantContext, caseId: string, p: PrescriptionOutput) {
    const c = this.caseOf(ctx, caseId, 'CREATE');
    this.move(ctx, c, 'SubmitForApproval', {});
    for (const a of p.actions) this.actions.set(this.id('act'), { id: '', caseId, title: a.title, owner: a.owner, deadline: a.deadline, status: 'OPEN' });
    for (const [k, v] of this.actions) v.id = k;
  }

  approvePrescription(ctx: TenantContext, caseId: string) {
    if (ctx.actor.kind !== 'HUMAN') throw new ForbiddenError('Only a human can approve a prescription');
    const c = this.caseOf(ctx, caseId, 'APPROVE');
    this.move(ctx, c, 'PrescriptionApproved', { prescriptionApproved: true });
    this.log(ctx, 'PRESCRIPTION_APPROVED', c.id, null, null, null, ctx.actor.userId);
  }

  assignCoach(ctx: TenantContext, caseId: string, coachId: string) {
    const c = this.caseOf(ctx, caseId, 'EDIT');
    c.coachId = coachId;
    this.move(ctx, c, 'CoachAssigned', { hasCoach: true });
  }

  recordKpi(ctx: TenantContext, r: Omit<KpiReading, 'at'>) {
    this.caseOf(ctx, r.caseId, 'EDIT');
    this.kpis.push({ ...r, at: this.d.now().toISOString() });
    this.log(ctx, 'KPI_UPDATED', r.caseId, null, r);
  }

  reportOutcome(ctx: TenantContext, caseId: string, description: string): OutcomeRec {
    this.caseOf(ctx, caseId, 'CREATE');
    const o: OutcomeRec = { id: this.id('out'), caseId, description, status: 'REPORTED', evidenceRefs: [], verifiedBy: null, attribution: 'NOT_ASSESSED' };
    this.outcomes.set(o.id, o);
    this.log(ctx, 'OUTCOME_REPORTED', o.id, null, o);
    return o;
  }

  submitOutcomeEvidence(ctx: TenantContext, outcomeId: string, refs: string[]) {
    const o = this.outcomes.get(outcomeId)!;
    this.caseOf(ctx, o.caseId, 'EDIT');
    o.evidenceRefs.push(...refs); o.status = 'EVIDENCE_SUBMITTED';
    this.log(ctx, 'OUTCOME_EVIDENCE_SUBMITTED', o.id, null, { refs });
  }

  /** Verification requires a human and at least one evidence item; otherwise INSUFFICIENT_EVIDENCE. */
  verifyOutcome(ctx: TenantContext, outcomeId: string, accept: boolean) {
    if (ctx.actor.kind !== 'HUMAN') throw new ForbiddenError('Only a human can verify an outcome');
    const o = this.outcomes.get(outcomeId)!;
    this.caseOf(ctx, o.caseId, 'APPROVE');
    const before = o.status;
    o.status = !o.evidenceRefs.length ? 'INSUFFICIENT_EVIDENCE' : accept ? 'VERIFIED' : 'REJECTED';
    o.verifiedBy = o.status === 'VERIFIED' ? ctx.actor.userId : null;
    this.log(ctx, 'OUTCOME_VERIFICATION', o.id, { status: before }, { status: o.status }, null, ctx.actor.userId);
    return o;
  }

  nextBestAction(ctx: TenantContext, caseId: string) {
    this.caseOf(ctx, caseId, 'VIEW');
    const acts = [...this.actions.values()].filter((a) => a.caseId === caseId);
    const s = this.latestScore(caseId);
    return nextBestActions({ actions: acts, weakDimensions: (s?.dimensions ?? []).filter((d) => d.score !== null && d.score < 2).map((d) => ({ dimension: d.dimension, score: d.score! })), openCriticalRisks: 0, now: this.d.now() });
  }

  /** Report separates verified fact, client-reported, AI interpretation, and human judgement. */
  report(ctx: TenantContext, caseId: string) {
    const c = this.caseOf(ctx, caseId, 'EXPORT');
    const org = this.orgs.get(c.organisationId)!;
    const s = this.latestScore(caseId);
    const recs = [...this.recs.values()].filter((r) => r.caseId === caseId);
    const decs = this.decisions.filter((x) => recs.some((r) => r.id === x.recommendationId));
    return {
      organisation: org.name, caseState: c.state, generatedAt: this.d.now().toISOString(),
      framework: { scoringVersion: s?.scoringVersion ?? null, diagnosticDate: s?.computedAt ?? null, formula: s?.formula ?? null },
      calculated: s ? { overall: s.overall, maturity: s.maturity, coverage: s.coverage, dimensions: s.dimensions } : null,
      clientReported: org.profile,
      aiInterpretation: recs.map((r) => ({ id: r.id, agent: r.agent, confidence: r.confidence, status: r.status, output: r.output, disclaimer: r.disclaimer })),
      humanJudgement: decs.map((x) => ({ action: x.action, by: x.decidedBy, reason: x.reason, final: x.finalDecision })),
      verifiedOutcomes: [...this.outcomes.values()].filter((o) => o.caseId === caseId && o.status === 'VERIFIED').map((o) => ({ description: o.description, evidence: o.evidenceRefs, attribution: o.attribution })),
      unverifiedOutcomes: [...this.outcomes.values()].filter((o) => o.caseId === caseId && o.status !== 'VERIFIED').map((o) => ({ description: o.description, status: o.status })),
      limitations: [
        ...(s && s.coverage < 1 ? [`Diagnostic coverage is ${Math.round(s.coverage * 100)}%; unanswered questions were excluded, not scored as zero.`] : []),
        'AI interpretations are drafts unless a human decision is listed. Outcome attribution has not been assessed; correlation is not causation.',
      ],
    };
  }
}
