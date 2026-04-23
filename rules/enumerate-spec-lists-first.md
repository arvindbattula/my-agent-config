When spec prose contains a slash-separated list of axes (`"contradictory recency/source/corroboration requirements"`, `"validates X/Y/Z"`) or conditional clauses (`"only if"`, `"unless"`, `"when"`, `"except for"`), split each item onto its own line before you start implementing or reviewing.

These are the highest-miss classes in both implementation and review. A reader's eye skims past the second and third items in a slash-list; conditional bullets get absorbed into the surrounding "always" pattern and lose their gate. Four inspection passes later, two of three axes can still be unimplemented.

For each enumerated item, write down:
- The implementation symbol that will handle it (function, branch, guard)
- The test fixture that will exercise it (even a stub name is enough)

If an item has no symbol yet, that's your first Fix-Now or next TDD target. If an item has no fixture, you will not know whether it works.

Do this on the first read of the spec, before writing code. Doing it at review time catches the misses but doesn't prevent them — the missing axis was cheap to implement on day one and becomes expensive after surrounding code has hardened around the implemented axes.

Applies equally to PRD bullets, API contracts, edge-case tables, and acceptance-criteria lists — anywhere requirements collapse multiple obligations into one sentence.
