Don't add comments that describe obvious code. Don't add defensive checks on trusted internal code paths. Don't cast to `any` to avoid type issues. Match the style of the existing file.

Don't write comments that describe intent the code doesn't implement. If the comment describes a branch the conditional doesn't have, either fix the code or delete the aspirational clause — a lying comment is worse than no comment, because the next reader (including you) trusts it and skips verification.
