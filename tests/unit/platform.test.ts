import { describe, expect, it } from 'vitest';
import { applyTransition, allowedTriggers, TRANSITIONS } from '@/core/cases';
import { evaluateRules, promote, testRule, nextVersion, type RuleDef } from '@/core/rules';
import { AuditLog } from '@/core/audit';
import { EventBus, type DomainEvent } from '@/core/events';
import { authorize, can } from '@/core/auth';
import { nextBestActions } from '@/core/nba';
import { ForbiddenError, InvalidTransitionError } from '@/core/domain';
import { aiCtx, human, NOW } from '../fixtures';

describe('case state machine', () => {
  it('follows the happy path with guards', () => {
    expect(applyTransition('DIAGNOSTIC', 'DiagnosticCompleted', 'SYSTEM', { hasScore: true }, NOW).to).toBe('DIAGNOSED');
    expect(() => applyTransition('DIAGNOSTIC', 'DiagnosticCompleted', 'SYSTEM', {}, NOW)).toThrow(InvalidTransitionError);
  });
  it('AI cannot advance a case', () => {
    expect(() => applyTransition('DIAGNOSED', 'PrescriptionGenerated', 'AI', { diagnosisApproved: true }, NOW)).toThrow(/may not/);
  });
  it('requires human approval before execution', () => {
    expect(() => applyTransition('PENDING_APPROVAL', 'PrescriptionApproved', 'SYSTEM', { prescriptionApproved: true }, NOW)).toThrow();
    expect(() => applyTransition('PENDING_APPROVAL', 'PrescriptionApproved', 'HUMAN', {}, NOW)).toThrow();
    expect(applyTransition('PENDING_APPROVAL', 'PrescriptionApproved', 'HUMAN', { prescriptionApproved: true }, NOW).to).toBe('IN_EXECUTION');
  });
  it('undeclared transitions are rejected and every state is reachable', () => {
    expect(() => applyTransition('NEW', 'Graduate', 'HUMAN', {}, NOW)).toThrow(InvalidTransitionError);
    const reach = new Set(['NEW']); let grew = true;
    while (grew) { grew = false; for (const t of TRANSITIONS) if (reach.has(t.from) && !reach.has(t.to)) { reach.add(t.to); grew = true; } }
    expect(reach.size).toBe(16);
    expect(allowedTriggers('CLOSED')).toEqual([]);
  });
});

describe('rules engine', () => {
  const rule: RuleDef = { id: 'r1', version: 1, status: 'DRAFT', description: 'low cash', when: [{ field: 'cashMonths', op: 'lt', value: 1 }], then: { action: 'RAISE_RISK', params: { level: 'CRITICAL' } } };
  const tests = [{ name: 'fires', facts: { cashMonths: 0.5 }, expectFires: true }, { name: 'quiet', facts: { cashMonths: 4 }, expectFires: false }, { name: 'missing fact never fires', facts: {}, expectFires: false }];
  it('tests before deployment; draft rules do not fire', () => {
    expect(evaluateRules([rule], { cashMonths: 0.5 })).toEqual([]);
    expect(testRule(rule, tests).passed).toBe(true);
    expect(evaluateRules([promote(rule, tests)], { cashMonths: 0.5 })[0]).toMatchObject({ action: 'RAISE_RISK', version: 1 });
  });
  it('refuses to promote an untested or failing rule', () => {
    expect(() => promote(rule, [])).toThrow();
    expect(() => promote(rule, [{ name: 'bad', facts: { cashMonths: 9 }, expectFires: true }])).toThrow(/failed tests/);
  });
  it('changes create a new draft version', () => {
    const v2 = nextVersion(promote(rule, tests), { when: [{ field: 'cashMonths', op: 'lt', value: 2 }] });
    expect(v2).toMatchObject({ version: 2, status: 'DRAFT' });
  });
});

describe('audit log', () => {
  const mk = () => { const l = new AuditLog(); for (let i = 0; i < 3; i++) l.append({ tenantId: 't1', who: 'u', what: `E${i}`, entity: 'x', before: null, after: { i }, why: null, source: 's', approval: null }, NOW); return l; };
  it('chain verifies', () => expect(mk().verifyChain()).toBeNull());
  it('detects edits, deletions, reordering', () => {
    const edited = mk().snapshot(); (edited[1].after as { i: number }).i = 99;
    expect(new AuditLog().verifyChain(edited)).toBe(2);
    const deleted = mk().snapshot(); deleted.splice(1, 1);
    expect(new AuditLog().verifyChain(deleted)).not.toBeNull();
    const swapped = mk().snapshot(); [swapped[0], swapped[1]] = [swapped[1], swapped[0]];
    expect(new AuditLog().verifyChain(swapped)).not.toBeNull();
  });
  it('later mutation of caller-owned objects cannot alter sealed records', () => {
    const l = new AuditLog(); const obj = { status: 'A' };
    l.append({ tenantId: 't1', who: 'u', what: 'W', entity: 'x', before: null, after: obj, why: null, source: 's', approval: null }, NOW);
    obj.status = 'B';
    expect(l.list('t1')[0].after).toEqual({ status: 'A' }); expect(l.verifyChain()).toBeNull();
  });
  it('stored events are frozen and tenant-filtered', () => {
    const l = mk(); l.append({ tenantId: 't2', who: 'u', what: 'X', entity: 'y', before: null, after: null, why: null, source: 's', approval: null }, NOW);
    expect(l.list('t1')).toHaveLength(3); expect(l.list('t2')).toHaveLength(1);
    expect(() => { (l.list('t1')[0] as { what: string }).what = 'hack'; }).toThrow();
  });
});

