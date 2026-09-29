# Testing

Runner: Vitest (`npm test`). Type check: `npm run typecheck`. Lint: `npm run lint`.

| Layer | Location | Status |
|---|---|---|
| Unit (scoring, evidence, rules, state machine, RBAC, audit, events, NBA, AI validation/safety) | `tests/unit` | implemented |
| AI evaluation fixtures + gate | `tests/ai-evaluation` | implemented (recorded outputs) |
| Journey (acceptance subset, in-memory) | `tests/integration` | implemented |
| DB integration | `tests/integration` | pending live Postgres |
| E2E (Playwright) | `tests/e2e` | pending UI |

Critical properties covered: tenant isolation, scoring determinism and versioning, historical score immutability, structured-output rejection, anti-fabricated evidence refs, human override authority, event idempotency and retry, audit tamper detection, contradictory data.

Gate: no change to scoring, prompts or rules merges unless `npm test` passes, including the AI evaluation gate.
