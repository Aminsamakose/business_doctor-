# Security

Priority order (spec §99): security → integrity → authorisation → evidence integrity → deterministic rules → governance.

## Authentication & authorisation
- Roles: Business Owner, CEO, Coach, Consultant, Programme Manager, Partner, Donor, Expert, Administrator. Permissions: VIEW, CREATE, EDIT, APPROVE, DELETE, EXPORT, OVERRIDE. Matrix in `src/core/auth/rbac.ts`.
- `authorize(ctx, permission, resource)` enforces role permission **and** tenant equality. Every repository call takes a `TenantContext`; cross-tenant reads/writes fail closed.
- AI is a system actor with no APPROVE/OVERRIDE permission.
- Authentication provider is not yet wired (M1 gap). Until it is, route handlers must not be exposed publicly; `/api/*` legacy routes are flagged in the plan for retirement.

## Data
- No secrets in source; env vars only (`.env.example`). `ANTHROPIC_API_KEY` is server-only; never `NEXT_PUBLIC_`.
- The legacy browser Supabase client with anon key writing tables directly is a known vulnerability (ADR-003) and must be removed once server routes replace it. RLS must be enabled on any Supabase table until then.
- Input validation with zod at every route boundary.
- Audit log is append-only and hash-chained; `verifyChain()` detects edits, deletions and reordering.
- Uploads (later milestone): type allow-list, size limit, content-type sniffing, private storage, signed URLs.
- Webhooks (later): signature verification + idempotency keys to prevent duplicate payment events.

## Required tests (spec §83) and status
| Test | Status |
|---|---|
| Cross-tenant access | done (`auth.test.ts`) |
| Unauthorised edits / privilege escalation | done |
| AI cannot approve | done |
| Audit tamper detection | done |
| Duplicate events | done |
| Injection / uploads / webhooks / secrets scan | pending (needs routes/uploads) |
