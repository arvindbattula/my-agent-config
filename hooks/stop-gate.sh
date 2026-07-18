#!/usr/bin/env bash
# Stop hook: prevent premature completion while a quality gate has failed.
# Reads .hook-state/last_design_gate.json (written by design-antipattern-check.sh).
# Blocks (exit 2) only when the gate belongs to the CURRENT session and still
# lists failing files. A gate left over from a previous session is treated as
# stale and ignored (fail open) so a fresh session is never hard-blocked before
# it edits anything.
# Exit 0 = allow completion. Exit 2 = block.

set -uo pipefail

# Read hook payload from stdin
INPUT=$(cat)
CWD=$(echo "$INPUT" | jq -r '.cwd // .workspace.current_dir // empty' 2>/dev/null)
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // empty' 2>/dev/null)
STOP_ACTIVE=$(echo "$INPUT" | jq -r '.stop_hook_active // false' 2>/dev/null)

if [ -z "$CWD" ]; then
  CWD="$(pwd)"
fi

# Safety valve: if stop_hook_active is true, the agent already got one
# nudge and retried. Let it stop to avoid an infinite loop.
[ "$STOP_ACTIVE" = "true" ] && exit 0

GATE_FILE="$CWD/.hook-state/last_design_gate.json"

# No gate has run yet — allow completion
[ -f "$GATE_FILE" ] || exit 0

# Gate from a different session — stale, fail open
GATE_SID=$(jq -r '.session_id // ""' "$GATE_FILE" 2>/dev/null)
[ "$GATE_SID" = "$SESSION_ID" ] || exit 0

# Collect files that still have anti-patterns
FAILING=$(jq -r '.failing_files // {} | keys[]' "$GATE_FILE" 2>/dev/null)

# Nothing failing — allow completion
[ -z "$FAILING" ] && exit 0

echo "BLOCKED: Design quality gate failed. Fix the anti-patterns in these files before finishing:" >&2
while IFS= read -r f; do
  [ -n "$f" ] && echo "  - $f" >&2
done <<< "$FAILING"
exit 2
