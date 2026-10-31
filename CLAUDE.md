# my-agent-config

Personal Claude Code configuration — skills, commands, rules, and settings, synced across machines.

## Setup

```bash
./install.sh              # Compare repo vs local, sync with confirmation
./install.sh --dry-run    # Preview changes without modifying anything
./install.sh --force      # Sync without confirmation (for fresh machine setup)
./install.sh --status     # Show sync status only
```

## Structure

- `skills/` — Auto-triggered by Claude when relevant (18 skills)
- `commands/` — User-invoked via `/` in Claude Code (18 commands)
- `rules/` — Always-on behavioral guidelines (21 rules)
- `hooks/` — Session lifecycle hooks (session-start, compress-memory, design-antipattern-check, design-antipattern-prevent, protect-paths, command-policy, stop-gate, session-end), plus `design-checks-lib.sh` (shared checks) and `hooks.test.sh` (tests)
- `bin/` — Helper scripts (e.g. `recall`)
- `pi/` — Pi coding agent config: `extensions/`, `models.json`, `settings.json`
- `settings.json` — Permissions, plugins, preferences
- `statusline.sh` — Terminal status bar (context usage, git info)

## Self-Improving Workflow

The engineering workflow (`/idea-refine` → `/scaffold` → `/discover` → `/blueprint` → `/construct` → `/inspect` → `/ship` → `/retro`) is self-improving:

- Each skill has a `## Performance Notes` section updated by `/retro`
- `/retro` extracts both blind spots (what went wrong) and positive patterns (what worked)
- Patterns validated across 3+ projects get proposed as skill instruction changes
- Engineering patterns persist in auto-memory and feed back into `/discover` and `/blueprint`

## Branch Protection

- `main` is protected by a GitHub ruleset — all changes require a PR, including the owner
- No bypass: the repo-admin bypass actor was removed (2026-10-22); direct pushes are rejected server-side
- `.github/workflows/protect-main.yml` — flags direct pushes by creating an issue
- `.github/workflows/close-external-prs.yml` — auto-closes PRs from non-collaborators

## Verification

After making changes:
- `./install.sh --status` — Check sync status between repo and local
- `bash hooks/hooks.test.sh` — Hook tests
- `pi/extensions/README.md` lists the Pi test files; plan-mode's are in `pi/extensions/plan-mode/tests/`
