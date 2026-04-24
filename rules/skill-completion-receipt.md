When you run a slash command or skill that has 2+ numbered steps, print a completion receipt at the end — before claiming the command is done. The receipt lists every numbered step from the skill file with `✓` (executed), `✗` (skipped, with one-line reason), or `N/A` (explicitly doesn't apply to this project — say why). Mirror lettered variants exactly as written (e.g., `Step 1a`, `Step 1b`); when a skill branches between variants, mark the chosen branch with its status and the unchosen with `N/A (branch not taken)`.

Format — reproduce each step's full heading as written in the skill file (not a `[name]` placeholder), followed by status:
```
## Receipt: /<command>
- Step 1: Reproduce — ✓
- Step 2: Inspect logs — ✗ (no error logs to check)
- Step 3: Verify fix — N/A (not needed yet)
...
```

Why: multi-step commands/skills (/retro, /wrap-session, /inspect, /discover, /blueprint) get silently truncated — the recall step gets skipped, the NEXT-SESSION.md body doesn't get refreshed, a second-pass review never happens. Silent skipping is the failure mode. A forced enumeration surfaces it before the user has to.

Rules:
- Never print `✓` for a step you didn't actually execute. That's worse than skipping — it lies about the state.
- If a step has sub-steps (e.g., "Step 4: update each skill's performance notes"), enumerate the sub-steps or give a count ("4/9 skills touched, rest N/A").
- Do not fabricate a step that isn't in the skill file to pad the receipt. The receipt mirrors the skill's numbered sections exactly.
- Single-step commands don't need a receipt — they're covered by ordinary completion.
- If you realize mid-receipt that a step you claimed `✓` was actually skipped, correct the receipt and do the step — don't silently move on.
