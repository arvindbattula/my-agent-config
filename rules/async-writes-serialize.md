When two async code paths write to the same shared state, you must serialize them explicitly. `await` inside a function does NOT make other callers wait — `void asyncFn(...)` in an event handler is fire-and-forget and runs concurrently. Two events 10ms apart can both sit on `await` at the same time, then interleave their writes.

Classic trigger: an async init task (cache warm, pre-embed, index build) runs in the background, while a runtime handler (hot-reload, user action) also writes to the same state. The init task's slow write lands AFTER the handler's fast write and silently clobbers it.

Fix: route both paths through a single-flight promise queue (not a mutex — queues are simpler under failure; tasks that reject get sunk so they don't poison subsequent tasks). Tests that drive the init task to completion before firing the handler will never catch this — use a controlled-pause mock to reproduce the race.
