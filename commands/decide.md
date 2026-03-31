---
name: decide
description: Record an architecture or product decision
---

Record an architecture or product decision with full context in `docs/decisions.md`.

## When to Use

Run `/decide` when you've made a significant choice that future sessions should understand:
- Technology or framework selection
- Architecture pattern choice
- Data model decisions
- Scope tradeoffs (building X instead of Y)
- Performance vs. simplicity tradeoffs
- Any choice where the "why" isn't obvious from the code

## Process

### Step 1: Identify the decision

If the user describes the decision, use that. Otherwise, ask: "What decision did you just make?"

### Step 2: Explore the context

Ask briefly:
- What prompted this? (What problem or question led here?)
- What other options did you consider?
- Why this option over the others?
- What are the consequences? (What does this enable or constrain going forward?)

Don't over-interview — this should take 1-2 minutes, not 10.

### Step 3: Write the entry

Append to `docs/decisions.md`:

```markdown
## [Date] — [Decision Title]
**Context:** (what prompted this decision)
**Options considered:**
1. [Option A] — [brief pro/con]
2. [Option B] — [brief pro/con]
3. [Option C] — [brief pro/con]
**Decision:** [what we chose]
**Rationale:** [why — the core reason]
**Consequences:** [what this means going forward — what it enables, what it constrains]
```

### Step 4: Confirm

Show the entry to the user. Ask if anything needs adjusting.

If `docs/decisions.md` doesn't exist, create it with the header:
```markdown
# Architecture Decision Log
```
