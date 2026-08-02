#!/usr/bin/env bash
# Regression tests for the Claude Code lifecycle hooks.
#
# Mirrors the Pi lifecycle-guards unit tests (lifecycle-guards.test.mjs) on the
# bash side. Feeds each hook a mock stdin payload and asserts exit codes / gate
# state. No network, only jq + python3 (already hook dependencies).
#
# Run: bash hooks/hooks.test.sh
# Exits non-zero if any assertion fails.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

PASS=0
FAIL=0

pass() { PASS=$((PASS + 1)); printf '  \033[0;32m✓\033[0m %s\n' "$1"; }
fail() { FAIL=$((FAIL + 1)); printf '  \033[0;31m✗\033[0m %s\n' "$1"; }

# json <value>  -> JSON-encoded string of the argument
# Piped via stdin, not argv: Git Bash/MSYS auto-converts POSIX-looking argv
# strings (e.g. /tmp/xxx) to Windows form (C:/Users/...) when calling a
# native (non-MSYS) exe like python3 on Windows, silently corrupting any
# path fixture passed as an argument. Reading from stdin isn't subject to
# that conversion.
json() { python3 -c 'import json,sys; print(json.dumps(sys.stdin.read().rstrip("\n")))' <<< "$1"; }

# run_hook <hook> <payload-json>  -> prints nothing, sets RC
run_hook() {
  echo "$2" | bash "$SCRIPT_DIR/$1" >/dev/null 2>&1
  RC=$?
}

# expect_exit <label> <expected-rc>
expect_exit() {
  if [ "$RC" = "$2" ]; then pass "$1 (exit $RC)"; else fail "$1 (expected exit $2, got $RC)"; fi
}

# ── protect-paths.sh ──────────────────────────────────────────────────────
echo "protect-paths.sh"
pp() { run_hook protect-paths.sh "$(printf '{"tool_input":{"file_path":%s},"cwd":%s}' "$(json "$1")" "$(json "$TMP")")"; }

pp ".env";            expect_exit "block .env" 2
pp ".env.local";      expect_exit "block .env.local" 2
pp ".env.production"; expect_exit "block .env.production" 2
pp "generated/x.ts";  expect_exit "block generated/" 2
pp ".git/config";     expect_exit "block .git/" 2
pp "../outside.txt";  expect_exit "block path outside repo" 2
pp "sub/../.env";     expect_exit "block .env via traversal" 2
pp "src/app.ts";      expect_exit "allow src/app.ts" 0
pp "docs/readme.md";  expect_exit "allow docs/readme.md" 0

# Outside-root exemptions: scratchpad (<temp>/claude/), plans, memory.
# pp_from runs the hook with an explicit TMPDIR and cwd distinct from the
# temp root, so the exemption (not the inside-project branch) is what allows.
EXEMPT_PROJ="$TMP/exempt-proj"; mkdir -p "$EXEMPT_PROJ"
pp_from() { # <file_path> — cwd=$EXEMPT_PROJ, TMPDIR=$TMP
  printf '{"tool_input":{"file_path":%s},"cwd":%s}' "$(json "$1")" "$(json "$EXEMPT_PROJ")" \
    | TMPDIR="$TMP" bash "$SCRIPT_DIR/protect-paths.sh" >/dev/null 2>&1
  RC=$?
}
pp_from "$TMP/claude/sess/scratchpad/x.txt"; expect_exit "allow scratchpad under \$TMPDIR/claude" 0
pp_from "$TMP/no-claude/x.txt";              expect_exit "block temp path outside claude/ subtree" 2
pp_from "/tmp/claude/sess/scratchpad/x.txt"; expect_exit "allow /tmp/claude (literal fallback root)" 0
pp_from "$HOME/.claude/plans/x.md";          expect_exit "allow plan-mode file in ~/.claude/plans" 0
pp_from "$HOME/.claude/projects/some-proj/memory/note.md"; expect_exit "allow auto-memory file" 0

