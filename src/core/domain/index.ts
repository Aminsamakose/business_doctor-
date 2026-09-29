export type Id = string;

export type EvidenceLevel =
  | 'VERIFIED'
  | 'EXPERT_VALIDATED'
  | 'DOCUMENT_SUPPORTED'
  | 'SELF_REPORTED'
  | 'INFERRED'
  | 'UNVERIFIED'
  | 'MISSING';

export type Role =
  | 'BUSINESS_OWNER'
  | 'CEO'
  | 'COACH'
  | 'CONSULTANT'
  | 'PROGRAMME_MANAGER'
  | 'PARTNER'
  | 'DONOR'
  | 'EXPERT'
  | 'ADMINISTRATOR';

export type Permission = 'VIEW' | 'CREATE' | 'EDIT' | 'APPROVE' | 'DELETE' | 'EXPORT' | 'OVERRIDE';

/** Who performed an action. AI is a system actor, never a human role. */
export type Actor =
  | { kind: 'HUMAN'; userId: Id; role: Role; tenantId: Id }
  | { kind: 'SYSTEM'; name: string; tenantId: Id }
  | { kind: 'AI'; agent: string; tenantId: Id };

export interface TenantContext {
  actor: Actor;
  tenantId: Id;
  requestId: string;
}

export class DomainError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}
export class ForbiddenError extends DomainError {
  constructor(message = 'Forbidden') {
    super(message, 'FORBIDDEN');
  }
}
export class InvalidTransitionError extends DomainError {
  constructor(message: string) {
    super(message, 'INVALID_TRANSITION');
  }
}
export class ValidationError extends DomainError {
  constructor(message: string) {
    super(message, 'VALIDATION');
  }
}

/** Feature flags: unfinished modules stay off in the MVP. */
export const FEATURE_FLAGS = {
  SME360: true,
  AGRIFOOD360: false,
  ESO360: false,
  KNOWLEDGE_GRAPH: false,
  SCENARIO_ENGINE: false,
  MARKETPLACE: false,
  ECOSYSTEM_INTELLIGENCE: false,
  ADVANCED_AI: false,
  COMMERCIAL: false,
  OFFLINE_MODE: false,
} as const;
export type FeatureFlag = keyof typeof FEATURE_FLAGS;
export const isEnabled = (f: FeatureFlag, overrides: Partial<Record<FeatureFlag, boolean>> = {}) =>
  overrides[f] ?? FEATURE_FLAGS[f];
