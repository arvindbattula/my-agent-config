#!/bin/bash
set -uo pipefail

# Resolve repo directory from script location
REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
CLAUDE_DIR="$HOME/.claude"
BACKUP_DIR="$CLAUDE_DIR/backups/$(date +%Y%m%d_%H%M%S)"

# Flags
DRY_RUN=false
FORCE=false
STATUS_ONLY=false

for arg in "$@"; do
    case "$arg" in
        --dry-run|-n) DRY_RUN=true ;;
        --force|-f) FORCE=true ;;
        --status|-s) STATUS_ONLY=true ;;
        --help|-h)
            echo "Usage: install.sh [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --status, -s    Show sync status only"
            echo "  --dry-run, -n   Preview changes without modifying anything"
            echo "  --force, -f     Sync without confirmation (for fresh machine setup)"
            echo "  --help, -h      Show this help"
            exit 0
            ;;
        *) echo "Unknown option: $arg"; exit 1 ;;
    esac
done

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
GRAY='\033[0;90m'
NC='\033[0m'
BOLD='\033[1m'

# Counters for summary
identical=0
repo_newer=0
local_newer=0
repo_only=0
local_only=0
actions_taken=0

# Compare two files by checksum. Returns:
#   "identical" - same content
#   "differs"   - both exist, different content
#   "repo_only" - only in repo
#   "local_only"- only in local
compare_file() {
    local repo_file="$1"
    local local_file="$2"

    if [ -f "$repo_file" ] && [ -f "$local_file" ]; then
        repo_hash=$(shasum -a 256 "$repo_file" | cut -d' ' -f1)
        local_hash=$(shasum -a 256 "$local_file" | cut -d' ' -f1)
        if [ "$repo_hash" = "$local_hash" ]; then
            echo "identical"
        else
            echo "differs"
        fi
    elif [ -f "$repo_file" ]; then
        echo "repo_only"
    elif [ -f "$local_file" ]; then
        echo "local_only"
    fi
}

# Compare two directories recursively by checksumming all files
# Uses relative paths so location doesn't affect the hash
compare_dir() {
    local repo_path="$1"
    local local_path="$2"

    if [ -d "$repo_path" ] && [ -d "$local_path" ]; then
        repo_hash=$(cd "$repo_path" && find . -type f | sort | xargs shasum -a 256 | shasum -a 256 | cut -d' ' -f1)
        local_hash=$(cd "$local_path" && find . -type f | sort | xargs shasum -a 256 | shasum -a 256 | cut -d' ' -f1)
        if [ "$repo_hash" = "$local_hash" ]; then
            echo "identical"
        else
            echo "differs"
        fi
    elif [ -d "$repo_path" ]; then
        echo "repo_only"
    elif [ -d "$local_path" ]; then
        echo "local_only"
    fi
}

backup_file() {
    local file="$1"
    if [ -f "$file" ] || [ -d "$file" ]; then
        mkdir -p "$BACKUP_DIR"
        cp -r "$file" "$BACKUP_DIR/"
    fi
}

print_header() {
    echo ""
    echo -e "${BOLD}$1${NC}"
    echo -e "${GRAY}$(printf '%.0s─' $(seq 1 40))${NC}"
}

# Ask user what to do about a diff. Returns: "repo", "local", "skip"
ask_action() {
    local name="$1"
    local status="$2"

    if $FORCE; then
        echo "repo"
        return
    fi

    if [ "$status" = "differs" ]; then
        echo -e "  ${YELLOW}~${NC} ${name} ${GRAY}(differs)${NC}" >&2
        read -p "    Use [r]epo / keep [l]ocal / show [d]iff / [s]kip? " choice
        case "$choice" in
            r|R) echo "repo" ;;
            l|L) echo "local" ;;
            d|D) echo "diff" ;;
            *) echo "skip" ;;
        esac
    elif [ "$status" = "repo_only" ]; then
        echo "repo"
    elif [ "$status" = "local_only" ]; then
        echo -e "  ${CYAN}+${NC} ${name} ${GRAY}(local only, not in repo)${NC}" >&2
        read -p "    Copy to [r]epo / [s]kip? " choice
        case "$choice" in
            r|R) echo "to_repo" ;;
            *) echo "skip" ;;
        esac
    fi
}

