# my-agent-config

Personal agent configuration — skills, commands, rules, and settings, synced across machines and consumed by Codex, Claude Code, and pi.

## Setup

```bash
./install.sh              # Compare repo vs local, sync with confirmation
./install.sh --dry-run    # Preview changes without modifying anything
./install.sh --force      # Sync without confirmation (for fresh machine setup)
./install.sh --status     # Show sync status only
bash install.test.sh      # Sync-logic tests: JSON normalization + protected-key guard
```

`--force` answers every "differs" with `repo` and is meant for a fresh machine. Prefer a plain run on a live machine: the two settings regressions recorded in `pi/extensions/README.md` came from forced syncs.

## Structure

`install.sh` syncs the Claude Code files into `~/.claude`, mirrors everything under `pi/` into `~/.pi/agent`, and syncs `codex/AGENTS.md` plus `codex/skills/` into `~/.codex`.

| Dir / file | Consumed by | Notes |
|---|---|---|
| `skills/` | Claude Code, pi | auto-triggered when relevant; pi reads these via `~/.agents/skills` symlinks and again through `pi/skills/` mirrors |
| `commands/` | Claude Code, Codex | user-invoked via `/`; pi has no command concept, so `pi/skills/` carries native ports |
| `rules/` | Claude Code | always-on behavioral guidelines, path-scoped by frontmatter |
| `pi/AGENTS.md` | pi | the same rules inlined as global instructions, since pi cannot path-scope per file |
| `rules-personal/` | local only | machine-local rule staging; gitignored, not committed |
| `hooks/` | Claude Code | session lifecycle: session-start, compress-memory, design-antipattern-check, design-antipattern-prevent (PreToolUse guard), protect-paths, command-policy, stop-gate (with stop_hook_active safety), session-end, herdr-agent-state, model-router |
| `bin/` | Claude Code | helper scripts (e.g. `recall`) |
| `pi/extensions/` | pi | auto-discovered from `~/.pi/agent/extensions`; includes lifecycle-guards (Pi port of the Claude Code hooks), Azure providers, model-router, statusline, plan-mode, zz-auto-continue, and their test suites |
| `pi/skills/` | pi | pi-native skills synced to `~/.pi/agent/skills`; upstream Matt Pocock skills are excluded by design |
| `pi/{settings,models,model-router}.json` | pi | provider defaults, model definitions, routing tiers |
| `codex/AGENTS.md` | Codex | global instructions synced to `~/.codex/AGENTS.md` |
| `codex/skills/` | Codex | portable skills discovered from `~/.codex/skills`; command files are adapted to `$skill` invocation |
| `settings.json` | Claude Code | permissions, plugins, preferences |
| `statusline.sh` | Claude Code | terminal status bar (context usage, git info) |
| `install.test.sh` | — | tests for the sync guards; run after touching `install.sh` |

## Self-Improving Workflow

The engineering workflow (`/idea-refine` → `/scaffold` → `/discover` → `/blueprint` → `/construct` → `/inspect` → `/ship` → `/retro`) is self-improving:

- Each skill has a `## Performance Notes` section updated by `/retro`
- `/retro` extracts both blind spots (what went wrong) and positive patterns (what worked)
- Patterns validated across 3+ projects get proposed as skill instruction changes
- Engineering patterns persist in auto-memory and feed back into `/discover` and `/blueprint`

Pi sessions run the newer upstream chain instead: `idea-refine` → `grill-with-docs` → `to-spec` → `to-tickets` → `implement` → `code-review` → `ship` → `retro`, invoked as `/skill:<name>`. Codex uses the portable copies under `codex/skills/` and invokes them as `$<name>`.

## Branch Protection

- `main` is protected by a GitHub ruleset — collaborators must open a PR with owner approval
- Admin (repo owner) can bypass and push directly
- `.github/workflows/protect-main.yml` — flags direct pushes by creating an issue
- `.github/workflows/close-external-prs.yml` — auto-closes PRs from non-collaborators

## Verification

After making changes:
- `./install.sh --status` — Check sync status between repo and local
- `bash install.test.sh` — Sync guards: JSON normalization, protected-key refusal and override
- `bash hooks/hooks.test.sh` — Claude Code hook behavior (68 assertions)
- The five pi extension suites, from `~/.pi/agent/extensions` or `pi/extensions` (191 checks; see `pi/extensions/README.md` → Test files)

## Full inventory

See `README.md` for the complete skill, command, rule, and hook tables, sync mechanics, and origin/attribution.
