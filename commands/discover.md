Structured product discovery interview. Guides the user from a fuzzy idea to a complete specification written to `docs/spec.md`. Claude leads the interview, does the writing, surfaces unknowns. The user answers questions and makes decisions.

**This is NOT the same as /grill-me.** Grill-me is general-purpose questioning. Discover is a structured product definition process with layered interview phases and a persisted spec output.

## Process

### Step 1: Determine project size

Ask the user: **"Before we dive in — how big is this project?"**

Offer three options with examples:
- **Quick script** — one-off utility, data transform, CLI tool, automation
- **Small tool** — single-file app, personal dashboard, API wrapper, browser extension
- **Full product** — multi-file app, team-facing tool, public product, something that will grow

This determines interview depth:

| Size | Interview Layers | Spec Sections |
|---|---|---|
| Quick script | Layers 1-2 | Problem, Scope, Technical Decisions |
| Small tool | Layers 1-3 | Above + User Flows, Data Model |
| Full product | Layers 1-6 | Full spec |

### Step 2: Run the interview

Work through the layers one at a time. For each layer, ask 2-4 focused questions. Do NOT dump all questions at once — this is a conversation, not a form. Push for specifics. Don't accept vague answers.

**Layer 1: Intent & Context**
- What is this? Describe it in one sentence.
- Who is it for? (You personally? Your team? External users?)
- What problem does it solve? What's painful about the current way?
- What does success look like? How will you know this is working?

**Layer 2: Scope & Boundaries**
- What's the MVP — the absolute smallest thing that would be useful?
- What's explicitly OUT of scope for now? (Force the user to name things they won't build yet.)
- What are the 2-3 features that make this worth building vs. using an existing tool?

**Layer 3: User Experience** *(skip for quick scripts)*
- Walk through the primary user flow step by step: what does the user see first? What do they do? What happens next?
- What are the key interactions? What data goes in, what comes out?
- Are there secondary flows? (Settings, error states, onboarding, edge cases)

**Layer 4: System Thinking** *(full product only)*
This is the "unknown unknowns" layer. Claude should actively surface risks the user hasn't considered:
- Where does the data come from? Where does it go? What's the data lifecycle?
- What are the external dependencies? (APIs, services, files, databases)
- What happens when things go wrong? (Network down, bad input, API rate limits, partial failures)
- Performance/scale: how much data? How many users? What needs to be fast?
- Security/privacy: who can access this? Any sensitive data? Auth needed?

**Layer 5: Technical Shape** *(full product only)*
- What technologies/frameworks? (If user isn't sure, Claude should recommend based on the requirements and user's experience.)
- How will this run? (Local, server, cloud, static file, desktop app?)
- What existing code or patterns should this build on?
- What's the deployment/distribution story?

**Layer 6: Risks & Open Questions** *(full product only)*
Claude synthesizes everything heard so far and surfaces:
- "Based on what you've told me, here are the things I think could go wrong..."
- "Here are decisions we haven't made yet..."
- "These assumptions feel risky to me because..."

The user addresses each one: resolve it, defer it explicitly, or ask Claude for a recommendation.

### Step 3: Write the spec

After the interview, write `docs/spec.md`. Use this format, but ONLY include sections relevant to the project size:

```markdown
# [Project Name] — Specification

## Problem & Intent
(why this exists, what pain it solves)

## Users & Context
(who uses it, when, how, what they do today)

## MVP Scope
(what we're building first)
### Out of Scope
(what we're explicitly NOT building yet)

## User Flows
(step-by-step primary flows — skip for quick scripts)

## Data Model
(what data exists, where it lives, how it flows — skip for quick scripts)

## External Dependencies
(APIs, services, files — only if they exist)

## Technical Decisions
(language, framework, architecture — with rationale for each choice)

## Edge Cases & Error Handling
(what can go wrong, how we handle it — full product only)

## Open Questions
(unresolved items — revisit before or during build)
```

### Step 4: Update CLAUDE.md

Update the "What This Is" section of `CLAUDE.md` with a 1-2 sentence project summary derived from the spec.

### Step 5: Confirm and suggest next step

Present a summary of the spec to the user. Ask them to review and flag anything wrong.

Then suggest: "When you're happy with the spec, run `/blueprint` to create the phased build plan."

## Interview Principles

- **One layer at a time.** Don't skip ahead. Each layer builds on previous answers.
- **Push for specifics.** "It should be fast" → "What's the latency budget? Under 1 second? Under 100ms?"
- **Surface tradeoffs.** "You said X and Y — those are in tension. Which matters more?"
- **Name the unknowns.** If the user says "I'm not sure," that's fine — capture it as an open question in the spec rather than guessing.
- **Recommend when asked.** If the user wants Claude's opinion on tech choices, give an opinionated recommendation with rationale, not a list of options.
- **Don't over-spec quick scripts.** A utility script needs 10 lines of spec, not 2 pages.
