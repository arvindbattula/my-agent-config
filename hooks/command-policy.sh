#!/usr/bin/env bash
# PreToolUse hook: block dangerous shell commands before they execute.
# Matcher: Bash tool. Exit 2 = block. Exit 0 = allow.
#
# Denylist is conservative — only blocks clearly destructive commands.
# rm -rf with specific subdirectories is allowed (agent may clean artifacts).
# git push --force to feature branches is allowed.

set -uo pipefail

# Read hook payload from stdin
INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null)

# Guard: need a command
[ -z "$COMMAND" ] && exit 0

# Normalize whitespace for regex matching
NORMALIZED=$(echo "$COMMAND" | tr -s ' \t' ' ')

BLOCKED=""

# --- Destructive recursive deletes ---
# Bare root/home/cwd: rm -rf /, ~, $HOME, . (but not /foo, ./sub, build/)
# Parent traversal: rm -rf .. , ../ , ../foo , ../.. (kept in parity with the
# Pi lifecycle-guards util). ./sub and build/ stay allowed for artifact cleanup.
if echo "$NORMALIZED" | grep -qE '\brm\s+-rf\s+((/|~|\$HOME|\.)(\s|$)|\.\.(/|\s|$))' 2>/dev/null; then
  BLOCKED="destructive recursive delete (rm -rf root/home/cwd/parent)"
fi

# --- Destructive database commands ---
if [ -z "$BLOCKED" ] && echo "$NORMALIZED" | grep -qiE '\b(drop|truncate)\s+table\b' 2>/dev/null; then
  BLOCKED="destructive database command (DROP/TRUNCATE TABLE)"
fi

# --- Reading env/secret files ---
if [ -z "$BLOCKED" ] && echo "$NORMALIZED" | grep -qE '\b(cat|less|more|tail|head)\s+.*\.env\b' 2>/dev/null; then
  BLOCKED="reading env/secrets file"
fi

# --- Force-pushing to protected branches ---
if [ -z "$BLOCKED" ] && echo "$NORMALIZED" | grep -qE 'git\s+push.*--force.*\b(main|master)\b' 2>/dev/null; then
  BLOCKED="force-pushing to protected branch (main/master)"
fi
if [ -z "$BLOCKED" ] && echo "$NORMALIZED" | grep -qE 'git\s+push.*-f\b.*\b(main|master)\b' 2>/dev/null; then
  BLOCKED="force-pushing to protected branch (main/master)"
fi

# --- Output block reason ---
if [ -n "$BLOCKED" ]; then
  echo "BLOCKED by command policy: $BLOCKED. Command: $NORMALIZED" >&2
  exit 2
fi

# All checks passed — allow
exit 0
