---
name: retro
description: Project retrospective — review workflow and extract patterns
---

Project retrospective that reviews how well you thought about the problem upfront, what worked, and how each workflow skill performed. Run this when a project hits a milestone or ships. The goal is not to review code quality (that's `/inspect`) — it's to make the entire workflow smarter for the next project.

## Prerequisites

Read whichever of these exist (none are strictly required):
- `docs/spec.md` — what we said we'd build (preferred anchor for Step 1)
- `docs/plan.md` — how we said we'd build it
- `docs/learnings.md` — what surprised us
- `docs/decisions.md` — choices made along the way
- `CLAUDE.md` — project context

Also read the codebase to understand what was actually built.

Step 1 adapts to what's available:
- If `docs/spec.md` exists → run Step 1a (full Spec vs. Reality audit).
- If not → run Step 1b (lighter archaeological pass against CLAUDE.md,
  git log for fix/revert/bug commits, any review comments or
  post-mortems, and the codebase). Patterns from 1b carry softer
  evidence; tag them accordingly in Step 2 so future `/discover` calls
  can weigh them.

If none of CLAUDE.md, git history, memory, or the codebase is available,
stop — there's nothing to retro against. Tell the user.

## Process

### Step 1a: Spec vs. Reality Audit (when `docs/spec.md` exists)

Compare what was specified against what was actually built. Identify three categories:

**Built but not in spec** — features, components, or behaviors that were added during construction that the spec didn't anticipate.
- For each: why wasn't this caught during discovery? What question would have surfaced it?

**In spec but turned out wrong** — requirements that were specified but had to be changed during build.
- For each: what assumption was wrong? What would have revealed this earlier?

**Decisions forced mid-build** — choices from `decisions.md` or `learnings.md` that had to be made during construction but should have been made during discovery.
- For each: what discovery question would have surfaced this decision point upfront?

Present these findings to the user. Ask: "Does this match your experience? Anything else that surprised you during this project?"

### Step 1b: Archaeological Audit (when `docs/spec.md` is absent)

Reconstruct the "what was intended vs. what was built" gap from whatever sources exist. Identify three categories, same shape as 1a:

**Built but not stated** — features or behaviors in the code that `CLAUDE.md` or the README never mention. Look at top-level modules, route handlers, major UI surfaces, and CLI subcommands.
- For each: was this an intentional expansion or drift? What would have surfaced it as a decision point upfront?

**Unexpected issues** — pain visible in git history or reviews. Scan commit messages for `fix:`, `revert:`, `hotfix`, `bug`, and read any review comments, post-mortems, or issue threads.
- For each: which category of discovery question would have pre-empted this? (data lifecycle, error states, external API limits, auth boundaries, etc.)

**Forced mid-build decisions** — choices visible in commit messages or `decisions.md` (if it exists) that look reactive rather than deliberate. Look for commits that revise an earlier approach, add a config escape hatch, or introduce a workaround.
- For each: what did the team learn at that moment that they could have known earlier?

Present findings. Ask: "This is a reconstruction from code and history rather than a spec comparison. Does this match your memory of what went off-plan?" Respect corrections — the user's memory trumps git log here.

### Step 2: Extract blind spot patterns

From the audit, distill 2-5 **blind spot patterns**. These are recurring categories of things that tend to get missed during discovery. Frame them as question types, not project-specific details.

Format:
```
**[Pattern Name]**
Missed: [what was missed in this project]
Root cause: [why it was missed — wrong assumption, didn't ask, didn't know to ask]
Discovery question to add: [the specific question that would catch this in future projects]
Evidence source: spec-audit | archaeological | external-review
```

The `Evidence source` field records where the pattern came from. `spec-audit` is the strongest (direct spec-vs-reality delta from Step 1a). `archaeological` is inferred from git log / codebase without a spec (Step 1b) — softer, needs more corroboration before it validates. `external-review` came from review comments or post-mortems — strong but indirect. Future `/discover` calls and this command's Step 5 use the field to weigh patterns; the 3-project validation threshold in Step 5 still applies.

Examples of what patterns look like:
- "Error state design" — you specified the happy path but not what users see when things fail
- "Data migration" — you defined the data model but not how existing data gets into it
- "Auth boundaries" — you didn't clarify who can access what until mid-build
- "External API limits" — you assumed an API would work a certain way without checking

### Step 3: Extract positive patterns

Review `docs/learnings.md` and `docs/decisions.md` for things that went **right**. Look for:

- **Tech choices that paid off** — a library, framework, or tool that worked well and why
- **Architectural patterns that held up** — a structural decision that didn't need to change during build
- **Process wins** — something about the discover/blueprint/construct flow that worked especially well this time

For each positive pattern:
```
**[Pattern Name]**
What worked: [description]
Why it worked: [context — what about this project made it a good fit]
Reuse when: [conditions where this pattern applies]
```

Write to `~/.claude/projects/-Users-arvindbattula/memory/engineering_patterns.md`:
- If the pattern already exists, increment "seen in" count and add this project's context
- If new and this is the first project, add under the appropriate section (Tech Choices, Architectural Patterns, or Gotchas) and mark as `(provisional — 1 project)`
- If seen in 2+ projects, update to `(validated — N projects)`

Format in the file:
```markdown
### [Pattern Name]
**Seen in:** [count] projects ([project names])
**What:** [description]
**When to use:** [conditions]
**Status:** provisional | validated
```

### Step 4: Update skill performance notes

For each workflow skill that was used in this project (`/discover`, `/blueprint`, `/construct`, `/inspect`), read the skill file and compare its instructions against how this project actually went.

**For `/discover`** — Review the spec audit from Step 1:
- Did the interview layers cover the right depth for this project size?
- Were the blind-spot probes effective?
- Did engineering patterns inform good recommendations?
- Were there signs the interview should have pushed harder or softer somewhere?

**For `/blueprint`** — Review the plan vs. what was actually built:
- Were phases right-sized for single sessions?
- Did the cross-phase integration check catch real issues?
- Were there phases that had to be split or merged mid-build?
- Did dependency ordering hold up?

**For `/construct`** — Review `docs/learnings.md` and the build history:
- How many spec reconciliations were triggered? What caused them?
- Did the orientation step save time?
- Was context window management needed?
- Were there repeated friction points?

**For `/inspect`** — Review inspection findings (if `/inspect` was run):
- Which review passes found the most issues?
- Were any passes consistently empty (candidate for skipping by project type)?
- Did the "promote to global" step produce useful suggestions?

**For `/ship`** — Review the launch process (if `/ship` was run):
- Did the pre-launch checklist catch real issues before deploy?
- Were any checklist sections consistently irrelevant for this project type?
- Was the rollback plan tested or needed?
- Were there post-deploy surprises the checklist should have caught?

**For `security`** — Review security posture (if security was relevant):
- Were security issues found during `/inspect` that the skill should have prevented earlier?
- Did the three-tier boundary system (Always/Ask/Never) hold up?
- Any false positives (security guidance that didn't apply to this project type)?

**For `debugging`** — Review bug encounters (if bugs were debugged):
- Did the triage checklist (reproduce → localize → reduce → fix → guard) save time vs. guessing?
- Were there debugging patterns not covered by the skill?
- Did regression tests written during debugging catch anything later?

**For `api-contracts`** — Review API decisions (if APIs were designed):
- Did contract-first design prevent rework?
- Were there API shape changes mid-build that contract-first would have caught?
- Did the error semantics pattern hold up across endpoints?

**For `git`** — Review commit discipline (if relevant):
- Were atomic commits maintained throughout the project?
- Did the save-point pattern (commit on green, revert on red) help?
- Were there commit hygiene issues in the final history?

**For `performance`** — Review performance work (if performance was addressed):
- Did measurement-first catch the actual bottleneck on the first try?
- Were budget thresholds appropriate for this project?
- Any performance issues that the skill's diagnostic tree missed?

**For `/idea-refine`** — Review the idea refinement (if `/idea-refine` was run):
- Did the divergent phase (variations) surface the direction that was ultimately chosen?
- Were the hidden assumptions identified actually the ones that mattered during build?
- Was the "Not Doing" list respected, or did scope creep reintroduce items?

**For `react-engineering`** — Review UI quality (if frontend was built):
- Did the state management decision tree lead to the right choice?
- Were accessibility issues found late that the skill should have caught earlier?
- Did the component architecture guidance (file structure, prop drilling limits) hold up?

**For `design-setup`** — Review design quality (if design skills were used):
- Did the design context (.impeccable.md) guide meaningful design decisions?
- Were anti-patterns (purple gradients, Inter font, nested cards) avoided?
- Did the design-review scoring reflect actual quality?

For each skill, append dated observations to the `## Performance Notes` section at the bottom of the skill file:
- Format: `- YYYY-MM-DD [project-name]: observation (evidence: docs/learnings.md, etc.)`
- Cap at **5 notes per skill per retro** — highest signal only
- If a note contradicts an earlier note, update the earlier one instead of adding a new one
- If a pattern has evidence from **3+ projects**, propose promoting it into the skill's actual instructions — present the specific change to the user for approval before editing

Rules:
- Notes must cite evidence (which docs/ file, what specific finding)
- Notes must be actionable — "Layer 4 was skipped" is not useful; "Layer 4 question about data lifecycle would have caught the cascade delete issue" IS useful
- Don't log "everything went fine" — only log signal
- Only note skills that were actually used in this project

### Step 5: Update global blind spots

Read `~/.claude/memory/discovery-blind-spots.md` (create if it doesn't exist).

For each new pattern from Step 2, check for duplicates before writing:

```bash
~/.claude/bin/recall "<pattern name + one-line description>" --scope global --budget 600 --why
```

If recall returns a near-match, update the existing entry's "Seen in" count with this project's context instead of creating a duplicate. If recall returns nothing similar, add the new pattern.

File format:
```markdown
# Discovery Blind Spots

Accumulated patterns of things missed during /discover. Read by /discover to add targeted probing questions.

## [Pattern Name]
**Seen in:** [count] projects ([project names])
**What gets missed:** [description]
**Discovery question:** [the question to ask in future /discover sessions]
**Priority:** [high/medium/low — based on how often it recurs and how costly the miss is]
```

Sort by priority (high first), then by frequency.

### Step 6: Update the memory index

If this is the first retro, add pointers to `discovery-blind-spots.md` and `engineering_patterns.md` in `~/.claude/projects/-Users-arvindbattula/memory/MEMORY.md` (if not already there).

### Step 7: Report

Tell the user:
- How many blind spots were found (new vs. updated)
- How many positive patterns were captured (new vs. updated, provisional vs. validated)
- Skill performance notes added (which skills, what observations)
- Any promotion proposals (patterns with 3+ project evidence ready to become skill instructions)
- The top 3 patterns that `/discover` will now probe for
- "These patterns will automatically strengthen your next project."

## Principles

- **Be honest, not harsh.** The point is to improve, not to criticize. Frame everything as "here's what we'll catch next time."
- **Patterns over incidents.** A one-off miss isn't a blind spot. A recurring pattern is. If this is the first project, note patterns as provisional — they become confirmed after recurring.
- **Questions over rules.** Blind spots should generate new *questions* for /discover, not rigid rules. The goal is better thinking, not more bureaucracy.
- **Keep the list lean.** 10-15 high-quality blind spots is better than 50 vague ones. Merge similar patterns. Remove ones that stop recurring.
- **Celebrate what worked.** Positive patterns are as valuable as blind spots. They prevent regression — knowing what to KEEP doing is as important as knowing what to fix.
- **Performance notes are for signal, not logging.** Don't record every observation. Record the ones that would change how a skill behaves next time.
- **Promotions require evidence.** Never promote a performance note into a skill's instructions until it has evidence from 3+ projects. One project is an anecdote. Three is a pattern.
