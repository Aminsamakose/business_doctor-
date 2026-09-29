import { describe, expect, it } from 'vitest';
import { JourneyService } from '@/core/services/journey';
import { Orchestrator } from '@/core/ai/orchestrator';
import type { LlmProvider } from '@/core/ai/provider';
import { AuditLog } from '@/core/audit';
import { EventBus } from '@/core/events';
import { SME360_SCORING_V0_1 } from '@/core/scoring/sme360';
import { answersAll, ctxItem, goodDiagnosis, human, NOW } from '../fixtures';

function setup(outputs: string[] = [goodDiagnosis(['ev-1'])]) {
  const audit = new AuditLog(); const bus = new EventBus(); const q = [...outputs];
  const provider: LlmProvider = { complete: async () => ({ text: q.shift() ?? '{}', model: 'mock', modelVersion: 'mock-1', inputTokens: 1, outputTokens: 1 }) };
  let i = 0;
  const orchestrator = new Orchestrator({ provider, audit, rules: [], now: () => NOW, newId: () => `rec-${++i}` });
  const svc = new JourneyService({ audit, bus, orchestrator, scoring: SME360_SCORING_V0_1, now: () => NOW });
  return { svc, audit, bus };
}
const evidence = [ctxItem('ev-1', { evidenceLevel: 'DOCUMENT_SUPPORTED' })];
const owner = human('t1', 'BUSINESS_OWNER'); const coach = human('t1', 'COACH'); const consultant = human('t1', 'CONSULTANT');
const prescription = { problem: 'p', intervention: 'i', rationale: 'r', evidence: ['ev-1'], prerequisites: [], dependencies: [], actions: [{ title: 'Reconcile monthly', owner: 'owner', deadline: '2026-10-15' }], owners: [], deadlines: [], kpis: [], resources: [], risks: [], confidence: 'HIGH' as const, reviewRequired: false };

