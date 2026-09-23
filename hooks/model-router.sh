#!/usr/bin/env bash
# UserPromptSubmit hook: warn-only model-tier recommendation via TypeSafe's
# Jev classifier (https://docs.typesafe.ai). Classifies only the first prompt
# of each session (state file gate) and sends a redacted copy of the prompt —
# see model-router-lib.sh — since there is no confirmed ZDR/DPA with TypeSafe.
# Never blocks or rewrites the prompt: this only adds additionalContext for
# Claude to optionally relay to the user.
#
# Requires: jq, curl, TYPESAFE_API_KEY env var. Any of these missing, or any
# error along the way (network, malformed response), fails open — the hook
# exits 0 with no output and the prompt proceeds untouched.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/model-router-lib.sh"

# Drain stdin unconditionally before any early exit: a caller writing a large
# prompt can block or see a broken pipe if we exit while its write is still
# in flight.
INPUT=$(cat)

command -v jq >/dev/null 2>&1 || exit 0
command -v curl >/dev/null 2>&1 || exit 0
[ -n "${TYPESAFE_API_KEY:-}" ] || exit 0

printf '%s' "$INPUT" | jq empty >/dev/null 2>&1 || exit 0

PROMPT=$(printf '%s' "$INPUT" | jq -r '.prompt // empty' 2>/dev/null)
SESSION_ID=$(printf '%s' "$INPUT" | jq -r '.session_id // empty' 2>/dev/null)
[ -z "$PROMPT" ] && exit 0
[ -z "$SESSION_ID" ] && exit 0

# Once per session: skip every prompt after the first.
STATE_DIR="${TMPDIR:-/tmp}/claude-model-router"
mkdir -p "$STATE_DIR" 2>/dev/null || exit 0
STATE_FILE="$STATE_DIR/$SESSION_ID.done"
[ -e "$STATE_FILE" ] && exit 0
touch "$STATE_FILE" 2>/dev/null

SANITIZED="$(sanitize_prompt "$PROMPT")"
[ -z "$SANITIZED" ] && exit 0

REQUEST_BODY=$(jq -n --arg state "$SANITIZED" '{
  state: $state,
  model: "jev-latest",
  questions: {
    model_tier: {
      type: "choice",
      instructions: "Which Claude model tier best matches the complexity of this coding task",
      criteria: {
        haiku: "Mechanical, low-complexity: renames, formatting, simple lookups, one-line fixes",
        sonnet: "Standard implementation: normal feature coding, typical bug fixes, moderate complexity",
        opus: "High-complexity: architecture decisions, deep debugging, multi-file refactors, sustained reasoning"
      }
    }
  }
}') || exit 0

RESPONSE=$(curl -sS --max-time 5 -X POST "https://api.typesafe.ai/v1/systemone" \
  -H "Authorization: Bearer $TYPESAFE_API_KEY" \
  -H "Content-Type: application/json" \
  -d "$REQUEST_BODY" 2>/dev/null)
[ $? -eq 0 ] || exit 0
printf '%s' "$RESPONSE" | jq empty >/dev/null 2>&1 || exit 0

TIER=$(printf '%s' "$RESPONSE" | jq -r '.answers.model_tier.choice // empty' 2>/dev/null)
CONFIDENCE=$(printf '%s' "$RESPONSE" | jq -r '.answers.model_tier.confidence // empty' 2>/dev/null)
[ -z "$TIER" ] && exit 0

MESSAGE=$(build_recommendation "$TIER" "$CONFIDENCE") || exit 0

# UserPromptSubmit hooks only surface output via hookSpecificOutput.additionalContext
# (injected into Claude's context) — a top-level systemMessage is silently ignored
# for this event type.
jq -n --arg msg "$MESSAGE" '{hookSpecificOutput: {hookEventName: "UserPromptSubmit", additionalContext: $msg}}'
exit 0
