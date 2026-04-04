#!/bin/bash
input=$(cat)

MODEL=$(echo "$input" | jq -r '.model.display_name')
DIR=$(echo "$input" | jq -r '.workspace.current_dir')
COST=$(echo "$input" | jq -r '.cost.total_cost_usd // 0')
PCT=$(echo "$input" | jq -r '.context_window.used_percentage // 0' | cut -d. -f1)
DURATION_MS=$(echo "$input" | jq -r '.cost.total_duration_ms // 0')

CYAN='\033[36m'; GREEN='\033[32m'; YELLOW='\033[33m'; RED='\033[31m'; RESET='\033[0m'

if [ "$PCT" -ge 90 ]; then BAR_COLOR="$RED"
elif [ "$PCT" -ge 70 ]; then BAR_COLOR="$YELLOW"
else BAR_COLOR="$GREEN"; fi

FILLED=$((PCT / 10)); EMPTY=$((10 - FILLED))
printf -v FILL "%${FILLED}s"; printf -v PAD "%${EMPTY}s"
BAR="${FILL// /█}${PAD// /░}"

MINS=$((DURATION_MS / 60000)); SECS=$(((DURATION_MS % 60000) / 1000))

GRAY='\033[0;90m'

PARENT=$(basename "$(dirname "$DIR")")
BASE=$(basename "$DIR")
if [ "$PARENT" = "/" ] || [ "$PARENT" = "." ]; then
    DIR_NAME="$BASE"
else
    DIR_NAME="$PARENT/$BASE"
fi

BRANCH=""
if git -C "$DIR" rev-parse --is-inside-work-tree > /dev/null 2>&1; then
    BRANCH_NAME=$(git -C "$DIR" branch --show-current 2>/dev/null || echo "detached")
    STATUS_OUTPUT=$(git -C "$DIR" status --porcelain 2>/dev/null)
    if [ -n "$STATUS_OUTPUT" ]; then
        TOTAL_FILES=$(echo "$STATUS_OUTPUT" | wc -l | xargs)
        LINE_STATS=$(git -C "$DIR" diff --numstat HEAD 2>/dev/null | awk '{added+=$1; removed+=$2} END {print added+0, removed+0}')
        ADDED=$(echo $LINE_STATS | cut -d' ' -f1)
        REMOVED=$(echo $LINE_STATS | cut -d' ' -f2)
        BRANCH=" | ${YELLOW}(${BRANCH_NAME}${RESET} ${YELLOW}|${RESET} ${GRAY}${TOTAL_FILES} files${RESET}"
        [ "$ADDED" -gt 0 ] && BRANCH="${BRANCH} ${GREEN}+${ADDED}${RESET}"
        [ "$REMOVED" -gt 0 ] && BRANCH="${BRANCH} ${RED}-${REMOVED}${RESET}"
        BRANCH="${BRANCH} ${YELLOW})${RESET}"
    else
        BRANCH=" | ${YELLOW}(${BRANCH_NAME})${RESET}"
    fi
fi

echo -e "${CYAN}[$MODEL]${RESET} 📁 ${DIR_NAME}${BRANCH}"
COST_FMT=$(printf '$%.2f' "$COST")
echo -e "${BAR_COLOR}${BAR}${RESET} ${PCT}% | ${YELLOW}${COST_FMT}${RESET} | ⏱️ ${MINS}m ${SECS}s"
