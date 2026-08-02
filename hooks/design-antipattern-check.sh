#!/usr/bin/env bash
# PostToolUse hook: detect design anti-patterns in frontend files after Edit/Write.
# Outputs warnings that Claude sees inline. Also writes gate state to
# .hook-state/last_design_gate.json for the Stop hook to enforce.
# Sources the shared design-checks-lib.sh for pattern definitions.

set -uo pipefail
trap 'exit 0' ERR

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/design-checks-lib.sh"

# Read hook payload from stdin
INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty' 2>/dev/null)
CWD=$(echo "$INPUT" | jq -r '.cwd // .workspace.current_dir // empty' 2>/dev/null)
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // empty' 2>/dev/null)

# Guard: need a file path
[ -z "$FILE_PATH" ] && exit 0

if [ -z "$CWD" ]; then
  CWD="$(pwd)"
fi

# Only check frontend files
case "$FILE_PATH" in
  *.tsx|*.jsx|*.css|*.html|*.vue|*.svelte) ;;
  *) exit 0 ;;
esac

# Skip if file doesn't exist (deleted)
[[ -f "$FILE_PATH" ]] || exit 0

# --- Run shared pattern checks ---
WARNINGS=$(check_design_patterns "$FILE_PATH")

# --- Output warnings ---
if [[ -n "$WARNINGS" ]]; then
  echo -e "$WARNINGS"
fi

# --- Write gate state for Stop hook ---
# Write .hook-state/last_design_gate.json so stop-gate.sh can block completion
# while any frontend file still has anti-patterns. The gate is scoped to the
# current session_id: a stale gate from a previous session is dropped rather
# than carried over (prevents cross-session hard-blocks). failing_files tracks
# each file independently so fixing one file doesn't mask another still-failing
# file (avoids the last-file-wins gap).
STATE_DIR="$CWD/.hook-state"
mkdir -p "$STATE_DIR" 2>/dev/null || exit 0
GATE_FILE="$STATE_DIR/last_design_gate.json"

# Load existing failing_files only if the gate belongs to this session
EXISTING="{}"
if [[ -f "$GATE_FILE" ]]; then
  PREV_SID=$(jq -r '.session_id // ""' "$GATE_FILE" 2>/dev/null)
  if [[ "$PREV_SID" == "$SESSION_ID" ]]; then
    EXISTING=$(jq -c '.failing_files // {}' "$GATE_FILE" 2>/dev/null || echo "{}")
  fi
fi

# Collect warnings into a JSON array (grep may exit 1 when no lines match — that's OK)
WARNINGS_JSON=$(echo -e "$WARNINGS" | { grep -v '^$' || true; } | jq -R '.' 2>/dev/null | jq -s '.' 2>/dev/null || echo '[]')

# Update this file's entry: set it when failing, remove it when clean.
# MSYS_NO_PATHCONV (Git for Windows) / MSYS2_ARG_CONV_EXCL (MSYS2) suppress
# Git Bash's argv path conversion, which otherwise rewrites POSIX-style
# substrings in $FILE_PATH (e.g. /tmp/x -> C:/Users/.../Temp/x) before native
# jq.exe sees them, storing mangled keys in the gate file. Both vars are
# inert on macOS/Linux.
if [[ -n "$WARNINGS" ]]; then
  UPDATED=$(echo "$EXISTING" | MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*' jq -c --arg f "$FILE_PATH" --argjson w "$WARNINGS_JSON" '. + {($f): $w}' 2>/dev/null || echo "$EXISTING")
else
  UPDATED=$(echo "$EXISTING" | MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*' jq -c --arg f "$FILE_PATH" 'del(.[$f])' 2>/dev/null || echo "$EXISTING")
fi

MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*' jq -cn \
  --arg sid "$SESSION_ID" \
  --argjson failing "$UPDATED" \
  '{session_id:$sid, failing_files:$failing}' \
  > "$GATE_FILE" 2>/dev/null || true

exit 0
