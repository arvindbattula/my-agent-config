---
name: open-pr
description: "Open a pull request for a finished branch — but ONLY when the human explicitly triggers it. Develops locally first (worktree, dev servers, gates, back-and-forth); the agent never opens a PR unprompted. Cleans the description with unslop so it reads like a person wrote it. The human completes the PR in ADO."
disable-model-invocation: true
---

# open-pr

Open a PR to `main` for the current (or named) branch. This is the **only** way
a branch becomes a PR in this workflow — the agent does not open PRs as a side
effect of finishing work, and it never merges or completes its own PRs.

The org standard (qcg-dsu-studio AGENTS.md "Git workflow"): trunk-based, `main`
receives merges only through a PR. The agent authors; the human reviews and
completes in ADO. Completing the PR fires the main pipeline (CI → auto-version
tag → git-source deploy to `dsu-studio-test`).

## When this runs

Only on an explicit human trigger (`/skill:open-pr`, or "open the PR"). If you
finish implementing a ticket and the human hasn't asked for a PR, **stop and
report** — do not open one. Local iteration (dev servers, visual check, gates)
happens before this skill is invoked.

## Inputs

- `{{branch}}` (optional) — the branch to PR. Default: the current branch. In a
  worktree, run from that worktree's directory.

## Process — follow this order, do not improvise

1. **Confirm the branch and that it's not `main`.** `git branch --show-current`.
   If it's `main`, stop — there's nothing to PR.

2. **Confirm the tree is clean.** `git status --short`. Uncommitted changes →
   stop and tell the human; don't PR a dirty branch.

3. **Confirm the branch is rebased on current `main`.** `git fetch origin main`
   then `git log --oneline HEAD..origin/main`. If `main` has commits the branch
   lacks, tell the human and offer to rebase (`git rebase origin/main`) — don't
   silently rebase, and don't open a PR on a stale base (the PR's build
   validation would test against an old main).

4. **Run the gates from the branch** so the PR carries proof and you catch
   breakage before opening it. In a worktree, `source .worktree-env` first:
   - Always: `npm --prefix web run test`
   - If the branch touched `src/` or `tests/`: `./scripts/gates.sh pytest`
   - If anything fails: fix or stop. Do not open a PR for broken code.

