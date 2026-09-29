---
name: "retro"
description: "Project retrospective — review workflow and extract patterns"
disable-model-invocation: true
---

# retro


Project retrospective that reviews how well you thought about the problem upfront, what worked, and how each workflow skill performed. Run this when a project hits a milestone or ships. The goal is not to review code quality (that's `/skill:code-review`) — it's to make the entire workflow smarter for the next project.

## Prerequisites

Read whichever of these exist (none are strictly required):
- The **feature spec(s) from the issue tracker** (published by `/skill:to-spec`) — what we said we'd build (preferred anchor for Step 1)
- The **tickets from the issue tracker** (from `/skill:to-tickets`) — how we said we'd build it
- ADRs / `docs/decisions.md` — choices made along the way
- The domain glossary / `CONTEXT.md` — the vocabulary the project settled on
- `CLAUDE.md` — project context

Also read the codebase to understand what was actually built.
Also read production/CI logs since the last retro — a log sweep often surfaces the costliest inefficiencies and real-world issues invisible in the tracker or git log.

Step 1 adapts to what's available:
- If a spec exists on the tracker → run Step 1a (full Spec vs. Reality audit).
- If not → run Step 1b (lighter archaeological pass against CLAUDE.md,
  git log for fix/revert/bug commits, any review comments or
  post-mortems, and the codebase). Patterns from 1b carry softer
  evidence; tag them accordingly in Step 2 so future grilling sessions
  can weigh them.

If none of CLAUDE.md, git history, memory, or the codebase is available,
stop — there's nothing to retro against. Tell the user.

## Process

### Step 1a: Spec vs. Reality Audit (when a spec exists on the tracker)

Compare what was specified against what was actually built. Identify three categories:

**Built but not in spec** — features, components, or behaviors that were added during construction that the spec didn't anticipate.
- For each: why wasn't this caught during grilling? What question would have surfaced it?

**In spec but turned out wrong** — requirements that were specified but had to be changed during build.
- For each: what assumption was wrong? What would have revealed this earlier?

**Decisions forced mid-build** — choices from ADRs or commit history that had to be made during implementation but should have been made during grilling/spec-writing.
- For each: what grilling question would have surfaced this decision point upfront?

Present these findings to the user. Ask: "Does this match your experience? Anything else that surprised you during this project?"

### Step 1b: Archaeological Audit (when no spec exists)

Reconstruct the "what was intended vs. what was built" gap from whatever sources exist. Identify three categories, same shape as 1a:

**Built but not stated** — features or behaviors in the code that `CLAUDE.md` or the README never mention. Look at top-level modules, route handlers, major UI surfaces, and CLI subcommands.
- For each: was this an intentional expansion or drift? What would have surfaced it as a decision point upfront?

**Unexpected issues** — pain visible in git history or reviews. Scan commit messages for `fix:`, `revert:`, `hotfix`, `bug`, and read any review comments, post-mortems, or issue threads.
- For each: which category of grilling question would have pre-empted this? (data lifecycle, error states, external API limits, auth boundaries, etc.)

**Forced mid-build decisions** — choices visible in commit messages or ADRs (if they exist) that look reactive rather than deliberate. Look for commits that revise an earlier approach, add a config escape hatch, or introduce a workaround.
- For each: what did the team learn at that moment that they could have known earlier?

Present findings. Ask: "This is a reconstruction from code and history rather than a spec comparison. Does this match your memory of what went off-plan?" Respect corrections — the user's memory trumps git log here.

### Step 2: Extract blind spot patterns

From the audit, distill 2-5 **blind spot patterns**. These are recurring categories of things that tend to get missed during grilling/spec-writing. Frame them as question types, not project-specific details.

Format:
```
**[Pattern Name]**
Missed: [what was missed in this project]
Root cause: [why it was missed — wrong assumption, didn't ask, didn't know to ask]
Grilling question to add: [the specific question that would catch this in future projects]
Evidence source: spec-audit | archaeological | external-review
```

The `Evidence source` field records where the pattern came from. `spec-audit` is the strongest (direct spec-vs-reality delta from Step 1a). `archaeological` is inferred from git log / codebase without a spec (Step 1b) — softer, needs more corroboration before it validates. `external-review` came from review comments or post-mortems — strong but indirect. Future grilling sessions and this command's Step 5 use the field to weigh patterns; the 3-project validation threshold in Step 5 still applies.

Examples of what patterns look like:
- "Error state design" — you specified the happy path but not what users see when things fail
- "Data migration" — you defined the data model but not how existing data gets into it
- "Auth boundaries" — you didn't clarify who can access what until mid-build
- "External API limits" — you assumed an API would work a certain way without checking

### Step 3: Extract positive patterns

Review ADRs, the tracker history, and mnemosyne recall for things that went **right**. Look for:

- **Tech choices that paid off** — a library, framework, or tool that worked well and why
- **Architectural patterns that held up** — a structural decision that didn't need to change during build
- **Process wins** — something about the grill-with-docs → to-spec → to-tickets → implement flow that worked especially well this time

For each positive pattern:
```
**[Pattern Name]**
What worked: [description]
Why it worked: [context — what about this project made it a good fit]
Reuse when: [conditions where this pattern applies]
```

Save each positive pattern to **mnemosyne** (`mnemosyne_remember`):
- Before saving, `mnemosyne_recall` the pattern name — if a near-match exists, save an update that increments the "seen in" count with this project's context (and `mnemosyne_forget` the stale entry if it's superseded)
- Mark new patterns `(provisional — 1 project)`; 2+ projects → `(validated — N projects)`
- Include in the memory content: what the pattern is, when to use it, status (provisional | validated), and which projects it's been seen in

