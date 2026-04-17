#!/bin/bash
# Session start hook: brief workflow reminder injected at session start.
# Kept intentionally short (<100 words) to minimize token cost.

cat <<'EOF'
Workflow: /idea-refine → /discover → /blueprint → /construct → /inspect → /ship → /retro
For non-trivial tasks, start with a plan (plan-build-verify skill).
Check docs/spec.md, docs/plan.md, docs/state.md if they exist in this project.
Save preferences, library quirks, and surprises to memory as they surface — don't wait.
At session end, run /wrap-session to route learnings to the right place.
EOF
