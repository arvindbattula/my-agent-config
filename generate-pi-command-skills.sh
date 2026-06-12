#!/bin/bash
set -uo pipefail

# Generate pi skills from repo command files.
#
# pi has no "command" concept — only skills (dir/SKILL.md). This converts each
# commands/<name>.md into ~/.agents/skills/source-command-<name>/SKILL.md so the
# command's behavior is available to pi.
#
# name/description are pulled from each command file's own frontmatter.
# Re-run this whenever commands/ changes (install.sh calls it automatically).

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
AGENTS_SKILLS="$HOME/.agents/skills"
COMMANDS_DIR="$REPO_DIR/commands"

# Read a frontmatter field (name/description) from a command markdown file.
# Looks only inside the leading --- ... --- block.
read_frontmatter() {
    local file="$1" key="$2"
    awk -v key="$key" '
        NR==1 && $0!="---" { exit }
        NR==1 { infm=1; next }
        infm && $0=="---" { exit }
        infm && $0 ~ "^"key":" {
            sub("^"key":[ \t]*", "")
            print
            exit
        }
    ' "$file"
}

# Strip the leading frontmatter block, returning the command body.
strip_frontmatter() {
    awk '
        NR==1 && $0=="---" { infm=1; next }
        infm && $0=="---" { infm=0; next }
        !infm { print }
    ' "$1"
}

generated=0
skipped=0

for cmd_file in "$COMMANDS_DIR"/*.md; do
    [ -f "$cmd_file" ] || continue
    base="$(basename "$cmd_file" .md)"

    name="$(read_frontmatter "$cmd_file" name)"
    desc="$(read_frontmatter "$cmd_file" description)"

    if [ -z "$name" ] || [ -z "$desc" ]; then
        echo "  SKIP $base (missing name/description frontmatter)"
        ((skipped++))
        continue
    fi

    skill_name="source-command-$name"
    skill_dir="$AGENTS_SKILLS/$skill_name"
    body="$(strip_frontmatter "$cmd_file")"

    mkdir -p "$skill_dir"
    {
        echo "---"
        echo "name: \"$skill_name\""
        echo "description: \"$desc\""
        echo "---"
        echo ""
        echo "# $skill_name"
        echo ""
        echo "Skill generated from the \`$name\` command. Use when the user asks to run \`$name\` or describes its purpose."
        echo ""
        echo "$body"
    } > "$skill_dir/SKILL.md"

    ((generated++))
done

echo "  generated: $generated  skipped: $skipped  -> $AGENTS_SKILLS"
