---
name: idea-refine
description: Refine a vague idea into a sharp, buildable concept
---

Refine a fuzzy idea into a sharp concept with clear scope, validated assumptions, and a one-pager output. This is the step BEFORE `/discover` — use it when the idea isn't yet concrete enough for a structured product interview.

**This is NOT the same as /discover.** Idea-refine is divergent thinking → convergent thinking → one-pager. Discover is a structured interview that produces a full spec.

## Process

### Phase 1: Understand & Expand (Divergent)

1. Restate the idea as a crisp "How Might We" problem statement
2. Ask 3-5 sharpening questions:
   - Who is this for, specifically?
   - What does success look like?
   - What are the real constraints (time, tech, resources)?
   - What's been tried before?
   - Why now?
3. Generate 5-8 idea variations using these lenses:
   - **Inversion:** What if we did the opposite?
   - **Constraint removal:** What if budget/time/tech weren't factors?
   - **Audience shift:** What if this were for a completely different user?
   - **Combination:** What if we merged this with an adjacent idea?
   - **Simplification:** What's the version that's 10x simpler?
   - **10x version:** What does this look like at massive scale?
   - **Expert lens:** What would domain experts find obvious that we're missing?

Don't generate more than 8 variations. Quality over quantity.

### Phase 2: Evaluate & Converge

1. Cluster the variations that resonate into 2-3 **distinct directions** (not minor tweaks — meaningfully different approaches)
2. Stress-test each against three criteria:
   - **User value:** Who benefits, how much? Is this a painkiller or a vitamin?
   - **Feasibility:** What's the technical/resource cost? What's the hardest part?
   - **Differentiation:** What's genuinely different from what exists? Would someone switch?
3. Surface hidden assumptions:
   - What are you betting is true but haven't validated?
   - What could kill this?
   - What are you choosing to ignore (and why that's OK for now)?

**Be honest, not supportive.** If an idea is weak, say so with kindness and explain why. Sycophancy wastes everyone's time.

### Phase 3: Sharpen & Ship

Write a one-pager to `docs/idea.md` (or print it if no project exists yet):

```markdown
# [Idea Name]

## Problem Statement
[One-sentence "How Might We" framing]

## Recommended Direction
[Chosen direction and why — 2-3 paragraphs max]

## Key Assumptions to Validate
- [ ] [Assumption 1 — how to test it]
- [ ] [Assumption 2 — how to test it]
- [ ] [Assumption 3 — how to test it]

## MVP Scope
[Minimum version that tests the core assumption. What's in, what's out.]

## Not Doing (and Why)
- [Thing 1] — [reason]
- [Thing 2] — [reason]
- [Thing 3] — [reason]

## Open Questions
- [Question needing answer before building]
```

The "Not Doing" list is arguably the most valuable section. Focus means saying no to good ideas.

### Suggest next step

"When the idea is sharp enough, run `/discover` to write the full spec."

## Principles

- **Simplicity is the ultimate sophistication.** If the idea can't be explained in one sentence, it's not sharp enough yet.
- **Start with the user, work backwards to tech.** Every good idea starts with a person and a problem.
- **Say no to 1,000 things.** Focus beats breadth.
- **Challenge every assumption.** The most dangerous assumptions are the ones nobody states.
- **Don't just list ideas — tell a story.** Why this direction? Why now? Why this user?

## Performance Notes
<!-- Updated by /retro. Do not edit manually. -->
<!-- Format: - YYYY-MM-DD [project]: observation (evidence: source) -->
