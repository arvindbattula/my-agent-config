#!/usr/bin/env bash
# PreToolUse hook: block edits/writes to protected paths before they happen.
# Protected: .env files, .git/ directory contents, generated/ prefix,
# and any path resolving outside the project root (cwd) — except the Claude
# session scratchpad (<temp>/claude/), plan files (~/.claude/plans/), and
# auto-memory (~/.claude/projects/*/memory/), which Claude Code directs
# sessions to write and which live outside the project by design.
# Exit 2 = block the tool call. Exit 0 = allow.
#
# Failure policy is tiered fail-closed: a missing jq or unparseable payload
# blocks with an explanatory message (a broken dependency here previously
# turned this hook into a silent no-op for months — loud beats silent).
# A valid payload without a file_path stays allowed: Write/Edit always carry
# one, and blocking an unknown-but-legitimate variant would brick sessions.

set -uo pipefail

# Fail closed: jq is required to read the payload at all. Checked before
# any other external command so a stripped PATH fails here, deterministically.
if ! command -v jq >/dev/null 2>&1; then
  echo "BLOCKED (fail-closed): protect-paths.sh requires jq, which is not on PATH. Install jq (winget install jqlang.jq / brew install jq) to restore Write/Edit." >&2
  exit 2
fi

# Read hook payload from stdin
INPUT=$(cat)

# Fail closed: an unparseable payload means we cannot know what is being written.
if ! printf '%s' "$INPUT" | jq -e . >/dev/null 2>&1; then
  echo "BLOCKED (fail-closed): protect-paths.sh received an unparseable hook payload." >&2
  exit 2
fi

FILE_PATH=$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // empty' 2>/dev/null)
CWD=$(printf '%s' "$INPUT" | jq -r '.cwd // .workspace.current_dir // empty' 2>/dev/null)

# Guard: need a file path (deliberate fail-open tier — see header)
[ -z "$FILE_PATH" ] && exit 0

# Guard: need cwd to resolve relative paths
if [ -z "$CWD" ]; then
  CWD="$(pwd)"
fi

# normalize <path> — one canonical absolute form for prefix comparison.
# MSYS/Git Bash (cygpath exists): cygpath -u unifies C:\ / C:/ / /c/ forms,
#   then realpath -m resolves . and .. without requiring the file to exist.
#   Native Windows python3 is NOT usable here: it returns C:\-form paths that
#   never string-match pwd's /c/-form.
# macOS/Linux: python3 normpath. Deliberately not realpath — BSD realpath
#   resolves symlinks, and on macOS /var -> /private/var would break prefix
#   matching against $TMPDIR and logical pwd.
normalize() {
  local p="$1"
  if command -v cygpath >/dev/null 2>&1; then
    p="$(cygpath -u "$p" 2>/dev/null || echo "$p")"
    realpath -m "$p" 2>/dev/null || echo "$p"
  else
    python3 -c "import os,sys; print(os.path.normpath(os.path.abspath(sys.argv[1])))" "$p" 2>/dev/null || echo "$p"
  fi
}

# Resolve the file path to absolute
# Handle ~ expansion, relative paths, and absolute paths
if [[ "$FILE_PATH" == ~* ]]; then
  FILE_PATH="${FILE_PATH/#\~/$HOME}"
fi

# Convert a Windows-form file path (C:\... or backslashed relative) to POSIX
# before the relative check below — cygpath is a no-op on POSIX-form input.
if command -v cygpath >/dev/null 2>&1; then
  FILE_PATH="$(cygpath -u "$FILE_PATH" 2>/dev/null || echo "$FILE_PATH")"
fi

CWD="$(normalize "$CWD")"

if [[ "$FILE_PATH" != /* ]]; then
  FILE_PATH="$CWD/$FILE_PATH"
fi

NORMALIZED="$(normalize "$FILE_PATH")"

# Fail closed if normalization left traversal residue (realpath/python both
# unavailable or broken): an unresolved .. can lexically prefix-match the
# project root and escape it.
case "/$NORMALIZED/" in
  */../*|*/./*)
    echo "BLOCKED (fail-closed): could not normalize '$FILE_PATH' — refusing unresolved traversal." >&2
    exit 2
    ;;
esac

# Resolve cwd to absolute for comparison
CWD_ABS=$(cd "$CWD" 2>/dev/null && pwd 2>/dev/null || echo "$CWD")

# outside_root_exempt — allowed destinations outside the project root, all
# written at Claude Code's direction. Checked only for paths that already
# failed the inside-project test, so a project living under one of these
# roots still gets the .env/.git/generated checks.
#   <system-temp>/claude/*          session scratchpads. Every plausible temp
#     root is tried through the same normalizer as the file path so Windows
#     (cygpath collapses AppData\Local\Temp to /tmp), macOS ($TMPDIR=
#     /var/folders/...) and plain /tmp all match. Only the claude/ subtree,
#     not all of temp. Any session's scratchpad matches, not just this
#     one's — accepted, it is ephemeral temp data.
#   ~/.claude/plans/*               plan-mode files
#   ~/.claude/projects/*/memory/*   auto-memory
# The rest of ~/.claude (settings.json, hooks) stays protected.
outside_root_exempt() {
  local tmp_cand tmp_root home_abs
  for tmp_cand in "${TMPDIR:-}" "${TMP:-}" "${TEMP:-}" /tmp; do
    [ -z "$tmp_cand" ] && continue
    tmp_root="$(normalize "$tmp_cand")"
    tmp_root="${tmp_root%/}"
    case "$NORMALIZED" in
      "$tmp_root"/claude/*) return 0 ;;
    esac
  done
  home_abs="$(normalize "$HOME")"
  case "$NORMALIZED" in
    "$home_abs"/.claude/plans/*) return 0 ;;
    "$home_abs"/.claude/projects/*/memory/*) return 0 ;;
  esac
  return 1
}

# --- Check 1: path outside project root ---
# Use string prefix check (both normalized to absolute)
case "$NORMALIZED" in
  "$CWD_ABS"|"$CWD_ABS"/*)
    # Inside the project root — OK
    ;;
  *)
    outside_root_exempt && exit 0
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
