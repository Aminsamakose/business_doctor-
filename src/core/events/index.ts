export interface DomainEvent<P = unknown> {
  id: string;
  type: string;
  tenantId: string;
  idempotencyKey: string;
  payload: P;
  at: string;
}
export type Handler = (e: DomainEvent) => Promise<void> | void;

export interface DeadLetter { event: DomainEvent; handler: string; error: string; attempts: number }

/**
 * At-least-once, in-process bus. Each (handler, idempotencyKey) succeeds at most once,
 * failures retry up to maxAttempts, then dead-letter and raise a SystemError event.
 */
export class EventBus {
  private handlers = new Map<string, { name: string; fn: Handler }[]>();
  private done = new Set<string>();
  readonly store: DomainEvent[] = [];
  readonly deadLetters: DeadLetter[] = [];

  constructor(private opts: { maxAttempts: number } = { maxAttempts: 3 }) {}

  on(type: string, name: string, fn: Handler) {
    this.handlers.set(type, [...(this.handlers.get(type) ?? []), { name, fn }]);
  }

  async publish(e: DomainEvent): Promise<{ duplicate: boolean }> {
    const seen = this.store.some((x) => x.tenantId === e.tenantId && x.idempotencyKey === e.idempotencyKey && x.type === e.type);
    if (!seen) this.store.push(e);
    for (const h of this.handlers.get(e.type) ?? []) {
      const key = `${h.name}|${e.tenantId}|${e.type}|${e.idempotencyKey}`;
      if (this.done.has(key)) continue;
      let attempts = 0;
      for (;;) {
        attempts++;
        try {
          await h.fn(e);
          this.done.add(key);
          break;
        } catch (err) {
          if (attempts >= this.opts.maxAttempts) {
            this.deadLetters.push({ event: e, handler: h.name, error: String(err), attempts });
            if (e.type !== 'SystemError')
              await this.publish({ id: `${e.id}:err:${h.name}`, type: 'SystemError', tenantId: e.tenantId, idempotencyKey: `${e.idempotencyKey}:${h.name}`, payload: { handler: h.name, error: String(err) }, at: e.at });
            break;
          }
        }
      }
    }
    return { duplicate: seen };
  }
}
