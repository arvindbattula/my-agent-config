---
paths:
  - "**/*.{py,js,ts,go,rb,java}"
---

When a resumable batch retries an item that previously produced partial results, replace the old results only if the retry did at least as well. Never delete-then-append unconditionally: a retry that fails again (the common case — whatever broke the first attempt is often still broken) silently turns "partially read" into "lost", and a downstream writer then publishes the loss.

Concretely: compare per item before replacing. If the retry's output still carries an error marker, keep the old rows (still flagged, so the next resume retries again). Only swap when the retry is clean.

Write the regression test as: checkpoint holds one good row + one error row for an item → retry returns only an error → the good row must survive. Tests that only exercise "retry succeeds" will never catch this.
