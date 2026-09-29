---
name: unslop
description: Heavy prose-cleanup pass. Cut AI tells and restore human voice in publishable writing (specs, tickets, ADRs, PR descriptions, retro notes, docs). Use for /skill:unslop, "unslop this", or before publishing prose others will read. Prose only; code slop belongs to cleanup-ai-slop.
---

# Unslop

Edit text to remove AI patterns and add human voice. Adapted from pstack's unslop skill (MIT, Lauren Tan) with three changes: the em-dash rule is softened, project glossary terms are exempt from the jargon list, and the scope is prose only.

The baseline drafting discipline lives in `~/.pi/agent/AGENTS.md` and applies to every reply automatically. This skill is the explicit full pass. Run it before prose gets published to the issue tracker, the repo, or a PR, and whenever a draft reads generic.

## Process

1. Scan for the patterns below.
2. Rewrite. Preserve meaning, match intended tone.
3. Add soul (next section).
4. Self-audit: "What makes this obviously AI generated?" Fix remaining tells.

## Adding soul

Removing patterns is half the job. Sterile, voiceless writing is just as obvious.

- **Have opinions.** React to facts instead of neutrally listing pros and cons.
- **Vary rhythm.** Short sentences. Then longer ones that take their time. Mix it up.
- **Acknowledge complexity.** "Impressive but also kind of unsettling" beats "impressive."
- **Use "I" when it fits.** First person isn't unprofessional.
- **Let some mess in.** Perfect structure looks machine-made.
- **Be specific.** Not "this is concerning" but "there's something unsettling about agents churning away at 3am."

## Patterns to detect and fix

### Content

1. **Puffery.** "pivotal moment", "testament to", "evolving landscape", "setting the stage for", "indelible mark", "deeply rooted". Cut puffery, state what happened.
2. **Name-dropping.** Listing media outlets without context. Pick one, say what was said.
3. **Superficial -ing phrases.** "highlighting...", "ensuring...", "reflecting...", "showcasing...", "fostering...". Delete or expand with real sources.
4. **Promotional language.** "nestled", "vibrant", "breathtaking", "groundbreaking", "renowned", "stunning", "must-visit". Use neutral descriptions.
5. **Vague attributions.** "Experts believe", "Industry reports suggest", "Some critics argue". Name the source or delete.
6. **Formulaic challenges.** "Despite challenges... continues to thrive." Replace with specific facts.

### Language

7. **AI vocabulary.** Additionally, crucial, delve, enduring, enhance, fostering, garner, interplay, intricate, landscape (abstract), pivotal, showcase, tapestry (abstract), testament, underscore, vibrant. Replace with plain words.
8. **Fancy ways to say "is".** "serves as", "stands as", "boasts", "features". Just say "is" or "has".
9. **"Not just X, but Y."** State the point directly instead.
10. **Rule of three.** Forcing ideas into groups of three. Use the natural number.
11. **Synonym cycling.** Protagonist, main character, central figure, hero all in one paragraph. Pick one, repeat it.
12. **False ranges.** "from X to Y" where X and Y aren't on a meaningful scale. List topics directly.

### Style

13. **Dash and colon crutches.** Don't lean on em dashes or mid-sentence colons as default connectors; if a thought needs separation, end the sentence or use a comma. Occasional use is fine when nothing plainer works. A colon before a list is always fine.
14. **Boldface overuse.** Don't bold every proper noun or acronym.
15. **Inline-header lists.** The tell is a bold label and colon that restates the line: "**Performance:** Performance improved...". Convert those to prose. A bold lead-in that ends in a period, names the item, and is followed by genuinely new detail ("**Schema in TypeScript.** Tables live in one file.") is fine, not a tell.
16. **Title case headings.** Use sentence case.
17. **Decorative emojis.** Remove from headings and bullets.
18. **Curly quotes.** Replace with straight quotes.

### Communication artifacts

19. **Chatbot phrases.** "I hope this helps!", "Let me know if...", "Of course!", "Certainly!", "Found the smoking gun!" Remove.
20. **Cutoff disclaimers.** "While specific details are limited..." Find sources or remove.
21. **Sycophantic tone.** "Great question! You're absolutely right!" Respond directly.

### Filler

22. **Filler phrases.** "In order to" becomes "To". "Due to the fact that" becomes "Because". "It is important to note that" gets deleted.
23. **Excessive hedging.** "could potentially possibly be argued that it might" becomes "may".
24. **Generic conclusions.** "The future looks bright." State specific plans or facts.

### Jargon

25. **Abstract metaphor nouns.** Substrate, wedge, vector, locus, vantage, nexus, primitive (as noun), harness (as metaphor), bedrock, scaffolding (as metaphor), modality, paradigm, gold-plating, ratchet (as metaphor), evacuate (for moving code), endgame, north star, flywheel. These read as technical but usually have a plainer concrete word. Pick the concrete word. **Exception:** terms defined in the project's domain glossary or ADRs, and established design vocabulary from the codebase-design skill (e.g. "API surface", "shallow module"), are legitimate. Glossary wins over this list.

### Plain speech

26. **Say what it does, not how it feels.** "the database stays close at hand", "SQL you can read" name a feeling. The fix names the mechanism or a number: "`.toSQL()` returns the exact string sent to the database". If the sentence could appear unchanged in another project's docs, it says nothing about this one. Cut it.
27. **Shorten or split dense sentences.** If the reader has to backtrack to parse a sentence, break it in two or drop clauses. One idea per sentence.
28. **Active voice.** Prefer it. "queries are validated" becomes "the compiler validates queries". Passive is fine only when the actor is unknown or genuinely doesn't matter.
29. **Cut adverbs, or use a stronger verb.** "runs quickly" becomes "is fast" or the number. "significantly improves" becomes the measured delta.
30. **Prefer the plain word.** "utilize" becomes "use", "leverage" becomes "use", "facilitate" becomes "help", "numerous" becomes "many", "in the event that" becomes "if".
