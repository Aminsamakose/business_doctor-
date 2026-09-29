# Workflow Architecture

## Case state machine (`src/core/cases`)
States: NEW, DIAGNOSTIC, DIAGNOSED, PRESCRIBED, PENDING_APPROVAL, IN_EXECUTION, COACHING, MONITORING, AT_RISK, STALLED, MIDLINE, ENDLINE, FOLLOW_UP, GRADUATED, RE_ENTRY, CLOSED.
Every transition is declared with: trigger, guard condition, allowed actor kinds, required evidence, side-effect action, next state. Undeclared transitions throw `InvalidTransitionError`. Each applied transition emits an audit event.

## Events (`src/core/events`)
Events are stored with `id`, `type`, `tenantId`, `idempotencyKey`, payload. The bus is at-least-once: handlers are retried with backoff; after `maxAttempts` the event goes to a dead-letter list and a `SystemError` event is raised. Duplicate `idempotencyKey`s are ignored per handler.

## Workflow pattern
WHEN → IF → THEN → ASSIGN → NOTIFY → WAIT → CHECK → ESCALATE → COMPLETE, expressed as rules (`src/core/rules`) plus event handlers. MVP wires: DiagnosticCompleted → score → AI analysis → review task; ActionOverdue → notify → escalate.

## Recovery
DETECT → LOG → RETRY → QUEUE → ESCALATE → RECOVER → AUDIT. Implemented for event handlers; job queue infrastructure (durable) is deferred to M2 and requires a Postgres-backed queue.
