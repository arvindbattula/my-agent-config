---
name: review-architecture
description: Find architectural improvements by deepening shallow modules
---

Explore this codebase to find opportunities for architectural improvement. Focus on making the codebase more testable by deepening shallow modules.

A **deep module** (John Ousterhout, "A Philosophy of Software Design") has a small interface hiding a large implementation. Deep modules are more testable, more navigable, and let you test at the boundary instead of inside.

## Process

### 1. Explore the codebase

Navigate the codebase organically and note where you experience friction:

- Where does understanding one concept require bouncing between many small files?
- Where are modules so shallow that the interface is nearly as complex as the implementation?
- Where have pure functions been extracted just for testability, but the real bugs hide in how they're called?
- Where do tightly-coupled modules create integration risk in the seams between them?
- Which parts of the codebase are untested, or hard to test?

The friction you encounter IS the signal.

### 2. Present candidates

Present a numbered list of deepening opportunities. For each candidate, show:

- **Cluster**: Which modules/concepts are involved
- **Why they're coupled**: Shared types, call patterns, co-ownership of a concept
- **Dependency category**: In-process, Local-substitutable, Ports & Adapters, or True external (Mock)
- **Test impact**: What existing tests would be replaced by boundary tests

Ask me which to explore further.

### 3. Design multiple interfaces

For the chosen candidate, spawn 3+ sub-agents in parallel with different design constraints:

- Agent 1: "Minimize the interface — aim for 1-3 entry points max"
- Agent 2: "Maximize flexibility — support many use cases and extension"
- Agent 3: "Optimize for the most common caller — make the default case trivial"

Each agent outputs: interface signature, usage example, what complexity it hides, dependency strategy, and trade-offs.

Present designs, compare them, and give your own recommendation. Be opinionated.

### 4. Dependency categories

When assessing candidates, classify dependencies:

- **In-process**: Pure computation, no I/O. Merge and test directly.
- **Local-substitutable**: Has local test stand-ins (e.g., PGLite for Postgres).
- **Ports & Adapters**: Own services across network boundary. Define a port, inject transport.
- **True external**: Third-party services. Mock at the boundary.

### 5. Testing strategy

Core principle: **replace, don't layer.**

- Old unit tests on shallow modules are waste once boundary tests exist — delete them
- Write new tests at the deepened module's interface boundary
- Tests assert on observable outcomes, not internal state
