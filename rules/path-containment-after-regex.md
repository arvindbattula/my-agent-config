When a regex gates a filesystem path parameter, the regex alone is not enough. Character-class patterns like `[^/\s]+` permit `.` — so `..`, `./foo`, `foo/..`, `.hidden/x` all pass, and `path.join(root, userPath)` can escape the root.

Always pair the regex with two more gates:

1. **Segment-content check** at the tool boundary: reject any segment that equals `.`, equals `..`, or starts with `.` (unless `.`-prefixed files are a deliberate supported case). This surfaces the failure pointing at the offending input, not the resolved path.

2. **Post-`path.resolve` containment check** against the expected root: `path.resolve(root, userPath).startsWith(path.resolve(root) + path.sep)`. This is the authoritative gate — the regex + segment check are optimization and error quality.

The regex gate tells the caller what shape is accepted. The containment gate tells the filesystem what scope is allowed. They are different contracts; you need both.

Applies to any code that takes a user-supplied, LLM-emitted, or config-supplied path fragment and joins it to a trusted root — tool handlers, API endpoints reading files by name, template loaders, asset servers.
