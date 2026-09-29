import { ValidationError } from '../domain';

export type Op = 'lt' | 'lte' | 'gt' | 'gte' | 'eq' | 'neq';
export interface Condition { field: string; op: Op; value: number | string | boolean }

export interface RuleDef {
  id: string;
  version: number;
  status: 'DRAFT' | 'TESTED' | 'ACTIVE' | 'RETIRED';
  description: string;
  /** All conditions must hold (AND). */
  when: Condition[];
  then: { action: string; params?: Record<string, unknown> };
}

export interface RuleTestCase { name: string; facts: Record<string, unknown>; expectFires: boolean }

type Scalar = number | string | boolean;
const OPS: Record<Op, (a: Scalar, b: Scalar) => boolean> = {
  lt: (a, b) => a < b, lte: (a, b) => a <= b, gt: (a, b) => a > b, gte: (a, b) => a >= b,
  eq: (a, b) => a === b, neq: (a, b) => a !== b,
};

export function evaluateRule(rule: RuleDef, facts: Record<string, unknown>): boolean {
  return rule.when.every((c) => {
    const v = facts[c.field];
    // A missing fact never satisfies a condition: absence is not evidence.
    if (v === undefined || v === null) return false;
    return OPS[c.op](v as Scalar, c.value);
  });
}

export interface RuleFiring { ruleId: string; version: number; action: string; params?: Record<string, unknown> }

export function evaluateRules(rules: RuleDef[], facts: Record<string, unknown>): RuleFiring[] {
  return rules
    .filter((r) => r.status === 'ACTIVE' && evaluateRule(r, facts))
    .map((r) => ({ ruleId: r.id, version: r.version, action: r.then.action, params: r.then.params }));
}

/** Rules must pass their own tests before promotion to ACTIVE. */
export function testRule(rule: RuleDef, tests: RuleTestCase[]) {
  const failures = tests.filter((t) => evaluateRule(rule, t.facts) !== t.expectFires).map((t) => t.name);
  return { passed: failures.length === 0 && tests.length > 0, failures };
}

export function promote(rule: RuleDef, tests: RuleTestCase[]): RuleDef {
  const r = testRule(rule, tests);
  if (!r.passed) throw new ValidationError(`Rule ${rule.id} failed tests: ${r.failures.join(', ') || 'no tests supplied'}`);
  return { ...rule, status: 'ACTIVE' };
}

/** New version instead of mutation, so historical firings stay explainable. */
export const nextVersion = (rule: RuleDef, patch: Partial<Omit<RuleDef, 'id' | 'version'>>): RuleDef => ({
  ...rule, ...patch, version: rule.version + 1, status: 'DRAFT',
});
