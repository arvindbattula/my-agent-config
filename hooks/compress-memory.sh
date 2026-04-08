#!/bin/bash
# Claude Code PostToolUse hook: compress natural language in memory files.
# Triggered after Write tool. Preserves frontmatter, code blocks, inline code,
# URLs, file paths, headings, and tables. Only removes filler words and
# shortens verbose phrases in prose sections.

# Never block Claude — exit 0 on any failure
trap 'exit 0' ERR

# Read hook payload from stdin
INPUT=$(cat)

# Extract file path from tool input
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty' 2>/dev/null)

# Guard: need a file path
[ -z "$FILE_PATH" ] && exit 0

# Guard: must be a memory markdown file (not the MEMORY.md index)
case "$FILE_PATH" in
    */memory/*.md) ;;
    *) exit 0 ;;
esac
case "$FILE_PATH" in
    */MEMORY.md) exit 0 ;;
esac

# Guard: file must exist and be non-empty
[ -s "$FILE_PATH" ] || exit 0

# Run compression
python3 - "$FILE_PATH" << 'COMPRESS_PY'
import sys
import re
import os
import shutil


FILLER_WORDS = [
    'just', 'really', 'basically', 'actually', 'simply',
    'essentially', 'obviously', 'clearly', 'certainly',
    'definitely', 'merely', 'quite',
]

PHRASE_REPLACEMENTS = [
    (r'\bin order to\b', 'to'),
    (r'\bdue to the fact that\b', 'because'),
    (r'\bfor the purpose of\b', 'for'),
    (r'\bwhether or not\b', 'whether'),
    (r'\bin the event that\b', 'if'),
    (r'\bat this point in time\b', 'now'),
    (r'\bhas the ability to\b', 'can'),
    (r'\bis able to\b', 'can'),
    (r'\bis not able to\b', 'cannot'),
    (r'\ba large number of\b', 'many'),
    (r'\bas a result of\b', 'from'),
    (r'\bwith regard to\b', 'regarding'),
    (r'\bin addition to\b', 'besides'),
    (r'\bthe reason is that\b', 'because'),
    (r'\bmake sure that\b', 'ensure'),
    (r'\bit is important to note that\s*', 'note: '),
    (r'\bit should be noted that\s*', 'note: '),
    (r'\bin spite of\b', 'despite'),
    (r'\bat the present time\b', 'now'),
    (r'\bprior to\b', 'before'),
    (r'\bsubsequent to\b', 'after'),
    (r'\bin close proximity to\b', 'near'),
    (r'\bon a regular basis\b', 'regularly'),
    (r'\bfor the most part\b', 'mostly'),
    (r'\ba wide variety of\b', 'various'),
    (r'\bin the process of\b', 'currently'),
    (r'\btake into consideration\b', 'consider'),
    (r'\bgive consideration to\b', 'consider'),
    (r'\bhas a tendency to\b', 'tends to'),
    (r'\bin the near future\b', 'soon'),
    (r'\bat the end of the day\b', 'ultimately'),
    (r'\bon the other hand\b', 'however'),
]

# Regex to match spans that must not be compressed
PROTECTED_SPAN = re.compile(
    r'(`[^`]+`'                    # inline code
    r'|```[\s\S]*?```'             # fenced code blocks (shouldn't appear mid-line, but safe)
    r'|https?://\S+'              # URLs
    r'|\b\w+://\S+'              # other protocol URLs
    r'|(?:~/|/[\w])[\w/.\-@:]+)' # file paths
)


def main():
    filepath = sys.argv[1]

    with open(filepath, 'r') as f:
        original = f.read()

    if not original.strip():
        return

    compressed = compress_file(original)

    # Skip if nothing changed
    if compressed.rstrip('\n') == original.rstrip('\n'):
        return

    # Validate before writing
    validate(original, compressed)

    # Backup, write, verify
    backup = filepath + '.bak'
    shutil.copy2(filepath, backup)
    try:
        with open(filepath, 'w') as f:
            f.write(compressed)
        os.remove(backup)
    except Exception:
        if os.path.exists(backup):
            shutil.copy2(backup, filepath)
            os.remove(backup)
        raise


