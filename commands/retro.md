Project retrospective that reviews how well you thought about the problem upfront, what worked, and how each workflow skill performed. Run this when a project hits a milestone or ships. The goal is not to review code quality (that's `/inspect`) — it's to make the entire workflow smarter for the next project.

## Prerequisites

Read these files:
- `docs/spec.md` — what we said we'd build (required)
- `docs/plan.md` — how we said we'd build it
- `docs/learnings.md` — what surprised us
- `docs/decisions.md` — choices made along the way
- `CLAUDE.md` — project context

Also read the codebase to understand what was actually built.

If `docs/spec.md` doesn't exist or is empty, this command isn't useful — tell the user.

## Process

### Step 1: Spec vs. Reality Audit

Compare what was specified against what was actually built. Identify three categories:

**Built but not in spec** — features, components, or behaviors that were added during construction that the spec didn't anticipate.
- For each: why wasn't this caught during discovery? What question would have surfaced it?

**In spec but turned out wrong** — requirements that were specified but had to be changed during build.
- For each: what assumption was wrong? What would have revealed this earlier?

**Decisions forced mid-build** — choices from `decisions.md` or `learnings.md` that had to be made during construction but should have been made during discovery.
- For each: what discovery question would have surfaced this decision point upfront?

Present these findings to the user. Ask: "Does this match your experience? Anything else that surprised you during this project?"

### Step 2: Extract blind spot patterns

From the audit, distill 2-5 **blind spot patterns**. These are recurring categories of things that tend to get missed during discovery. Frame them as question types, not project-specific details.

Format:
```
**[Pattern Name]**
Missed: [what was missed in this project]
Root cause: [why it was missed — wrong assumption, didn't ask, didn't know to ask]
Discovery question to add: [the specific question that would catch this in future projects]
```

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

For each new pattern from Step 2:
- If a similar blind spot already exists, update it with this new evidence (increment the "seen in" count)
- If it's new, add it

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