# Fail-closed tiers
run_hook protect-paths.sh 'this is not json'
expect_exit "fail closed on unparseable payload" 2
run_hook protect-paths.sh '{"tool_input":{}}'
expect_exit "allow valid payload without file_path" 0
printf '{"tool_input":{"file_path":".env"}}' \
  | PATH=/nonexistent /usr/bin/bash "$SCRIPT_DIR/protect-paths.sh" >/dev/null 2>&1
RC=$?
expect_exit "fail closed when jq missing (PATH stripped)" 2

# ── command-policy.sh ─────────────────────────────────────────────────────
echo "command-policy.sh"
cp_run() { run_hook command-policy.sh "$(printf '{"tool_input":{"command":%s}}' "$(json "$1")")"; }

cp_run "rm -rf /";                    expect_exit "block rm -rf /" 2
cp_run "rm -rf ~";                    expect_exit "block rm -rf ~" 2
cp_run 'rm -rf $HOME';                expect_exit "block rm -rf \$HOME" 2
cp_run "rm -rf .";                    expect_exit "block rm -rf . (cwd)" 2
cp_run "rm -rf ./";                   expect_exit "block rm -rf ./ (cwd)" 2
cp_run "rm -rf ..";                   expect_exit "block rm -rf .. (parent)" 2
cp_run "rm -rf ../..";                expect_exit "block rm -rf ../.." 2
cp_run "rm -rf ../sibling";           expect_exit "block rm -rf ../sibling" 2
cp_run "DROP TABLE users";            expect_exit "block DROP TABLE" 2
cp_run "truncate table logs";         expect_exit "block TRUNCATE TABLE" 2
cp_run "cat .env";                    expect_exit "block cat .env" 2
cp_run "git push --force origin main";expect_exit "block force-push main" 2
cp_run "git push -f origin master";   expect_exit "block -f push master" 2
cp_run "rm -rf build/";               expect_exit "allow rm -rf build/" 0
cp_run "rm -rf ./node_modules";       expect_exit "allow rm -rf ./node_modules" 0
cp_run "rm -rf ./dist";               expect_exit "allow rm -rf ./dist" 0
cp_run "cat README.md";               expect_exit "allow cat README.md" 0
cp_run "git push origin feature";     expect_exit "allow push to feature" 0

# ── design-antipattern-check.sh + stop-gate.sh ────────────────────────────
echo "design-antipattern-check.sh + stop-gate.sh"
PROJ="$TMP/proj"; mkdir -p "$PROJ"
SID_A="session-A"; SID_B="session-B"

design() { # <file> <session_id>
  run_hook design-antipattern-check.sh \
    "$(printf '{"tool_input":{"file_path":%s},"cwd":%s,"session_id":%s}' \
      "$(json "$1")" "$(json "$PROJ")" "$(json "$2")")"
}
stop() { # <session_id>
  run_hook stop-gate.sh "$(printf '{"cwd":%s,"session_id":%s}' "$(json "$PROJ")" "$(json "$1")")"
}
gate_keys() { jq -r '.failing_files | keys | join(",")' "$PROJ/.hook-state/last_design_gate.json" 2>/dev/null; }

BAD='.a { color: #000; font-family: Inter; }'
GOOD='.a { color: oklch(0.2 0.02 250); font-family: "Space Grotesk"; }'

# 1. bad file -> gate lists it, stop blocks in same session
printf '%s\n' "$BAD" > "$PROJ/one.css"; design "$PROJ/one.css" "$SID_A"
[ "$(gate_keys)" = "$PROJ/one.css" ] && pass "gate tracks failing file" || fail "gate tracks failing file (got '$(gate_keys)')"
stop "$SID_A"; expect_exit "stop blocks with failing file (same session)" 2