# ─── Status/Sync for directory-based items (skills) ───

sync_directories() {
    local type_name="$1"
    local repo_path="$2"
    local local_path="$3"

    print_header "$type_name"

    # Collect all names from both locations
    local all_names=()
    [ -d "$repo_path" ] && for d in "$repo_path"/*/; do
        [ -d "$d" ] && all_names+=("$(basename "$d")")
    done
    [ -d "$local_path" ] && for d in "$local_path"/*/; do
        [ -d "$d" ] && {
            name="$(basename "$d")"
            # Add only if not already in list
            if [[ ! " ${all_names[*]:-} " =~ " $name " ]]; then
                all_names+=("$name")
            fi
        }
    done

    # Sort names
    IFS=$'\n' sorted=($(sort <<<"${all_names[*]}")); unset IFS

    for name in "${sorted[@]}"; do
        local r="$repo_path/$name"
        local l="$local_path/$name"
        local status=$(compare_dir "$r" "$l")

        case "$status" in
            identical)
                echo -e "  ${GREEN}✓${NC} $name"
                ((identical++))
                ;;
            differs)
                if $STATUS_ONLY; then
                    echo -e "  ${YELLOW}~${NC} $name ${GRAY}(differs)${NC}"
                    ((local_newer++))
                else
                    action=$(ask_action "$name" "differs")
                    if [ "$action" = "repo" ]; then
                        if ! $DRY_RUN; then
                            backup_file "$l"
                            rm -rf "$l"
                            cp -r "$r" "$l"
                            ((actions_taken++))
                        fi
                        echo -e "    ${GREEN}→ copied repo to local${NC}$($DRY_RUN && echo " (dry-run)")"
                    elif [ "$action" = "local" ]; then
                        if ! $DRY_RUN; then
                            cp -r "$l" "$r"
                            ((actions_taken++))
                        fi
                        echo -e "    ${GREEN}→ copied local to repo${NC}$($DRY_RUN && echo " (dry-run)")"
                    elif [ "$action" = "diff" ]; then
                        diff -rq "$r" "$l" || true
                        # Re-ask after showing diff
                        read -p "    Use [r]epo / keep [l]ocal / [s]kip? " choice2
                        case "$choice2" in
                            r|R)
                                if ! $DRY_RUN; then
                                    backup_file "$l"
                                    rm -rf "$l"
                                    cp -r "$r" "$l"
                                    ((actions_taken++))
                                fi
                                echo -e "    ${GREEN}→ copied repo to local${NC}"
                                ;;
                            l|L)
                                if ! $DRY_RUN; then
                                    cp -r "$l" "$r"
                                    ((actions_taken++))
                                fi
                                echo -e "    ${GREEN}→ copied local to repo${NC}"
                                ;;
                            *) echo -e "    ${GRAY}→ skipped${NC}" ;;
                        esac
                    fi
                    ((local_newer++))
                fi
                ;;
            repo_only)
                if $STATUS_ONLY; then
                    echo -e "  ${BLUE}↓${NC} $name ${GRAY}(in repo, not local)${NC}"
                else
                    echo -e "  ${BLUE}↓${NC} $name ${GRAY}(copying to local)${NC}"
                    if ! $DRY_RUN; then
                        mkdir -p "$local_path"
                        cp -r "$r" "$l"
                        ((actions_taken++))
                    fi
                fi
                ((repo_only++))
                ;;
            local_only)
                if $STATUS_ONLY; then
                    echo -e "  ${CYAN}+${NC} $name ${GRAY}(local only)${NC}"
                else
                    action=$(ask_action "$name" "local_only")
                    if [ "$action" = "to_repo" ]; then
                        if ! $DRY_RUN; then
                            cp -r "$l" "$r"
                            ((actions_taken++))
                        fi
                        echo -e "    ${GREEN}→ copied to repo${NC}$($DRY_RUN && echo " (dry-run)")"
                    fi
                fi
                ((local_only++))
                ;;
        esac
    done
}

# ─── Status/Sync for file-based items (commands, rules) ───

