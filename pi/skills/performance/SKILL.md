---
name: performance
description: "Guides performance optimization with measurement-first approach. Use when page load is slow, interactions feel sluggish, API responses are delayed, bundle size is growing, or when Core Web Vitals need improvement. Never optimize without profiling data first."
---

# Performance Optimization

Measure first, optimize what matters, verify the improvement. Never optimize without profiling data. Gut feelings about performance are wrong more often than right.

## When to Use

- Page load feels slow or Core Web Vitals are in "Needs Improvement" / "Poor"
- API responses are slow
- Bundle size is growing beyond budget
- Users report sluggishness
- Performance review during `/inspect`

**When NOT to use:** Don't preemptively optimize. Write correct, clear code first. Optimize only when measurement shows a real problem.

## The Optimization Cycle

```
MEASURE → IDENTIFY → FIX → VERIFY → GUARD
    ↑                                  │
    └──────────────────────────────────┘
```

1. **Measure** — establish a baseline with real numbers
2. **Identify** — find the bottleneck (not what you assume, what the data shows)
3. **Fix** — apply the targeted optimization
4. **Verify** — measure again, confirm improvement
5. **Guard** — add a budget or test to prevent regression

## Core Web Vitals Targets

| Metric | Good | Needs Improvement | Poor |
|--------|------|-------------------|------|
| LCP (Largest Contentful Paint) | ≤2.5s | ≤4.0s | >4.0s |
| INP (Interaction to Next Paint) | ≤200ms | ≤500ms | >500ms |
| CLS (Cumulative Layout Shift) | ≤0.1 | ≤0.25 | >0.25 |

## Diagnostic Decision Tree

```
What is slow?
├── First page load → Check: LCP, render-blocking resources, image sizes, server response time
├── Interaction response → Check: INP, long tasks (>50ms), heavy JS on main thread, large DOM updates
├── Navigation between pages → Check: code splitting, prefetching, caching
└── API/Backend → Check: query performance, N+1 patterns, missing indexes, payload size
```

## Common Bottlenecks

**Frontend:**

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| Slow LCP | Large images, render-blocking resources | Optimize images, defer non-critical CSS/JS |
| High CLS | Images without dimensions, late-loading content | Set width/height on images, reserve space for dynamic content |
| Poor INP | Heavy JS on main thread | Code-split, defer non-critical work, use web workers |
| Large bundle | Unoptimized imports, no code splitting | Dynamic import() for heavy features, tree-shake |

**Backend:**

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| Slow API responses | N+1 queries, missing indexes | Eager loading, add indexes, optimize queries |
| Memory growth | Leaked references, unbounded caches | Heap analysis, bounded LRU caches |
| High latency variance | Cold starts, connection pooling | Connection pooling, warm-up, caching |

## N+1 Query Prevention

```typescript
// BAD: N+1 — one query per task to fetch owner
const tasks = await db.tasks.findMany();
for (const task of tasks) {
  task.owner = await db.users.findUnique({ where: { id: task.ownerId } });
}

// GOOD: Eager loading — one query total
const tasks = await db.tasks.findMany({
  include: { owner: true },
});
```

## Bundle Size Budget

| Category | Budget |
|----------|--------|
| JavaScript (initial, gzipped) | <200KB |
| CSS (gzipped) | <50KB |
| Images (above fold, each) | <200KB |
| Fonts (total) | <100KB |
| API response time (p95) | <200ms |
| Time to Interactive (4G) | <3.5s |
| Lighthouse Performance score | ≥90 |

## Code Splitting

```typescript
// Route-level code splitting
const AdminPanel = lazy(() => import('./AdminPanel'));

function App() {
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route path="/admin" element={<AdminPanel />} />
      </Routes>
    </Suspense>
  );
}

// Feature-level splitting for heavy libraries
const exportToPDF = async (data: ReportData) => {
  const { generatePDF } = await import('./pdf-generator');
  return generatePDF(data);
};
```

## React Performance Pitfalls

```typescript
// BAD: New object/array on every render causes child re-renders
function TaskList() {
  return <List options={{ sort: 'date' }} items={tasks.filter(t => t.active)} />;
}

// GOOD: Stable references
const SORT_OPTIONS = { sort: 'date' } as const;
function TaskList() {
  const activeTasks = useMemo(() => tasks.filter(t => t.active), [tasks]);
  return <List options={SORT_OPTIONS} items={activeTasks} />;
}
```

Only use `React.memo` and `useMemo` where profiling shows a real re-render problem. Don't scatter them everywhere preemptively.

## Common Rationalizations

| Rationalization | Reality |
|---|---|
| "We'll optimize later" | Performance debt compounds. N+1 queries at 10 rows are invisible; at 10,000 they're a crisis. |
| "It's fast on my machine" | Your machine isn't representative. Test on target hardware and network conditions. |
| "Users won't notice 100ms" | Research shows 100ms impacts conversion rates. Users notice more than you think. |
| "Let me add React.memo everywhere" | Premature optimization obscures code. Profile first, optimize the actual bottleneck. |
| "We need to rewrite this for performance" | Most performance issues are fixed by targeted changes (indexes, eager loading, code splitting), not rewrites. |

## Red Flags

- Optimizing without profiling data
- N+1 query patterns in any data-fetching code
- List endpoints without pagination
- Images without dimensions, lazy loading, or responsive sizes
- Bundle size growing without review
- No performance monitoring in production
- `React.memo` and `useMemo` scattered everywhere without evidence of need
- Missing database indexes on frequently queried columns

## Verification

After optimizing:

- [ ] Baseline measurement taken before optimization
- [ ] Improvement measured and quantified (not just "feels faster")
- [ ] Core Web Vitals within "Good" thresholds (if applicable)
- [ ] No regressions in other metrics
- [ ] Bundle size within budget
- [ ] Tests still pass (optimization didn't change behavior)

## Performance Notes
<!-- Updated by /retro. Do not edit manually. -->
<!-- Format: - YYYY-MM-DD [project]: observation (evidence: source) -->
