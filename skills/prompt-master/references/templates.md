# Prompt Templates Reference

Template library for Prompt Master (Claude Code edition). Read the relevant template when the user's task type matches.

## Table of Contents

| Template | Best For |
|----------|----------|
| [A — Chain of Thought](#template-a--chain-of-thought) | Logic, math, analysis, debugging |
| [B — Few-Shot](#template-b--few-shot) | Consistent structured output, pattern replication |
| [C — Prompt Decompiler](#template-c--prompt-decompiler) | Breaking down, adapting, or splitting existing prompts |

---

## Template A — Chain of Thought

*Use for logic-heavy tasks, math, debugging, and multi-factor analysis where Claude Code needs to reason carefully before committing to an answer.*

```
[Task statement]

Before answering, think through this carefully:
<thinking>
1. What is the actual problem being asked?
2. What constraints must the solution respect?
3. What are the possible approaches?
4. Which approach is best and why?
</thinking>

Give your final answer in <answer> tags only.
```

**When to use:**
- Debugging where the cause is not obvious
- Comparing two technical approaches
- Any math or calculation
- Analysis where a wrong first impression is likely

**When NOT to use:**
- Simple tasks where the answer is clear (unnecessary overhead)
- Creative tasks (CoT can kill natural voice)

---

## Template B — Few-Shot

*Use when the output format is easier to show than describe. Examples outperform written instructions for format-sensitive tasks every time.*

```
[Task instruction]

Here are examples of the exact format needed:

<examples>
  <example>
    <input>[example input 1]</input>
    <output>[example output 1]</output>
  </example>
  <example>
    <input>[example input 2]</input>
    <output>[example output 2]</output>
  </example>
</examples>

Now apply this exact pattern to: [actual input]
```

**Rules:**
- 2 to 5 examples is the sweet spot. More rarely helps and wastes tokens.
- Examples must include edge cases, not just easy cases.
- Use XML tags to wrap examples — Claude parses XML reliably.
- If you have been re-prompting for the same formatting correction twice, switch to few-shot instead of rewriting instructions.

---

## Template C — Prompt Decompiler

*Use when the user pastes an existing prompt and wants to break it down, adapt it, simplify it, or split it for Claude Code.*

**Detect which Decompiler task is needed:**
- **Break down** — explain what each part of the prompt does
- **Simplify** — remove redundancy and tighten without losing meaning
- **Split** — divide a complex one-shot prompt into a cleaner sequence

**Break down output format:**
```
Original prompt: [paste]

Structure analysis:
- Role/Identity: [what role is assigned and why]
- Task: [what action is being requested]
- Constraints: [what limits are set]
- Format: [what output shape is expected]
- Weaknesses: [what is missing or could cause wrong output]

Recommended fix: [rewritten version with gaps filled]
```

**Split output format:**
```
Original prompt: [paste]

This prompt is doing [N] things. Split into [N] sequential prompts:

Prompt 1 — [what it handles]:
[prompt block]

Prompt 2 — [what it handles]:
[prompt block]

Run these in order. Each output feeds the next.
```