describe('event bus', () => {
  const ev = (key: string, type = 'ActionOverdue'): DomainEvent => ({ id: key, type, tenantId: 't1', idempotencyKey: key, payload: {}, at: NOW.toISOString() });
  it('ignores duplicate events per handler', async () => {
    const bus = new EventBus(); let n = 0; bus.on('ActionOverdue', 'notify', () => { n++; });
    await bus.publish(ev('k1')); const r = await bus.publish(ev('k1'));
    expect(n).toBe(1); expect(r.duplicate).toBe(true); expect(bus.store).toHaveLength(1);
  });
  it('retries then succeeds without duplicating side effects', async () => {
    const bus = new EventBus({ maxAttempts: 3 }); let calls = 0; let effects = 0;
    bus.on('ActionOverdue', 'flaky', () => { if (++calls < 3) throw new Error('boom'); effects++; });
    await bus.publish(ev('k2')); await bus.publish(ev('k2'));
    expect(calls).toBe(3); expect(effects).toBe(1); expect(bus.deadLetters).toHaveLength(0);
  });
  it('dead-letters after max attempts and raises SystemError', async () => {
    const bus = new EventBus({ maxAttempts: 2 }); const errs: DomainEvent[] = [];
    bus.on('ActionOverdue', 'bad', () => { throw new Error('always'); }); bus.on('SystemError', 'watch', (e) => { errs.push(e); });
    await bus.publish(ev('k3'));
    expect(bus.deadLetters[0]).toMatchObject({ handler: 'bad', attempts: 2 }); expect(errs).toHaveLength(1);
  });
  it('same key in different tenants is not a duplicate', async () => {
    const bus = new EventBus(); let n = 0; bus.on('ActionOverdue', 'h', () => { n++; });
    await bus.publish(ev('k')); await bus.publish({ ...ev('k'), tenantId: 't2' }); expect(n).toBe(2);
  });
});

describe('authorisation and tenancy', () => {
  const res = { tenantId: 't1' };
  it('denies cross-tenant access', () => {
    expect(() => authorize(human('t2', 'ADMINISTRATOR'), 'VIEW', res)).toThrow(ForbiddenError);
    expect(can(human('t1', 'ADMINISTRATOR'), 'VIEW', res)).toBe(true);
  });
  it('denies a forged context whose actor tenant differs', () => {
    const forged = { ...human('t2', 'ADMINISTRATOR'), tenantId: 't1' };
    expect(() => authorize(forged, 'VIEW', res)).toThrow(/Cross-tenant/);
  });
  it('enforces role permissions', () => {
    expect(can(human('t1', 'DONOR'), 'EDIT', res)).toBe(false);
    expect(can(human('t1', 'COACH'), 'APPROVE', res)).toBe(false);
    expect(can(human('t1', 'COACH'), 'OVERRIDE', res)).toBe(false);
    expect(can(human('t1', 'PROGRAMME_MANAGER'), 'OVERRIDE', res)).toBe(true);
  });
  it('AI is a system actor that can only read and draft', () => {
    expect(can(aiCtx(), 'CREATE', res)).toBe(true);
    for (const p of ['APPROVE', 'EDIT', 'DELETE', 'OVERRIDE', 'EXPORT'] as const) expect(can(aiCtx(), p, res)).toBe(false);
  });
});

describe('next best action', () => {
  const base = { weakDimensions: [], openCriticalRisks: 0, now: NOW };
  it('excludes blocked actions and prefers overdue and unblocking ones', () => {
    const r = nextBestActions({ ...base, actions: [
      { id: 'a', title: 'A', owner: 'o', deadline: '2026-12-01', status: 'OPEN' },
      { id: 'b', title: 'B', owner: 'o', deadline: '2026-09-01', status: 'OPEN' },
      { id: 'c', title: 'C', owner: 'o', deadline: null, status: 'OPEN', blockedBy: ['a'] },
      { id: 'd', title: 'D', owner: 'o', deadline: null, status: 'BLOCKED' },
    ] });
    expect(r.map((x) => x.actionId)).toEqual(['b', 'a']);
    expect(r[0].why).toMatch(/overdue/);
    expect(r[0].framing).toMatch(/not a guaranteed/);
  });
  it('unblocks dependants once the blocker is done', () => {
    const r = nextBestActions({ ...base, actions: [{ id: 'a', title: 'A', owner: null, deadline: null, status: 'DONE' }, { id: 'c', title: 'C', owner: null, deadline: null, status: 'OPEN', blockedBy: ['a'] }] });
    expect(r[0].actionId).toBe('c');
  });
});
