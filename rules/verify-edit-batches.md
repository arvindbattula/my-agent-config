# Verify Edit Batches

After applying a multi-edit batch (two or more replacements in one call), diff the
file against its pre-change backup and count the hunks before claiming success.

Edit batches can fail **atomically**: if any single edit in the batch fails to match,
none are applied — and a retry that fixes only the failing edit can leave the batch
half-done. A "replaced successfully" message for the retry proves nothing about the
rest of the batch.

Evidence (2026-10-22, plan-mode hardening session): a Phase 1 two-edit batch failed
atomically; the retry restored only the second edit, silently dropping the
`messageType` guard. It was caught 30 minutes later only because Phase 1b's
verification counted diff hunks (expected 6, found 5). The same discipline caught a
broken import in Phase 2.

Mechanism:

1. Keep a pre-change backup (`cp file file.pre-<phase>`).
2. After the batch: `diff backup file | grep -c "^[0-9]"` — count hunks.
3. Compare against the hunk count you *expect*. Any mismatch = investigate before
   proceeding, even if tests pass.
4. List the removed lines (`diff | grep "^<"`) and confirm every one is intended.
