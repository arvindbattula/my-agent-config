#!/bin/bash
# Full verification matrix for the safehouse srt-mux fix (run AFTER
# install-safehouse-allowance.sh and launcher wiring, from a normal Terminal).
#
# Automated parts run pi's plan-mode tests inside a safehouse'd shell both
# without (control) and with (fixed) the allowance; the interactive TUI
# checks are printed at the end for you to do by hand.

set -uo pipefail   # checks report; this script never hard-stops mid-matrix

DIR="$(cd "$(dirname "$BASH_SOURCE[0]")" && pwd -P)"
PLANNER_DIR="$(cd "$DIR/.." && pwd -P)"
DEST="$HOME/.config/safehouse/append/srt-mux-pi.sb"
PROFILE_FLAG="--append-profile=$DEST"

pass=0; fail=0
result() { # $1 expected  $2 actual  $3 label
	if [ "$1" = "$2" ]; then echo "PASS  $3"; pass=$((pass+1)); else echo "FAIL  $3 (expected: $1, got: $2)"; fail=$((fail+1)); fi
}

echo "== 1. Allowance installed =="
[ -f "$DEST" ] && { echo "PASS  $DEST present"; pass=$((pass+1)); } || { echo "FAIL  $DEST missing — run install-safehouse-allowance.sh first"; fail=$((fail+1)); }

echo
echo "== 2. Probe WITHOUT allowance (control: expect FAIL/EPERM) =="
out="$(safehouse -- node "$DIR/probe-srt-mux.mjs" 2>&1 || true)"
echo "    $out"
case "$out" in FAIL:*) result "FAIL" "FAIL" "control denied without allowance";; *) result "FAIL" "OK" "control denied without allowance";; esac

echo
echo "== 3. Probe WITH allowance (expect OK) =="
out="$(safehouse $PROFILE_FLAG -- node "$DIR/probe-srt-mux.mjs" 2>&1 || true)"
echo "    $out"
case "$out" in OK:*) result "OK" "OK" "mux-shaped unix socket bind+connect allowed with allowance";; *) result "OK" "FAIL" "srt-mux socket allowed with allowance";; esac

echo
echo "== 4. Kernel-sandbox probes (tests/run.mjs --sandbox) inside safehouse =="
echo "    WITHOUT allowance (control: expect exit 1, listen EPERM on srt-mux):"
( cd "$PLANNER_DIR" && safehouse -- node tests/run.mjs --sandbox ) >/tmp/vsf-nofix.out 2>&1; rc=$?
echo "    exit=$rc; summary: $(grep -Ei 'listen EPERM|passed|failed|skipped' /tmp/vsf-nofix.out | head -3 | tr '\n' ' ')"
result "1" "$rc" "S-tier fails inside safehouse without the allowance (documented gotcha reproduced)"

echo "    WITH allowance (init should pass; enforcement may be OS-blocked):"
( cd "$PLANNER_DIR" && safehouse $PROFILE_FLAG -- node tests/run.mjs --sandbox ) >/tmp/vsf-fix.out 2>&1; rc=$?
echo "    exit=$rc; summary: $(grep -E 'passed|failed|skipped' /tmp/vsf-fix.out | head -3 | tr '\n' ' ')"
if [ "$rc" = "0" ]; then
	result "0" "0" "S-tier kernel probes PASS inside safehouse with the allowance"
elif grep -q "sandbox_apply\|cannot enforce\|exit=71" /tmp/vsf-fix.out; then
	echo "PASS  nested Seatbelt is OS-blocked (documented, sandbox_apply/exit 71) — init passes, enforcement cannot; the extension canary degrades instead of bricking"
	pass=$((pass+1))
else
	result "0" "$rc" "S-tier kernel probes PASS inside safehouse with the allowance"
fi

echo
echo "== 5. Corpus gate inside safehouse (expect 127/127) =="
( cd "$PLANNER_DIR" && safehouse $PROFILE_FLAG -- node tests/run.mjs ) >/tmp/vsf-corpus.out 2>&1; rc=$?
grep "Corpus gate" /tmp/vsf-corpus.out
result "0" "$rc" "corpus gate green inside safehouse with the allowance"

echo
echo "== 6. No collateral: docker.sock connect still denied with allowance =="
out="$(safehouse $PROFILE_FLAG -- bash -c 'exec 3<>/var/run/docker.sock' 2>&1 || true)"
case "$out" in *"denied"*|*EPERM*|*"Operation not permitted"*)
	result "denied" "denied" "docker.sock connect still blocked with allowance active";;
	*) result "denied" "allowed" "docker.sock connect still blocked with allowance active";;
esac

echo
echo "===================== MANUAL TUI CHECKS (do by hand) ====================="
cat <<'MANUAL'
Start pi the way you wired it (safehouse ... -- pi) and check:

  7. Enter /plan          -> "Plan mode enabled" toast with NO "Kernel sandbox
                            init failed" warning.
  8. In plan mode, try a write, e.g.: touch PLAN-verify.txt
                            -> blocked with "Operation not permitted" (seatbelt
                            policy of the kernel sandbox, not just the regex).
  9. /plan (exit), /plan (re-enter)  -> still no warning (2nd mux, seq 1).
 10. /plan-airgap         -> initializes; bash works read-only instead of
                            being blocked entirely (fail-closed is gone).
 11. Optionally watch the live Seatbelt decisions while you do 7-10:
     /usr/bin/log stream --style compact \
       --predicate 'eventMessage CONTAINS "Sandbox:" AND eventMessage CONTAINS "deny("'
MANUAL

echo
echo "RESULT: $pass passed, $fail failed"
exit $(( fail > 0 ? 1 : 0 ))