def compress_file(content):
    lines = content.split('\n')
    result = []
    in_frontmatter = False
    fm_delims = 0
    in_code_block = False

    for line in lines:
        stripped = line.strip()

        # Frontmatter delimiters
        if stripped == '---' and not in_code_block:
            fm_delims += 1
            in_frontmatter = (fm_delims % 2 == 1)
            result.append(line)
            continue

        # Preserve: frontmatter content
        if in_frontmatter:
            result.append(line)
            continue

        # Code block delimiters
        if stripped.startswith('```'):
            in_code_block = not in_code_block
            result.append(line)
            continue

        # Preserve: code block content
        if in_code_block:
            result.append(line)
            continue

        # Preserve: headings, tables, blank lines, HTML comments
        if (stripped.startswith('#') or stripped.startswith('|')
                or stripped == '' or stripped.startswith('<!--')):
            result.append(line)
            continue

        # Compress this prose line
        result.append(compress_line(line))

    return '\n'.join(result)


def compress_line(line):
    parts = PROTECTED_SPAN.split(line)
    if len(parts) == 1:
        return compress_prose(line)

    result = []
    for part in parts:
        if PROTECTED_SPAN.match(part):
            result.append(part)
        else:
            result.append(compress_prose(part))
    return ''.join(result)


def compress_prose(text):
    if not text.strip():
        return text

    for filler in FILLER_WORDS:
        text = re.sub(rf'\b{filler}\s+', '', text, flags=re.IGNORECASE)

    for pattern, repl in PHRASE_REPLACEMENTS:
        text = re.sub(pattern, repl, text, flags=re.IGNORECASE)

    # Clean artifacts from removals
    text = re.sub(r'  +', ' ', text)
    # Only strip space before punctuation when it's real punctuation
    # (followed by whitespace or end of string), not dotfiles like .gitignore
    text = re.sub(r'\s+([.,;:!?])(?=\s|$)', r'\1', text)

    return text


def validate(original, compressed):
    """Abort if compression corrupted any structured content."""
    # Frontmatter must be identical
    orig_fm = extract_frontmatter(original)
    comp_fm = extract_frontmatter(compressed)
    if orig_fm != comp_fm:
        raise ValueError('Frontmatter corrupted')

    # Code blocks must be identical
    orig_blocks = re.findall(r'```.*?```', original, re.DOTALL)
    comp_blocks = re.findall(r'```.*?```', compressed, re.DOTALL)
    if orig_blocks != comp_blocks:
        raise ValueError('Code blocks corrupted')

    # Strip code fences before checking inline patterns — raw backtick
    # regex gets confused by triple-backtick boundaries
    orig_stripped = re.sub(r'```.*?```', '', original, flags=re.DOTALL)
    comp_stripped = re.sub(r'```.*?```', '', compressed, flags=re.DOTALL)

    # Inline code must be identical
    orig_inline = re.findall(r'`[^`]+`', orig_stripped)
    comp_inline = re.findall(r'`[^`]+`', comp_stripped)
    if orig_inline != comp_inline:
        raise ValueError('Inline code corrupted')

    # URLs must be identical
    orig_urls = re.findall(r'https?://\S+', orig_stripped)
    comp_urls = re.findall(r'https?://\S+', comp_stripped)
    if orig_urls != comp_urls:
        raise ValueError('URLs corrupted')

    # Headings must be identical
    orig_h = [l for l in original.split('\n') if l.strip().startswith('#')]
    comp_h = [l for l in compressed.split('\n') if l.strip().startswith('#')]
    if orig_h != comp_h:
        raise ValueError('Headings corrupted')

    # Line count should not decrease dramatically (sanity check)
    orig_lines = len(original.split('\n'))
    comp_lines = len(compressed.split('\n'))
    if comp_lines < orig_lines * 0.5:
        raise ValueError('Too many lines removed')


def extract_frontmatter(text):
    m = re.match(r'^(---\n.*?\n---)\n', text, re.DOTALL)
    return m.group(1) if m else ''


if __name__ == '__main__':
    main()
COMPRESS_PY

exit 0
