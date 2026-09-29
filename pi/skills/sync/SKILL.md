---
name: "sync"
description: "Check ~/.pi/agent/ against its canonical config repo and reconcile drift"
disable-model-invocation: true
---

Reconcile `~/.pi/agent/` against the `my-agent-config` repo, which is where this machine's pi configuration is version-controlled. The repo holds `pi/extensions/`, `pi/skills/`, `pi/AGENTS.md`, `pi/settings.json`, `pi/models.json`, and `pi/model-router.json`; `install.sh` compares both trees by checksum and asks before changing anything.

Direction matters. Edits you made live under `~/.pi/agent/` should usually be copied *up* into the repo so they survive a machine move and reach the team. A fresh machine is the opposite case: the repo copies *down*. Say which direction you intend before choosing at a prompt.

## Steps

1. Locate the repo. Default is `~/my-agent-config`; confirm with `git -C ~/my-agent-config status -sb`. If it isn't there, or isn't a git repo, ask the user where their canonical config lives — don't guess a path.

2. Read the state first. `install.sh --status` is read-only and is the only safe way in:
   ```bash
   cd ~/my-agent-config && ./install.sh --status
   ```
   Report what it found: `✓` identical, `↓` repo only, `+` local only, `~` differs.

3. Preview if anything differs: `./install.sh --dry-run`.

4. Reconcile interactively with `./install.sh` (no flags). Each difference gets `[r]epo / [l]ocal / [d]iff / [s]kip`. Take them one at a time and explain each choice as you go.

   Do not use `--force`. It answers every `differs` prompt with `repo` without showing you the choice, and that is how live settings got clobbered twice — see "Valar retry" in `pi/extensions/README.md`.

5. Resolve `retry` refusals deliberately. `pi/settings.json` protects the `retry` key: a repo → local copy that would change it is refused unless overridden. If you hit that, tell the user what live says versus what the repo says and let them choose. Retry stays **enabled** for Valar; the Azure providers retry in-extension, so a global retry stacks on top of them.

6. Confirm both trees after the run:
   ```bash
   diff -rq ~/my-agent-config/pi/extensions ~/.pi/agent/extensions
   diff -rq ~/my-agent-config/pi/skills ~/.pi/agent/skills
   ```
   Expected leftovers: `azure-foundry-models.json` (runtime cache), `valar-dynamic.ts` (personal provider), and `herdr-agent-state.ts` (Herdr-managed) under extensions; `reports/session-audit.log` and the `.gitignore` that hides it under skills; and the 22 upstream Matt Pocock skill directories named in the repo's `.gitignore`. Anything else listed there is real drift.

7. Run the extension test suites if any `.ts`/`.mjs`/`.mts`/`.json` under `pi/extensions` changed:
   ```bash
   cd ~/.pi/agent/extensions
   node model-router.test.mts
   node azure-model-specs.test.mjs
   node azure-stream-result.test.mjs
   node azure-reasoning-effort.test.mjs
   node lifecycle-guards/lifecycle-guards.test.mjs
   ```
   191 checks total. Node >= 23.6 for TypeScript type stripping.

8. If the repo side gained files, they are uncommitted changes in the working tree. Show `git -C ~/my-agent-config status --short`, and leave committing to the user.

Never sync these, and never copy them to the repo if asked to: `auth.json`, `trust.json`, `models-store.json` (machine state), `~/.pi/azure-foundry.config.json`, or anything matching a `.gitignore` entry.

Always explain what you're about to do before doing it. The user should stay in control at every step.
