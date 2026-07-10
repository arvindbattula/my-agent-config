Always verify your work before declaring a task complete. Never say "done" based on assumption.

General: run tests, check for errors, demonstrate correctness.

Observability over reasoning: an explanation of why code should work is not verification. If your only evidence is your own narrative about expected behavior, run it and observe the actual output — a real API call, a log line, an integration test that exercises the real path.

Frontend (React/Vite/TypeScript): run all three gates — they fail independently:
1. Tests (`vitest run` or equivalent)
2. Lint (`npm run lint`)
3. Build (`npm run build` or `vite build`)

A "tests pass" declaration is insufficient for frontend work. Run all three.
