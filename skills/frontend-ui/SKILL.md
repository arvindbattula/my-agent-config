---
name: frontend-ui
description: "Guides production-quality frontend UI development. Use when building React components, designing UI architecture, implementing responsive layouts, or when code review flags accessibility or design quality issues. Use when the output needs to look and feel like a real product, not an AI demo."
---

# Frontend UI Engineering

Production-quality UI with accessibility, responsive design, and disciplined component architecture. The goal is code that looks like it was written by someone who ships products — not AI demos with purple gradients and oversized cards.

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

## AI Aesthetic Anti-Patterns

These are the defaults AI tends to produce. Avoid them.

| AI Default | Why It's Wrong | Do This Instead |
|---|---|---|
| Purple/indigo everything | Models default to "safe" palettes | Use the project's actual color palette |
| Excessive gradients | Visual noise, distracts from content | Flat colors or subtle single-direction gradients |
| Rounded everything (`rounded-2xl`) | Ignores visual hierarchy | Consistent border-radius from design system |
| Oversized padding everywhere | Destroys visual hierarchy and density | Consistent spacing scale (0.25rem increments) |
| Generic hero sections | No connection to actual content | Content-first layouts |
| Shadow-heavy design | Competes with content for attention | Subtle or none unless design system specifies |
| Stock card grids | Ignores information priority | Purpose-driven layouts based on content |
| Lorem ipsum copy | Hides real layout problems | Realistic placeholder content |

## Spacing and Typography

- Use a consistent spacing scale (0.25rem increments or project-defined)
- Never use arbitrary pixel values — stick to the scale
- Typography hierarchy: establish clear heading levels and body text sizes
- Line height: 1.5 for body text, 1.2-1.3 for headings

## Accessibility (WCAG 2.1 AA)

**Non-negotiable requirements:**

- All interactive elements keyboard-accessible and focusable
- ARIA labels on icon buttons and inputs without visible labels
- Focus management on modals: move focus in, trap while open, restore on close
- Color contrast: 4.5:1 for normal text, 3:1 for large text (18px+)
- Never use color alone to convey information (add icons, text, or patterns)
- Meaningful empty/error states with `role="status"` and `role="alert"`
- Form inputs associated with labels (`htmlFor` / `aria-label`)
- Heading hierarchy: one `h1` per page, sequential levels (no skipping h2 → h4)

See [references/accessibility-checklist.md](../../references/accessibility-checklist.md) for the full checklist.

## Responsive Design

**Breakpoints to test:** 320px, 768px, 1024px, 1440px

**Mobile-first approach:**
```tsx
<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
```

- Touch targets: minimum 44x44px on mobile
- No horizontal scrolling at any breakpoint
- Navigation collapses appropriately on mobile

## Loading States

- Skeleton loading over spinners for content areas
- Optimistic updates for perceived speed (update UI before server confirms)
- `aria-busy="true"` on loading containers

## Common Rationalizations

| Rationalization | Reality |
|---|---|
| "Accessibility is nice-to-have" | It's a legal requirement in many jurisdictions and a quality signal. |
| "We'll make it responsive later" | 3x harder to retrofit. Mobile-first from the start. |
| "The AI aesthetic is fine for now" | It signals low quality and erodes trust. Match the design system. |
| "This component is too small to need its own test" | Small components are the easiest to test. No excuse to skip. |
| "We don't need empty states yet" | Users hit empty states on first use. It's the first impression. |

## Red Flags

- Components over 200 lines
- Inline styles or arbitrary pixel values outside the spacing scale
- Missing error, loading, or empty states
- No keyboard navigation testing
- Color as sole indicator of state (red = error without icon or text)
- Generic "AI look" (purple gradients, oversized cards, shadow-heavy)
- Prop drilling beyond 3 levels

## Verification

After implementing UI:

- [ ] All interactive elements keyboard-accessible (Tab through the page)
- [ ] Color contrast meets WCAG 2.1 AA (4.5:1 text, 3:1 large text)
- [ ] Responsive at 320px, 768px, 1024px, 1440px
- [ ] Loading, empty, and error states implemented
- [ ] No AI aesthetic anti-patterns (check the table above)
- [ ] Spacing follows the project's scale
- [ ] Components under 200 lines

## Performance Notes
<!-- Updated by /retro. Do not edit manually. -->
<!-- Format: - YYYY-MM-DD [project]: observation (evidence: source) -->
