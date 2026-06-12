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

created=0
updated=0
unchanged=0
removed=0
skipped=0

# Track which source-command-* skills we expect, so we can prune orphans.
expected=()

mkdir -p "$AGENTS_SKILLS"

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
    skill_file="$skill_dir/SKILL.md"
    expected+=("$skill_name")
    body="$(strip_frontmatter "$cmd_file")"

    new_content="$(
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
    )"

    if [ -f "$skill_file" ] && [ "$(cat "$skill_file")" = "$new_content" ]; then
        ((unchanged++))
    elif [ -f "$skill_file" ]; then
        printf '%s\n' "$new_content" > "$skill_file"
        echo "  updated $skill_name"
        ((updated++))
    else
        mkdir -p "$skill_dir"
        printf '%s\n' "$new_content" > "$skill_file"
        echo "  created $skill_name"
        ((created++))
    fi
done

# Prune orphaned source-command-* skills whose command no longer exists.
for existing in "$AGENTS_SKILLS"/source-command-*/; do
    [ -d "$existing" ] || continue
    existing_name="$(basename "$existing")"
    keep=false
    for e in "${expected[@]}"; do
        [ "$e" = "$existing_name" ] && { keep=true; break; }
    done
    if ! $keep; then
        rm -rf "$existing"
        echo "  removed $existing_name (command deleted)"
        ((removed++))
    fi
done

echo "  created: $created  updated: $updated  unchanged: $unchanged  removed: $removed  skipped: $skipped  -> $AGENTS_SKILLS"
