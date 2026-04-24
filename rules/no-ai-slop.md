Don't add comments that describe obvious code. Don't add defensive checks on trusted internal code paths. Don't cast to `any` to avoid type issues. Match the style of the existing file.

Don't write comments that describe intent the code doesn't implement. If the comment describes a branch the conditional doesn't have, either fix the code or delete the aspirational clause — a lying comment is worse than no comment, because the next reader (including you) trusts it and skips verification.

Define jargon inline the first time it appears in a user-facing flow (e.g., "no-op" → "no-op (no change needed)", "idempotent" → "idempotent (safe to re-run)"). Prose that assumes the reader already shares your vocabulary forces them to stop and look it up, or worse, nod along without actually understanding.
