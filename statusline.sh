#!/bin/bash
input=$(cat)

MODEL=$(echo "$input" | jq -r '.model.display_name // "?"')
DIR=$(echo "$input" | jq -r '.workspace.current_dir // .cwd // "."')
COST=$(echo "$input" | jq -r '.cost.total_cost_usd // 0')
DURATION_MS=$(echo "$input" | jq -r '.cost.total_duration_ms // 0')
EFFORT=$(echo "$input" | jq -r '.effort.level // ""')
RL5=$(echo "$input" | jq -r '.rate_limits.five_hour.used_percentage // empty')
RL7=$(echo "$input" | jq -r '.rate_limits.seven_day.used_percentage // empty')

# Context usage from the real schema: (input + output) / window size.
read -r USED PCT <<EOF
$(echo "$input" | jq -r '
  .context_window as $c
  | (($c.total_input_tokens // 0) + ($c.total_output_tokens // 0)) as $used
  | ($c.context_window_size // 200000) as $size
  | "\($used) \(if $size > 0 then ($used * 100 / $size | floor) else 0 end)"')
EOF

CYAN='\033[36m'; GREEN='\033[32m'; YELLOW='\033[33m'; RED='\033[31m'
MAGENTA='\033[35m'; GRAY='\033[0;90m'; RESET='\033[0m'

if [ "$PCT" -ge 90 ]; then BAR_COLOR="$RED"
elif [ "$PCT" -ge 70 ]; then BAR_COLOR="$YELLOW"
else BAR_COLOR="$GREEN"; fi

# Clamp bar to 10 cells even if PCT exceeds 100.
FILLED=$((PCT / 10)); [ "$FILLED" -gt 10 ] && FILLED=10
EMPTY=$((10 - FILLED))
printf -v FILL "%${FILLED}s"; printf -v PAD "%${EMPTY}s"
BAR="${FILL// /█}${PAD// /░}"

MINS=$((DURATION_MS / 60000)); SECS=$(((DURATION_MS % 60000) / 1000))

PARENT=$(basename "$(dirname "$DIR")")
BASE=$(basename "$DIR")
if [ "$PARENT" = "/" ] || [ "$PARENT" = "." ]; then DIR_NAME="$BASE"; else DIR_NAME="$PARENT/$BASE"; fi

BRANCH=""
if git -C "$DIR" rev-parse --is-inside-work-tree > /dev/null 2>&1; then
    BRANCH_NAME=$(git -C "$DIR" branch --show-current 2>/dev/null || echo "detached")
    STATUS_OUTPUT=$(git -C "$DIR" status --porcelain 2>/dev/null)
    if [ -n "$STATUS_OUTPUT" ]; then
        TOTAL_FILES=$(echo "$STATUS_OUTPUT" | wc -l | xargs)
        LINE_STATS=$(git -C "$DIR" diff --numstat HEAD 2>/dev/null | awk '{added+=$1; removed+=$2} END {print added+0, removed+0}')
        ADDED=$(echo "$LINE_STATS" | cut -d' ' -f1)
        REMOVED=$(echo "$LINE_STATS" | cut -d' ' -f2)
        BRANCH=" | ${YELLOW}(${BRANCH_NAME}${RESET} ${YELLOW}|${RESET} ${GRAY}${TOTAL_FILES} files${RESET}"
        [ "$ADDED" -gt 0 ] && BRANCH="${BRANCH} ${GREEN}+${ADDED}${RESET}"
        [ "$REMOVED" -gt 0 ] && BRANCH="${BRANCH} ${RED}-${REMOVED}${RESET}"
        BRANCH="${BRANCH} ${YELLOW})${RESET}"
    else
        BRANCH=" | ${YELLOW}(${BRANCH_NAME})${RESET}"
    fi
fi

EFFORT_DISP=""
[ -n "$EFFORT" ] && EFFORT_DISP=" | ${MAGENTA}⚙ ${EFFORT}${RESET}"

# Rate limits: 5h / 7d usage windows.
RL_DISP=""
if [ -n "$RL5" ] || [ -n "$RL7" ]; then
    RL_DISP=" | ${GRAY}🔄 ${RL5:-0}%/5h · ${RL7:-0}%/7d${RESET}"
fi

echo -e "${CYAN}[$MODEL]${RESET} 📁 ${DIR_NAME}${BRANCH}${EFFORT_DISP}"
COST_FMT=$(printf '$%.2f' "$COST")
TOKENS_K=$(echo "$USED" | awk '{printf "%dk", $1/1000}')
echo -e "${BAR_COLOR}${BAR}${RESET} ${PCT}% ${GRAY}(${TOKENS_K})${RESET} | ${YELLOW}${COST_FMT}${RESET} | ⏱️ ${MINS}m ${SECS}s${RL_DISP}"
