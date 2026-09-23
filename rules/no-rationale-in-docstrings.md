Module/file-level docstrings and header comments should describe what the code does, not the reasoning trail behind why it was built that way.

When a task is scoped through conversation (e.g. "handle these three edge cases because X, Y, Z"), that reasoning belongs in the conversation, the commit message, or a design doc — not copied verbatim into the docstring. A docstring that accumulates every justification, rejected alternative, and edge-case rationale from the instructions that produced it grows into a wall of text that's expensive to keep in sync with the code and hard to skim.

Keep in a module docstring:
- What the module does
- Non-obvious operational facts a caller needs (run commands, required env vars, status/return value meanings)
- A short pointer to a design doc (e.g. `docs/plan.md Phase 4`) instead of inlining that doc's content

Cut from a module docstring:
- "Why" narrative explaining a design decision (belongs in a commit message or `docs/decisions.md`)
- Enumeration of edge cases considered and rejected, with justification for each
- Worked examples of specific inputs that motivated a rule (e.g. "AXP the operator vs. American Express's ticker AXP")
- Restating what a referenced module already documents

**How to apply:** After writing or editing a module docstring, read it back and ask "does this sentence tell the reader what the code does, or is it defending a decision?" Defenses get cut or moved to `docs/decisions.md`. Applies to Python module docstrings, file-header comments in any language, and README module-level blurbs — not to inline comments explaining a genuinely non-obvious invariant (see [[no-ai-slop]], which already covers that case).
