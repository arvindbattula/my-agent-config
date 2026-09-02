# my-agent-config

Personal agent configuration — skills, commands, rules, and settings — synced across machines. Primary target is Claude Code (`~/.claude`); skills and extensions are also synced for the Pi coding agent, and Codex reads `AGENTS.md` directly.

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
| `research` | Convergence-driven research with adversarial verification — tiered multi-engine search, iterative synthesis, claim challenging, cited briefs |
| `security` | OWASP Top 10 prevention, input validation, secrets management, npm audit triage |
| `debugging` | Systematic root-cause debugging — Stop-the-Line rule, 6-step triage checklist |
| `api-contracts` | Contract-first API design, error semantics, REST patterns, validation at boundaries |
| `git` | Trunk-based development, atomic commits, save-point pattern, git bisect |
| `performance` | Measurement-first optimization, Core Web Vitals, N+1 prevention, bundle budgets |
| `react-engineering` | React component architecture, state management, file structure discipline |
| `design-setup` | Design principles, anti-patterns, OKLCH color theory, typography — run `/design-setup teach` once per project |
| `design-review` | Scored design quality audit (accessibility, theming, responsive, anti-patterns) with P0-P3 severity |
| `design-polish` | Final-pass design refinement — alignment, spacing, interaction states, micro-details |
| `design-typography` | Typography assessment and fixes — font selection, hierarchy, readability, scales |
| `dead-code` | Find and remove unused files, deps, exports via knip |
| `triage` | Investigate bugs, find root cause, create issue with TDD fix plan |
| `diagram` | Render inline interactive visuals — SVG diagrams, HTML widgets, charts |
| `electron-wrapper` | Wrap a web app into an Electron desktop app |
| `read-the-damn-docs` | Web-search for current official docs before implementing external packages, APIs, or version-sensitive behavior. Prevents guessing from stale model memory. Includes memory feedback loop for documenting quirks. |

### Commands (user-invoked via `/`)

**Workflow — Structured AI-assisted engineering:**

```
/idea-refine → /scaffold → /discover → /blueprint → /construct → /inspect → /ship → /production-gate → /retro
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
| `/production-gate` | Go/no-go gate to promote a vibe-coded prototype into a managed IT environment. Applicability triage, sectioned readiness checklist (owner + `[Claude High/Partial/None]` + blocker/waiver markers), waiver mechanism, sign-off table. |
| `/decide` | Log architecture/product decisions in ADR format → `decisions.md` |
| `/retro` | Project retrospective — extracts blind spots, positive patterns, and skill performance notes. Feeds back into all workflow skills. |

Use `/decide` anytime during the workflow. Run `/retro` at milestones or when a project ships — it makes the entire workflow smarter by learning from each project.

**Self-improving workflow:** Each workflow command has a `## Performance Notes` section that `/retro` populates with dated, evidence-backed observations. Patterns validated across 3+ projects get proposed as actual skill instruction changes. Positive engineering patterns (validated tech choices, architectural approaches) persist in auto-memory and feed into `/discover` and `/blueprint`.

**Project initialization:**

| Command | Purpose |
|---------|---------|
| `/init-python` | Initialize a new Python uv project, derives directory + package, sets up `src/` layout, hatchling build, standard deps |

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
| `/wrap-session` | End-of-session routine. Routes session learnings (preferences, references, in-flight state) to auto-memory, `docs/state.md`, or CLAUDE.md. Review-before-write, size-capped. |

