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
| `plan-build-verify` | Workflow orchestration — plan, build, and verify complex coding tasks |
| `test-first` | Test-driven development with red-green-refactor and Prove-It bug fix pattern |
| `deep-research` | Convergence-driven research — multi-engine search, iterative synthesis, cited briefs |
| `security-hardening` | OWASP Top 10 prevention, input validation, secrets management, npm audit triage |
| `debugging` | Systematic root-cause debugging — Stop-the-Line rule, 6-step triage checklist |
| `api-design` | Contract-first API design, error semantics, REST patterns, validation at boundaries |
| `git-workflow` | Trunk-based development, atomic commits, save-point pattern, git bisect |
| `performance` | Measurement-first optimization, Core Web Vitals, N+1 prevention, bundle budgets |
| `frontend-ui` | Component architecture, accessibility (WCAG 2.1 AA), AI aesthetic anti-patterns |
| `remove-dead-code` | Find and remove unused files, deps, exports via knip |
| `find-skills` | Discover and install skills from the ecosystem |
| `skill-creator` | Guide for building new skills |
| `triage-issue` | Investigate bugs, find root cause, create issue with TDD fix plan |
| `prompt-master` | Generate optimized prompts for Claude Code agentic tasks |
| `visualise` | Render inline interactive visuals — SVG diagrams, HTML widgets, charts |
| `electron-wrapper` | Wrap a web app into an Electron desktop app |

### Commands (user-invoked via `/`)

**Workflow — Structured AI-assisted engineering:**

```
/idea-refine → /scaffold → /discover → /blueprint → /construct → /inspect → /ship → /retro
                                                       ↑              |
                                                       └──────────────┘
                                                    (loop until done)
```

| Command | Purpose |
|---------|---------|
| `/idea-refine` | Divergent→convergent thinking to sharpen fuzzy ideas into buildable concepts |
| `/scaffold` | Bootstrap `CLAUDE.md` + `docs/` directory for any new project |
| `/discover` | Structured product interview (scales by project size) → writes `spec.md`. Reads engineering patterns and blind spots from past projects. Includes EARS requirements, boundaries, and spec self-audit. |
| `/blueprint` | Break spec into phased build plan → writes `plan.md`. Orientation step checks existing code. Cross-checks phase integration. Reads engineering patterns. |
| `/construct` | Execute one phase at a time. Orientation step scopes changes. Resumes partial work. Live spec reconciliation when gaps found. Context window management. |
| `/inspect` | Multi-pass review (architecture, spec compliance, edge cases, code quality, security). Severity labels, dependency review, change sizing guidance. |
| `/ship` | Pre-launch checklist (code quality, security, performance, infrastructure, docs). Rollback plan template and post-deploy verification. |
| `/decide` | Log architecture/product decisions in ADR format → `decisions.md` |
| `/retro` | Project retrospective — extracts blind spots, positive patterns, and skill performance notes. Feeds back into all workflow skills. |

Use `/decide` anytime during the workflow. Run `/retro` at milestones or when a project ships — it makes the entire workflow smarter by learning from each project.

**Self-improving workflow:** Each workflow command has a `## Performance Notes` section that `/retro` populates with dated, evidence-backed observations. Patterns validated across 3+ projects get proposed as actual skill instruction changes. Positive engineering patterns (validated tech choices, architectural approaches) persist in auto-memory and feed into `/discover` and `/blueprint`.

**Utility commands:**

| Command | Purpose |
|---------|---------|
| `/push-further` | Challenge Claude to find the boldest addition to the current plan |
| `/cleanup-ai-slop` | Remove AI-generated cruft from the current branch |
| `/code-simplify` | Simplify recently changed code for clarity |
| `/organize-claude-config` | Refactor CLAUDE.md for progressive disclosure |
| `/grill-me` | Relentlessly interview you about a plan until all decisions are resolved |
| `/review-architecture` | Find architectural improvements by deepening shallow modules |
| `/sync` | Compare repo vs local config and resolve differences |

### Rules (always-on)
| Rule | Behavior |
|------|----------|
| `verify-before-done` | Always verify work before declaring complete; frontend requires tests + lint + build |
| `no-ai-slop` | No obvious comments, no unnecessary defensive checks |
| `simplicity-over-cleverness` | Simplest solution that works, no over-engineering |
| `ask-dont-assume` | Ask on ambiguous tasks; use judgment on minor reversible decisions |
| `minimal-diff` | Only change what's necessary; exception: update broken call sites directly |
| `check-docs-first` | Look up current docs for external libraries/APIs before writing code |
| `sunk-cost-breaker` | Stop after 3+ failed attempts; propose fresh restart with lessons learned |
| `no-lint-suppression` | Fix lint/type errors, never suppress with eslint-disable or ts-ignore |
| `no-backwards-compat` | No migration shims or compatibility wrappers unless explicitly asked |
| `batch-loop-exception-breadth` | Use broad `except Exception` per item in batch loops calling external services |
| `like-wildcard-escaping` | Escape `%`, `_`, `\` in SQL LIKE with user input, even when parameterized |

### References (loaded on demand)
| Reference | Purpose |
|-----------|---------|
| `security-checklist.md` | Pre-commit security checklist, OWASP Top 10 quick reference |
| `accessibility-checklist.md` | WCAG 2.1 AA compliance checklist — keyboard, screen reader, contrast, forms, focus |

### Hooks
| Hook | Trigger | Purpose |
|------|---------|---------|
| `session-start.sh` | SessionStart | Brief workflow reminder injected at session start |
| `compress-memory.sh` | PostToolUse → Write | Auto-compress prose in memory files (filler removal, phrase shortening). Preserves frontmatter, code, URLs, paths. Validates before writing, restores on corruption. |

### Config
- `settings.json` — Permissions, hooks, extended thinking, plugins, statusline
- `statusline.sh` — Terminal status bar showing directory, model, context usage, git state

## How Sync Works

`install.sh` compares the repo and `~/.claude/` using file checksums:

- `✓` Identical — no action needed
- `↓` In repo, not local — copies to local
- `↑` Local has changes — warns before overwriting
- `+` Local only — prompts to copy to repo
- `~` Both exist, differ — lets you choose which to keep

All overwrites create timestamped backups in `~/.claude/backups/`.

> **Note:** A running Claude Code session manages `~/.claude/settings.json` in memory and may overwrite external changes. If `settings.json` shows as "differs" after sync, exit all Claude Code sessions first, then run `./install.sh` again.

## Origin

Skills originally ported from [brianlovin/agent-config](https://github.com/brianlovin/agent-config) and [mattpocock/skills](https://github.com/mattpocock/skills), renamed for clarity, reorganized into skills vs commands, and extended with custom rules.

Security, debugging, API design, git workflow, performance, frontend UI, and shipping skills adapted from [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills) — a production-grade engineering skills library for AI coding agents. Anti-rationalization tables and red flags patterns also drawn from that project.
