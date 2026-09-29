import { createHash } from 'node:crypto';

export interface AuditEvent {
  seq: number;
  tenantId: string;
  who: string;
  what: string;
  when: string;
  entity: string;
  before: unknown;
  after: unknown;
  why: string | null;
  source: string;
  approval: string | null;
  prevHash: string;
  hash: string;
}
export type AuditInput = Omit<AuditEvent, 'seq' | 'when' | 'prevHash' | 'hash'>;

function deepFreeze<T>(o: T): T {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o)) deepFreeze(v);
  }
  return o;
}

const GENESIS = '0'.repeat(64);

const canonical = (v: unknown): string =>
  JSON.stringify(v, (_k, x) =>
    x && typeof x === 'object' && !Array.isArray(x)
      ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.localeCompare(b)))
      : x,
  );

const hashOf = (e: Omit<AuditEvent, 'hash'>) => createHash('sha256').update(canonical(e)).digest('hex');

/** Append-only. There is intentionally no update or delete method. */
export class AuditLog {
  private events: AuditEvent[] = [];

  append(input: AuditInput, now: Date): AuditEvent {
    const prevHash = this.events.at(-1)?.hash ?? GENESIS;
    // Clone so later mutation of caller-owned objects cannot alter a sealed record.
    const partial = { ...structuredClone(input), seq: this.events.length + 1, when: now.toISOString(), prevHash };
    const ev = deepFreeze({ ...partial, hash: hashOf(partial) }) as AuditEvent;
    this.events.push(ev);
    return ev;
  }

  list(tenantId: string): readonly AuditEvent[] {
    return this.events.filter((e) => e.tenantId === tenantId);
  }

  /** Returns the seq of the first broken record, or null if the chain is intact. */
  verifyChain(events: readonly AuditEvent[] = this.events): number | null {
    let prev = GENESIS;
    for (const [i, e] of events.entries()) {
      const { hash, ...rest } = e;
      if (e.prevHash !== prev || e.seq !== i + 1 || hashOf(rest) !== hash) return e.seq;
      prev = hash;
    }
    return null;
  }

  snapshot(): AuditEvent[] {
    return this.events.map((e) => structuredClone(e));
  }
}
