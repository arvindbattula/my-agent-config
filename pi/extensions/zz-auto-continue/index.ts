/**
 * zz-auto-continue Extension
 *
 * After any non-retrying compaction (threshold, silent overflow, manual), queue
 * a follow-up continuation message so the agent keeps going without the user
 * having to type "continue." Handles the case Pi leaves on the table: threshold
 * compaction returns false from hasQueuedMessages() and the agent loop ends.
 *
 * The `zz-` prefix ensures this extension loads AFTER `plan-mode` (extensions
 * load in directory-name order). In plan-mode sessions, `plan-mode` queues a
 * plan-specific resume message first; this extension then sees
 * `ctx.hasPendingMessages() === true` and skips — no double-queuing.
 *
 * Circuit breaker: max 5 auto-continues per user-initiated prompt, reset on
 * `before_agent_start`. Prevents infinite compaction→continue→tool-calls→
 * compact loops while still allowing long multi-step runs.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/** Max consecutive auto-continues within a single user-initiated run. */
const MAX_AUTO_CONTINUES = 5;

export default function autoContinueExtension(pi: ExtensionAPI): void {
	let autoContinueCount = 0;

	// Reset the circuit breaker at the start of every user-initiated prompt.
	// `before_agent_start` only fires for user-initiated turns (not for
	// agent.continue() / followUp turns), so the counter tracks consecutive
	// auto-continues within a single user-initiated run.
	pi.on("before_agent_start", async () => {
		autoContinueCount = 0;
		// No message injection needed — return nothing.
	});

	pi.on("session_compact", async (event, ctx) => {
		// Skip if Pi is already auto-retrying (error-based overflow). The retry
		// path runs via agent.continue() and handles continuation itself; queuing
		// another message here would cause a double-continue.
		if (event.reason === "overflow" && event.willRetry === true) {
			return;
		}

		// Skip if another extension already queued a continuation message. In
		// plan-mode sessions, plan-mode loads first and queues a plan-specific
		// resume message; hasPendingMessages() reflects that and we bow out.
		if (ctx.hasPendingMessages?.() === true) {
			return;
		}

		// Circuit breaker: cap consecutive auto-continues per user-initiated run.
		autoContinueCount++;
		if (autoContinueCount > MAX_AUTO_CONTINUES) {
			if (ctx.hasUI) {
				ctx.ui.notify(
					"Auto-continue paused after " +
						MAX_AUTO_CONTINUES +
						" compactions in one run. Please review and continue manually.",
					"warning",
				);
			}
			return;
		}

		// Queue a continuation message delivered as a follow-up. Because the
		// agent run is still active (session_compact fires inside
		// _runAutoCompaction, while _isAgentRunActive === true), sendMessage
		// takes the followUp path → enqueues to followUpQueue →
		// _runAutoCompaction returns hasQueuedMessages()===true → the agent
		// loop calls agent.continue() → drains the queue → new turn with
		// compacted context.
		pi.sendMessage(
			{
				customType: "auto-continue",
				content:
					"Context was compacted. Continue where you left off.",
				display: true,
			},
			{ triggerTurn: true, deliverAs: "followUp" },
		);

		if (ctx.hasUI) {
			ctx.ui.notify(
				"Context compacted — auto-continuing (" +
					autoContinueCount +
					"/" +
					MAX_AUTO_CONTINUES +
					")",
				"info",
			);
		}
	});
}
