#!/usr/bin/env bash
# Pure helpers for model-router.sh. Sourced, not executed directly.
#
# sanitize_prompt <text> -> redacted, length-capped copy of <text> on stdout.
# Redaction is best-effort regex matching (tokens, emails, absolute paths,
# IPv4) — it is not a security boundary, only a reduction in what leaves the
# machine before classification.
# build_recommendation <tier> <confidence> -> systemMessage text, or empty
# (rc 1) if <tier> is not one of haiku/sonnet/opus.

MODEL_ROUTER_MAX_CHARS=4000

redact_tokens() {
  sed -E \
    -e 's/\b(sk|ghp|gho|ghu|ghs|ghr)-[A-Za-z0-9_-]{10,}\b/[REDACTED_TOKEN]/g' \
    -e 's/\bAKIA[0-9A-Z]{16}\b/[REDACTED_TOKEN]/g' \
    -e 's/\bAIza[0-9A-Za-z_-]{35}\b/[REDACTED_TOKEN]/g' \
    -e 's/\bxox[baprs]-[A-Za-z0-9-]+\b/[REDACTED_TOKEN]/g' \
    -e 's/[Bb]earer +[A-Za-z0-9._-]+/[REDACTED_TOKEN]/g' \
    -e 's/\b[A-Za-z0-9_-]{32,}\b/[REDACTED_TOKEN]/g'
}

redact_emails() {
  sed -E 's/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/[REDACTED_EMAIL]/g'
}

redact_paths() {
  sed -E \
    -e 's#/(home|Users|root)/[A-Za-z0-9_.-]+(/[A-Za-z0-9_.-]+)*#[REDACTED_PATH]#g' \
    -e 's#[A-Za-z]:[\\/][A-Za-z0-9_. \\/-]+#[REDACTED_PATH]#g'
}

redact_ips() {
  sed -E 's/\b([0-9]{1,3}\.){3}[0-9]{1,3}\b/[REDACTED_IP]/g'
}

sanitize_prompt() {
  local text
  text="$(printf '%s' "$1" | redact_tokens | redact_emails | redact_paths | redact_ips)"
  printf '%s' "${text:0:$MODEL_ROUTER_MAX_CHARS}"
}

build_recommendation() {
  local tier="$1" confidence="$2"
  case "$tier" in
    haiku|sonnet|opus) ;;
    *) return 1 ;;
  esac
  printf 'Model Router (TypeSafe/Jev): this looks like %s-tier work (confidence %s). Run `/model %s` if you want to match — this is only a suggestion, nothing was switched automatically.' \
    "$tier" "$confidence" "$tier"
}