# 2. add a second bad file, then fix the first -> second still blocks
printf '%s\n' "$BAD" > "$PROJ/two.css"; design "$PROJ/two.css" "$SID_A"
printf '%s\n' "$GOOD" > "$PROJ/one.css"; design "$PROJ/one.css" "$SID_A"
[ "$(gate_keys)" = "$PROJ/two.css" ] && pass "fixing one file leaves the other tracked" || fail "multi-file tracking (got '$(gate_keys)')"
stop "$SID_A"; expect_exit "stop still blocks while another file fails" 2

# 3. fix the second file -> gate empty, stop allows
printf '%s\n' "$GOOD" > "$PROJ/two.css"; design "$PROJ/two.css" "$SID_A"
[ -z "$(gate_keys)" ] && pass "gate empty after all files fixed" || fail "gate empty (got '$(gate_keys)')"
stop "$SID_A"; expect_exit "stop allows when nothing fails" 0

# 4. stale gate from another session must not block a fresh session
printf '%s\n' "$BAD" > "$PROJ/one.css"; design "$PROJ/one.css" "$SID_A"
stop "$SID_A"; expect_exit "stop blocks in owning session" 2
stop "$SID_B"; expect_exit "stop ignores stale gate from other session" 0

# 5. stop_hook_active=true lets agent stop despite failing gate (anti-loop)
stop_active() { # <session_id>
  run_hook stop-gate.sh "$(printf '{"stop_hook_active":true,"cwd":%s,"session_id":%s}' "$(json "$PROJ")" "$(json "$1")")"
}
# Re-create a failing file (test 4 may have left gate in SID_A)
printf '%s\n' "$BAD" > "$PROJ/one.css"; design "$PROJ/one.css" "$SID_A"
stop "$SID_A"; expect_exit "stop blocks first time (stop_hook_active=false)" 2
stop_active "$SID_A"; expect_exit "stop_hook_active=true releases despite failing gate" 0

# ── design-antipattern-prevent.sh (PreToolUse) ────────────────────────────
echo "design-antipattern-prevent.sh"
prevent() { # <file_path> <content>
  run_hook design-antipattern-prevent.sh \
    "$(printf '{"tool_input":{"file_path":%s,"content":%s}}' "$(json "$1")" "$(json "$2")")"
}
prevent_edit() { # <file_path> <new_string>
  run_hook design-antipattern-prevent.sh \
    "$(printf '{"tool_input":{"file_path":%s,"new_string":%s}}' "$(json "$1")" "$(json "$2")")"
}

prevent "src/app.ts" "export const x = 1;"
expect_exit "allow non-frontend file (ts)" 0

prevent "src/app.css" ".a { color: oklch(0.2 0.02 250); font-family: \"Space Grotesk\"; }"
expect_exit "allow clean CSS" 0

prevent "src/app.css" ".a { color: #000; font-family: Inter; }"
expect_exit "block #000 + Inter in CSS" 2

prevent "src/app.tsx" "<div style={{ background: 'linear-gradient(135deg, violet, indigo)' }}>"
expect_exit "block purple gradient in TSX" 2

prevent "src/app.tsx" "<input type='text' />"
expect_exit "allow non-design content in TSX" 0

prevent_edit "src/app.css" ".a { color: hsl(200 50% 50%); }"
expect_exit "block HSL in Edit new_string" 2

prevent_edit "src/app.css" ".a { color: oklch(0.5 0.1 200); }"
expect_exit "allow OKLCH in Edit new_string" 0

# ── session-end.sh ────────────────────────────────────────────────────────
echo "session-end.sh"
run_hook session-end.sh "$(printf '{"session_id":"abc","reason":"quit","cwd":%s}' "$(json "$PROJ")")"
expect_exit "session-end exits clean" 0
if [ -f "$PROJ/reports/session-audit.log" ] && jq -e . "$PROJ/reports/session-audit.log" >/dev/null 2>&1; then
  pass "audit log written as valid JSONL"
else
  fail "audit log written as valid JSONL"
fi

# ── summary ───────────────────────────────────────────────────────────────
echo
printf 'tests: %d  \033[0;32mpass %d\033[0m  \033[0;31mfail %d\033[0m\n' "$((PASS + FAIL))" "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
