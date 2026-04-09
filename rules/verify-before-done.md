Always verify your work before declaring a task complete. Never say "done" based on assumption.

General: run tests, check for errors, demonstrate correctness.

Frontend (React/Vite/TypeScript): run all three gates — they fail independently:
1. Tests (`vitest run` or equivalent)
2. Lint (`npm run lint`)
3. Build (`npm run build` or `vite build`)

A "tests pass" declaration is insufficient for frontend work. Run all three.
