# my-agent-config

Personal agent configuration — skills, commands, rules, and settings — synced across machines. Claude Code (`~/.claude`), Pi (`~/.pi/agent`), and Codex (`~/.codex`) are wired up.

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
| `/group-commit` | Split working-tree changes into logical, atomic groups; stages and proposes a commit message one group at a time. Never runs `git commit` itself. |
| `/pr-draft` | Generate a PR description (overview, structure, summary of changes, how to run, deployment links) from the branch diff → `pr-draft.md` |

### Rules (always-on)
| Rule | Behavior |
|------|----------|
| `verify-before-done` | Always verify work before declaring complete; frontend requires tests + lint + build |
| `no-ai-slop` | No obvious comments, no unnecessary defensive checks, no aspirational comments describing unimplemented intent |
| `no-rationale-in-docstrings` | Module docstrings describe what the code does, not the why/reasoning trail behind it; defenses move to commit messages or `docs/decisions.md` |
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
| `maintain-readme` | Keep README.md current after structural changes (new modules, changed run instructions); defines the Overview/Structure/How-to-Run format to maintain |
| `no-autocommit-in-auto-mode` | Never `git commit` without an explicit ask in the current exchange, even under Auto Mode — committing is a separate decision from proceeding |
| `prune-dead-docs` | When a feature/module is removed, prune dead references in code, current-state docs, and on-disk artifacts; leave `docs/decisions.md` history untouched |

