#!/usr/bin/env bash
# PreToolUse hook: block edits/writes to protected paths before they happen.
# Protected: .env files, .git/ directory contents, generated/ prefix,
# and any path resolving outside the project root (cwd).
# Exit 2 = block the tool call. Exit 0 = allow.

set -uo pipefail

# Read hook payload from stdin
INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty' 2>/dev/null)
CWD=$(echo "$INPUT" | jq -r '.cwd // .workspace.current_dir // empty' 2>/dev/null)

# Guard: need a file path
[ -z "$FILE_PATH" ] && exit 0

# Guard: need cwd to resolve relative paths
if [ -z "$CWD" ]; then
  CWD="$(pwd)"
fi

# Resolve the file path to absolute
# Handle ~ expansion, relative paths, and absolute paths
if [[ "$FILE_PATH" == ~* ]]; then
  FILE_PATH="${FILE_PATH/#\~/$HOME}"
fi

if [[ "$FILE_PATH" != /* ]]; then
  FILE_PATH="$CWD/$FILE_PATH"
fi

# Normalize the path (resolve . and .. without requiring the file to exist)
NORMALIZED=$(cd "$CWD" 2>/dev/null && python3 -c "import os,sys; print(os.path.normpath(os.path.abspath(sys.argv[1])))" "$FILE_PATH" 2>/dev/null || echo "$FILE_PATH")

# Resolve cwd to absolute for comparison
CWD_ABS=$(cd "$CWD" 2>/dev/null && pwd 2>/dev/null || echo "$CWD")

# --- Check 1: path outside project root ---
# Use string prefix check (both normalized to absolute)
case "$NORMALIZED" in
  "$CWD_ABS"|"$CWD_ABS"/*)
    # Inside the project root — OK
    ;;
  *)
    echo "BLOCKED: $FILE_PATH resolves outside the project root ($CWD_ABS). Use files within the repo." >&2
    exit 2
    ;;
esac

# Relative path from project root for pattern matching
REL="${NORMALIZED#"$CWD_ABS"/}"

# --- Check 2: .env files ---
case "$REL" in
  .env|.env.local|.env.*)
    echo "BLOCKED: $REL is a secrets file. Do not edit .env files directly." >&2
    exit 2
    ;;
esac

# --- Check 3: .git/ directory contents ---
case "$REL" in
  .git/*)
    echo "BLOCKED: $REL is inside .git/. Use application code or tests instead." >&2
    exit 2
    ;;
esac

# --- Check 4: generated/ prefix ---
case "$REL" in
  generated/*)
    echo "BLOCKED: $REL is in generated/. This is auto-generated code — edit the source instead." >&2
    exit 2
    ;;
esac

# All checks passed — allow
exit 0
