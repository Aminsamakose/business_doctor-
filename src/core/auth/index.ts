import { ForbiddenError, type Permission, type Role, type TenantContext } from '../domain';

const ALL: Permission[] = ['VIEW', 'CREATE', 'EDIT', 'APPROVE', 'DELETE', 'EXPORT', 'OVERRIDE'];

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  ADMINISTRATOR: ALL,
  PROGRAMME_MANAGER: ['VIEW', 'CREATE', 'EDIT', 'APPROVE', 'EXPORT', 'OVERRIDE'],
  CONSULTANT: ['VIEW', 'CREATE', 'EDIT', 'APPROVE', 'EXPORT'],
  COACH: ['VIEW', 'CREATE', 'EDIT'],
  BUSINESS_OWNER: ['VIEW', 'CREATE', 'EDIT', 'APPROVE', 'EXPORT'],
  CEO: ['VIEW', 'CREATE', 'EDIT', 'APPROVE', 'EXPORT'],
  EXPERT: ['VIEW', 'CREATE'],
  PARTNER: ['VIEW', 'EXPORT'],
  DONOR: ['VIEW'],
};

export interface Resource { tenantId: string; organisationId?: string }

/** Fail closed: role must grant the permission AND the resource must belong to the caller's tenant. */
export function authorize(ctx: TenantContext, permission: Permission, resource: Resource): void {
  const { actor } = ctx;
  if (actor.tenantId !== ctx.tenantId || resource.tenantId !== ctx.tenantId)
    throw new ForbiddenError('Cross-tenant access denied');
  if (actor.kind === 'AI') {
    if (permission !== 'VIEW' && permission !== 'CREATE') throw new ForbiddenError('AI may only read and draft');
    return;
  }
  if (actor.kind === 'SYSTEM') return;
  if (!ROLE_PERMISSIONS[actor.role].includes(permission)) throw new ForbiddenError(`${actor.role} lacks ${permission}`);
}

export const can = (ctx: TenantContext, p: Permission, r: Resource) => {
  try { authorize(ctx, p, r); return true; } catch { return false; }
};
