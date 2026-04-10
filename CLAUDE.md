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

- `skills/` — Auto-triggered by Claude when relevant (16 skills)
- `commands/` — User-invoked via `/` in Claude Code (16 commands)
- `rules/` — Always-on behavioral guidelines (11 rules)
- `references/` — Supplementary checklists loaded on demand (security, accessibility)
- `hooks/` — Session lifecycle hooks (session-start, compress-memory)
- `settings.json` — Permissions, plugins, preferences
- `statusline.sh` — Terminal status bar (context usage, git info)

## Self-Improving Workflow

The engineering workflow (`/idea-refine` → `/discover` → `/blueprint` → `/construct` → `/inspect` → `/ship` → `/retro`) is self-improving:

- Each skill has a `## Performance Notes` section updated by `/retro`
- `/retro` extracts both blind spots (what went wrong) and positive patterns (what worked)
- Patterns validated across 3+ projects get proposed as skill instruction changes
- Engineering patterns persist in auto-memory and feed back into `/discover` and `/blueprint`

## Verification

After making changes:
- `./install.sh --status` — Check sync status between repo and local
