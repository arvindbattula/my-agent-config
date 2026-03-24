Project retrospective that identifies discovery blind spots. Run this when a project hits a milestone or ships. The goal is not to review code quality (that's `/inspect`) — it's to review **how well you thought about the problem upfront** and make future `/discover` sessions smarter.

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

### Step 3: Update global blind spots

Read `~/.claude/memory/discovery-blind-spots.md` (create if it doesn't exist).

For each new pattern:
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

### Step 4: Update the memory index

If this is the first retro, add a pointer to `discovery-blind-spots.md` in `~/.claude/projects/-Users-arvindbattula/memory/MEMORY.md`.

### Step 5: Report

Tell the user:
- How many blind spots were found (new vs. updated)
- The top 3 patterns that `/discover` will now probe for
- "These patterns will automatically strengthen your next `/discover` session."

## Principles

- **Be honest, not harsh.** The point is to improve, not to criticize. Frame everything as "here's what we'll catch next time."
- **Patterns over incidents.** A one-off miss isn't a blind spot. A recurring pattern is. If this is the first project, note patterns as provisional — they become confirmed after recurring.
- **Questions over rules.** Blind spots should generate new *questions* for /discover, not rigid rules. The goal is better thinking, not more bureaucracy.
- **Keep the list lean.** 10-15 high-quality blind spots is better than 50 vague ones. Merge similar patterns. Remove ones that stop recurring.