describe('SME360 journey (acceptance subset, in-memory)', () => {
  it('runs organisation → report with audit trail and human governance', async () => {
    const { svc, audit, bus } = setup();
    const { org, case: c } = svc.createOrganisation(owner, 'Acme Traders', { sector: 'retail', employees: 8 });
    expect(c.state).toBe('DIAGNOSTIC');

    const score = await svc.submitDiagnostic(owner, c.id, answersAll(3));
    expect(score.overall).toBe(3); expect(c.state).toBe('DIAGNOSED');
    expect(bus.store.map((e) => e.type)).toContain('DiagnosticCompleted');

    const r = await svc.analyse(consultant, c.id, evidence);
    if (r.status !== 'OK') throw new Error('expected OK');
    expect(r.recommendation.status).toBe('PENDING_REVIEW');
    expect(c.state).toBe('DIAGNOSED'); // AI did not advance the case

    svc.review(consultant, r.recommendation.id, 'APPROVED', 'consistent with bank statements');
    expect(c.state).toBe('PRESCRIBED');

    svc.submitPrescription(consultant, c.id, prescription);
    expect(c.state).toBe('PENDING_APPROVAL');
    expect(() => svc.approvePrescription(coach, c.id)).toThrow(/lacks APPROVE/);
    svc.approvePrescription(owner, c.id);
    expect(c.state).toBe('IN_EXECUTION');

    svc.assignCoach(consultant, c.id, 'coach-1'); expect(c.state).toBe('COACHING');
    svc.recordKpi(coach, { caseId: c.id, kpi: 'cash_months', value: 2, baseline: 1, target: 3 });

    const nba = svc.nextBestAction(owner, c.id);
    expect(nba[0]).toMatchObject({ action: 'Reconcile monthly', status: 'RECOMMENDED' });

    const out = svc.reportOutcome(owner, c.id, 'Monthly reconciliation in place');
    expect(svc.verifyOutcome(consultant, out.id, true).status).toBe('INSUFFICIENT_EVIDENCE'); // no evidence yet
    svc.submitOutcomeEvidence(owner, out.id, ['doc-77']);
    expect(svc.verifyOutcome(consultant, out.id, true).status).toBe('VERIFIED');

    const rep = svc.report(consultant, c.id);
    expect(rep.calculated?.overall).toBe(3);
    expect(rep.framework.scoringVersion).toBe('0.1.0');
    expect(rep.aiInterpretation).toHaveLength(1);
    expect(rep.humanJudgement[0]).toMatchObject({ action: 'APPROVED', by: 'u-CONSULTANT' });
    expect(rep.clientReported).toEqual({ sector: 'retail', employees: 8 });
    expect(rep.verifiedOutcomes).toHaveLength(1);
    expect(rep.limitations.join(' ')).toMatch(/correlation is not causation/);

    const trail = audit.list('t1').map((e) => e.what);
    for (const w of ['ORGANISATION_CREATED', 'HEALTH_SCORE_COMPUTED', 'AI_RECOMMENDATION_CREATED', 'AI_APPROVED', 'PRESCRIPTION_APPROVED', 'KPI_UPDATED', 'OUTCOME_VERIFICATION', 'CASE_TRANSITION']) expect(trail).toContain(w);
    expect(audit.verifyChain()).toBeNull();
    expect(org.id).toBeTruthy(); expect(org.tenantId).toBe('t1');
  });

  it('history is preserved on re-diagnosis (scores append)', async () => {
    const { svc } = setup();
    const { case: c } = svc.createOrganisation(owner, 'X', {});
    const first = await svc.submitDiagnostic(owner, c.id, answersAll(2));
    c.state = 'DIAGNOSTIC';
    await svc.submitDiagnostic(owner, c.id, answersAll(4));
    expect(svc.scores.get(c.id)).toHaveLength(2);
    expect(svc.scores.get(c.id)![0]).toEqual(first);
  });

  it('tenant isolation: another tenant cannot read, edit, or report on the case', async () => {
    const { svc } = setup();
    const { case: c } = svc.createOrganisation(owner, 'X', {});
    const other = human('t2', 'ADMINISTRATOR');
    await expect(svc.submitDiagnostic(other, c.id, answersAll(3))).rejects.toThrow(/Cross-tenant/);
    expect(() => svc.report(other, c.id)).toThrow(/Cross-tenant/);
    expect(() => svc.nextBestAction(other, c.id)).toThrow(/Cross-tenant/);
  });

  it('failure: invalid AI output twice escalates to human and case is unchanged', async () => {
    const { svc, audit } = setup(['{}', 'nope']);
    const { case: c } = svc.createOrganisation(owner, 'X', {});
    await svc.submitDiagnostic(owner, c.id, answersAll(3));
    const r = await svc.analyse(consultant, c.id, evidence);
    expect(r.status).toBe('NEEDS_HUMAN'); expect(c.state).toBe('DIAGNOSED');
    expect(audit.list('t1').filter((e) => e.what === 'AI_OUTPUT_REJECTED')).toHaveLength(2);
  });

  it('failure: cannot skip approval, AI cannot review, donor cannot edit, rejection does not advance', async () => {
    const { svc } = setup();
    const { case: c } = svc.createOrganisation(owner, 'X', {});
    await svc.submitDiagnostic(owner, c.id, answersAll(3));
    expect(() => svc.submitPrescription(consultant, c.id, prescription)).toThrow(/No transition/);
    const r = await svc.analyse(consultant, c.id, evidence); if (r.status !== 'OK') throw new Error();
    expect(() => svc.review({ actor: { kind: 'AI', agent: 'sme-diagnostic', tenantId: 't1' }, tenantId: 't1', requestId: 'x' }, r.recommendation.id, 'APPROVED', 'self')).toThrow(/human/);
    svc.review(consultant, r.recommendation.id, 'REJECTED', 'not supported');
    expect(c.state).toBe('DIAGNOSED');
    await expect(svc.submitDiagnostic(human('t1', 'DONOR'), c.id, answersAll(3))).rejects.toThrow(/lacks EDIT/);
  });

  it('failure: AI cannot verify outcomes; rejected outcome is not counted as verified', async () => {
    const { svc } = setup();
    const { case: c } = svc.createOrganisation(owner, 'X', {});
    const o = svc.reportOutcome(owner, c.id, 'Sales up'); svc.submitOutcomeEvidence(owner, o.id, ['d1']);
    expect(() => svc.verifyOutcome({ actor: { kind: 'AI', agent: 'a', tenantId: 't1' }, tenantId: 't1', requestId: 'x' }, o.id, true)).toThrow(/human/);
    svc.verifyOutcome(consultant, o.id, false);
    expect(svc.report(consultant, c.id).verifiedOutcomes).toHaveLength(0);
  });
});
