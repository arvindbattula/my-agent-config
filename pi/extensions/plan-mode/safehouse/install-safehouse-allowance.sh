#!/bin/bash
# Install the agent-safehouse srt-mux allowance for pi plan-mode's kernel
# sandbox, verify the composed policy is valid SBPL, then smoke-test it.
#
# RUN FROM A NORMAL TERMINAL (not inside a safehouse'd session): the policy
# must be visible to safehouse at launch, and ~/.config/safehouse is
# deny-read/write from inside the sandbox by design.
#
# After this script:
#   1. Add --append-profile="$HOME/.config/safehouse/append/srt-mux-pi.sb"
#      to whatever invocation wraps pi in safehouse (see the detection below).
#   2. Restart pi (policy bakes at process start).

set -euo pipefail

DIR="$(cd "$(dirname "$BASH_SOURCE[0]")" && pwd -P)"
DEST_DIR="$HOME/.config/safehouse/append"
DEST="$DEST_DIR/srt-mux-pi.sb"
PROFILE_OUT="$(mktemp -t srt-mux-policy-check.XXXXXX)"

echo "== Installing allowance =="
mkdir -p "$DEST_DIR"
cp "$DIR/srt-mux-pi.sb" "$DEST"
echo "installed: $DEST"

echo
echo "== Composed policy validates as SBPL =="
# --stdout prints the composed policy instead of executing pi.
safehouse --stdout --append-profile="$DEST" -- pi > "$PROFILE_OUT"
grep -n "network-bind\|unix-socket" "$PROFILE_OUT" | head -30
# sandbox-exec applies the policy to /usr/bin/true: a syntax error aborts
# right here; a valid policy just runs `true`.
sandbox-exec -f "$PROFILE_OUT" /usr/bin/true && echo "POLICY OK: composed policy compiles and executes under sandbox-exec"

echo
echo "== Smoke test: mux-shaped unix socket inside safehouse =="
echo "-- WITH the allowance (expect: OK bind+listen+connect+echo):"
safehouse --append-profile="$DEST" -- node "$DIR/probe-srt-mux.mjs" && echo "ALLOWANCE ACTIVE" || echo "ALLOWANCE NOT EFFECTIVE (see FAIL above)"
echo "-- WITHOUT the allowance, control (expect: FAIL bind EPERM):"
safehouse -- node "$DIR/probe-srt-mux.mjs" && echo "unexpected: control passed" || echo "control behaves as before (denied) — the allowance is what changes it"

echo
echo "== Where is 'pi' wrapped? (to wire --append-profile) =="
type -a pi 2>/dev/null || echo "no shell 'pi' resolution in this non-interactive shell"
for rc in "$HOME/.zshrc" "$HOME/.zprofile" "$HOME/.zshenv" "$HOME/.bashrc" "$HOME/.bash_profile"; do
	[ -f "$rc" ] && grep -Hn "safehouse\|append-profile\|alias pi\|pi(" "$rc" | sed "s|^|    |" || true
done

cat <<'WIRING'

WIRING — pick the case that matches what the detection above shows:

  ⚠️ VERDICT (2026-11-05): DO NOT WIRE --append-profile INTO pi's LAUNCH ⚠️
  macOS blocks applying a nested Seatbelt profile from inside an existing
  sandbox (sandbox_apply: Operation not permitted, exit 71 — confirmed even
  under an outer `(allow default)` policy, so no allow rule can lift it).
  With only these socket rules wired, initialize would SUCCEED while every
  wrapped plan/airgap bash child then fails its profile application. Keep
  this file installed for the probe/verification matrix only. Inside
  safehouse the plan-mode kernel layer can never enforce; the extension
  degrades to the regex guardrail (warn-once) and its post-init canary
  protects against accidental wiring. See README "Agent Safehouse (macOS
  wrapper)" and AUDIT.md "Safehouse coexistence".

  (The launcher detection below is kept for completeness — e.g. if the
  nesting verdict is ever revisited, or another unix-socket-bound tool
  needs the same wiring technique.)

  Case A: an alias/function in a shell rc file, e.g. `alias pi='safehouse --workdir ... pi'`
    -> add the flag to it:
       alias pi='safehouse --append-profile="$HOME/.config/safehouse/append/srt-mux-pi.sb" --workdir ... -- pi'
    then `source ~/.zshrc` (or open a new Terminal).

  Case B: a wrapper script on PATH (e.g. ~/.local/bin/pi)
    -> insert the flag into its safehouse invocation:
       exec safehouse --append-profile="$HOME/.config/safehouse/append/srt-mux-pi.sb" "$@" ...

  Case C: you type `safehouse ... pi` manually
    -> type it with the flag, or add the Case A alias for convenience.

Then run the full verification:
  bash "$DIR/verify-safehouse-fix.sh"
WIRING
