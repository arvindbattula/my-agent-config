# Plan Mode Extension

Read-only exploration mode for safe code analysis.

## Features

- **Write tools disabled**: Disables built-in `edit`/`write` while preserving other active tools (e.g. memory tools)
- **Bash allowlist**: Only read-only bash commands are allowed
- **Plan extraction**: Extracts numbered steps from `Plan:` sections
- **Progress tracking**: Widget shows completion status during execution
- **[DONE:n] markers**: Explicit step completion tracking
- **Session persistence**: State survives session resume

## Commands

- `/plan` - Toggle plan mode
- `/plan-airgap` - Toggle airgap plan mode (also `--plan-airgap` at startup)
- `/todos` - Show current plan progress
- `Ctrl+Alt+P` - Toggle plan mode (shortcut)
- `Ctrl+Alt+A` - Toggle airgap plan mode (shortcut)

**Trigger assist:** the first time a prompt looks like multi-file/structural work (refactor/migrate keywords, or 3+ file mentions), pi shows a one-line "consider /plan?" hint — once per session, never auto-entering plan mode. Short or "just do it" prompts never trigger it.

## Usage

1. Enable plan mode with `/plan` or `--plan` flag
2. The agent works in phases: **clarify** (interviews you via the `questionnaire` tool, or in plain text under `--print` — highest-leverage questions first, 5–10 max; the model may read code first, see AUDIT.md), **explore** (reads the code, notes files touched and likely conflicts), **plan**, **self-review** (re-checks against your goals, flags its least-confident step)
3. The plan is a numbered list under a `Plan:` header, each step in the form:

```
Plan:
1. <action> - done when: <observable condition> [Verify: <command>] (files: <paths touched>)
2. ...

Risks:
- ...
```

`Verify:` checks are run by the harness when a step is marked complete. `done when:` keeps the plan self-auditing.

