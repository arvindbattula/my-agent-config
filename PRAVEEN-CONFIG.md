# praveen-configs — a snapshot, not a line of development

This branch is a point-in-time copy of Praveen's pi configuration, taken
2026-10-13. It follows the `shreya-configs` pattern: a personal branch that
never merges into `main`.

**Do not open a PR from this branch.** It deletes four things `main` wants to
keep (see below). Take individual files if they are useful; leave the branch
alone otherwise.

The live source of truth is `~/my-pi-skills` on Praveen's machine, which is a
separate repository. That repo has no remote, so this branch is the only shared
copy. It will go stale. Ask before assuming it is current.

## What is here

```
pi/skills/        53 skill directories (122 files)
pi/extensions/    lifecycle-guards, azure-foundry, azure-openai-models,
                  valar-dynamic, herdr-agent-state, lib/, 4 test files
pi/AGENTS.md      global instructions loaded into every pi session
pi/settings.json  Praveen's pi settings
pi/models.json    compatible endpoints and model overrides
pi/themes/        gruvbox-light, gruvbox-dark, cobalt2
```

Nothing outside `pi/` changed. `skills/`, `commands/`, `rules/`, `hooks/`,
`bin/`, and `install.sh` are exactly as they are on `main`.

## Why this branch must not be merged

It removes four things from `pi/extensions/` that exist on `main`:

| Removed | Reason |
|---|---|
| `plan-mode/` | deleted from Praveen's live config on 2026-10-13 |
| `zz-auto-continue/` | deleted from Praveen's live config on 2026-10-13 |
| `statusline.ts` | never installed on Praveen's machine |
| `azure-foundry-models.json` | machine-specific runtime cache, gitignored |

Those are personal choices, not recommendations. If `plan-mode` and
`zz-auto-continue` work for you, keep them.

## `pi/settings.json` will not work if you copy it

It points at paths that exist only on Praveen's machine:

```json
"skills":     ["~/my-pi-skills/skills"],
"extensions": ["~/my-pi-skills/extensions/..."],
"themes":     ["~/my-pi-skills/themes"]
```

Pi reads that repo **in place** — no copy lives in `~/.pi/agent/`, and
`~/.pi/agent/skills/`, `extensions/`, and `themes/` were deleted outright. Pi
auto-discovers those directories *on top of* the settings paths, so keeping both
gives you two copies of every skill and guaranteed drift. That arrangement is
deliberate and is the reason this branch is a snapshot rather than a sync target.

`enabledModels` is a hand-curated allowlist of five exact model ids, not an
oversight. Discovery decides what pi *can* reach; `enabledModels` decides what is
worth cycling through. Do not widen it to `provider/*`.

## Two fixes that belong on `main`, not here

Both are already prepared as separate branches off `main`:

- `fix/install-status-readonly` — `install.sh:609` runs `mkdir -p` outside the
  `DRY_RUN` guard, so `./install.sh --status` creates empty extension
  directories. Pi scans every subdirectory of the extensions dir, so removed
  extensions resurrect as phantoms. Present on `main` and `shreya-configs`.
- `fix/azure-provider-tool-declarations` — restores tool declarations and
  thinking replay for both Azure providers after the pi 0.86.0 context change.

Review those two on their own branches. They are not personal preferences.

## The big change in `lifecycle-guards`

677 lines down to 221. Two `tool_call` deny rules survive: protected paths and
the bash command policy. Removed:

- **`before_agent_start` context injection.** That event fires once per *run*,
  not once per session, and pi appends a returned message to the transcript each
  time. One measured session file held 286 copies, about 41.9k tokens. Pi 1.2.0
  widened it by firing for `pi.sendMessage({triggerTurn:true})` runs too, which
  `pi-subagents` uses for async child wakes. Standing instructions belong in
  `AGENTS.md` or `event.systemPromptOptions.sections[...]`.
- **Design anti-pattern block, `tool_result` check, and `agent_end` gate.**
  Never fired — `writeGateState` runs on every frontend write and there were
  zero `.hook-state/` directories on disk. The regexes also blocked legitimate
  content (`#fff` in SVG fixtures, `hsl()` in generated Tailwind) and each false
  positive cost up to three extra turns.
- **Memory compression.** Keyed on `memory/*.md`; every `memory/` directory on
  disk sits under `~/.claude/projects/`, which pi never writes to. It also
  rewrote files after the agent wrote them, so disk and transcript disagreed.
- **Session audit log.** Had produced 25 `reports/session-audit.log` files
  across unrelated repos; a gitignore rule already existed to hide them.

Known bug in what remains: the bash secrets rule is
`\b(cat|less|more|tail|head)\s+.*\.env\b` and the `.*` spans the whole command
line, so `head -5 a.txt; grep -v "process.env" b.ts` is blocked with a
misleading reason. Split the command.

## Verify

```bash
node pi/extensions/lifecycle-guards/lifecycle-guards.test.mjs   # 22 tests
node pi/extensions/azure-stream-result.test.mjs                 # 31 checks
```

Both need Node >= 23.6 for native TypeScript type stripping.
