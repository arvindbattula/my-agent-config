---
name: post-merge
description: Local cleanup and verification after a PR is completed in ADO. Use when the human says they merged a PR, the pipeline ran, or asks "what now" after a merge. Handles the happy path (re-sync main, kill the lane's dev servers, delete the dead branch, prune, remove the worktree, drop its test databases) and the failure paths (build-validation failed, deploy failed, live regression).
---

# post-merge

Run this after the human completes a PR in ADO — and run it **in the main
worktree's pi session**, not the feature worktree's. The happy path does
`git checkout main` first and ends with `git worktree remove <feature-wt>`:
both assume you're standing in the main checkout. The feature worktree can't
remove itself. (The counterpart, `open-pr`, runs in the *feature* worktree.)

The merge fires the main
pipeline (CI → auto-version tag → git-source deploy). What you do locally
depends on whether that succeeded — so **check the outcome first**, then act.

The one discipline that governs all of it: **the feature branch's only job is
to get the PR merged.** The merge is a squash — the branch's individual commits
do NOT land on `main`, only the single squash commit does. The moment the PR
merges, the branch is dead weight. If anything fails *after* the merge, the fix
is always a **fresh branch off the updated `main`**, never a resurrection of
the old branch (its history is already collapsed and gone).

## Step 0 — find the outcome before touching anything

Don't assume. Check:

- **Did the PR merge?** `az repos pr show --id <N> --org https://dev.azure.com/quantumep`
  → `status: completed`.
- **Did the main pipeline succeed?** `az pipelines runs list --pipeline-ids 594
  --org https://dev.azure.com/quantumep --project "Well and Field DO"` → latest
  run `succeeded`, and its `buildNumber` is the release version.
- **Is the deploy live?** `GET /health` on `dsu-studio-test` → the new
  `version`, `db:"up"`. (Browser visual check is the human's step.)

Then pick the path below.

## Happy path — merged, pipeline green, deploy live

Run these **in order** (the order matters):

```bash
git checkout main && git pull origin main   # land the squash merge locally
git fetch origin --tags                     # pull the v<x.y.z> tag the pipeline pushed
git branch -D feat/<branch>                 # delete the dead feature branch
git fetch origin --prune                    # drop the stale remote-tracking ref
# human verifies in the browser, then (worktree lanes):
# kill the lane's dev servers (step 5), then:
git worktree remove <wt> --force
```

Why each step:

1. **Re-sync `main`.** The squash merge means you *pull* the squash commit; you
   never merge the feature branch yourself.
2. **Fetch the tags.** The pipeline pushed `v<x.y.z>` on the *remote*. Your
   local clone doesn't have it until `--tags` — reading the version from a
   stale local tag list is a real bug we've shipped (PR #23415).
3. **Delete the feature branch.** Squash-collapsed and merged. Use `-D`
   (force), not `-d`: git sees the branch as "unmerged" because its commits
   aren't ancestors of `main` — expected with squash merges, not a problem.
4. **Prune.** ADO auto-deletes the source branch on merge, so prune the local
   tracking ref.
5. **Kill the worktree's dev servers** — before removing the worktree, not
   after. A live server is what leaves the Vite husk in step 6, and
   `uvicorn --reload` spawns a worker that survives its parent dying: kill
   only the pane's foreground process and a zombie keeps the port with the
   old environment. Find every process tied to the worktree — the path shows
   in the child's command line (the venv / `node_modules/.bin` path) and in
   the parent's `/proc/<pid>/cwd`, so check both:
   ```bash
   WT=<worktree-dir>
   for pid in $(pgrep -f 'uvicorn|vite'); do
     { tr '\0' ' ' </proc/$pid/cmdline; readlink /proc/$pid/cwd; } 2>/dev/null \
       | grep -q "$WT" && echo "$pid  $(tr '\0' ' ' </proc/$pid/cmdline | cut -c1-100)"
   done
   ```
   Kill every PID it prints — parents and workers alike — except the probe
   itself: the loop's own shell matches (its cmdline contains the worktree
   path), so skip any PID whose cmdline contains `pgrep -f`. Done when
   re-running the loop prints only the probe and `ss -ltnp` shows their ports
   free.
6. **Remove the worktree** (if any) so the next ticket starts clean. First
   scan for **sole-copy data** — untracked or modified files that exist
   nowhere else on disk. `git worktree remove --force` discards them without
   asking, and twice the scan has caught real data (69 MB of shapefiles; the
   structure-grids analysis under `.scratch/`):
   ```bash
   git -C <wt> status --porcelain
   git -C <wt> ls-files --others --exclude-standard   # untracked, gitignored excluded
   ```
   Filter out regenerable noise (`.venv`, `node_modules`, `.vite`,
   `__pycache__`, the `.env` symlink, `.worktree-env`). For each remaining
   path, check for a second copy (`find ~ -name <basename> 2>/dev/null`, or
   against the main checkout's `.scratch/` for scratch files). Anything with
   no second copy is sole-copy data: **stop and ask the human** — keep, copy
   out, or discard is their call, never the agent's. Only then remove: never
   `rm -rf` a git worktree — `git worktree remove --force`; only `rm -rf` a
   non-git husk. Then **check the directory is actually gone**: if the dev
   server ran in that worktree, Vite's untracked `web/.vite/deps_temp_*/`
   cache survives `git worktree remove` and leaves a non-git husk (no `.git`).
   Verify it's only that (`find <dir> -mindepth 1 | grep -v '\.vite\|/web$'`
   should print nothing), then `rm -rf` the husk. If anything else is in
   there, stop and look before deleting. (Killing the servers in step 5 first
   means the husk usually doesn't form at all.)
7. **Drop the worktree's test databases.** `git worktree remove` does NOT
   clean these up. Every worktree's xdist run created a `dsu_test_<suffix>`
   family (the suffix is in the worktree's `.worktree-env`, one DB per worker
   as `dsu_test_<suffix>` + `dsu_test_<suffix>_gw<N>`). Read the suffix *before*
   removing the worktree (`cat <wt>/.worktree-env`), then drop the family from
   the `postgres` maintenance DB (autocommit — `DROP DATABASE` can't run in a
   transaction):
   ```bash
   source scripts/dev-env.sh   # for DATABASE_URL
   SUFFIX=<suffix> uv run --no-sync python - <<'PY'
   import os, re, sqlalchemy as sa
   sfx=os.environ["SUFFIX"]; dsn=os.environ["DATABASE_URL"]
   assert sfx, "refusing an empty suffix (would target the main dsu_test family)"
   base=re.sub(r'postgresql(\+\w+)?://','postgresql+psycopg://',dsn) if '+psycopg' not in dsn else dsn
   maint=re.sub(r'/[^/?]*(\?|$)',r'/postgres\1',base)
   eng=sa.create_engine(maint, isolation_level='AUTOCOMMIT')
   with eng.connect() as c:
       rows=[r[0] for r in c.execute(sa.text("SELECT datname FROM pg_database WHERE datname LIKE :p"),{"p":f"dsu_test_{sfx}%"})]
       rows=[n for n in rows if re.fullmatch(rf"dsu_test_{re.escape(sfx)}(_gw\d+)?",n)]
       for n in sorted(rows):
           c.execute(sa.text(f'DROP DATABASE IF EXISTS "{n}"')); print("dropped",n)
       print(f"{len(rows)} dropped")
   PY
   ```
   The `fullmatch` guards the drop to exactly `dsu_test_<suffix>` +
   `_gw<N>` — the main checkout's unsuffixed `dsu_test` family is never
   touched. Left alone these accumulate: this repo once had 177 across 11
   dead worktree families.

   **T2 topic branches: sweep the ticket-lane families too.** Each ticket
   branch off the topic (`feat/<topic>-<ticket>`) ran pytest with its own
   suffix — the topic suffix plus the ticket slug (`featprepreconciletab` +
   `07editinteraction`) — and those worktrees were removed ticket by ticket
   with nobody dropping their DBs. Dropping only the topic family leaves
   them all behind (one T2 topic left 136 orphan databases). After the
   topic-family drop, sweep for orphans — names starting with
   `dsu_test_<topicsuffix>` that belong to no live worktree:
   ```bash
   source scripts/dev-env.sh   # for DATABASE_URL
   SUFFIX=<suffix> uv run --no-sync python - <<'PY'
   import os, re, subprocess, sqlalchemy as sa
   sfx=os.environ["SUFFIX"]; dsn=os.environ["DATABASE_URL"]
   live={"dsu_test"}  # the main checkout's family is never touched
   for l in subprocess.run(["git","worktree","list","--porcelain"],capture_output=True,text=True).stdout.splitlines():
       if l.startswith("worktree "):
           p=os.path.join(l[9:].strip(),".worktree-env")
           m=re.search(r'DSU_TEST_DB_SUFFIX=(\w+)',open(p).read()) if os.path.exists(p) else None
           if m: live.add(f"dsu_test_{m.group(1)}")
   base=re.sub(r'postgresql(\+\w+)?://','postgresql+psycopg://',dsn) if '+psycopg' not in dsn else dsn
   maint=re.sub(r'/[^/?]*(\?|$)',r'/postgres\1',base)
   eng=sa.create_engine(maint, isolation_level='AUTOCOMMIT')
   with eng.connect() as c:
       rows=[r[0] for r in c.execute(sa.text("SELECT datname FROM pg_database WHERE datname LIKE :p"),{"p":f"dsu_test_{sfx}%"})]
       orphans=[n for n in rows if re.sub(r'_gw\d+$','',n) not in live]
       for n in sorted(orphans):
           c.execute(sa.text(f'DROP DATABASE IF EXISTS "{n}"')); print("dropped",n)
       print(f"{len(orphans)} dropped")
   PY
   ```
   The `live` set is the guard: any family whose suffix still belongs to a
   checked-out worktree survives — only merged, worktree-less ticket lanes
   get dropped. (Ticket-lane suffixes keep the topic suffix as a prefix
   even when `worktree-new.sh` truncates them to 40 chars, so the LIKE
   pattern still catches them.)

Also: update the `.scratch` ticket's `Status:` line.

## Failure paths

| Outcome | What it means | What you do |
|---|---|---|
| **PR build-validation failed** (before merge) | The merge result broke CI. The branch is alive, not merged. | **Delete nothing.** Stay on the branch, fix, push — the PR updates automatically. |
| **Merged, but the main-pipeline deploy failed** | Code is on `main`, the tag may exist, but the app didn't deploy. | Don't delete the branch yet (you may want its context). Diagnose the pipeline. If the fix needs new code, branch **fresh off the now-merged `main`** — don't resurrect the old branch. |
| **Deploy succeeded but the app misbehaves** (browser shows a bug) | Live regression. | Roll back first: `./scripts/rollback.sh v<prior-tag>`. Then branch off `main` to fix forward. The merged branch is already history — the fix is a new branch. |

The through-line: after a squash merge, the old branch is never the vehicle
for a fix. Roll back with `rollback.sh` if it's live-broken; fix forward on a
fresh branch either way.

## Common mistakes

| Mistake | Reality |
|---|---|
| `git branch -d` (lowercase) after a squash merge | Fails "not fully merged" — the branch's commits aren't on `main`. Use `-D`. |
| Resurrecting the merged branch to fix a post-merge bug | Its history is squash-collapsed and gone. Fresh branch off `main`. |
| Forgetting `git fetch origin --tags` | The pipeline's `v<x.y.z>` tag is remote-only until you fetch it. |
| `rm -rf` a worktree | `git worktree remove --force`. Only `rm -rf` a non-git husk. |
| `--force`-removing a worktree without scanning it | `--force` discards untracked files silently — sole-copy data has been caught this way twice. Scan in step 6; keep/copy/discard is the human's call. |
| Assuming the worktree dir is gone after `git worktree remove` | A running dev server leaves an untracked `web/.vite/deps_temp_*` husk. Check the dir; `rm -rf` only that. |
| Forgetting the test DBs | `git worktree remove` leaves the `dsu_test_<suffix>*` family behind. Drop it in step 7 (read the suffix from `.worktree-env` first). On a T2 topic branch, also sweep the merged ticket lanes' families — step 7's orphan sweep. |
| Forgetting the lane's dev servers | They survive worktree removal — a `--reload` worker outlives its parent, a `vite preview` orphans to PPID 1. Find them by the worktree path in cmdline or `/proc/<pid>/cwd` and kill in step 5, before the removal. |
| Deleting the branch while a failure is unresolved | Keep it until you know whether you need its context. |

## Performance Notes
<!-- Updated by /retro. Do not edit manually. -->
<!-- Format: - YYYY-MM-DD [project]: observation (evidence: source) -->
- 2026-10-08 [qcg-dsu-studio]: Happy-path order breaks at step 3: git refuses branch -D while the branch is checked out in its worktree. Kill the dev servers and remove the worktree FIRST, then branch -D (evidence: PR 23916 cleanup).
