When verifying frontend work (React/Vite/TypeScript), always run all three gates before declaring done:

1. Tests (`vitest run` or equivalent)
2. Lint (`npm run lint`)
3. Build (`npm run build` or `vite build`)

These can fail independently. Tests use their own config resolution (e.g., Vitest re-exports `defineConfig` with test-specific types). Lint catches patterns tests don't exercise (e.g., `react-hooks/set-state-in-effect`). Build catches type errors that `tsc --noEmit` misses when bundler config differs.

A "tests pass" declaration is insufficient. Run all three.
