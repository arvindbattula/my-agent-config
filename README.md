# my-agent-config

Personal Claude Code configuration — skills, commands, rules, and settings — synced across machines.

## Quick Start

```bash
# On a new machine
git clone https://github.com/arvindbattula/my-agent-config.git
cd my-agent-config
./install.sh --force

# Check sync status anytime
./install.sh --status

# Preview changes without modifying anything
./install.sh --dry-run
```

## What's Inside

### Skills (auto-triggered by Claude)
| Skill | Purpose |
|-------|---------|
| `task-planner` | Structured planning and execution for complex tasks |
| `test-first` | Test-driven development with red-green-refactor |
| `remove-dead-code` | Find and remove unused files, deps, exports via knip |
| `find-skills` | Discover and install skills from the ecosystem |
| `skill-creator` | Guide for building new skills |
| `electron-wrapper` | Wrap a web app into an Electron desktop app |

### Commands (user-invoked via `/`)
| Command | Purpose |
|---------|---------|
| `/push-further` | Challenge Claude to find the boldest addition to the current plan |
| `/cleanup-ai-slop` | Remove AI-generated cruft from the current branch |
| `/code-simplify` | Simplify recently changed code for clarity |
| `/organize-claude-config` | Refactor CLAUDE.md for progressive disclosure |
| `/sync` | Compare repo vs local config and resolve differences |

### Rules (always-on)
| Rule | Behavior |
|------|----------|
| `verify-before-done` | Always verify work before declaring complete |
| `no-ai-slop` | No obvious comments, no unnecessary defensive checks |
| `simplicity-over-cleverness` | Simplest solution that works, no over-engineering |
| `ask-dont-assume` | Ask on ambiguous tasks; use judgment on minor reversible decisions |
| `minimal-diff` | Only change what's necessary; flag nearby bugs but don't fix unsolicited |

### Config
- `settings.json` — Permissions, extended thinking, plugins, statusline
- `statusline.sh` — Terminal status bar showing directory, model, context usage, git state

## How Sync Works

`install.sh` compares the repo and `~/.claude/` using file checksums:

- `✓` Identical — no action needed
- `↓` In repo, not local — copies to local
- `↑` Local has changes — warns before overwriting
- `+` Local only — prompts to copy to repo
- `~` Both exist, differ — lets you choose which to keep

All overwrites create timestamped backups in `~/.claude/backups/`.

## Origin

Skills originally ported from [brianlovin/agent-config](https://github.com/brianlovin/agent-config), renamed for clarity, reorganized into skills vs commands, and extended with custom rules.