### Hooks
| Hook | Trigger | Purpose |
|------|---------|---------|
| `session-start.sh` | SessionStart | Brief workflow reminder injected at session start |
| `compress-memory.sh` | PostToolUse → Write | Auto-compress prose in memory files (filler removal, phrase shortening). Preserves frontmatter, code, URLs, paths. Validates before writing, restores on corruption. |
| `design-antipattern-check.sh` | PostToolUse → Edit/Write | Detects AI design anti-patterns (Inter font, purple gradients, side-stripe borders, gradient text, #000/#fff, HSL) in frontend files and warns inline |
| `model-router.sh` | UserPromptSubmit | Classifies the first prompt of a session via TypeSafe's Jev model and suggests a `/model` tier (haiku/sonnet/opus) via `additionalContext` for Claude to optionally relay. Warn-only — never switches models or blocks. Sends a redacted copy of the prompt (tokens, emails, paths, IPs stripped — see `model-router-lib.sh`). Requires `TYPESAFE_API_KEY`; fails open (silently, no output) if that's unset or any dependency/request step fails. |

### Config
- `settings.json` — Permissions, hooks, extended thinking, plugins, statusline
- `statusline.sh` — Terminal status bar showing directory, model, context usage, git state (Claude Code)

### Pi

`pi/` holds the Pi coding agent configuration and mirrors to `~/.pi/agent/` in both directions.

| Path | Synced to | What it is |
|---|---|---|
| `pi/AGENTS.md` | `~/.pi/agent/AGENTS.md` | Global instructions applied in every working directory: prose style plus all 23 rules. Pi applies one global instructions file with no glob-level rule scoping, so the rules from `rules/` are inlined here with their `applies to` globs in the text. Edit both when a rule changes. |
| `pi/skills/` | `~/.pi/agent/skills/` | 38 pi-native skill directories — see the breakdown below. |
| `pi/extensions/` | `~/.pi/agent/extensions/` | Extensions and their test suites. Documented in `pi/extensions/README.md`. |
| `pi/settings.json` | `~/.pi/agent/settings.json` | Default provider/model, `enabledModels` scope, packages, retry, compaction. `retry` is protected and `lastChangelogVersion` is ignored when comparing — see "How Sync Works". |
| `pi/models.json` | `~/.pi/agent/models.json` | Custom provider and model definitions (`valar`, `azure-claude`). |
| `pi/model-router.json` | `~/.pi/agent/model-router.json` | Complexity tiers and the multimodal fallback for `model-router.ts`. |

`pi/skills/` breaks down as:

| Count | Category |
|---|---|
| 20 | Native ports of `commands/*.md` — same workflow, with `/skill:` references, `disable-model-invocation`, and `AGENTS.md`/`CONTEXT.md` conventions instead of the Claude Code ones. Every command except `grill-me`, which upstream covers with `grilling` + `grill-with-docs`. |
| 15 | Mirrors of `skills/*` so pi reads one copy instead of reaching through `~/.agents/skills`. Three have no mirror: `debugging`, `test-first`, and `triage`, which upstream replaces with `diagnosing-bugs`, `tdd`, and its own `triage`. |
| 3 | Pi-only: `unslop` (prose cleanup pass), `gwt` and `mwt` (dsu-studio git-worktree kickoff and merge instructions). |

The three pi-only skills are committed on purpose. `gwt` and `mwt` name another project (dsu-studio, `qcg-dsu-land-pipeline`) and belong in that repo's `.agents/skills/` in principle; they live here so a machine move restores them. Both are `disable-model-invocation`, so they load only on `/skill:gwt` or `/skill:mwt`.

**Not synced** — recreated on a new machine instead, and gitignored so `install.sh` never offers to pull them in:

| What | Why |
|---|---|
| 22 upstream Matt Pocock skills: `ask-matt`, `code-review`, `codebase-design`, `diagnosing-bugs`, `domain-modeling`, `grilling`, `grill-with-docs`, `handoff`, `implement`, `prototype`, `resolving-merge-conflicts`, `setup-matt-pocock-skills`, `tdd`, `teach`, `to-questionnaire`, `to-spec`, `to-tickets`, `triage`, `wait-what`, `wayfinder`, `wizard`, `writing-for-agents` | Fetched from [mattpocock/skills](https://github.com/mattpocock/skills) rather than vendored, so upstream revisions stay available. Fetch them into `~/.pi/agent/skills/`; the list is mirrored in `.gitignore` and in `PI_UPSTREAM_SKILLS` in `install.sh`. Any local edit to one of them is unversioned — vendor it here instead if you change it. |
| `pi/extensions/valar-dynamic.ts` | Personal Valar provider shim, including reverse-engineered per-model pricing. Meaningless without a Valar key. |
| `pi/extensions/herdr-agent-state.ts` | Written and overwritten by the Herdr integration, which says so in its own header. |
| `pi/extensions/azure-foundry-models.json` | Runtime cache from live ARM discovery; rewrites its timestamp on every start. |
| `~/.pi/agent/auth.json`, `trust.json`, `models-store.json` | Machine state, never synced. |

> **Light terminal:** Pi auto-detects terminal background; if it guesses wrong (e.g. a dark theme on a white terminal), text becomes unreadable. `pi/settings.json` commits `"theme": "light"` as the team default. If your terminal is dark, set `"dark"` live and answer `l` (keep local) at the `settings.json` prompt so the repo copy cannot revert it.

## How Sync Works

`install.sh` compares the repo and `~/.claude/` using file checksums:

- `✓` Identical — no action needed
- `↓` In repo, not local — copies to local
- `↑` Local has changes — warns before overwriting
- `+` Local only — prompts to copy to repo
- `~` Both exist, differ — lets you choose which to keep

All overwrites create timestamped backups in `~/.claude/backups/`.

Pi paths sync the same way when `~/.pi/agent` exists:
- **Pi skills** (`pi/skills/` ↔ `~/.pi/agent/skills/`) — compared per skill directory, recursively. The 22 upstream Matt Pocock skills, the `reports/` audit log, and `.hook-state/` are excluded; the header reports how many.
- **Pi extensions** (`pi/extensions/` ↔ `~/.pi/agent/extensions/`) — `.ts`, `.mts`, `.mjs`, `.md`, `.json`, recursing into subdirs so `lib/` and `plan-mode/` sync. The pattern used to stop at `.ts`/`.md`/`.json`, so the test suites were hand-copied instead; two had drifted by the time this was fixed on 2026-09-25.
- **Pi config** (`pi/{AGENTS.md,settings.json,models.json,model-router.json}` ↔ `~/.pi/agent/`) with two protections:
  - `lastChangelogVersion` is stripped before comparing, so a pi upgrade does not report drift.
  - `retry` is protected. A repo → local copy that would change it is refused until you answer `o` after seeing both values, and `--force` cannot bypass that. The setting has been clobbered off twice; with it off, transient blips to api.valarhq.ai read as "Error: Connection error."
- **Pi skills via `~/.agents/skills`** — the older path, still wired: repo `skills/` are symlinked there and `commands/` are generated into `source-command-*` skills. Two overlaps follow from keeping it. A plain `./install.sh` run symlinks all 18 repo skills into `~/.agents/skills`, so the 15 that `pi/skills/` mirrors are then discoverable from two locations under the same name — pi logs a name-collision warning and keeps whichever it discovers first. And because `pi/skills/` carries native ports of every command except `grill-me`, pi also loads a `source-command-*` twin of each workflow under a different name, so both show up. Neither overlap is harmful, both are noise; retiring the generator and the symlink path is a separate decision.

Prefer a plain `./install.sh` run over `--force`. `--force` answers every "differs" prompt with `repo` without showing the choice, which is how live settings got clobbered.

Verify a change to the sync logic with `bash install.test.sh` (22 assertions over JSON normalization and the protected-key guard) and `bash hooks/hooks.test.sh` (68 assertions over the Claude Code hooks).

> **Note:** A running Claude Code session manages `~/.claude/settings.json` in memory and may overwrite external changes. If `settings.json` shows as "differs" after sync, exit all Claude Code sessions first, then run `./install.sh` again.

### Codex

`codex/` contains the Codex-compatible portion of the configuration:

| Path | Synced to | What it is |
|---|---|---|
| `codex/AGENTS.md` | `~/.codex/AGENTS.md` | Global prose and engineering instructions |
| `codex/skills/` | `~/.codex/skills/` | Shared skills plus command ports, invoked as `$skill-name` |

The port uses the Agent Skills format: each skill is a directory with a `SKILL.md` file and optional references. Claude hooks, Claude permissions/plugins, Pi extensions, and Pi provider/model settings remain harness-specific and are not copied into Codex. Codex's `.system` skills are excluded from sync.

## Contributing

- `main` is protected — all changes require a PR with owner approval
- PRs from non-collaborators are auto-closed
- Direct pushes to `main` are flagged via GitHub Actions

## Origin

Skills originally ported from [brianlovin/agent-config](https://github.com/brianlovin/agent-config) and [mattpocock/skills](https://github.com/mattpocock/skills), renamed for clarity, reorganized into skills vs commands, and extended with custom rules.

The newer Matt Pocock engineering set (`to-spec`, `to-tickets`, `implement`, `code-review`, `handoff`, `wayfinder`, and 16 more) is not vendored — it stays in `~/.pi/agent/skills/` from upstream. See the "Not synced" table under Pi.

`pi/skills/unslop` is adapted from pstack's unslop skill (MIT, Lauren Tan) with the em-dash rule softened and the scope narrowed to prose.

Security, debugging, API design, git workflow, performance, frontend UI, and shipping skills adapted from [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills) — a production-grade engineering skills library for AI coding agents. Anti-rationalization tables and red flags patterns also drawn from that project.

Design skills (`design-setup`, `design-review`, `design-polish`, `design-typography`) and the anti-pattern detection hook adapted from [pbakaus/impeccable](https://github.com/pbakaus/impeccable) (Apache 2.0) — a design skill system that teaches AI coding assistants real design principles.

`read-the-damn-docs` skill adapted from [BuilderIO/skills](https://github.com/BuilderIO/skills) — extended with memory-first lookup and discovery feedback loop.
