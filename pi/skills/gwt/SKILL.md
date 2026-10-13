---
name: gwt
description: "Kickoff-git worktree instructions"
disable-model-invocation: true
---

You are in a git worktree of the dsu-studio repo. Before running any pytest, run source .worktree-env
in every shell you use — it sets DSU_TEST_DB_SUFFIX so your tests use this worktree's own database.
Work on the checked-out branch. The land pipeline no longer lives in this repo (ticket 32)
— it is an independent Databricks job in the sibling qcg-dsu-land-pipeline repository; this
repo reads its output tables through dsu.landread. The dev database is one schema per
environment with plain table names (ADR-0146/0147) — there are no work./core. schemas anymore.

Run tests through ./scripts/gates.sh — its pytest gate is xdist -n auto with a database per
worker; bare full-suite pytest is serial and is never the right command. Single-file or
single-test runs while iterating are fine directly (uv run pytest tests/path/test_x.py -x).
See AGENTS.md "Running tests" for the two verification tiers.