4. Choose "Execute the plan" when prompted — or "Refine the plan", which now offers two modes: **an interview** (the model grills you with questions until you're aligned, then rewrites the plan — the Grill-Me pattern) or the classic **free-form editor**
5. During execution, the agent marks steps complete with `plan_step_done` (or `[DONE:n]` as fallback) — steps with `[Verify: ...]` checks complete only when the harness check passes
6. Progress widget shows completion status (`✓✓` verified, `☑` reported)

## How It Works

### Kernel enforcement (Phase 2)

While plan or airgap mode is active, **every bash command runs inside an OS-level sandbox** (Seatbelt on macOS, bubblewrap on Linux) via `@anthropic-ai/sandbox-runtime`: writes and network are denied at the kernel, no matter how the command is worded. The allowlist above is advisory UX on top — the sandbox is the boundary.

- **Plan mode:** deny all writes + network. Optional read denials via `.pi/plan-mode.json`: `{ "denyRead": ["~/.ssh", ".env"] }`
- **Airgap mode:** same, plus a fixed `denyRead` of `~/.ssh`, `~/.aws`, `~/.gnupg`, `.env`, `.env.*`, `*.pem`, `*.key`
- **Fail-closed in airgap:** if the sandbox cannot initialize, airgap blocks ALL bash. Plan mode degrades to the allowlist with a visible warning.
- User-typed `!`/`!!` commands get the same sandbox while a planning mode is active.
- Kill switch: `pi --no-plan-sandbox` disables the kernel layer (allowlist still applies).
- Verified by `node tests/run.mjs --sandbox` (11 kernel probes) — writes, network, and the regex-bypass vectors (`sh -c`, `git --output`, `sort -o`) all fail at the OS level. It prints `n passed, m skipped, k failed` and exits 1 only when a probe fails.

#### Install the dependency (all platforms)

`./install.sh` installs it with `npm ci`, and `--status` reports when it is missing. To run the tests from a repo checkout, also run `npm ci` in this directory.

Without the dependency, `pi` exits with `Cannot find module '@anthropic-ai/sandbox-runtime'`, even when no planning mode was requested. `pi -ne` starts without extensions, and therefore without plan mode or airgap.

#### Linux prerequisites

Beyond the npm dependency, macOS needs nothing extra. Linux needs three binaries on `PATH`; if any is missing, the sandbox cannot initialize, so airgap blocks all bash and plan mode falls back to the allowlist. The failure message names the packages to install.

```bash
sudo apt-get install bubblewrap socat ripgrep   # Debian/Ubuntu
sudo dnf install bubblewrap socat ripgrep       # Fedora
sudo pacman -S bubblewrap socat ripgrep         # Arch
```

- **Ubuntu 24.04+:** bubblewrap also needs capability-bearing user namespaces, which AppArmor restricts by default. Run `sudo sysctl -w kernel.apparmor_restrict_unprivileged_userns=0`, or add an AppArmor profile granting `userns` to the relevant binaries.
- **WSL1 is unsupported** (bubblewrap does not run there); use WSL2.
- **Docker:** the default container profile stops bubblewrap creating namespaces, and unconfined seccomp/AppArmor is not enough. It works in a `--privileged` container, which gives up much of the container's own isolation.
- **Blocked namespaces look different from missing binaries:** the sandbox still reports ready, then every bash command fails with a `bwrap:` error, including in plan mode (no allowlist fallback). Nothing runs unsandboxed.
- Confirm with `node tests/run.mjs --sandbox` from this directory. If bubblewrap cannot start, the denial probes report FAIL as "not run". Probes that can't prove anything on this machine, such as reading a `~/.aws/config` that doesn't exist, report SKIP.

### Plan Mode (Read-Only)
- Built-in `edit`/`write` disabled; other active tools (read, bash, grep, find, ls, questionnaire, memory tools) remain available
- Bash commands filtered through the allowlist AND executed in the kernel sandbox
- Other preserved tools keep their own capabilities — the no-egress guarantee is scoped to bash, not all of plan mode (e.g. a remote-backed memory tool can still do network I/O); use airgap for full egress lockdown

### Execution Mode
- Full tool access restored; the kernel sandbox tears down
- Steps marked complete with `plan_step_done` — **a proposal, not a claim**:
  - Steps carrying a `[Verify: <command>]` check are only marked complete when the **harness runs the check** (outside the model's control) and it passes (exit 0)
  - Failed checks return the command's output to the model — fix and retry; after **8 consecutive failures** the step pauses and the model must ask you
  - Checks are hashed at extraction (lock trail); at approval the harness runs each once to record the **red witness** (pre-work failing state); hash drift on resume disables the check loudly
  - Pass an `evidence` argument (one line: what you ran to verify) — shown in results; steps without checks are explicitly labeled "model-reported only"
- When all steps complete, the model runs a short blind-spot audit (least-confident step, riskiest assumption, what you should verify)
- Progress widget: `✓✓` = harness-verified, `☑` = reported only, `☐` = pending; footer shows `📋 3/10 (2✓)`
- `[DONE:n]` markers still work as a fallback (reported only)

#### Project config: `.pi/plan-mode.json` (all optional)

```json
{
  "verifySteps": true,          // harness-verified completion (default true)
  "defaultCheck": "npm test",    // default check for steps without inline [Verify: ...]
  "denyRead": ["~/.ssh", ".env"] // extra sandbox read-denials in plan mode (airgap list is fixed)
}
```

### Command Allowlist

Every segment of a command (split on `|`, `;`, `&&`, `&`, newlines — quote-aware) must
independently pass. Unbalanced quotes block the whole command.

Safe commands (allowed as the first word of a segment):
- File inspection: `cat`, `head`, `tail`, `grep`, `find`, `ls`, `pwd`, `wc`, `sort` (without `-o`), `uniq`, `diff`, `file`, `stat`, `du`, `df`, `tree`
- Text output: `echo`, `printf`, `jq`, `sed -n` (without `e`/`w`/`r` commands), `awk` (without `getline`/`system()`/redirect/network)
- Search: `rg`, `fd`, `bat`, `eza`
- Git read: `git status|log|diff|show|branch|remote|config --get|ls-*` (without `--output`/`--ext-diff`/`-c`)
- Package info: `npm list|ls` (local only — `npm view/audit` etc. hit the network and are blocked)
- System info: `uname`, `whoami`, `id`, `date`, `cal`, `uptime`, `ps`, `top`, `htop`, `free`, `which`, `whereis`, `type`, `env` (bare only), `printenv`
- Version probes: `node --version`, `python --version`, `python3 --version`

Blocked (segment head or content):
- Any pipeline segment headed by an interpreter: `sh`, `bash`, `zsh`, `python*`, `node`, `perl`, `ruby`, `osascript`, … (`cat x | sh` is blocked)
- Network commands: `curl`, `wget`, `nc`, `ssh`, `scp`, `socat`, `telnet`, `dig`, … — blocked as a command, not as a word (`grep ssh README.md` is fine)
- File modification: `rm`, `mv`, `cp`, `mkdir`, `touch`, `tee`, `truncate`, …
- Output redirection (`>`, `>>` outside quotes) — except redirects to `/dev/null` (`2>/dev/null`, `>/dev/null`, …), which write nowhere and are allowed
- Command/process substitution: `$(…)`, backticks, `<(…)`
- Git write: `git add`, `git commit`, `git push`, … and read-git write flags (`--output=`, `-c`)
- Package install: `npm install`, `yarn add`, `pip install`, and registry queries (`npm view`, `yarn info`, …)
- Pagers: `less`, `more` (no TTY in pi's bash; closes pager escapes)
- `env` with any arguments or assignments (`LD_PRELOAD=…`, `PAGER=sh git …`)
- System: `sudo`, `kill`, `reboot`, editors (`vim`, `nano`, `code`)

The allowlist is a guardrail; the kernel sandbox is the boundary, unless it failed
to initialize — see AUDIT.md. Airgap mode
(`--plan-airgap`) allows only: `cat`, `grep`, `ls`, `find`, `head`, `tail`, `wc`, `pwd`.
