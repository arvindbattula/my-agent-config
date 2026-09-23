When a feature, data source, or module in this project is replaced or removed, proactively prune every now-dead reference to it — not just the call sites.

Check three places:
1. **Code** — the old call sites (this is the part that's easy to remember).
2. **Docs describing current state** — `README.md`, `docs/table_schemas.md`, `docs/plan.md`, module docstrings. These should describe what's true *now*; a reference to a superseded source/module here is a bug in the documentation.
3. **On-disk artifacts** — data files (e.g. `_data/*.csv`) that only existed to feed the removed code path. If nothing reads it anymore, delete it.

`docs/decisions.md` is the one exception: it's a historical log, so old references SHOULD stay there as addenda explaining what was superseded and why — don't scrub it, just make sure it reads as history rather than current state.

**How to apply:** after finishing an implementation change, grep the repo for the old name/path before calling the task done. If a grep hit is in `docs/decisions.md`, leave it. If it's anywhere else, update or delete it. If an artifact on disk is now unread by any code path, delete it rather than leaving it as silent clutter.
