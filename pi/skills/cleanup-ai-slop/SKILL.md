---
name: "cleanup-ai-slop"
description: "Remove AI-generated slop from the current branch"
---

# cleanup-ai-slop


Check the diff against main, and remove all AI generated slop introduced in this branch.

This includes:
- Extra comments that a human wouldn't add or is inconsistent with the rest of the file
- Extra defensive checks or try/catch blocks that are abnormal for that area of the codebase (especially if called by trusted / validated codepaths)
- Casts to any to get around type issues
- Deeply nested code that should be simplified with early returns
- Any other style that is inconsistent with the file

Keep behavior unchanged unless fixing a clear bug. Prefer minimal, focused edits over broad rewrites.

Report at the end with only a 1-3 sentence summary of what you changed
