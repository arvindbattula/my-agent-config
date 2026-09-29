---
paths:
  - "**/*.{py,js,ts,go,rb,java}"
---

Any persisted "in progress" marker — a job row with `status='running'`, a lock file, a queue claim, a `processing` flag — needs a recovery path for when the process that set it dies. Without one, a single crash (or a dev-server `--reload` mid-job) locks that item out permanently: every future request sees "already running" and declines to start a new one, while the UI polls forever.

Pick the simplest recovery that fits:
- Single-process app: at startup, reset every in-progress row to a terminal error state ("interrupted by restart — try again").
- Multi-process / distributed: store a started-at timestamp or heartbeat and treat markers older than a lease window as reclaimable.

Test it by writing the marker, simulating a restart (new store/app instance, no background task running), and asserting a new request can start the job.
