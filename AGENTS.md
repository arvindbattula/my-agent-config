# my-agent-config

Personal agent configuration — skills, commands, rules, and settings, synced across machines and consumed by Codex, Claude Code, and pi.

## Setup

```bash
./install.sh              # Compare repo vs local, sync with confirmation
./install.sh --dry-run    # Preview changes without modifying anything
./install.sh --force      # Sync without confirmation (for fresh machine setup)
./install.sh --status     # Show sync status only
```

## Structure

`install.sh` syncs to `~/.claude` (primary), with skills also symlinked to `~/.agents/skills` for pi and extensions copied to `~/.pi/agent/extensions`. Codex reads `AGENTS.md` directly.

| Dir / file | Consumed by | Notes |
|---|---|---|
| `skills/` | Claude Code, pi | auto-triggered when relevant; pi reads via `~/.agents/skills` symlinks |
| `commands/` | Claude Code, Codex | user-invoked via `/`; pi has no command concept |
| `rules/` | Claude Code | always-on behavioral guidelines |
| `rules-personal/` | local only | machine-local rule staging; gitignored, not committed |
| `hooks/` | Claude Code | session lifecycle: session-start, compress-memory, design-antipattern-check, protect-paths, command-policy, stop-gate, session-end |
| `bin/` | Claude Code | helper scripts (e.g. `recall`) |
| `pi/extensions/` | pi | auto-discovered from `~/.pi/agent/extensions`; includes lifecycle-guards (Pi port of Claude Code hooks) |
| `settings.json` | Claude Code | permissions, plugins, preferences |
| `statusline.sh` | Claude Code | terminal status bar (context usage, git info) |

## Self-Improving Workflow

The engineering workflow (`/idea-refine` → `/scaffold` → `/discover` → `/blueprint` → `/construct` → `/inspect` → `/ship` → `/retro`) is self-improving:

- Each skill has a `## Performance Notes` section updated by `/retro`
- `/retro` extracts both blind spots (what went wrong) and positive patterns (what worked)
- Patterns validated across 3+ projects get proposed as skill instruction changes
- Engineering patterns persist in auto-memory and feed back into `/discover` and `/blueprint`

## Branch Protection

- `main` is protected by a GitHub ruleset — collaborators must open a PR with owner approval
- Admin (repo owner) can bypass and push directly
- `.github/workflows/protect-main.yml` — flags direct pushes by creating an issue
- `.github/workflows/close-external-prs.yml` — auto-closes PRs from non-collaborators

## Verification

After making changes:
- `./install.sh --status` — Check sync status between repo and local

## Full inventory

See `README.md` for the complete skill, command, rule, and hook tables, sync mechanics, and origin/attribution.
