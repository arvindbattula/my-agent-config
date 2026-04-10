#!/bin/bash
# Session start hook: brief workflow reminder injected at session start.
# Kept intentionally short (<100 words) to minimize token cost.

cat <<'EOF'
Workflow: /idea-refine → /discover → /blueprint → /construct → /inspect → /ship → /retro
For non-trivial tasks, start with a plan (plan-build-verify skill).
Check docs/spec.md and docs/plan.md if they exist in this project.
EOF
