#!/usr/bin/env bash
# PreToolUse hook: BLOCK design anti-patterns before they hit disk.
# Matcher: Write|Edit. Exit 2 = block with feedback. Exit 0 = allow.
#
# Inspects .tool_input.content (Write) or .tool_input.new_string (Edit).
# Writes content to a temp file, then runs the shared check function.
# The existing PostToolUse check + Stop gate remain as a backstop.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/design-checks-lib.sh"

# Read hook payload from stdin
INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty' 2>/dev/null)

# Guard: need a file path
[ -z "$FILE_PATH" ] && exit 0

# Only check frontend files
case "$FILE_PATH" in
  *.tsx|*.jsx|*.css|*.html|*.vue|*.svelte) ;;
  *) exit 0 ;;
esac

# Extract content: Write uses .content, Edit uses .new_string
CONTENT=$(echo "$INPUT" | jq -r '.tool_input.content // .tool_input.new_string // empty' 2>/dev/null)

# Guard: need content to check
[ -z "$CONTENT" ] && exit 0

# Write to temp file and run shared checks
TMP=$(mktemp)
trap 'rm -f "$TMP"' EXIT
printf '%s' "$CONTENT" > "$TMP"

WARNINGS=$(check_design_patterns "$TMP")
if [[ -n "$WARNINGS" ]]; then
    echo "$WARNINGS" >&2
    echo "BLOCKED: Fix the design anti-patterns above before writing this file." >&2
    exit 2
fi

exit 0
