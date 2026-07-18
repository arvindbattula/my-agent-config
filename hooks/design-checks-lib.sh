#!/usr/bin/env bash
# Shared design anti-pattern checks. Sourced by both:
#   - design-antipattern-check.sh   (PostToolUse — warn + gate state)
#   - design-antipattern-prevent.sh  (PreToolUse — block before disk)
#
# Exposes: check_design_patterns <file_path>
# Outputs warnings to stdout (one per line, ⚠ prefixed).
# Returns 0 always — caller decides enforcement (warn vs block).

check_design_patterns() {
    local file="$1"
    local warnings=""

    # --- Font anti-patterns ---
    if grep -qiE 'font-family[^;]*\bInter\b' "$file" 2>/dev/null; then
        warnings+="⚠ DESIGN: Inter font detected — it's the most overused AI default. Pick a distinctive font for this project's brand.\n"
    fi
    if grep -qiE 'font-family[^;]*\bRoboto\b' "$file" 2>/dev/null; then
        warnings+="⚠ DESIGN: Roboto font detected — generic AI default. Choose a font that reflects the brand personality.\n"
    fi
    if grep -qiE 'font-family[^;]*\bOpen Sans\b' "$file" 2>/dev/null; then
        warnings+="⚠ DESIGN: Open Sans detected — invisible default. Choose a font with personality.\n"
    fi

    # --- Color anti-patterns ---
    if grep -qE '#000000|#000[^0-9a-fA-F]|: *#000 *;|: *#000 *$' "$file" 2>/dev/null; then
        warnings+="⚠ DESIGN: Pure black (#000) detected — use tinted neutrals instead. Pure black doesn't exist in nature.\n"
    fi
    if grep -qE '#ffffff|#fff[^0-9a-fA-F]|: *#fff *;|: *#fff *$' "$file" 2>/dev/null; then
        warnings+="⚠ DESIGN: Pure white (#fff) detected — use tinted neutrals instead.\n"
    fi
    if grep -qiE 'hsl\(' "$file" 2>/dev/null; then
        warnings+="⚠ DESIGN: HSL color detected — prefer OKLCH for perceptually uniform colors.\n"
    fi

    # --- Purple gradient (AI signature) ---
    if grep -qiE 'linear-gradient.*purple|linear-gradient.*#[89a-f][0-9a-f][0-9a-f][0-9a-f]ff|linear-gradient.*violet|linear-gradient.*indigo' "$file" 2>/dev/null; then
        warnings+="⚠ DESIGN: Purple/violet gradient detected — this is the #1 AI aesthetic tell. Use the project's actual brand colors.\n"
    fi

    # --- Side-stripe borders (BAN 1) ---
    if grep -qE 'border-left: *[3-9]px|border-left: *[1-9][0-9]+px|border-right: *[3-9]px|border-right: *[1-9][0-9]+px' "$file" 2>/dev/null; then
        warnings+="⚠ DESIGN: Side-stripe border (>1px) detected — this is a banned AI pattern. Use background tints, full borders, or no indicator instead.\n"
    fi

    # --- Gradient text (BAN 2) ---
    if grep -qE 'background-clip: *text|-webkit-background-clip: *text' "$file" 2>/dev/null; then
        if grep -qE 'linear-gradient|radial-gradient|conic-gradient' "$file" 2>/dev/null; then
            warnings+="⚠ DESIGN: Gradient text detected — this is a banned AI pattern. Use a solid color for text emphasis.\n"
        fi
    fi

    # --- Output warnings (trim trailing newline) ---
    if [[ -n "$warnings" ]]; then
        echo -e "$warnings" | sed '/^$/d'
    fi
}
