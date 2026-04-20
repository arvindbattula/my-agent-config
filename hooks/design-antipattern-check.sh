#!/usr/bin/env bash
# PostToolUse hook: detect design anti-patterns in frontend files after Edit/Write.
# Outputs warnings that Claude sees inline. No installs required — grep only.

set -uo pipefail
trap 'exit 0' ERR

# Read hook payload from stdin
INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty' 2>/dev/null)

# Guard: need a file path
[ -z "$FILE_PATH" ] && exit 0

# Only check frontend files
case "$FILE_PATH" in
  *.tsx|*.jsx|*.css|*.html|*.vue|*.svelte) ;;
  *) exit 0 ;;
esac

# Skip if file doesn't exist (deleted)
[[ -f "$FILE_PATH" ]] || exit 0

WARNINGS=""

# --- Font anti-patterns ---
if grep -qiE 'font-family[^;]*\bInter\b' "$FILE_PATH" 2>/dev/null; then
  WARNINGS+="⚠ DESIGN: Inter font detected — it's the most overused AI default. Pick a distinctive font for this project's brand.\n"
fi
if grep -qiE 'font-family[^;]*\bRoboto\b' "$FILE_PATH" 2>/dev/null; then
  WARNINGS+="⚠ DESIGN: Roboto font detected — generic AI default. Choose a font that reflects the brand personality.\n"
fi
if grep -qiE 'font-family[^;]*\bOpen Sans\b' "$FILE_PATH" 2>/dev/null; then
  WARNINGS+="⚠ DESIGN: Open Sans detected — invisible default. Choose a font with personality.\n"
fi

# --- Color anti-patterns ---
if grep -qE '#000000|#000[^0-9a-fA-F]|: *#000 *;|: *#000 *$' "$FILE_PATH" 2>/dev/null; then
  WARNINGS+="⚠ DESIGN: Pure black (#000) detected — use tinted neutrals instead. Pure black doesn't exist in nature.\n"
fi
if grep -qE '#ffffff|#fff[^0-9a-fA-F]|: *#fff *;|: *#fff *$' "$FILE_PATH" 2>/dev/null; then
  WARNINGS+="⚠ DESIGN: Pure white (#fff) detected — use tinted neutrals instead.\n"
fi
if grep -qiE 'hsl\(' "$FILE_PATH" 2>/dev/null; then
  WARNINGS+="⚠ DESIGN: HSL color detected — prefer OKLCH for perceptually uniform colors.\n"
fi

# --- Purple gradient (AI signature) ---
if grep -qiE 'linear-gradient.*purple|linear-gradient.*#[89a-f][0-9a-f][0-9a-f][0-9a-f]ff|linear-gradient.*violet|linear-gradient.*indigo' "$FILE_PATH" 2>/dev/null; then
  WARNINGS+="⚠ DESIGN: Purple/violet gradient detected — this is the #1 AI aesthetic tell. Use the project's actual brand colors.\n"
fi

# --- Side-stripe borders (BAN 1) ---
if grep -qE 'border-left: *[3-9]px|border-left: *[1-9][0-9]+px|border-right: *[3-9]px|border-right: *[1-9][0-9]+px' "$FILE_PATH" 2>/dev/null; then
  WARNINGS+="⚠ DESIGN: Side-stripe border (>1px) detected — this is a banned AI pattern. Use background tints, full borders, or no indicator instead.\n"
fi

# --- Gradient text (BAN 2) ---
if grep -qE 'background-clip: *text|-webkit-background-clip: *text' "$FILE_PATH" 2>/dev/null; then
  if grep -qE 'linear-gradient|radial-gradient|conic-gradient' "$FILE_PATH" 2>/dev/null; then
    WARNINGS+="⚠ DESIGN: Gradient text detected — this is a banned AI pattern. Use a solid color for text emphasis.\n"
  fi
fi

# --- Output warnings ---
if [[ -n "$WARNINGS" ]]; then
  echo -e "$WARNINGS"
fi