### Step 4: Update skill performance notes

For each workflow skill that was used in this project, read the skill file and compare its instructions against how this project actually went.

**For `grill-with-docs` / `grilling`** — Review the spec audit from Step 1:
- Did the interview cover the right depth for this project size?
- Were the blind-spot probes (Performance Notes) effective?
- Did the frontier rounds settle decisions in the right order?
- Were there signs the interview should have pushed harder or softer somewhere?

**For `to-spec`** — Review the published spec vs. what was actually built:
- Did the user stories cover what got built, or did implementation escape the spec?
- Were the testing seams well-chosen?
- Was the Out of Scope section respected?

**For `to-tickets`** — Review the ticket breakdown vs. the build history:
- Were tickets right-sized for single context windows?
- Did the blocking edges hold up, or did tickets have hidden dependencies?
- Were there tickets that had to be split or merged mid-build?

**For `implement`** — Review the build sessions:
- Did the 40%/60% context-window thresholds get respected? What happened when they weren't?
- Did TDD-at-seams produce tests that survived refactoring?
- Were there repeated friction points?

**For `code-review`** — Review the review findings (if run):
- Did the Standards and Spec axes each catch real issues?
- Were any smell-baseline flags consistently irrelevant for this project type (candidates for repo-standard overrides)?

**For `ship`** — Review the launch process (if `/skill:ship` was run):
- Did the pre-launch checklist catch real issues before deploy?
- Were any checklist sections consistently irrelevant for this project type?
- Was the rollback plan tested or needed?
- Were there post-deploy surprises the checklist should have caught?

**For `security`** — Review security posture (if security was relevant):
- Were security issues found during code-review that the skill should have prevented earlier?
- Did the three-tier boundary system (Always/Ask/Never) hold up?
- Any false positives (security guidance that didn't apply to this project type)?

**For `diagnosing-bugs`** — Review bug encounters (if bugs were debugged):
- Did the tight feedback loop get built before hypothesizing? What did it catch?
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

**For `idea-refine`** — Review the idea refinement (if `/skill:idea-refine` was run):
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
- Format: `- YYYY-MM-DD [project-name]: observation (evidence: source)`
- Cap at **5 notes per skill per retro** — highest signal only
- If a note contradicts an earlier note, update the earlier one instead of adding a new one
- If a pattern has evidence from **3+ projects**, propose promoting it into the skill's actual instructions — present the specific change to the user for approval before editing

Rules:
- Notes must cite evidence (which ticket, ADR, or specific finding)
- Notes must be actionable — "Layer 4 was skipped" is not useful; "Layer 4 question about data lifecycle would have caught the cascade delete issue" IS useful
- Don't log "everything went fine" — only log signal
- Only note skills that were actually used in this project

### Step 5: Update global blind spots

For each new pattern from Step 2, check for duplicates before saving to **mnemosyne**:

`mnemosyne_recall "<pattern name + one-line description>"`

If recall returns a near-match, save an updated entry that increments the "Seen in" count with this project's context (and `mnemosyne_forget` the stale one). If nothing similar comes back, save the new pattern with high importance.

Memory content format:
```
Blind spot: [Pattern Name]
Seen in: [count] projects ([project names])
What gets missed: [description]
Grilling question: [the question to ask in future grill-with-docs sessions]
Priority: [high/medium/low — based on recurrence and cost of the miss]
```

### Step 6: (removed)

No memory index to maintain — mnemosyne handles retrieval by similarity.

### Step 7: Report

Run an `/skill:unslop` pass over the retro write-up before presenting it — it is publishable prose.

Tell the user:
- How many blind spots were found (new vs. updated)
- How many positive patterns were captured (new vs. updated, provisional vs. validated)
- Skill performance notes added (which skills, what observations)
- Any promotion proposals (patterns with 3+ project evidence ready to become skill instructions)
- The top 3 patterns that future grilling sessions will now probe for
- "These patterns will automatically strengthen your next project."

## Principles

- **Be honest, not harsh.** The point is to improve, not to criticize. Frame everything as "here's what we'll catch next time."
- **Patterns over incidents.** A one-off miss isn't a blind spot. A recurring pattern is. If this is the first project, note patterns as provisional — they become confirmed after recurring.
- **Questions over rules.** Blind spots should generate new *questions* for grilling, not rigid rules. The goal is better thinking, not more bureaucracy.
- **Keep the list lean.** 10-15 high-quality blind spots is better than 50 vague ones. Merge similar patterns. Remove ones that stop recurring.
- **Celebrate what worked.** Positive patterns are as valuable as blind spots. They prevent regression — knowing what to KEEP doing is as important as knowing what to fix.
- **Performance notes are for signal, not logging.** Don't record every observation. Record the ones that would change how a skill behaves next time.
- **Promotions require evidence.** Never promote a performance note into a skill's instructions until it has evidence from 3+ projects. One project is an anecdote. Three is a pattern.

## Performance Notes
<!-- Updated by /retro. Do not edit manually. -->
<!-- Format: - YYYY-MM-DD [project]: observation (evidence: source) -->
- 2026-07-17 [Project C]: Add 'read the production/CI logs since the last retro' to the retro prerequisites — a log sweep found the costliest inefficiency (recurring job overlap) and a recovered opportunity, neither visible in docs/ or git log. (evidence: project CI logs)