sync_files() {
    local type_name="$1"
    local repo_path="$2"
    local local_path="$3"
    local pattern="${4:-*.md}"

    print_header "$type_name"

    local all_names=()
    [ -d "$repo_path" ] && for f in "$repo_path"/$pattern; do
        [ -f "$f" ] && all_names+=("$(basename "$f")")
    done
    [ -d "$local_path" ] && for f in "$local_path"/$pattern; do
        [ -f "$f" ] && {
            name="$(basename "$f")"
            if [[ ! " ${all_names[*]:-} " =~ " $name " ]]; then
                all_names+=("$name")
            fi
        }
    done

    IFS=$'\n' sorted=($(sort <<<"${all_names[*]}")); unset IFS

    for name in "${sorted[@]}"; do
        local r="$repo_path/$name"
        local l="$local_path/$name"
        local status=$(compare_file "$r" "$l")

        case "$status" in
            identical)
                echo -e "  ${GREEN}✓${NC} $name"
                ((identical++))
                ;;
            differs)
                if $STATUS_ONLY; then
                    echo -e "  ${YELLOW}~${NC} $name ${GRAY}(differs)${NC}"
                    ((local_newer++))
                else
                    action=$(ask_action "$name" "differs")
                    if [ "$action" = "repo" ]; then
                        if ! $DRY_RUN; then
                            backup_file "$l"
                            cp "$r" "$l"
                            ((actions_taken++))
                        fi
                        echo -e "    ${GREEN}→ copied repo to local${NC}$($DRY_RUN && echo " (dry-run)")"
                    elif [ "$action" = "local" ]; then
                        if ! $DRY_RUN; then
                            cp "$l" "$r"
                            ((actions_taken++))
                        fi
                        echo -e "    ${GREEN}→ copied local to repo${NC}$($DRY_RUN && echo " (dry-run)")"
                    elif [ "$action" = "diff" ]; then
                        diff "$r" "$l" || true
                        read -p "    Use [r]epo / keep [l]ocal / [s]kip? " choice2
                        case "$choice2" in
                            r|R)
                                if ! $DRY_RUN; then
                                    backup_file "$l"
                                    cp "$r" "$l"
                                    ((actions_taken++))
                                fi
                                echo -e "    ${GREEN}→ copied repo to local${NC}"
                                ;;
                            l|L)
                                if ! $DRY_RUN; then
                                    cp "$l" "$r"
                                    ((actions_taken++))
                                fi
                                echo -e "    ${GREEN}→ copied local to repo${NC}"
                                ;;
                            *) echo -e "    ${GRAY}→ skipped${NC}" ;;
                        esac
                    fi
                    ((local_newer++))
                fi
                ;;
            repo_only)
                if $STATUS_ONLY; then
                    echo -e "  ${BLUE}↓${NC} $name ${GRAY}(in repo, not local)${NC}"
                else
                    echo -e "  ${BLUE}↓${NC} $name ${GRAY}(copying to local)${NC}"
                    if ! $DRY_RUN; then
                        mkdir -p "$local_path"
                        cp "$r" "$l"
                        ((actions_taken++))
                    fi
                fi
                ((repo_only++))
                ;;
            local_only)
                if $STATUS_ONLY; then
                    echo -e "  ${CYAN}+${NC} $name ${GRAY}(local only)${NC}"
                else
                    action=$(ask_action "$name" "local_only")
                    if [ "$action" = "to_repo" ]; then
                        if ! $DRY_RUN; then
                            cp "$l" "$r"
                            ((actions_taken++))
                        fi
                        echo -e "    ${GREEN}→ copied to repo${NC}$($DRY_RUN && echo " (dry-run)")"
                    fi
                fi
                ((local_only++))
                ;;
        esac
    done
}

# ─── Sync single files (settings.json, statusline.sh) ───

