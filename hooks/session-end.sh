#!/usr/bin/env bash
# SessionEnd hook: write a final audit record when the session ends.
# Appends one JSONL line to $cwd/reports/session-audit.log.
# Always exits 0 — never interfere with session teardown.

trap 'exit 0' ERR

# Read hook payload from stdin
INPUT=$(cat)
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // empty' 2>/dev/null)
TRANSCRIPT_PATH=$(echo "$INPUT" | jq -r '.transcript_path // empty' 2>/dev/null)
REASON=$(echo "$INPUT" | jq -r '.reason // "unknown"' 2>/dev/null)
CWD=$(echo "$INPUT" | jq -r '.cwd // .workspace.current_dir // empty' 2>/dev/null)

if [ -z "$CWD" ]; then
  CWD="$(pwd)"
fi

# Create reports directory if it doesn't exist
REPORTS_DIR="$CWD/reports"
mkdir -p "$REPORTS_DIR" 2>/dev/null || exit 0

# Build JSONL record
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || echo "unknown")

# Write audit line (use jq to ensure valid JSON)
jq -cn \
  --arg ts "$TIMESTAMP" \
  --arg event "SessionEnd" \
  --arg sid "$SESSION_ID" \
  --arg reason "$REASON" \
  --arg transcript "$TRANSCRIPT_PATH" \
  --arg cwd "$CWD" \
  '{timestamp:$ts, event:$event, session_id:$sid, reason:$reason, transcript_path:$transcript, cwd:$cwd}' \
  >> "$REPORTS_DIR/session-audit.log" 2>/dev/null

exit 0