### Rules (always-on)
| Rule | Behavior |
|------|----------|
| `verify-before-done` | Always verify work before declaring complete; frontend requires tests + lint + build |
| `no-ai-slop` | No obvious comments, no unnecessary defensive checks, no aspirational comments describing unimplemented intent |
| `simplicity-over-cleverness` | Simplest solution that works, no over-engineering |
| `tdd-is-not-universal` | Gate strict test-first on spec stability, code longevity, and testable surface; build-first + verify-after when any gate fails |
| `ask-dont-assume` | Ask on ambiguous tasks; use judgment on minor reversible decisions |
| `minimal-diff` | Only change what's necessary; exception: update broken call sites directly |
| `sunk-cost-breaker` | Stop after 3+ failed attempts; propose fresh restart with lessons learned |
| `no-lint-suppression` | Fix lint/type errors, never suppress with eslint-disable or ts-ignore |
| `no-backwards-compat` | No migration shims or compatibility wrappers unless explicitly asked |
| `enumerate-spec-lists-first` | Split slash-lists and conditional clauses in specs into enumerated items before implementing |
| `tests-enforce-spec-not-code` | Every test assertion should trace to a spec requirement, not incidental implementation |
| `test-every-escape-hatch` | For every test bypass (dry-run, mock, skip flag), write one smoke test that uses the real path |
| `async-writes-serialize` | Serialize concurrent async writes to shared state via a single-flight queue |
| `batch-loop-exception-breadth` | Use broad `except Exception` per item in batch loops calling external services |
| `like-wildcard-escaping` | Escape `%`, `_`, `\` in SQL LIKE with user input, even when parameterized |
| `path-containment-after-regex` | Pair regex path gates with segment check + post-resolve containment (and realpath for symlink threats) |
| `no-unsourced-claims` | Never invent stats; tag quantitative claims as sourced/estimate/opinion; don't smuggle opinions as facts |
| `skill-completion-receipt` | For 2+ step skills/commands, print a per-step receipt (✓/✗/N/A) before claiming done |

### Hooks
| Hook | Trigger | Purpose |
|------|---------|---------|
| `session-start.sh` | SessionStart | Brief workflow reminder injected at session start |
| `compress-memory.sh` | PostToolUse → Write | Auto-compress prose in memory files (filler removal, phrase shortening). Preserves frontmatter, code, URLs, paths. Validates before writing, restores on corruption. |
| `design-antipattern-check.sh` | PostToolUse → Edit/Write | Detects AI design anti-patterns (Inter font, purple gradients, side-stripe borders, gradient text, #000/#fff, HSL) in frontend files and warns inline |

### Config
- `settings.json` — Permissions, hooks, extended thinking, plugins, statusline
- `statusline.sh` — Terminal status bar showing directory, model, context usage, git state (Claude Code)
- `pi/extensions/statusline.ts` — Equivalent two-line footer for the Pi coding agent, synced to `~/.pi/agent/extensions/` by `install.sh` (auto-discovered by the Pi CLI). Shows model, dir, git branch + diff stats, thinking level, context bar, tokens, cost, and session elapsed time. Rate limits are omitted (not exposed by Pi); duration is session wall-clock rather than cumulative request time. Colors use `theme.fg()`, so the footer adapts to the active Pi theme.

> **Light terminal:** Pi auto-detects terminal background; if it guesses wrong (e.g. a dark theme on a white terminal), text becomes unreadable. Set `"theme": "light"` in your **personal** `~/.pi/agent/settings.json` — this is machine/terminal-specific and intentionally not committed.

## How Sync Works

`install.sh` compares the repo and `~/.claude/` using file checksums:

- `✓` Identical — no action needed
- `↓` In repo, not local — copies to local
- `↑` Local has changes — warns before overwriting
- `+` Local only — prompts to copy to repo
- `~` Both exist, differ — lets you choose which to keep

All overwrites create timestamped backups in `~/.claude/backups/`.

Beyond `~/.claude/`, `install.sh` also syncs Pi coding agent resources when present:
- **Pi skills** (`~/.agents/skills`) — repo skills are symlinked; `/`-commands are generated into `source-command-*` skills.
- **Pi extensions** (`~/.pi/agent/extensions`) — repo `pi/extensions/*.ts` are copied there (auto-discovered by the Pi CLI). Personal extensions not in the repo (e.g. `azure-foundry.ts`) show as `+ local only` and are never pulled in automatically.

Both sections only run if the corresponding Pi directory already exists.

> **Note:** A running Claude Code session manages `~/.claude/settings.json` in memory and may overwrite external changes. If `settings.json` shows as "differs" after sync, exit all Claude Code sessions first, then run `./install.sh` again.

## Contributing

- `main` is protected — all changes require a PR with owner approval
- PRs from non-collaborators are auto-closed
- Direct pushes to `main` are flagged via GitHub Actions

## Origin

Skills originally ported from [brianlovin/agent-config](https://github.com/brianlovin/agent-config) and [mattpocock/skills](https://github.com/mattpocock/skills), renamed for clarity, reorganized into skills vs commands, and extended with custom rules.

Security, debugging, API design, git workflow, performance, frontend UI, and shipping skills adapted from [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills) — a production-grade engineering skills library for AI coding agents. Anti-rationalization tables and red flags patterns also drawn from that project.

Design skills (`design-setup`, `design-review`, `design-polish`, `design-typography`) and the anti-pattern detection hook adapted from [pbakaus/impeccable](https://github.com/pbakaus/impeccable) (Apache 2.0) — a design skill system that teaches AI coding assistants real design principles.

`read-the-damn-docs` skill adapted from [BuilderIO/skills](https://github.com/BuilderIO/skills) — extended with memory-first lookup and discovery feedback loop.
