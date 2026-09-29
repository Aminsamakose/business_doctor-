# AI Architecture

Pipeline: REQUEST → CLASSIFY → AUTHORISE → RETRIEVE → RULES → AGENT → CLAUDE → VALIDATE → REVIEW → EXECUTE → AUDIT
Code: `src/core/ai/*`.

## Principles
- Deterministic code decides scores, thresholds, eligibility. Claude interprets supplied evidence only.
- Claude is reached through the `LlmProvider` interface. The Anthropic adapter is server-only; tests use a mock.
- Context is assembled by `ContextBuilder` from a bounded, relevance-ranked set of items, each tracked with source, timestamp, token estimate. Whole databases are never sent.
- Output must satisfy strict zod schemas (`DiagnosisOutput`, `PrescriptionOutput`). Invalid → reject, log, one repair attempt, then human review.
- Every evidence reference in an output must exist in the supplied context; unknown refs fail validation (anti-fabrication).
- Confidence is capped by the weakest evidence level cited; the AI cannot upgrade evidence.
- No hidden chain-of-thought is stored: only a short `reasoningSummary` plus evidence refs.
- Safety guardrails flag financial, legal, investment, employment, personal-data and compliance topics → `reviewRequired=true` and a professional-review disclaimer.
- AI is a system actor. Outputs are `AiRecommendation` records with status PENDING_REVIEW. Only a human approval (`approve|edit|reject|defer|override`) makes a decision authoritative.

## Agents
Bounded capabilities defined as data (`agents.ts`): purpose, allowed context kinds, output schema, permissions, escalation. MVP registers SME Diagnostic and Intervention agents; others are listed as registered-but-disabled by feature flag.

## Provenance recorded per recommendation
model, model version, agent, prompt version, knowledge sources, evidence refs, request id, case id, org id, timestamp, confidence, reviewer, approval status.

## Evaluation
`tests/ai-evaluation` holds synthetic fixtures (CASE-STRONG, WEAK, MIXED, MISSING-DATA, CONTRADICTORY, FAILED-INTERVENTION, HIGH-RISK, OUT-OF-SCOPE) and a gate that runs validation, grounding and routing checks against recorded model outputs. Live-model evaluation runs when `ANTHROPIC_API_KEY` is present (not in CI by default).
