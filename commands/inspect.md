---
name: inspect
description: Multi-pass review of the current codebase
---

Multi-pass review of the current codebase. Checks architecture, spec compliance, edge cases, code quality, and security. Outputs categorized findings and promotes broadly useful learnings to global memory.

## Prerequisites

Read these files before starting:
- `docs/spec.md` — the specification (if exists)
- `docs/plan.md` — the build plan (if exists)
- `docs/decisions.md` — prior decisions (if exists)
- `docs/learnings.md` — prior learnings (if exists)
- `CLAUDE.md` — project context

This command works even without spec/plan files — it will skip the spec-compliance pass and focus on code quality.

## Process

### Orientation

Before starting review passes, scope the codebase:

```bash
# How big is this codebase?
find . -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.py" | grep -v node_modules | wc -l

# Recent changes (what to focus on)
git log --oneline -10 2>/dev/null

# Any TODOs or FIXMEs left behind?
grep -rn "TODO\|FIXME\|HACK\|XXX" --include="*.ts" --include="*.tsx" --include="*.js" --include="*.py" . 2>/dev/null | grep -v node_modules | head -15
```

Use this to calibrate review depth — a 5-file project doesn't need the same scrutiny as a 50-file project.

**Change sizing (if reviewing a PR or branch):**
- ~100 lines → Reviewable in one sitting
- ~300 lines → Acceptable if single logical change
- ~1000 lines → Too large. Recommend splitting.
- Separate refactoring from feature work — they're two different changes.

### Pass 1: Architecture

Explore the codebase and assess:
- Do components have the right intent, depth, and purpose?
- Are responsibilities clearly separated?
- Are there shallow modules that should be deepened? (See /review-architecture for the full deep-module methodology — this pass is a lighter version)
- Is the file/folder organization intuitive?
- Are there unnecessary abstractions or missing ones?

### Pass 2: Spec Compliance *(skip if no spec.md)*

Compare the implementation against `docs/spec.md`:
- Is everything in the MVP scope implemented?
- Is anything built that's listed as out-of-scope?
- Do user flows match what was specified?
- Does the data model match?

### Pass 3: Edge Cases & Error Handling

Think adversarially:
- What happens with empty/null/missing input?
- What happens when external services are down or slow?
- What happens at boundary conditions? (0 items, 1 item, 10000 items)
- Are error messages helpful to the user?
- Are there silent failures that should surface?

### Pass 4: Code Quality

Review for:
- Readability — can someone unfamiliar follow the code?
- Duplication — is there copy-pasted logic that should be shared?
- Naming — are variables, functions, files named clearly?
- Consistency — does the code follow its own patterns?
- Dead code — anything unused?
- Dependencies — any new deps added? Check: does existing stack solve this? Bundle impact? Actively maintained? Known vulnerabilities? License compatible? Prefer standard library over new dependencies.

### Pass 5: Security *(for team/public-facing projects)*

See `security` skill for full guidance. Check OWASP basics:
- Input validation at system boundaries
- No secrets in code or config files
- No SQL/command injection vectors
- Appropriate access controls
- Sensitive data handling (logging, storage, transmission)
- Rate limiting on auth endpoints
- Security headers configured

## Output

Present findings organized by severity. Within each category, label individual findings:

| Prefix | Meaning | Author Action |
|--------|---------|---------------|
| **Critical:** | Security vulnerability, data loss, broken functionality | Must fix before merge |
| **Important:** | Real issue that should be addressed | Must address or justify deferral |
| **Nit:** | Minor, optional — style or preference | Author may ignore |
| **FYI** | Informational, no action needed | Context for future reference |

Categories:

### Fix Now
(Issues that block further development or pose real risk)
- [Finding]: [Description] — [File:line if applicable]

### Fix Later
(Real issues, but not blocking. Add to plan as future phase.)
- [Finding]: [Description]

### Accept
(Known tradeoffs. Document in decisions.md if not already recorded.)
- [Finding]: [Description]

### What's Good
(Explicitly call out things done well — reinforces good patterns)
- [Finding]: [Description]

## After the Review

### Update learnings

Append any new learnings to `docs/learnings.md`:
```markdown
## Inspection — [Date]
- [Learning 1]
- [Learning 2]
```

### Promote to global *(important)*

Review the learnings from this project. If any are broadly applicable across projects (not specific to this codebase), offer to save them:
- As a global rule in `~/.claude/rules/` (if it's a behavioral principle)
- As a global memory entry (if it's contextual knowledge)

Ask the user: "These learnings seem broadly useful — want me to save them globally?"
- [Learning]: [Why it's broadly applicable]

### Suggest next steps

Based on findings, suggest:
- If Fix Now items exist: "Address these before continuing to the next phase."
- If Fix Later items exist: "Want me to add a cleanup phase to the plan?"
- If everything looks good: "Codebase is in good shape. Ready for the next `/construct` phase."

## Common Rationalizations

| Rationalization | Reality |
|---|---|
| "Tests pass, so it's good" | Tests are necessary but not sufficient. They don't catch architecture problems, security issues, or readability concerns. |
| "I wrote it, so I know it's correct" | Authors are blind to their own assumptions. Every change benefits from another set of eyes. |
| "This project is small, it doesn't need review" | Small projects have the most concentrated risk per line. A single bug in 500 lines is harder to find than in 50. |
| "AI-generated code is probably fine" | AI code needs more scrutiny, not less. It's confident and plausible, even when wrong. |
| "We'll clean it up later" | Later never comes. The review is the quality gate — use it. |

## Red Flags

- Review that only checks if tests pass (ignoring other axes)
- "LGTM" without evidence of actual review
- Security-sensitive code without security-focused review
- Large changes that are "too big to review properly" (split them)
- No regression tests accompanying bug fixes
- Accepting "I'll fix it later" for real issues

## Performance Notes
<!-- Updated by /retro. Do not edit manually. -->
<!-- Format: - YYYY-MM-DD [project]: observation (evidence: source) -->
- 2026-03-31 [innovate-intel]: Edge cases pass (Pass 3) found the most actionable issues — 21 unguarded json.loads, PDF filename injection, missing input validation. Architecture pass found real concerns but lower severity (evidence: inspection Fix Now items)
- 2026-03-31 [innovate-intel]: Parallel subagents for passes 1/3/4+5 worked well (3 agents). Spec compliance pass (Pass 2) found zero gaps — could be skipped for projects at Phase 8 maturity if inspection was run at earlier milestones (evidence: spec compliance agent found 0 gaps)
- 2026-03-31 [innovate-intel]: Re-inspection after fixes (verify pass) caught the RuntimeSettingsProvider test needing ToastProvider wrapper — a regression introduced by the fix. Always re-run full test suite, not just new tests (evidence: 1 failing test in RuntimeSettingsProvider.test.tsx after Toast wiring)
