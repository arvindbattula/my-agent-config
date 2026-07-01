---
name: production-gate
description: Go/no-go gate to promote a vibe-coded prototype into a managed IT environment
---

Go/no-go gate for taking a prototype from "works in a demo" to "runs in our managed IT environment." Runs *after* `/ship` in the discover → blueprint → construct → inspect → ship → production-gate pipeline. Walk it with the project owner. An item is not done until its named owner signs off.

This is an expectation-alignment and risk-transfer instrument as much as an engineering checklist. Its job: reset the "AI will do it all" assumption, locate the timeline in the `[None]`/`[Partial]` items (not the code), and force named human accountability.

## Prerequisites

Read these before starting:
- `docs/spec.md` — what we said we'd build (if exists)
- `docs/decisions.md` — architecture/product decisions (if exists)
- `CLAUDE.md` — project context

The code-level checks below overlap existing tooling — reuse it: `/inspect` (5-pass review incl. OWASP), the `security` skill (OWASP Top 10, secrets, headers, `npm audit`), and `/ship` (rollback triggers, health checks, monitoring). Don't re-derive what those already produce.

## How to read the "Claude" tag

- **[High]** — Claude does most of the work; a person reviews and approves.
- **[Partial]** — Claude helps, but it needs our access, our data, or our standards as input, and a human owns the result.
- **[None]** — requires human authority, infra access, a sign-off, or an organizational decision. Claude cannot do this.

The count of `[None]` and `[Partial]` items is the real timeline driver, not the code.

## Gate markers

- **B** — hard blocker for go-live.
- **W** — launch-with-plan (waivable).
- **B\*** — blocker only if Section 0 triggers it (conditional).

## Process

### Step 0: Applicability triage — do this first

Answer four questions with the App Owner + Eng Lead. Any "yes" turns the matching heavy sections on in full; all "no" = lightweight path. This is a human scoping call. **Owner: App Owner + Eng Lead · [None]**

- [ ] Real users beyond the builder?
- [ ] Regulated / PII / cross-border / confidential data involved?
- [ ] Does it make or influence decisions, money, or automated actions?
- [ ] Any public / internet network exposure?

### Step 1: Walk the sections

Check each item with its named owner. Skip sections Step 0 ruled out. Record waivers explicitly (see Step 2).

**1. Code Quality & Maintainability**
- [ ] Reviewed by someone other than the author; readable/maintainable confirmed. **Eng Lead · [High] · B**
- [ ] Refactored for separation of concerns, no hardcoded values, proper error handling. **Eng · [High] · B**
- [ ] Dependency audit: current, supported, no known CVEs; versions pinned/locked. **Eng · [High] · B**
- [ ] Automated tests (unit, integration, regression) at an agreed coverage target. **Eng · [High] · B**
- [ ] In source control with branching + mandatory code review. **Eng Lead · [Partial] · B**
- [ ] No leftover debug output, stray TODO/FIXME, or dead code. **Eng · [High] · W**

**2. AI-Provenance & Code Trust** *(the vibe-code section)*
- [ ] Every dependency verified to exist and be the intended package — no hallucinated/typosquatted libs. **Eng · [High] · B**
- [ ] License/IP scan: no incompatible (e.g. copyleft) or proprietary code pulled in by the model. **Eng + Legal · [Partial] · B**
- [ ] A named engineer can explain the architecture and data flow unaided — no "understanding debt." **Eng Lead · [Partial] · B**
- [ ] No phantom features: every demoed capability is actually wired and works on real input. **Eng + App Owner · [High] · B**

**3. Functional & Business Validation**
- [ ] Acceptance-tested against real requirements with real users (UAT), not just the demo path. **App Owner · [Partial] · B**
- [ ] Edge cases and error/failure paths validated, not only the golden path. **Eng + App Owner · [High] · B**
- [ ] Output correctness confirmed on real data samples — results are *right*, not just present. **App Owner · [Partial] · B**

**4. Security**
- [ ] Auth via enterprise SSO / IdP (no local logins). **IT Security · [Partial] · B**
- [ ] RBAC: roles defined and enforced, least privilege. **App Owner + IT Security · [Partial] · B**
- [ ] Secrets removed from code — code reads from a vault. **Eng · [High] · B**
- [ ] Secrets vault provisioned and secrets loaded. **IT Security · [None] · B**
- [ ] Encryption in transit configured (TLS). **Eng · [High] · B**
- [ ] Encryption at rest verified end-to-end. **IT Security · [None] · B**
- [ ] OWASP Top 10 code review — first pass, not the sign-off. **Eng · [High] · B**
- [ ] Input validation / output encoding on all boundaries. **Eng · [High] · B**
- [ ] Audit logging: sensitive reads/writes traceable. **Eng + Compliance · [High] · B**
- [ ] If an LLM is in the loop: prompt-injection, unsafe-output-handling, data-exfiltration, and runaway-cost/abuse mitigations in place. **Eng + IT Security · [High] · B\***
- [ ] Independent security review or penetration test signed off. **IT Security · [None] · B**

**5. Data, Privacy & Compliance**
- [ ] Data classified (sensitivity, PII, regulated) and storage region confirmed. **Compliance + IT · [Partial] · B**
- [ ] Regulatory review where applicable (GDPR, works council/labor, etc.). **Legal · [None] · B\***
- [ ] DPIA completed if PII is processed. **Legal · [Partial] · B\***
- [ ] Retention, deletion, and legal-hold policies implemented. **Legal + Eng · [Partial] · B**
- [ ] Data migration/seeding plan: quality checks + reconciliation from the source. **Data Owner + Eng · [Partial] · B**
- [ ] If it scores/ranks/decides: bias, fairness, explainability assessed; legal exposure reviewed. **Legal + App Owner · [Partial] · B\***
- [ ] Access to real production data approved and provisioned. **Data Owner + IT Security · [None] · B**

