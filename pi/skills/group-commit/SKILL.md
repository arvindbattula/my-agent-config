---
name: "group-commit"
description: "Split the current working-tree changes into logical, atomic groups and stage them one at a time with a suggested commit message for each"
disable-model-invocation: true
---

Take everything currently changed/untracked in the repo and stage it as a sequence of small, logical, atomic commits — one group at a time — instead of one giant commit. For each group: stage it, show what's staged, propose a commit message. Then stop and wait for the user before moving to the next group. **Never run `git commit` yourself** — the user reviews and commits each group. This holds even if the user says "keep going" generally; committing is a separate decision from staging (see the `no-autocommit-in-auto-mode` rule in `AGENTS.md`).

## Step 1: Survey

```bash
git status --porcelain=v1
git diff --stat
git log --oneline -10
```

If there are no changes, say so and stop. Read the recent `git log` subjects to learn this repo's actual commit-message convention (some repos use `type: description`, some use plain imperative sentences, some are inconsistent) — match whatever the repo is actually doing, don't impose Conventional Commits on a repo that doesn't use it.

## Step 2: Understand the changes before grouping

Don't group by directory or file-extension. Group by **what the change does**. For every modified/untracked file, look at the actual diff (`git diff -- <file>` / read new files) — the file path alone is not enough to tell whether it belongs with feature A or feature B.

Look for:
- A backend feature and its own tests
- A frontend feature and its own tests
- Shared/contract files (e.g. a models/types file, a router registration, a lockfile) that support one specific feature — these belong with that feature's group, not in their own "misc" pile
- Docs/plan/decisions/learnings updates — usually their own group, unless they clearly document only one of the other groups
- Unrelated drive-by fixes — their own group, however small

**Watch for one file containing two unrelated changes.** A single file can have hunks belonging to two different logical groups (e.g. a shared models/types file that gained fields for two unrelated features in the same diff). Check this explicitly with `git diff -- <file>` and look at the `@@` hunk boundaries — don't assume a modified file belongs wholly to one group just because it appears once in `git status`.

## Step 3: Preview the grouping

Before touching the index, list the proposed groups to the user in one short message: group name + files in each, in the order you'll stage them. Grouping is a judgment call with more than one valid split — this preview is the checkpoint for the user to redirect before you start staging, not a request for permission on every subsequent step.

## Step 4: Stage and propose, one group at a time

For each group, in order:

1. **Stage whole files** with `git add <path> <path> ...` — always explicit paths, never `git add -A` / `git add .`.
2. **Split a mixed file** if Step 2 found one: build a patch containing only the hunk(s) for this group and apply it to the index directly, e.g.:
   ```bash
   cat > /tmp/<name>.patch << 'EOF'
   diff --git a/path b/path
   index <hash>..<hash> 100644
   --- a/path
   +++ b/path
   @@ -<old-start>,<old-count> +<new-start>,<new-count> @@ <context>
    <context line>
   +<added line>
    <context line>
   EOF
   git apply --cached /tmp/<name>.patch
   ```
   Copy the hunk header and lines verbatim from `git diff -- <path>` — don't hand-type line numbers from memory. Verify afterward with `git diff --cached -- <path>` (shows only this group's hunk staged) and `git diff -- <path>` (shows only the remaining group's hunk still unstaged).
3. **Verify the group is exactly right**: `git diff --cached --stat` for this group should list only the intended files, and nothing more/less.
4. **Check for secrets** in what's staged: `git diff --cached | grep -iE "password|secret|api_key|token"` — investigate before proceeding if anything hits.
5. **Report to the user**: the group name, the file list, and a suggested commit message in the style Step 1 identified. Keep the message focused on *why*, not a restatement of the diff.
6. **Stop.** Wait for the user's next message before staging the next group — they may commit, ask for a reword, or ask you to re-split the group first.

## Step 5: Wrap-up

Once every file from Step 1's survey is accounted for across the proposed groups (nothing left in `git status` unaccounted-for), say so explicitly. If the user asked for `next` past the last group, tell them this was the last one instead of silently doing nothing.
