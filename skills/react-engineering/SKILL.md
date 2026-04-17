---
name: react-engineering
description: "Guides React component architecture, state management, and engineering discipline. Use when building React components, designing component architecture, implementing state management, or reviewing UI code structure. For design quality (typography, color, spacing, anti-patterns), see the design-setup skill."
---

# React Engineering

Disciplined React component architecture — file structure, state management, prop boundaries, and loading/error/empty state coverage.

## When to Use

- Building new React components or pages
- Designing component architecture or state management
- Implementing responsive layouts
- Reviewing UI code for quality
- Fixing accessibility issues

## Component Architecture

**File structure** — colocate tests, hooks, and types with components:

```
src/components/
  TaskList/
    TaskList.tsx          # Component
    TaskList.test.tsx     # Tests
    use-task-list.ts      # Custom hook (if complex logic)
    types.ts              # Component-specific types
```

**Rules:**
- One component per file
- Components under 200 lines (split if larger)
- Separate data fetching (containers) from presentation
- Every component must handle: loading state, empty state, error state
- Max prop drilling: 3 levels deep before restructuring

## State Management Decision Tree

```
Is the state used by only this component?
  → useState

Shared between 2-3 siblings?
  → Lift to parent

Read-heavy, rarely written (theme, auth, locale)?
  → Context

Derived from URL (filters, pagination, sort)?
  → URL state (searchParams)

Remote data with caching needs?
  → Server state (React Query, SWR)

Complex client state used app-wide?
  → Global store (Zustand, Redux) — last resort
```

## Design Quality

For typography, color, spacing, accessibility depth, and AI anti-pattern avoidance — see the `design-setup` skill. Run `/design-review` for a scored design audit.

## Loading States

- Skeleton loading over spinners for content areas
- Optimistic updates for perceived speed (update UI before server confirms)
- `aria-busy="true"` on loading containers

## Common Rationalizations

| Rationalization | Reality |
|---|---|
| "Accessibility is nice-to-have" | It's a legal requirement in many jurisdictions and a quality signal. |
| "We'll make it responsive later" | 3x harder to retrofit. Mobile-first from the start. |
| "This component is too small to need its own test" | Small components are the easiest to test. No excuse to skip. |
| "We don't need empty states yet" | Users hit empty states on first use. It's the first impression. |

## Red Flags

- Components over 200 lines
- Missing error, loading, or empty states
- No keyboard navigation testing
- Prop drilling beyond 3 levels

## Verification

After implementing UI:

- [ ] All interactive elements keyboard-accessible (Tab through the page)
- [ ] Loading, empty, and error states implemented
- [ ] Components under 200 lines
- [ ] No prop drilling beyond 3 levels
- [ ] State management matches the decision tree

## Performance Notes
<!-- Updated by /retro. Do not edit manually. -->
<!-- Format: - YYYY-MM-DD [project]: observation (evidence: source) -->
