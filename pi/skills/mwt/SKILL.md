---
name: mwt
description: "Merge-git worktree instructions"
disable-model-invocation: true
---

Merge the worktree for {{branch-name}} into main. Follow this exact order — do not improvise:

1. Verify the branch is done. In the worktree at ../qcg-dsu-studio-wt/<slug>, confirm git status is
clean and check what the branch adds with git log --oneline origin/main..<branch-name>. If there are
uncommitted changes, stop and tell me.

2. Merge in the main checkout, never in the worktree. cd to the main checkout
(/home/praveenqc/qcg-dsu-studio). A worktree cannot check out main — do not try. Run:
 - git fetch origin main
 - git merge --ff-only origin/main (if local main has diverged from origin, stop and tell me — do not
   reset or force anything without asking)
 - git merge <branch-name> --no-edit
 - git push origin main

3. Run the fast gates before pushing. npm --prefix web run test must pass. If it fails, fix or stop — do
not push broken code.

3b. Migrate the dev database if the merge brought migrations. Check whether the merge touched
src/dsu/platform/migrations/ (new versions, or an in-place rewrite pre-deploy). If the dev DB is
behind — uv run alembic current vs uv run alembic heads in the main checkout — run uv run alembic
upgrade head before restarting the api, or the first page load 500s on a stale schema. If the
branch's worktree session already migrated the shared dev DB, current == heads and this is a no-op
— verify, don't assume either way. Note: src/dsu/platform/migrations/migrate.py runs the same
upgrade at app startup in deployed environments; the hand-run dev tabs do not go through it.

4. Remove the worktree with git, not rm. Run git worktree remove ../qcg-dsu-studio-wt/<slug> --force
from the main checkout, then git push origin --delete <branch-name> and git branch -d <branch-name>.
Never rm -rf a worktree — it leaves stale metadata in .git/worktrees/.

5. Kill any servers the worktree spawned. Check ps aux | grep -E "uvicorn|vite" | grep -v grep for
processes whose path contains the worktree directory. Kill them by PID.

6. Restart the main servers in their herdr tabs (api w1:p3, web w1:p4). Restart cleanly, per
AGENTS.md "Dev servers": kill the port holder by PID, not just the pane's foreground process —
uvicorn's reload worker survives its parent and keeps serving the old code on the port. Find it
with ss -ltnp | grep -E ':8000|:5173', kill every PID on both ports, confirm the ports are free,
then relaunch with herdr pane run:
 - api: source scripts/dev-env.sh && uv run uvicorn dsu.app:app --reload --reload-dir src
   (dev-env.sh sources .env and mints a fresh WAREHOUSE_TOKEN — skipping it 401s/503s; the
   --reload-dir src matters: a bare --reload watches web/node_modules and .venv and holds the
   watcher at ~40% CPU idle)
 - web: npx vite --port 5173 --strictPort
   Verify with curl -s http://localhost:8000/health and curl -s -o /dev/null -w "%{http_code}"
   http://localhost:5173/ — expect {"status":"ok","db":"up"} and 200. For the api, also verify the
   fresh WAREHOUSE_TOKEN landed: read /proc/<worker-pid>/environ and check the JWT's exp is in the
   future; an empty or expired token means the Databricks CLI profile needs databricks auth login
   --profile $WAREHOUSE_PROFILE (interactive — ask the user) before warehouse-backed paths work.

7. Report the end state: new HEAD of main, test count, server health, and confirmation that the worktree
directory is gone.