5. **If the branch changes the app, ask about a version bump.** Check what the
   branch touched: `git diff --name-only origin/main...HEAD`. If it includes
   `src/` or `web/` (the deployed app changes), **stop and ask the human**:
   does this PR bump `VERSION` (and `web/package.json`)? The release model is
   human-triggered — ordinary merges don't auto-release — so an app-changing
   merge that skips the bump ships under a stale version. Docs/chore/pipeline
   branches (no `src/`/`web/`) don't bump; skip this step for them. If the
   human says bump, do it on the branch before pushing (a patch bump via the
   `release` skill if it's a real release, or a hand bump for a fix), commit,
   and include it in the PR.

6. **Push the branch.** `git push -u origin {{branch}}`. The branch must exist
   on origin for the PR.

7. **Draft the description, then invoke `/skill:unslop` on it.** Write for the
   reviewer, not for yourself — they haven't been following the ticket, so the
   diff alone won't tell them the story.

   The `pr` skill (PR-body template) will likely auto-load here. Its Summary /
   Evidence / Merge Danger structure does NOT replace this step's structure —
   the What → Why → How → Testing order below is the contract. Borrow two
   things from `pr` when the change warrants it: a **visual** (pseudocode, call
   tree, file tree, or diff sketch) inside What changed when prose alone won't
   show the shape, and a one-line **Merge Danger** call (one-way or two-way
   door, blast radius) at the end of How for risky merges. Small fixes need
   neither.

   Structure it to answer three questions, in this order:
   - **What changed** — the primary change in the first sentence, scoped to
     its size (a two-line fix gets one sentence; a multi-module change gets a
     short paragraph or a brief bullet list). Lead with an active verb.
   - **Why** — the problem it solves and why this approach over the
     alternative you weighed. One or two sentences.
   - **How** — the implementation details the diff won't show: structure
     choices, schema changes and migration sequencing, a dependency you added,
     or any code path that departs from the codebase's usual pattern. Flag the
     unconventional bit explicitly and say why — one sentence up front beats a
     long comment thread.
   The order is the contract — What, Why, How — and it holds for fixes too.
   Known limitations and tradeoffs ride at the end of **What changed** as a
   flagged note ("Known limitation: …"): that is the top. Never a paragraph
   of their own between sections, never the bottom.
   Then a **Testing** section with real specifics, not "tested locally":
   which tests were added/updated and what behavior they cover, the gates
   evidence (vitest/pytest counts), and any manual check with its environment.
   Before invoking unslop, check the draft's order: What → Why → How →
   Testing.

   **Keep it short.** Aim for 100–200 words; a small fix can be under 50. If a
   section needs more, cut detail, don't grow the prose. The reviewer wants the
   gist and the proof, fast. Prefer one or two short sentences per section over
   a paragraph.

   **No em dashes.** This is a hard rule here, not a soft one: don't use `—`
   anywhere in the title or description. End the sentence and start a new one,
   or use a comma. (See the em-dash note in `unslop`.)

   Then **actually invoke the `unslop` skill** — don't just eyeball the draft
   — so it reads like a person wrote it: no AI tells, varied rhythm, plain
   words. The description is publishable prose; it goes in front of a reviewer.

   **No bare PR or issue numbers in the description.** Azure DevOps auto-links
   `#<number>` to a work item (and a PR reference like `PR #23415` resolves
   too), which adds an unintended link/backreference on that artifact. Refer
   to prior work by name or by the `.scratch` ticket slug instead — "the
   committed-version switch", "ticket dev-deploy-infra/03" — never `#123`
   or `PR #123`. If a number is genuinely needed, write it so ADO won't parse
   it (e.g. "PR 23415", no `#`).

8. **Open the PR** with `az repos pr create` against the `dsu-studio` repo in
   project `Well and Field DO`:
   - `--source-branch {{branch}} --target-branch main`
   - Title: the branch's subject (top commit message). No `#` numbers in the
     title either — ADO links those too.
   - Description: the unslop'd text from step 6.
   - Do NOT set auto-complete. Do NOT add reviewers programmatically.
   Print the PR URL and number.

9. **Hand off.** Tell the human: the PR is open, CI (build validation) runs
   automatically, and **they complete it in ADO** — that merge fires the deploy.
   Do not complete the PR yourself.

10. **Leave the branch and worktree in place** until the human merges. Once
   they do, the **`post-merge`** skill owns the cleanup — re-sync `main`,
   fetch the tag, delete the dead branch, prune, remove the worktree, and the
   failure paths. Never `rm -rf` a worktree — use `git worktree remove
   --force`, and only `rm -rf` a non-git husk.

## Report

End with: PR URL/number, gates counts, the rebase status (up to date / rebased
onto `main`), and a one-line reminder that completion + deploy are the human's
step in ADO — and that post-merge cleanup is `/skill:post-merge` once they've
merged.

## Common mistakes

| Mistake | Reality |
|---|---|
| Opening a PR when the ticket's "done" | The human decides when it's PR-ready. Finish → report → wait for the trigger. |
| PR on a stale base | Fetch `main`; if it moved, rebase first or the build validation tests old code. |
| Skipping gates "because CI will catch it" | The PR description should carry local proof; CI is the backstop, not the first line. |
| App-changing PR with no version bump | If the branch touches `src/`/`web/`, ask before pushing. A merge that skips the bump ships under a stale version. |
| Raw AI description | Invoke `/skill:unslop` on it. The reviewer reads this; it should sound like you. |
| Em dashes in the description or title | Hard rule: no `—`. End the sentence or use a comma. |
| Description too long | 100–200 words, small fixes under 50. Cut detail, don't grow prose. |
| `#123` / `PR #123` in the description or title | ADO auto-links it to that work item/PR. Name the work or use the `.scratch` ticket slug instead. |
| Completing your own PR | The human completes. That's the review gate. |
| Cleaning up right after opening | The branch stays until the human merges; cleanup is `/skill:post-merge`. |
