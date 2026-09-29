#!/bin/bash
# Tests for the pi-config guards install.sh adds: volatile-key normalization and
# the protected-key refusal. Run: bash install.test.sh
#
# These cover the settings.json regressions recorded in
# pi/extensions/README.md → "Valar retry": whole-file copies flipped retry off
# twice, so a boundary case here matters more than the assertion count.

set -uo pipefail
cd "$(dirname "$0")"

source <(sed -n '1,/# ─── Main ───/p' install.sh)

TMPDIR_BASE=$(mktemp -d)
BACKUP_DIR="$TMPDIR_BASE/backups"
trap 'rm -rf "$TMPDIR_BASE"' EXIT
pass=0
fail=0

check() {
    local desc="$1" got="$2" want="$3"
    if [ "$got" = "$want" ]; then
        echo "  ✓ $desc"
        ((pass++))
    else
        echo "  ✗ $desc — got: $got | want: $want"
        ((fail++))
    fi
}

LIVE="$TMPDIR_BASE/live.json"
printf '%s' '{"theme":"light","retry":{"enabled":true,"maxRetries":3,"baseDelayMs":2000},"lastChangelogVersion":"0.87.1","compaction":{"reserveTokens":32768},"enabledModels":["valar/kimi","azure/opus"]}' > "$LIVE"

repo_variant() {
    local out="$TMPDIR_BASE/$1.json"
    shift
    printf '%s' "$1" > "$out"
    echo "$out"
}

echo "compare_json_normalized"

V=$(repo_variant volatile '{"theme":"light","retry":{"enabled":true,"maxRetries":3,"baseDelayMs":2000},"lastChangelogVersion":"0.83.0","compaction":{"reserveTokens":32768},"enabledModels":["valar/kimi","azure/opus"]}')
check "lastChangelogVersion drift is not a difference" "$(compare_json_normalized "$V" "$LIVE")" "identical"

V=$(repo_variant retry-off '{"theme":"light","retry":{"enabled":false,"maxRetries":3,"baseDelayMs":2000},"lastChangelogVersion":"0.87.1","compaction":{"reserveTokens":32768},"enabledModels":["valar/kimi","azure/opus"]}')
check "nested key change (retry.enabled) is a difference" "$(compare_json_normalized "$V" "$LIVE")" "differs"

V=$(repo_variant compact '{"theme":"light","retry":{"enabled":true,"maxRetries":3,"baseDelayMs":2000},"lastChangelogVersion":"0.87.1","compaction":{"reserveTokens":16384},"enabledModels":["valar/kimi","azure/opus"]}')
check "second nested key change (compaction) is a difference" "$(compare_json_normalized "$V" "$LIVE")" "differs"

V=$(repo_variant models '{"theme":"light","retry":{"enabled":true,"maxRetries":3,"baseDelayMs":2000},"lastChangelogVersion":"0.87.1","compaction":{"reserveTokens":32768},"enabledModels":["valar/kimi"]}')
check "array element removal is a difference" "$(compare_json_normalized "$V" "$LIVE")" "differs"

V=$(repo_variant reorder '{"lastChangelogVersion":"0.83.0","enabledModels": ["valar/kimi","azure/opus"],"compaction":{"reserveTokens":32768},"retry":{"baseDelayMs":2000,"maxRetries":3,"enabled":true},"theme": "light"}')
check "key order and whitespace do not read as a difference" "$(compare_json_normalized "$V" "$LIVE")" "identical"

V=$(repo_variant absent '{"theme":"light","retry":{"enabled":true,"maxRetries":3,"baseDelayMs":2000},"compaction":{"reserveTokens":32768},"enabledModels":["valar/kimi","azure/opus"]}')
check "volatile key absent on one side is still identical" "$(compare_json_normalized "$V" "$LIVE")" "identical"

V=$(repo_variant bad 'not json at all')
check "unparsable file falls back to whole-file compare" "$(compare_json_normalized "$V" "$LIVE")" "differs"
check "missing file reports repo_only" "$(compare_json_normalized "$V" "$TMPDIR_BASE/nope.json")" "repo_only"
check "node absent falls back to whole-file compare" "$(JSON_TOOL= compare_json_normalized "$V" "$LIVE")" "differs"

echo "copy_would_clobber_protected"

V=$(repo_variant guard-fires '{"theme":"dark","retry":{"enabled":false}}')
copy_would_clobber_protected "$V" "$LIVE" && r=fires || r=quiet
check "refuses when retry would change" "$r" "fires"

V=$(repo_variant guard-quiet '{"theme":"dark","retry":{"enabled":true,"maxRetries":3,"baseDelayMs":2000},"lastChangelogVersion":"0.99.0"}')
copy_would_clobber_protected "$V" "$LIVE" && r=fires || r=quiet
check "allows a copy that keeps retry" "$r" "quiet"

V=$(repo_variant guard-dropped '{"theme":"dark"}')
copy_would_clobber_protected "$V" "$LIVE" && r=fires || r=quiet
check "refuses when retry would be deleted outright" "$r" "fires"

copy_would_clobber_protected "$TMPDIR_BASE/nope.json" "$LIVE" && r=fires || r=quiet
check "missing live file cannot clobber (fresh install)" "$r" "quiet"

JSON_TOOL= copy_would_clobber_protected "$(repo_variant guard-nonode '{"retry":{"enabled":false}}')" "$LIVE" && r=fires || r=quiet
check "node absent leaves the guard inert (documented)" "$r" "quiet"

echo "install_repo_over_live_config"

BAD=$(repo_variant clobber '{"theme":"dark","retry":{"enabled":false},"lastChangelogVersion":"0.83.0"}')
DRY_RUN=true
install_repo_over_live_config "$BAD" "$LIVE" >/dev/null 2>&1
check "dry-run refuses and does not prompt" "$?" "1"
check "dry-run leaves the live file untouched" "$(json_key "$LIVE" retry)" '{"enabled":true,"maxRetries":3,"baseDelayMs":2000}'

DRY_RUN=false
echo "s" | install_repo_over_live_config "$BAD" "$LIVE" >/dev/null 2>&1
check "skip answer refuses" "$?" "1"
check "skip answer leaves retry enabled" "$(json_key "$LIVE" retry | grep -o '"enabled":true')" '"enabled":true'

echo "o" | install_repo_over_live_config "$BAD" "$LIVE" >/dev/null 2>&1
check "override answer copies" "$?" "0"
check "override answer writes the repo value" "$(json_key "$LIVE" retry)" '{"enabled":false}'
check "override took a backup first" "$(find "$BACKUP_DIR" -name 'live.json' | wc -l | tr -d ' ')" "1"

GOOD=$(repo_variant safe '{"theme":"light","retry":{"enabled":true,"maxRetries":3,"baseDelayMs":2000},"lastChangelogVersion":"0.87.1"}')
# The override assertion above left retry disabled in the fixture; restore it so
# this case exercises a copy that touches no protected key.
printf '%s' '{"theme":"light","retry":{"enabled":true,"maxRetries":3,"baseDelayMs":2000},"lastChangelogVersion":"0.87.1"}' > "$LIVE"
install_repo_over_live_config "$GOOD" "$LIVE" </dev/null >/dev/null 2>&1
check "unprotected copy needs no answer on stdin" "$?" "0"

echo ""
echo "tests: $((pass + fail))  pass $pass  fail $fail"
[ "$fail" -eq 0 ]
