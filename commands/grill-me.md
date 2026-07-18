---
name: grill-me
description: Relentlessly interview about a plan until decisions resolved
---

Interview me relentlessly about every aspect of this plan until we reach a shared understanding. Walk down each branch of the design tree, resolving dependencies between decisions one-by-one.

If a question can be answered by exploring the codebase, explore the codebase instead of asking me.

Keep going until every decision branch is resolved. Don't stop early. Don't accept vague answers — push for specifics.

## Performance Notes
<!-- Updated by /retro. Do not edit manually. -->
<!-- Format: - YYYY-MM-DD [project]: observation (evidence: source) -->
- 2026-07-14 [Project C]: Live-probing external APIs DURING the grill (curl the endpoints before any code) was the highest-leverage move — caught pre-build that identifiers were unguessable across providers, that the LLM endpoint was the Responses API not chat-completions, and that the model was a reasoning model. Reshaped the whole data model + LLM integration before a line was written. BUT the grill tested reachability/response-SHAPE, not THROUGHPUT — the per-call latency (which later forced concurrency + pre-filter + incremental persistence + CI resumability) went unprobed. Lesson: when grilling a plan that depends on an external service, live-probe not just "does it respond and what shape" but "how slow/costly is one call, and does the largest run fit the runtime's limits" (evidence: project decision + learnings docs)
- 2026-07-17 [Project C]: The grill locked filter strictness and runner choice but never asked (a) what persisted record makes paid LLM verdicts idempotent across recurring runs, or (b) a dry-run of the human's routine approval cycle — both became forced mid-build redesigns. Add both probes for any recurring-pipeline project. (evidence: project decision docs)
