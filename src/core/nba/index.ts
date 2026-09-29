export interface NbaInput {
  actions: { id: string; title: string; owner: string | null; deadline: string | null; status: 'OPEN' | 'DONE' | 'BLOCKED'; blockedBy?: string[]; goalId?: string; kpiId?: string; risk?: 'LOW' | 'MEDIUM' | 'HIGH'; resources?: string[] }[];
  weakDimensions: { dimension: string; score: number }[];
  openCriticalRisks: number;
  now: Date;
}

export interface NextBestAction {
  actionId: string;
  action: string;
  why: string;
  owner: string | null;
  deadline: string | null;
  requiredResources: string[];
  relatedGoal: string | null;
  relatedKpi: string | null;
  risk: string;
  status: 'RECOMMENDED';
  /** Always framed as a recommendation, never as optimal or guaranteed. */
  framing: string;
}

/**
 * Transparent ranking: overdue > unblocks others > high risk > earliest deadline.
 * Blocked actions are excluded until their blockers are done.
 */
export function nextBestActions(input: NbaInput, limit = 3): NextBestAction[] {
  const done = new Set(input.actions.filter((a) => a.status === 'DONE').map((a) => a.id));
  const open = input.actions.filter((a) => a.status !== 'DONE');
  const ready = open.filter((a) => a.status !== 'BLOCKED' && (a.blockedBy ?? []).every((b) => done.has(b)));
  const unblocks = (id: string) => open.filter((o) => o.blockedBy?.includes(id)).length;
  const t = input.now.getTime();
  const overdue = (a: (typeof ready)[number]) => (a.deadline ? new Date(a.deadline).getTime() < t : false);
  const rank = { LOW: 0, MEDIUM: 1, HIGH: 2 } as const;

  const scored = ready.map((a) => ({ a, key: [overdue(a) ? 1 : 0, unblocks(a.id), rank[a.risk ?? 'LOW'], a.deadline ? -new Date(a.deadline).getTime() : -Infinity] }));
  scored.sort((x, y) => { for (let i = 0; i < x.key.length; i++) { if (y.key[i] !== x.key[i]) return y.key[i] - x.key[i]; } return x.a.id.localeCompare(y.a.id); });

  return scored.slice(0, limit).map(({ a }) => {
    const reasons = [
      overdue(a) && 'it is overdue',
      unblocks(a.id) > 0 && `it unblocks ${unblocks(a.id)} other action(s)`,
      a.risk === 'HIGH' && 'it is linked to a high risk',
      input.openCriticalRisks > 0 && `${input.openCriticalRisks} critical risk(s) are open`,
    ].filter(Boolean) as string[];
    return {
      actionId: a.id, action: a.title, why: reasons.length ? `Recommended because ${reasons.join(', ')}.` : 'Recommended as the earliest ready action by deadline.',
      owner: a.owner, deadline: a.deadline, requiredResources: a.resources ?? [], relatedGoal: a.goalId ?? null, relatedKpi: a.kpiId ?? null,
      risk: a.risk ?? 'LOW', status: 'RECOMMENDED' as const,
      framing: 'A recommendation based on the stated criteria and recorded evidence; not a guaranteed or objectively optimal choice.',
    };
  });
}
