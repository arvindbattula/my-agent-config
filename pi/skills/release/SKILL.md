---
name: release
description: "Cut a release — bump the committed version, update the changelog, run the fast gates, and commit (no tag). Run ONLY when the human explicitly says a merge should cut a release; ordinary PRs don't bump. After this, open the PR with /skill:open-pr. The version is committed source-of-truth so the git-source deploy reports the full version."
disable-model-invocation: true
---

# release

Cut a release for qcg-dsu-studio. This bumps the version and prepares a release
commit — it does **not** open a PR, tag, or deploy. Run it only when the human
says "this merge should cut a release" (or `/skill:release`). Most PRs are
ordinary work and must NOT bump the version.

## Why this exists (the model)

The deployed app is built **server-side by Databricks** (git-source), with no
`.git`. A version the *pipeline* computes (counting tags) can't reach that
build — that's why the app used to show `0.1` and not `0.1.4`. The fix: the
version is **committed source-of-truth**. The root `VERSION` file holds the
full semver; the build reads it directly; the deployed toolbar and `/health`
report the real version. Bumping it is a deliberate, human-gated act that goes
through a normal PR — never a pipeline computing a version at deploy time.

## Process — follow this order

1. **Confirm the human wants a release.** If they didn't explicitly ask, stop.
   Ask what version: patch (`0.1.3` → `0.1.4`) for fixes, minor (`0.1.3` →
   `0.2.0`) for features, per semver.

2. **Make sure the changelog has the changes.** `CHANGELOG.md` must have an
   `## [Unreleased]` section listing what this release contains. If it's empty
   or missing, draft the entries from the commits since the last tag
   (`git log --oneline v$(cat VERSION)..HEAD`), clean them with `/skill:unslop`,
   and add them under `## [Unreleased]` — then confirm with the human before
   going on. The release script refuses to run without this section.

3. **Run the release script from a clean tree** on the current branch:
   `./scripts/release.sh <x.y.z>`. It:
   - checks the tracked tree is clean and the changelog has `## [Unreleased]`,
   - runs the fast gates (ruff, mypy, pytest, web tests) and refuses if red,
   - bumps `VERSION` to the full semver, syncs `web/package.json`,
   - promotes `## [Unreleased]` to a dated `## [x.y.z]` section,
   - commits — **no tag** (tagging on a branch doesn't survive a squash-merge;
     the pipeline tags the merge commit on main instead).

4. **Hand off to open-pr.** Tell the human the release commit is ready and to
   run `/skill:open-pr` when they want the PR opened. The release goes through
   the normal PR flow — a human completes it in ADO, the merge fires the main
   pipeline, which reads the committed `VERSION` and tags `v<x.y.z>` on main.

5. **Report.** Version bumped from→to, gates result, and that the PR + merge +
   deploy are the human's next steps.

## Common mistakes

| Mistake | Reality |
|---|---|
| Bumping on every PR | Only release PRs bump. Ordinary work merges without a version change (the pipeline skips the existing tag). |
| Tagging on the branch | Squash-merge drops branch commits; the tag would point at a commit that never lands on main. The pipeline tags the merge commit. |
| Releasing with red gates | The script refuses. A version tag should mean the gates passed. |
| Pipeline computing the version | The whole point is the version is committed. The pipeline reads `VERSION`, never counts tags. |