sync_single_file() {
    local name="$1"
    local repo_file="$REPO_DIR/$name"
    local local_file="$CLAUDE_DIR/$name"

    local status=$(compare_file "$repo_file" "$local_file")

    case "$status" in
        identical)
            echo -e "  ${GREEN}✓${NC} $name"
            ((identical++))
            ;;
        differs)
            if $STATUS_ONLY; then
                echo -e "  ${YELLOW}~${NC} $name ${GRAY}(differs)${NC}"
                ((local_newer++))
            else
                action=$(ask_action "$name" "differs")
                if [ "$action" = "repo" ]; then
                    if ! $DRY_RUN; then
                        backup_file "$local_file"
                        cp "$repo_file" "$local_file"
                        ((actions_taken++))
                    fi
                    echo -e "    ${GREEN}→ copied repo to local${NC}$($DRY_RUN && echo " (dry-run)")"
                elif [ "$action" = "local" ]; then
                    if ! $DRY_RUN; then
                        cp "$local_file" "$repo_file"
                        ((actions_taken++))
                    fi
                    echo -e "    ${GREEN}→ copied local to repo${NC}$($DRY_RUN && echo " (dry-run)")"
                elif [ "$action" = "diff" ]; then
                    diff "$repo_file" "$local_file" || true
                    read -p "    Use [r]epo / keep [l]ocal / [s]kip? " choice2
                    case "$choice2" in
                        r|R)
                            if ! $DRY_RUN; then
                                backup_file "$local_file"
                                cp "$repo_file" "$local_file"
                                ((actions_taken++))
                            fi
                            echo -e "    ${GREEN}→ copied repo to local${NC}"
                            ;;
                        l|L)
                            if ! $DRY_RUN; then
                                cp "$local_file" "$repo_file"
                                ((actions_taken++))
                            fi
                            echo -e "    ${GREEN}→ copied local to repo${NC}"
                            ;;
                        *) echo -e "    ${GRAY}→ skipped${NC}" ;;
                    esac
                fi
                ((local_newer++))
            fi
            ;;
        repo_only)
            if $STATUS_ONLY; then
                echo -e "  ${BLUE}↓${NC} $name ${GRAY}(in repo, not local)${NC}"
            else
                echo -e "  ${BLUE}↓${NC} $name ${GRAY}(copying to local)${NC}"
                if ! $DRY_RUN; then
                    cp "$repo_file" "$local_file"
                    ((actions_taken++))
                fi
            fi
            ((repo_only++))
            ;;
        local_only)
            if $STATUS_ONLY; then
                echo -e "  ${CYAN}+${NC} $name ${GRAY}(local only)${NC}"
            else
                action=$(ask_action "$name" "local_only")
                if [ "$action" = "to_repo" ]; then
                    if ! $DRY_RUN; then
                        cp "$local_file" "$repo_file"
                        ((actions_taken++))
                    fi
                    echo -e "    ${GREEN}→ copied to repo${NC}$($DRY_RUN && echo " (dry-run)")"
                fi
            fi
            ((local_only++))
            ;;
    esac
}

# ─── Main ───

echo -e "${BOLD}my-agent-config sync${NC}"
echo -e "${GRAY}Repo: $REPO_DIR${NC}"
echo -e "${GRAY}Local: $CLAUDE_DIR${NC}"

if $DRY_RUN; then
    echo -e "${YELLOW}(dry-run mode — no changes will be made)${NC}"
fi

# Sync each category
sync_directories "Skills" "$REPO_DIR/skills" "$CLAUDE_DIR/skills"
sync_files "Commands" "$REPO_DIR/commands" "$CLAUDE_DIR/commands"
sync_files "Rules" "$REPO_DIR/rules" "$CLAUDE_DIR/rules"

print_header "Config Files"
sync_single_file "settings.json"
sync_single_file "statusline.sh"

sync_files "Hooks" "$REPO_DIR/hooks" "$CLAUDE_DIR/hooks" "*"
# Ensure hooks are executable after sync
if ! $DRY_RUN && ! $STATUS_ONLY && [ -d "$CLAUDE_DIR/hooks" ]; then
    chmod +x "$CLAUDE_DIR/hooks"/*.sh 2>/dev/null || true
fi

# Summary
echo ""
echo -e "${BOLD}Summary${NC}"
echo -e "${GRAY}$(printf '%.0s─' $(seq 1 40))${NC}"
echo -e "  ${GREEN}✓${NC} Identical: $identical"
[ $repo_only -gt 0 ] && echo -e "  ${BLUE}↓${NC} Repo only: $repo_only"
[ $local_only -gt 0 ] && echo -e "  ${CYAN}+${NC} Local only: $local_only"
[ $local_newer -gt 0 ] && echo -e "  ${YELLOW}~${NC} Differs: $local_newer"
if ! $STATUS_ONLY; then
    echo -e "  Actions taken: $actions_taken"
    if [ -d "$BACKUP_DIR" ]; then
        echo -e "  ${GRAY}Backups: $BACKUP_DIR${NC}"
    fi
fi
echo ""
