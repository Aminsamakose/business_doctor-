# Data Model

Canonical model: `prisma/schema.prisma` (PostgreSQL). TypeScript domain types in `src/core/domain`.

## Conventions
- Every row: `id` (cuid), `createdAt`, `updatedAt`, `createdBy`, `updatedBy`.
- Tenant scope: `tenantId` on every tenant-owned table; all repository calls require a `TenantContext`.
- Versioned entities (DiagnosticVersion, ScoringVersion, PromptVersion, Prescription…) are immutable once published; changes create a new version.
- Snapshots (HealthScore, Diagnosis, AIRecommendation) are append-only. History is never overwritten.

## Ontology mapping
ENTITY→CONDITION→ROOT CAUSE→EVIDENCE→RISK→GOAL→INTERVENTION→ACTION→RESOURCE→KPI→OUTPUT→OUTCOME→IMPACT→LESSON

| Ontology | Table |
|---|---|
| Entity | Organisation |
| Condition | Diagnosis (+ dimension scores) |
| Root cause | RootCause |
| Evidence | Evidence, Document |
| Risk | Risk |
| Goal | Goal |
| Intervention | Intervention (catalogue), Prescription |
| Action | Action |
| KPI/Output/Outcome | Kpi, KpiReading, Outcome |
| Lesson | LearningRecord |

## Separation of concepts
FACT (Response, Evidence) · RULE (ScoringVersion, Rule) · AI INTERPRETATION (AiRecommendation) · HUMAN DECISION (Approval) · MEASURED OUTCOME (Outcome + verification). These are separate tables and never merged.

## Source of truth
Org master → Organisation; responses → Response; score → HealthScore (engine output only); AI → AiRecommendation; human decision → Approval; audit → AuditEvent (hash-chained). Conflicts create a `DataQualityIssue` and preserve both values.

## MVP tables implemented in schema
Tenant, User, Membership, Organisation, Case, CaseTransition, Programme, DiagnosticVersion, Response, Evidence, HealthScore, Diagnosis, RootCause, Risk, Goal, Prescription, Action, Coach assignment, CoachingSession, Kpi, KpiReading, Outcome, AiRequest, AiRecommendation, Approval, DataQualityIssue, AuditEvent, DomainEvent, KnowledgeAsset, LearningRecord.

Deferred tables (Contract, Invoice, Payment, Marketplace, Experiment, CaseStudy…) are documented in the spec and added in later milestones with their feature flags.