**6. Architecture & Environment Fit**
- [ ] Stack reviewed vs the reference architecture; deviations approved or remediated. **Architecture · [Partial] · B**
- [ ] Network placement defined: private networking, no unintended public exposure. **IT/Cloud · [None] · B**
- [ ] Integration points scoped (identity, source systems, data lake…), each as its own work item. **Eng + Architecture · [Partial] · B**
- [ ] Stateless/scalable confirmed by a load/concurrency test at expected volume — not just asserted. **Eng · [Partial] · B**
- [ ] Backups + DR defined; RTO/RPO targets set. **IT/Cloud · [Partial] · B**
- [ ] DR restore actually tested. **IT/Cloud · [None] · B**

**7. UX & Accessibility**
- [ ] Accessibility (WCAG) and responsive design verified — automated + manual with assistive tech. **Design/Eng · [Partial] · B\* (external/regulated) / W (internal)**
- [ ] Consistent with other internal tools; brand reskin. **Design/Eng · [High] · W** *(backlog, not a gate)*

**8. Deployment & Operations**
- [ ] CI/CD pipeline with dev/test/prod (no "runs on one machine"). **Eng/DevOps · [Partial] · B**
- [ ] Monitoring, alerting, and centralized logging in place. **IT/Ops · [Partial] · B**
- [ ] SLOs / success metrics / error budget agreed and dashboarded. **IT/Ops + App Owner · [Partial] · B**
- [ ] Rollback plan: documented undo path, migration rollback, auto-rollback triggers. **Eng/DevOps · [Partial] · B**
- [ ] Named support owner + on-call + runbook. **IT/Ops · [None] · B**
- [ ] Patching cadence and SLA expectations agreed. **IT/Ops · [None] · B**
- [ ] Documentation & knowledge transfer: architecture, admin, user docs, ADRs handed over. **Eng + IT/Ops · [High] · B**

**9. Governance, Cost & Ownership**
- [ ] Production sign-offs from Legal, Compliance, IT Security. **each function · [None] · B**
- [ ] Change management, user training, and rollout plan complete. **App Owner + IT · [Partial] · B**
- [ ] If an LLM is in the workflow: fits AI governance + recording/transcription policy. **Compliance + IT · [Partial] · B\***
- [ ] Cost model approved: API usage, hosting, launch. **Finance + IT · [None] · B**
- [ ] Long-term ownership + year-2 TCO/maintenance funded and named. **Finance + App Owner · [None] · B**
- [ ] Decommission / exit plan: retire the prototype instance; vendor/API exit path. **App Owner + IT · [None] · W**

### Step 2: Record waivers

A `W` item, or a `B` item a function chooses to accept risk on, ships only with a **named risk-acceptor and a remediation-by date** recorded. No silent skips — an unwaived, unmet `B` is a hard no-go.

```markdown
## Waivers
- [item] — accepted by [name, function] on [date]; remediate by [date]; reason: [...]
```

### Step 3: Go / No-Go sign-off

Production approval requires a signature from each function that owns an item. No single individual, and no AI tool, clears this gate alone.

| Function | Owner | Signed? | Date |
|---|---|---|---|
| Engineering | | ☐ | |
| IT Security | | ☐ | |
| Architecture / Cloud | | ☐ | |
| DevOps / Platform | | ☐ | |
| Data Owner | | ☐ | |
| Legal | | ☐ | |
| Compliance | | ☐ | |
| App / Business Owner | | ☐ | |
| Finance | | ☐ | |

### Step 4: Report

Tell the user:
- Which sections applied (per Step 0) and which were skipped.
- Every unmet `B`, grouped by owner — these block go-live.
- Every waiver recorded, with risk-acceptor and remediation date.
- The `[None]`/`[Partial]` long poles and their lead times.
- "Go" or "No-go — clear these first: [list]".

## The timeline reality

Start every `[None]` and `[Partial]` track on day 1, in **parallel** — security review scheduling, real-data approval, and legal/regulatory queues have calendar lead times that code work cannot compress. Treat the prototype as a validated spec, not a near-final product. A "few weeks" outcome is only realistic if scope is small, no regulated/cross-border data is involved, and the code is reusable. Otherwise plan for months and let this checklist pull it shorter as items clear.

## Common Rationalizations

| Rationalization | Reality |
|---|---|
| "Claude can do all of this" | Claude clears the `[High]` items fast. The `[None]`/`[Partial]` items are access, infra, and sign-offs no model produces. |
| "It works in the demo, it's basically done" | Demo = golden path on demo data. Managed environments break on real data, real users, and edge cases. |
| "We understand the code well enough" | If no named engineer can explain it unaided, IT is inheriting code no human owns. That's a blocker, not a nit. |
| "The dependencies are fine, it ran" | Vibe-coded trees carry hallucinated/typosquatted packages and license contamination. Verify provenance. |
| "We'll get sign-offs at the end" | Sign-offs have queue times. Start them first, or they become the schedule. |
| "Skip the waiver, we'll fix it later" | An unwaived, unmet blocker with no owner and no date never gets fixed. Record it. |

## Red Flags

- Walking the gate without a named owner per item.
- Real production data before an approval exists for it.
- LLM in the loop with no prompt-injection or cost-abuse mitigation.
- "Understanding debt" — the app ships and no human can explain it.
- Unpinned or unverified dependencies from the prototype carried straight to prod.
- Treating brand reskin as a blocker while DR restore was never tested.
- Any unwaived `B` marked done without evidence.

## Performance Notes
<!-- Updated by /retro. Do not edit manually. -->
<!-- Format: - YYYY-MM-DD [project]: observation (evidence: source) -->
