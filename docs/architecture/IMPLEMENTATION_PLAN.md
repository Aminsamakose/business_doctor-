# Samakose AI — Implementation Plan

Status: living document. Last updated 2026-09-29. Milestone M1 (foundation) in progress.

## 1. Current architecture (as found)

| Area | Finding |
|---|---|
| Framework | Next.js 16.3.5 (App Router), React 19, Tailwind 4. `AGENTS.md` warns of breaking changes (`middleware` is now `proxy`). |
| Data | `src/lib/store.ts` writes to Supabase using the **public anon key from the browser**. No tenancy, no auth, no versioning. |
| Scoring | `src/app/api/diagnose/route.ts`: 36 questions, 12 dimensions (D1–D12), 10 rule-based "patterns", scores computed inline in a route handler. Unversioned. Score = unweighted mean of dimension %. |
| AI | `src/app/api/prescribe/route.ts` calls Claude from a route, free text output, no schema, no audit, no review. Imports `@anthropic-ai/sdk`, which was not in `package.json`. |
| Auth | `/admin` is a client-side page; no real authentication. |
| Tests | None. |
| Health at start | `tsc` failed (typo in `diagnose/page.tsx`), lint had 8 errors, a stray file `admin/login/page.tsx\`` (backtick in name). |

Working prototype behaviour (free check, diagnose, prescribe, monitor, admin pages, EN/other i18n) is **preserved**. It is not deleted; it is progressively re-pointed at the new core.

## 2. Proposed architecture

**Modular monolith** in the existing Next.js app. Domain modules live in `src/core/<module>` and are framework-free TypeScript (no `next`, no React, no Prisma imports in domain logic). Persistence, AI provider and integrations are reached only through interfaces (ports) defined in the module that needs them.

```
src/core/
  domain/       ids, enums, base entity, errors
  scoring/      deterministic scoring + maturity (versioned configs)
  evidence/     evidence levels, classification, upgrade rules
  quality/      data-quality detection (missing, contradictory, stale…)
  cases/        explicit case state machine
  rules/        versioned WHEN/THEN rules engine + rule tests
  ai/           output contracts (zod), validation/repair, safety, context builder, orchestrator, override
  audit/        hash-chained append-only audit log
  events/       idempotent event bus with retry + dead letter
  auth/         RBAC + tenant scope guard
  nba/          next-best-action engine
prisma/schema.prisma   canonical PostgreSQL model
src/app/…              UI + thin route handlers (validate → authorise → call core)
docs/                  architecture, ADRs
```

Route handlers and UI never contain business rules and never call Claude directly; they call core services.

## 3. Gaps against the master specification

Implemented in M1 (with tests): scoring, maturity, evidence rules, quality detection, case state machine, rules engine, AI contracts/validation/safety/override, orchestrator (provider-injected), context builder, audit chain, event bus, RBAC/tenancy, NBA.

Not yet built (explicit, not faked): Prisma repositories + migrations against a live DB, real authentication provider, UI for the full journey, document intelligence, Kobo/Drive/Gmail/Calendar adapters, notifications, offline mode, programme engine, commercial engine, portfolio, AgriFood360, ESO360, marketplace, scenario engine, digital twin. All post-MVP items stay behind feature flags (`src/core/domain/flags.ts`).

## 4. Assumptions

1. Postgres will be provided via `DATABASE_URL`; Supabase Postgres is acceptable as hosting but its browser anon-key access pattern is retired (see ADR-003).
2. `ANTHROPIC_API_KEY` is supplied server-side only. Tests use a mock provider.
3. The existing 36-question bank is treated as **SME360 diagnostic v0 seed data**, remapped to the SME360 dimensions; it is not authoritative content.
4. Scoring content (weights, thresholds) is configuration owned by Samakose and must be reviewed by a domain lead before pilot.

## 5. Decisions (see ADRs below)

- ADR-001 Modular monolith under `src/core` instead of an npm workspaces `packages/` layout. Reason: existing single-app repo; avoids build-graph overhead; boundaries enforced by directory + lint. Migration to workspaces is mechanical later.
- ADR-002 Domain logic is pure and provider-agnostic; ports for DB, AI, storage, email.
- ADR-003 Retire client-side Supabase writes. All access goes through server route handlers with tenant-scoped authorisation. Supabase remains usable as Postgres host only.
- ADR-004 Scores are immutable snapshots that embed scoring version, inputs, formula and timestamp. Rule changes never rewrite history.
- ADR-005 AI output is untrusted input: zod-validated, evidence references verified against the supplied context, evidence level never upgraded by AI.
- ADR-006 Audit log is append-only and hash-chained so tampering is detectable.
- ADR-007 Prisma 7 pinned with `@prisma/client` 7.10 (a prerelease `prisma@8` was resolving by default).

## 6. Dependencies

`zod` (contracts), `@anthropic-ai/sdk` (provider adapter), `@prisma/client` + `prisma` (persistence), `vitest` (tests). `@types/node` raised to 22 for vitest.

## 7. Risks

| Risk | Mitigation |
|---|---|
| Scoring weights are placeholders without domain validation | Versioned config, "DRAFT" status, release gate before pilot |
| Model ID / SDK drift | Model name is config, not code; provider behind interface |
| Existing prototype pages diverge from core | Re-point incrementally; keep old routes until replaced |
| No live DB in dev container | Repository interfaces + in-memory adapter for tests; `prisma validate` in CI; migration run verified when DB available |
| Scope of spec vastly exceeds one milestone | Strict MVP boundary (SME360 loop), feature flags for the rest |

## 8. Milestone M1 status (verified 2026-09-29)

| Check | Result |
|---|---|
| `npm test` | 67 tests pass (unit, AI evaluation gate, journey integration) |
| `npx tsc --noEmit` | clean |
| `prisma validate` / `generate` | valid; **no migration has been run against a live database** (none available in this environment) |
| `next build` | passes when `NEXT_PUBLIC_SUPABASE_*` are set (legacy `src/lib/supabase.ts` throws at import without them) |
| `npm run lint` | 5 errors remain, all in **legacy prototype code**: `react-hooks/set-state-in-effect` in `admin/page.tsx` and `Navigation.tsx`, impure call in `prescribe/page.tsx`, `any` in `lib/i18n.ts`, `lib/store.ts`. `src/core` is lint-clean. |

Repairs made to the prototype (no behaviour removed): syntax error in `diagnose/page.tsx`, stray file name `page.tsx\``, Tailwind v4 `@apply` of a custom class, missing `@anthropic-ai/sdk` dependency, untyped `useState` hooks.

### Acceptance test (§70) coverage in `tests/integration/journey.test.ts`
Covered in-memory: create organisation, profile, diagnostic, deterministic score, evidence-grounded AI diagnosis (mock provider), human review, prescription, action plan and assignment, coach assignment, KPI update, outcome record and verification, report, next best action, history, audit trail, plus failure scenarios (invalid AI output, skipped approval, AI attempting to decide or verify, cross-tenant access, donor edit).
**Not covered:** persistence to Postgres, real authentication, UI screens, evidence file upload, coaching session notes, live Claude calls.

### Next steps (in order)
1. Postgres repositories implementing the service ports; run and check the first migration.
2. Authentication provider and `proxy.ts` session gate; server route handlers for the journey; remove the browser-side Supabase writes.
3. SME360 diagnostic UI and review screens wired to the service.
4. Replace `/api/prescribe` (unauthenticated, free-text, hard-coded model) with the orchestrator's `intervention` agent.
5. Review scoring weights with a domain lead before any pilot.
