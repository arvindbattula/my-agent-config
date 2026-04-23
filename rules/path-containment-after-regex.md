When a regex gates a filesystem path parameter, the regex alone is not enough. Character-class patterns like `[^/\s]+` permit `.` — so `..`, `./foo`, `foo/..`, `.hidden/x` all pass, and `path.join(root, userPath)` can escape the root.

Always pair the regex with two more gates:

1. **Segment-content check** at the tool boundary: reject any segment that equals `.`, equals `..`, or starts with `.` (unless `.`-prefixed files are a deliberate supported case). This surfaces the failure pointing at the offending input, not the resolved path.

2. **Post-resolve containment check** against the expected root. Resolve both sides, then use `path.relative`: reject if the result starts with `..` or is absolute. Use empty string (`candidate === root`) to explicitly decide whether the root itself is a permitted target. Prefer this over `startsWith(root + sep)` — `path.relative` handles the root-equals-candidate and trailing-separator edge cases for you, and on Windows you should also lowercase both paths (or use the official containment helper) because the filesystem is case-insensitive but string compare is not.

This is the authoritative **lexical** gate. It does not follow symlinks: a symlink planted inside `root` pointing outside (e.g., to `/etc`) passes the lexical check but escapes at access time. If your threat model includes attacker-controlled filesystem state under `root`, also `fs.realpath` both paths before applying the same containment check — and document explicitly whether symlinks within `root` are trusted.

The regex gate tells the caller what shape is accepted. The containment gate tells the filesystem what scope is allowed. They are different contracts; you need both.

Applies to any code that takes a user-supplied, LLM-emitted, or config-supplied path fragment and joins it to a trusted root — tool handlers, API endpoints reading files by name, template loaders, asset servers.
