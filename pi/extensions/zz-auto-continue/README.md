# zz-auto-continue Extension

Automatically continues the agent after any non-retrying compaction, so you
never have to type "continue" when context is compacted mid-run.

## Why

Pi has two compaction triggers:

| Trigger | `willRetry` | Auto-continues? |
|---|---|---|
| **Overflow** (LLM context overflow error) | `true` (error-based) / `false` (silent, e.g. z.ai) | Error-based: yes (one retry). Silent: **no** |
| **Threshold** (`contextTokens > contextWindow - reserveTokens`) | always `false` | **no** — session stops, user must type "continue" |

Threshold compaction fires after `agent_end`. `_runAutoCompaction` returns
`agent.hasQueuedMessages()`; with nothing queued → `false` → the agent loop
ends → session idle. The Pi authors left this case on the table because the
assistant's response completed (`stopReason="stop"`) and there's no pending
user prompt to continue from.

This extension closes that gap by queueing a follow-up continuation message
for every non-retrying compaction.

## How it works

1. `session_compact` event fires inside `_runAutoCompaction`, while the agent
   run is still active.
2. The extension calls
   `pi.sendMessage(..., { triggerTurn: true, deliverAs: "followUp" })`.
3. Because `isStreaming === true`, `sendCustomMessage` takes the `followUp`
   path → `agent.followUp(msg)` → enqueues to `followUpQueue`.
4. `_runAutoCompaction` returns `agent.hasQueuedMessages()` → **true**.
5. The agent loop calls `agent.continue()` → drains `followUpQueue` → a new
   turn runs with the compacted context.

## Load order (the `zz-` prefix)

Extensions load in directory-name order:

```
plan-mode/        ← loads first, handles plan-mode execution sessions
zz-auto-continue/ ← loads second, handles everything else
```

In plan-mode **execution** sessions: `plan-mode` queues a plan-specific resume
message first. `zz-auto-continue` sees `ctx.hasPendingMessages() === true` and
skips. No double-queuing.

In plan-mode **planning** sessions (not executing): `plan-mode` persists state
but does NOT queue a resume message. `zz-auto-continue` handles the
continuation (same as non-plan-mode sessions).

In non-plan-mode sessions: `plan-mode` returns early (not enabled).
`zz-auto-continue` handles it.

## Circuit breaker

To prevent infinite compaction→continue→tool-calls→compact loops, the
extension caps auto-continues at **5 per user-initiated prompt**. The counter
resets on `before_agent_start` (which only fires for user-initiated turns, not
for `agent.continue()` / followUp turns). When the cap is hit, the user gets a
warning notification and must continue manually.

## Skips

- **Error-based overflow** (`reason="overflow", willRetry=true`): Pi already
  auto-retries. The extension skips to avoid a double-continue.
- **Plan-mode execution sessions**: `plan-mode` already queues a plan-specific
  resume message. `hasPendingMessages()` is true → this extension skips. (In
  plan-mode *planning* sessions, plan-mode does NOT queue a resume, so this
  extension handles it — same as non-plan-mode.)

## Settings

No settings changes. `reserveTokens`, `keepRecentTokens`, and `retry.enabled`
are left at their current defaults. This extension is the safety net for
overflow that escapes threshold compaction (e.g. silent overflow on z.ai /
GLM-5.2).
