#!/usr/bin/env bash
# PostToolUse hook: detect design anti-patterns in frontend files after Edit/Write.
# Outputs warnings that Claude sees inline. Also writes gate state to
# .hook-state/last_design_gate.json for the Stop hook to enforce.
# No installs required — grep only.

set -uo pipefail
trap 'exit 0' ERR

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

WARNINGS=""

# --- Font anti-patterns ---
if grep -qiE 'font-family[^;]*\bInter\b' "$FILE_PATH" 2>/dev/null; then
  WARNINGS+="⚠ DESIGN: Inter font detected — it's the most overused AI default. Pick a distinctive font for this project's brand.\n"
fi
if grep -qiE 'font-family[^;]*\bRoboto\b' "$FILE_PATH" 2>/dev/null; then
  WARNINGS+="⚠ DESIGN: Roboto font detected — generic AI default. Choose a font that reflects the brand personality.\n"
fi
if grep -qiE 'font-family[^;]*\bOpen Sans\b' "$FILE_PATH" 2>/dev/null; then
  WARNINGS+="⚠ DESIGN: Open Sans detected — invisible default. Choose a font with personality.\n"
fi

# --- Color anti-patterns ---
if grep -qE '#000000|#000[^0-9a-fA-F]|: *#000 *;|: *#000 *$' "$FILE_PATH" 2>/dev/null; then
  WARNINGS+="⚠ DESIGN: Pure black (#000) detected — use tinted neutrals instead. Pure black doesn't exist in nature.\n"
fi
if grep -qE '#ffffff|#fff[^0-9a-fA-F]|: *#fff *;|: *#fff *$' "$FILE_PATH" 2>/dev/null; then
  WARNINGS+="⚠ DESIGN: Pure white (#fff) detected — use tinted neutrals instead.\n"
fi
if grep -qiE 'hsl\(' "$FILE_PATH" 2>/dev/null; then
  WARNINGS+="⚠ DESIGN: HSL color detected — prefer OKLCH for perceptually uniform colors.\n"
fi

# --- Purple gradient (AI signature) ---
if grep -qiE 'linear-gradient.*purple|linear-gradient.*#[89a-f][0-9a-f][0-9a-f][0-9a-f]ff|linear-gradient.*violet|linear-gradient.*indigo' "$FILE_PATH" 2>/dev/null; then
  WARNINGS+="⚠ DESIGN: Purple/violet gradient detected — this is the #1 AI aesthetic tell. Use the project's actual brand colors.\n"
fi

# --- Side-stripe borders (BAN 1) ---
if grep -qE 'border-left: *[3-9]px|border-left: *[1-9][0-9]+px|border-right: *[3-9]px|border-right: *[1-9][0-9]+px' "$FILE_PATH" 2>/dev/null; then
  WARNINGS+="⚠ DESIGN: Side-stripe border (>1px) detected — this is a banned AI pattern. Use background tints, full borders, or no indicator instead.\n"
fi

# --- Gradient text (BAN 2) ---
if grep -qE 'background-clip: *text|-webkit-background-clip: *text' "$FILE_PATH" 2>/dev/null; then
  if grep -qE 'linear-gradient|radial-gradient|conic-gradient' "$FILE_PATH" 2>/dev/null; then
    WARNINGS+="⚠ DESIGN: Gradient text detected — this is a banned AI pattern. Use a solid color for text emphasis.\n"
  fi
fi

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

# Update this file's entry: set it when failing, remove it when clean
if [[ -n "$WARNINGS" ]]; then
  UPDATED=$(echo "$EXISTING" | jq -c --arg f "$FILE_PATH" --argjson w "$WARNINGS_JSON" '. + {($f): $w}' 2>/dev/null || echo "$EXISTING")
else
  UPDATED=$(echo "$EXISTING" | jq -c --arg f "$FILE_PATH" 'del(.[$f])' 2>/dev/null || echo "$EXISTING")
fi

jq -cn \
  --arg sid "$SESSION_ID" \
  --argjson failing "$UPDATED" \
  '{session_id:$sid, failing_files:$failing}' \
  > "$GATE_FILE" 2>/dev/null || true

exit 0
