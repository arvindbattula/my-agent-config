---
name: design-review
description: "Run a design quality audit across accessibility, performance, theming, responsive design, and anti-patterns. Generates a scored report with P0-P3 severity ratings. Use when you want to evaluate UI design quality, check for AI aesthetic anti-patterns, or get a design score before shipping."
argument-hint: "[area (feature, page, component...)]"
user-invocable: true
---

## MANDATORY PREPARATION

Invoke the `design-setup` skill — it contains design principles, anti-patterns, and the **Context Gathering Protocol**. Follow the protocol before proceeding — if no design context exists yet, you MUST run `/design-setup teach` first.

---

Run systematic **design quality** checks and generate a comprehensive report. Don't fix issues — document them for other skills to address.

This is a design audit, not a code review. Check what's visible and experiential in the interface.

## Diagnostic Scan

Run comprehensive checks across 5 dimensions. Score each dimension 0-4 using the criteria below.

### 1. Accessibility (A11y)

**Check for**:
- **Contrast issues**: Text contrast ratios < 4.5:1 (or 7:1 for AAA)
- **Missing ARIA**: Interactive elements without proper roles, labels, or states
- **Keyboard navigation**: Missing focus indicators, illogical tab order, keyboard traps
- **Semantic HTML**: Improper heading hierarchy, missing landmarks, divs instead of buttons
- **Alt text**: Missing or poor image descriptions
- **Form issues**: Inputs without labels, poor error messaging, missing required indicators

**Score 0-4**: 0=Inaccessible (fails WCAG A), 1=Major gaps, 2=Partial (some effort, significant gaps), 3=Good (WCAG AA mostly met), 4=Excellent (WCAG AA fully met, approaches AAA)

### 2. Performance

**Check for**:
- **Layout thrashing**: Reading/writing layout properties in loops
- **Expensive animations**: Animating layout properties instead of transform/opacity
- **Missing optimization**: Images without lazy loading, unoptimized assets
- **Render performance**: Unnecessary re-renders, missing memoization

**Score 0-4**: 0=Severe issues, 1=Major problems, 2=Partial, 3=Good, 4=Excellent

### 3. Theming

**Check for**:
- **Hard-coded colors**: Colors not using design tokens
- **Broken dark mode**: Missing dark mode variants, poor contrast in dark theme
- **Inconsistent tokens**: Using wrong tokens, mixing token types

**Score 0-4**: 0=No theming, 1=Minimal tokens, 2=Partial, 3=Good, 4=Excellent

### 4. Responsive Design

**Check for**:
- **Fixed widths**: Hard-coded widths that break on mobile
- **Touch targets**: Interactive elements < 44x44px
- **Horizontal scroll**: Content overflow on narrow viewports
- **Text scaling**: Layouts that break when text size increases

**Score 0-4**: 0=Desktop-only, 1=Major issues, 2=Partial, 3=Good, 4=Excellent

### 5. Anti-Patterns (CRITICAL)

Check against ALL the **DON'T** guidelines in the design-setup skill. Look for AI slop tells (AI color palette, gradient text, glassmorphism, hero metrics, card grids, generic fonts) and general design anti-patterns (gray on color, nested cards, bounce easing, redundant copy).

**Score 0-4**: 0=AI slop gallery (5+ tells), 1=Heavy AI aesthetic (3-4 tells), 2=Some tells (1-2 noticeable), 3=Mostly clean, 4=No AI tells (distinctive, intentional design)

## Generate Report

### Audit Health Score

| # | Dimension | Score | Key Finding |
|---|-----------|-------|-------------|
| 1 | Accessibility | ? | [most critical issue or "--"] |
| 2 | Performance | ? | |
| 3 | Responsive Design | ? | |
| 4 | Theming | ? | |
| 5 | Anti-Patterns | ? | |
| **Total** | | **??/20** | **[Rating band]** |

**Rating bands**: 18-20 Excellent, 14-17 Good, 10-13 Acceptable, 6-9 Poor, 0-5 Critical

### Anti-Patterns Verdict
**Start here.** Pass/fail: Does this look AI-generated? List specific tells. Be brutally honest.

### Executive Summary
- Audit Health Score: **??/20** ([rating band])
- Total issues found (count by severity: P0/P1/P2/P3)
- Top 3-5 critical issues
- Recommended next steps

### Detailed Findings by Severity

Tag every issue with **P0-P3 severity**:
- **P0 Blocking**: Prevents task completion — fix immediately
- **P1 Major**: Significant difficulty or WCAG AA violation — fix before release
- **P2 Minor**: Annoyance, workaround exists — fix in next pass
- **P3 Polish**: Nice-to-fix, no real user impact — fix if time permits

For each issue, document:
- **[P?] Issue name**
- **Location**: Component, file, line
- **Category**: Accessibility / Performance / Theming / Responsive / Anti-Pattern
- **Impact**: How it affects users
- **Recommendation**: How to fix it

### Positive Findings

Note what's working well — good practices to maintain and replicate.

## Recommended Actions

List recommended skills in priority order (P0 first):

1. **[P?] `/design-typography`** — Brief description
2. **[P?] `/design-polish`** — Brief description

End with `/design-polish` as the final step if any fixes were recommended.

After presenting the summary, tell the user:

> You can ask me to run these one at a time, all at once, or in any order you prefer.
>
> Re-run `/design-review` after fixes to see your score improve.

## Performance Notes
<!-- Updated by /retro. Do not edit manually. -->
<!-- Format: - YYYY-MM-DD [project]: observation (evidence: source) -->
