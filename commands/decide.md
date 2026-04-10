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

Append to `docs/decisions.md` using ADR (Architecture Decision Record) format. Number sequentially.

```markdown
## ADR-NNN: [Decision Title]

**Status:** Accepted
**Date:** [YYYY-MM-DD]

**Context:** (what prompted this decision — the problem or question)

**Alternatives Considered:**

### [Option A]
- Pros: [advantages]
- Cons: [disadvantages]
- Rejected: [why this wasn't chosen]

### [Option B]
- Pros: [advantages]
- Cons: [disadvantages]
- Rejected: [why this wasn't chosen]

**Decision:** [what we chose and a one-sentence summary of why]

**Consequences:**
- [What this enables going forward]
- [What this constrains]
- [Any follow-up work needed]
```

**Status values:**
- **Accepted** — current active decision
- **Superseded by ADR-NNN** — replaced by a later decision
- **Deprecated** — no longer applies

### Step 4: Confirm

Show the entry to the user. Ask if anything needs adjusting.

If `docs/decisions.md` doesn't exist, create it with the header:
```markdown
# Architecture Decision Log
```

### Rules

- Don't delete old ADRs — they capture historical context even when superseded
- When a decision changes, write a new ADR that supersedes the old one (update the old one's status)
- Number sequentially: ADR-001, ADR-002, etc.
- Keep each ADR self-contained — a reader should understand it without reading the whole log
