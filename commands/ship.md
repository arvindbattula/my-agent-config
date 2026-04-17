---
name: ship
description: Pre-launch checklist and deployment verification
---

Pre-launch checklist. Run before deploying to production or sharing with users. This is the final gate in the discover → blueprint → construct → inspect → ship pipeline.

## Prerequisites

Read these files before starting:
- `docs/spec.md` — what we said we'd build (if exists)
- `docs/plan.md` — how we said we'd build it (if exists)
- `CLAUDE.md` — project context

## Process

### Step 1: Pre-launch audit

Run through each section. Check items that apply to this project — not every section applies to every project. Skip sections that are clearly irrelevant (e.g., Security for a local script with no user input).

**Code Quality:**
- [ ] All tests pass (`npm test` or equivalent)
- [ ] Build succeeds with no warnings (`npm run build`)
- [ ] Lint and type checking pass (`npm run lint`, `npx tsc --noEmit`)
- [ ] Code reviewed (via `/inspect` or manual review)
- [ ] No TODO/FIXME comments that should be resolved before shipping
- [ ] No console.log/print debugging left in production code
- [ ] Error handling covers expected failure modes

**Security** *(if user-facing or handles external input):*
- [ ] No secrets in code or version control
- [ ] `npm audit` shows no critical/high vulnerabilities reachable in production
- [ ] Input validation on all user-facing endpoints
- [ ] Authentication and authorization checks in place
- [ ] Rate limiting on auth endpoints
- [ ] Security headers configured (CSP, HSTS, etc.)
- [ ] CORS restricted to specific origins (not wildcard)

See `security` skill and `references/security-checklist.md` for details.

**Performance** *(if user-facing):*
- [ ] Core Web Vitals within "Good" thresholds (LCP ≤2.5s, INP ≤200ms, CLS ≤0.1)
- [ ] No N+1 queries in critical paths
- [ ] Bundle size within budget (<200KB gzip initial JS)
- [ ] List endpoints paginated
- [ ] Images optimized and lazy-loaded where appropriate

**Infrastructure:**
- [ ] Environment variables set in production
- [ ] Database migrations applied (or ready to apply)
- [ ] Logging and error reporting configured
- [ ] Health check endpoint exists and responds

**Documentation:**
- [ ] README updated with setup and run instructions
- [ ] CLAUDE.md current with build/test/dev commands
- [ ] Architecture decisions logged in `docs/decisions.md`

### Step 2: Rollback plan

Before deploying, document how to undo it:

```markdown
## Rollback Plan

**How to roll back:**
- Feature flag: [toggle X off]
- OR: git revert <commit> && deploy
- OR: redeploy previous version

**Database considerations:**
- Migration [X] has rollback: [command]
- OR: No database changes in this release

**Estimated time to rollback:** [< 1 min / < 5 min / < 15 min]
```

If the project uses feature flags, prefer flag-based rollback over redeployment.

### Step 3: Deploy and verify

After deploying:

1. Check health endpoint returns 200
2. Check error monitoring — no new error types
3. Check latency — no regression from baseline
4. Test the critical user flow manually
5. Monitor for 30 minutes minimum

**Roll back immediately if:**
- Error rate > 2x baseline
- P95 latency > 50% above baseline
- User-reported issues spike
- Data integrity issues detected

### Step 4: Report

Tell the user:
- What was checked and what passed
- Any items that need attention before or after deploy
- Rollback plan summary
- "Ship it" or "Address these items first: [list]"

## Common Rationalizations

| Rationalization | Reality |
|---|---|
| "It works in staging, it'll work in production" | Production has different data, traffic, and edge cases. Verify after deploy. |
| "We don't need a rollback plan for this" | Every deploy needs a rollback plan. The one time you don't have one is when you need it. |
| "Monitoring is overhead" | Not having monitoring means users discover problems first. |
| "We'll add monitoring later" | Add it before launch. Can't debug what you can't see. |
| "Rolling back is admitting failure" | Rolling back is responsible engineering. Shipping broken code is the failure. |

## Red Flags

- Deploying without a rollback plan
- No monitoring or error reporting in production
- Big-bang releases (everything at once, no staging)
- No one monitoring the deploy for the first hour
- Shipping on Friday afternoon
- "It's just a small change" without running the checklist

## Performance Notes
<!-- Updated by /retro. Do not edit manually. -->
<!-- Format: - YYYY-MM-DD [project]: observation (evidence: source) -->
