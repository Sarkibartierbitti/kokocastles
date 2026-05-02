#!/usr/bin/env bash
# PreToolUse gate for Write|Edit|MultiEdit|NotebookEdit.
# Blocks edits ONLY when a plan was just approved and the user has not yet
# typed an explicit go-keyword. Normal (non-plan-mode) editing is unaffected.

set -u
FLAG="${CLAUDE_PROJECT_DIR:-.}/.claude/.plan-approved"

# Not in post-plan state → allow.
[ -f "$FLAG" ] || exit 0

INPUT="$(cat || true)"
TRANSCRIPT=""
if command -v jq >/dev/null 2>&1; then
  TRANSCRIPT="$(printf '%s' "$INPUT" | jq -r '.transcript_path // empty' 2>/dev/null || true)"
fi

# Can't read transcript → fail open (avoid wedging the session).
if [ -z "$TRANSCRIPT" ] || [ ! -r "$TRANSCRIPT" ]; then
  rm -f "$FLAG"
  exit 0
fi

LAST_USER="$(jq -rs '[.[] | select(.type=="user") | .message.content] | last
  | if type=="array" then map(select(.type=="text") | .text) | join(" ") else . end' "$TRANSCRIPT" 2>/dev/null || echo "")"

# Match whole-word go-keywords case-insensitive. Multi-word phrases handled separately.
if printf '%s' "$LAST_USER" | grep -qiE '(\bbuild\b|\bimplement\b|\bgo\b|\bexecute\b|\bproceed\b|\bapprove\b|\byes\b|ship it|run it|do it)'; then
  rm -f "$FLAG"
  exit 0
fi

cat >&2 <<EOF
🚧 Plan approved but no explicit go command in last user message.
   Reply with one of: build / implement / go / execute / ship it / do it / proceed / yes
   to authorize file edits. Read-only actions remain allowed.
EOF
exit 2
