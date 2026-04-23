Every test assertion should trace to a spec requirement, plan bullet, or stated behavioral contract — not to what the code happens to do.

If you can't point at a sentence that the test enforces, you might be pinning accidental behavior. A test written as "this is what the code does" becomes a regression gate *against* the correct behavior: when a later fix arrives, the locked-in test fails and the fix looks like the bug.

Negative assertions are the highest-risk class. `expect(x).not.toContain(y)` or `"does NOT handle Z"` often means "the code didn't do this yet" rather than "the code must not do this." Treat every negative assertion as a claim that needs a spec citation.

When writing a test, ask: "If the spec changed tomorrow to require the opposite, would this test be wrong, or would the code be wrong?" If the test would be wrong, cite the spec in the test name or a comment so the next reader knows it's load-bearing. If you can't answer, the test is probably pinning implementation detail — rewrite it or delete it.

Applies to unit tests, integration tests, snapshot tests, and "characterization tests" for legacy code alike. Characterization tests are fine as scaffolding but must be labeled — otherwise they calcify into defended bugs.
