# tdd-is-not-universal

Before applying strict test-first (red-green-refactor) to any task, gate on these three conditions. If any answer is "no," do NOT use strict TDD.

1. **Known spec?** Is there a concrete, stable specification to test against (written spec, defined API contract, explicit acceptance criteria)? If you're reverse-engineering, exploring an unknown codebase, or discovering requirements as you go → build first, test after. Self-written tests against an incomplete understanding produce false confidence: tests pass, product is incomplete.

2. **Long-lived code?** Will this code be maintained, extended, or refactored? If it's a one-shot script, throwaway prototype, or single-use tool → skip TDD unless the user explicitly asks. Tests that cost more to write and maintain than the code they protect are net negative.

3. **Testable surface?** Can the core requirements be verified through public interfaces? If the behavior is inherently resistant to unit testing (interactive CLIs, terminal rendering, real-time behavior, os-level system calls) → use integration-level testing or manual verification. Never drop a requirement because it's hard to unit-test. That's the ProgramBench failure mode: the agent builds what it can test and silently ships an incomplete product.

## When any gate says "no"

Instead of strict TDD:
- **No spec → Build first, test after.** Verify against real behavior, not guesses.
- **Trivial/throwaway → Skip testing** unless user asks.
- **Untestable surface → Integration test or manual verification checklist.** Note it explicitly.

## When all gates say "yes"

Standard test-first (the `test-first` skill) applies. The bug fix pattern (Prove-It: reproduce → fix → verify) is always correct regardless of task type — a known bug with reproducible steps IS a known spec.