---
name: sync
description: Run install.sh to sync repo and ~/.claude/
---

Run the install.sh script from the my-agent-config repo to compare the repo and ~/.claude/ directory.

1. First, find the my-agent-config repo. Check these locations in order:
   - Look for a directory containing `install.sh` and a `skills/` directory in common locations: `~/Documents/Analytics/git/my-agent-config`, `~/Developer/my-agent-config`, `~/my-agent-config`
   - If not found, ask the user where it is

2. Run `./install.sh --status` from the repo directory and read the output

3. Explain the results in plain language:
   - Which items are in sync
   - Which items differ (and what the likely reason is — local edit? remote update?)
   - Which items are only on one side

4. If there are differences, ask the user what they'd like to do about each one:
   - Copy repo version to local
   - Copy local version to repo
   - Show the diff first
   - Skip

5. Execute the user's decisions by running the appropriate install.sh commands or file copies

6. If the user wants to commit and push changes to the repo, help with that too

Always explain what you're about to do before doing it. The user should feel in control at every step.
