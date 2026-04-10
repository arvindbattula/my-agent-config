---
name: deep-research
description: "Convergence-driven deep research with adversarial verification. Generates diverse search queries, routes them to tiered search engines (WebSearch, SerpAPI primary/specialty/alternate indexes), fetches and synthesizes sources in iterative phases (Discover → Deepen → Challenge) until gaps converge, then saves a comprehensive research brief as a markdown file. Use when the user says 'research', 'deep dive', 'investigate', 'comprehensive analysis', 'what do we know about', or asks for a thorough multi-source exploration of a topic. Also triggers for: market analysis, technology evaluation, competitive analysis, literature review, trend analysis, or any request that implies gathering information from many sources and synthesizing it."
---

# Deep Research

Autonomous, convergence-driven research agent with adversarial verification. Searches broadly across tiered engines, fetches sources, synthesizes findings, identifies gaps, iterates until convergence, then challenges its own findings before saving the result as a markdown file.

## Prerequisites

This skill uses the following tools:

- **`WebSearch`** (required) — built-in Claude Code tool for general web search
- **`WebFetch`** (required) — built-in Claude Code tool for fetching and extracting web page content
- **`mcp__serpapi__search`** (optional, recommended) — SerpAPI MCP server providing tiered search engines:

  **Tier 1 — Primary:** `google_light`
  **Tier 2 — AI-synthesized:** `google_ai_overview`
  **Tier 3 — Specialty:** `google_scholar`, `google_news`, `google_news_light`, `google_finance`, `google_forums`, `google_trends`, `google_patents`, `google_related_questions`, `youtube_search`, `google_shopping`, `google_jobs`
  **Tier 4 — Alternate index:** `bing`, `duckduckgo`, `yahoo`

**Fallback behavior:** If `mcp__serpapi__search` is not available, use only `WebSearch` for all queries. Engine routing and tiered selection will be skipped — all queries go through WebSearch instead. The Challenge phase still runs but without engine diversity. The skill still works, but with reduced source diversity.

---

## Process Overview

The research runs in three phases:

**Phase 1: Discover** (broad search)
1. Scope the research topic
2. Discover query angles via `google_related_questions`
3. Generate diverse queries with tiered engine routing
4. Execute all searches in parallel
5. Select and fetch top sources
6. Synthesize into a structured brief
7. Identify and number open questions

**Phase 2: Deepen** (convergence-gated, 0-3 iterations)
8. Evaluate convergence — iterate or proceed to Challenge
9. Generate targeted follow-up queries for open questions
10. Execute searches (including alternate index engines)
11. Fetch, synthesize, update open question tracker
12. Loop back to step 8

**Phase 3: Challenge** (always runs)
13. Generate adversarial queries against top claims
14. Execute searches via alternate engines
15. Assess claim confidence and update brief
16. Check in with user (after Phase 1 only — moved here if Deepen was skipped)
17. Save final brief to file

**Note:** During deep research, the tiered engine system in this skill supersedes the `parallel-web-search` rule. That rule still applies to ad-hoc searches outside of deep research.

---

## Phase 1: Discover

### Step 1: Scope the Research

Extract the research topic from the user's message. Note any constraints they mentioned:
- Time period (e.g., "in the last 6 months")
- Industry or domain (e.g., "in fintech")
- Geography (e.g., "in the EU")
- Audience (e.g., "for a technical decision-maker")

State the research question back in one sentence before proceeding. Do NOT ask clarifying questions unless the topic is genuinely ambiguous — just start researching.

### Step 2: Discover Query Angles

Before generating your own queries, fire a single `mcp__serpapi__search` call with `engine: "google_related_questions"` and the core research topic as the query.

Use the "People Also Ask" results to discover angles your training data might miss. Incorporate relevant angles into the query generation in Step 3 — these supplement, not replace, your own angle selection.

If `mcp__serpapi__search` is not available, skip this step.

### Step 3: Generate Diverse Queries

Create 5-7 search queries, each probing the topic from a different angle. Combine your own angle selection with any relevant angles discovered in Step 2. Select only the angles most relevant to the topic — not every angle applies to every topic.

**Query angles and engine routing:**

| Angle | Example Query | Route To |
|-------|---------------|----------|
| Base factual | `[topic]` | **Tier 1:** WebSearch + `google_light` |
| AI-synthesized overview | `[topic]` | **Tier 2:** `google_ai_overview` (once only) |
| Recent developments | `[topic] latest news [YEAR]` | **Tier 3:** `google_news` |
| Academic / research | `[topic] research paper study` | **Tier 3:** `google_scholar` |
| Community experience | `[topic] forum discussion experience` | **Tier 3:** `google_forums` |
| Quantitative / benchmarks | `[topic] benchmarks data statistics` | **Tier 1:** WebSearch + `google_light` |
| Case studies / examples | `[topic] case study real-world example` | **Tier 1:** WebSearch + `google_light` |
| Expert analysis | `[topic] expert analysis opinion` | **Tier 1:** WebSearch + `google_light` |
| Challenges / risks | `[topic] challenges risks criticisms` | **Tier 1:** WebSearch + `google_light` |
| Future outlook | `[topic] future predictions [YEAR+1]` | **Tier 1:** WebSearch + `google_light` |
| Trend data | `[topic] trend adoption growth` | **Tier 3:** `google_trends` |
| Market / financial data | `[topic] market size revenue growth` | **Tier 3:** `google_finance` |
| Patent / IP landscape | `[topic] patent innovation` | **Tier 3:** `google_patents` |
| Tutorials / walkthroughs | `[topic] tutorial walkthrough demo` | **Tier 3:** `youtube_search` |
| Products / pricing | `[topic] pricing comparison alternatives` | **Tier 3:** `google_shopping` |
| Hiring / team signals | `[topic] hiring jobs roles` | **Tier 3:** `google_jobs` |

Replace `[YEAR]` with the current year. Pick the 5-7 angles that will produce the most useful results for this specific topic.

### Step 4: Execute Searches

Fire ALL search calls in a single message with parallel tool calls. For each query:

**If routed to Tier 1** (WebSearch + google_light):
- Call `WebSearch` with the query
- Call `mcp__serpapi__search` with `engine: "google_light"` and `mode: "compact"`
- Both in parallel

**If routed to Tier 2** (AI-synthesized, once only):
- Call `mcp__serpapi__search` with `engine: "google_ai_overview"` and `mode: "compact"`
- One call with the core research question — not per query

**If routed to Tier 3** (specialty engine):
- Call only `mcp__serpapi__search` with the appropriate `engine` value and `mode: "compact"`
- Do NOT also call WebSearch — specialty engines are sufficient for their domain

**If `mcp__serpapi__search` is not available**, fall back to using `WebSearch` for ALL queries. Skip the engine routing table — send every query through `WebSearch` only.

Maximize parallelism. All queries for a single phase should be dispatched in one batch.

#### Failure Recovery (Search)

- If `WebSearch` fails for a query → retry that query with `google_light` via SerpAPI
- If a SerpAPI specialty engine fails → retry with `google_light`
- If both fail → log the failure in the provenance table, continue with remaining queries
- Never silently drop a query — every failure must be logged

### Step 5: Select and Fetch Sources

From all search results across all queries:

1. **Collect URLs** from all results. Record the title, URL, snippet, which query produced it, and which engine returned it.

2. **Deduplicate** by URL. Normalize URLs by:
   - Stripping tracking parameters (utm_*, fbclid, gclid, etc.)
   - Removing trailing slashes
   - Lowercasing the hostname
   - Stripping `www.` prefix

3. **Enforce domain diversity**: Max 2 URLs per domain. If a domain has more than 2 results, keep the 2 with the most relevant snippets.

4. **Select top 10-15 sources** based on relevance to the research question. Prioritize:
   - Sources that appear in multiple query results (cross-referenced)
   - Sources with specific data, named experts, or original research
   - Sources from authoritative domains for the topic

5. **Fetch all selected sources** using `WebFetch` in parallel. Use this extraction prompt:

   > Extract the key facts, claims, data points, and expert opinions from this page related to: [TOPIC]. Include any statistics, dates, named sources, and direct quotes. Note the author and publication date if visible.

6. **Drop thin sources**: If a fetch returns less than 2 sentences of relevant content, exclude it from synthesis.

#### Failure Recovery (Fetch)

- If `WebFetch` fails for a URL → try the next-best URL from the same query's results
- If all URLs for a query fail → note the gap in the provenance table
- Never silently lose a source — every failure is tracked

### Step 6: Synthesize

#### Stage A: Chunk Summaries (if >8 sources)

Group fetched sources into chunks of 6-8. For each chunk, internally summarize:
- Key claims with source attribution and engine origin
- Data points and statistics
- Areas where sources in this chunk agree
- Areas where sources in this chunk disagree

After summarizing a chunk, discard the raw fetched content to manage context. Keep only the chunk summary.

If 8 or fewer sources, skip chunking — work with all sources directly.

#### Stage B: Assemble Brief

Combine all chunk summaries (or all sources if <=8) into a structured brief using the template in the Brief Template section below.

### Step 7: Identify and Number Open Questions

After assembling the brief, extract open questions and assign each a stable ID:

```
Q1: [question text]
Q2: [question text]
Q3: [question text]
```

These IDs persist across all phases. New questions discovered in later phases get the next available ID.

---

## Phase 2: Deepen

### Step 8: Evaluate Convergence

After each Deepen iteration, explicitly classify every open question:

- **`RESOLVED`** — answered with a specific source citation. State which source resolved it.
- **`NARROWED`** — partially answered, refined into a more specific question. State the original and refined version.
- **`UNCHANGED`** — no new information found for this question.

**Stop the Deepen phase and proceed to Challenge if ANY of these is true:**
- The current iteration resolved or narrowed zero questions (all questions are UNCHANGED — searching more won't help)
- Deepen iteration count has reached 3
- The user said "good enough" or "stop" at the check-in

**Continue Deepen if ALL of these are true:**
- At least one question was RESOLVED or NARROWED in this iteration
- Deepen iteration count is below 3

Do NOT use subjective shortcuts like "the brief feels comprehensive." The question tracker is the sole measure of progress.

### Step 9: Generate Follow-Up Queries

Generate 3-5 targeted follow-up queries:
- Each query must aim at a specific open question (reference its ID: "targeting Q2")
- These should be narrower and more specific than the initial broad queries
- **Use Tier 4 alternate engines** (bing, duckduckgo, yahoo) for at least half of the follow-up queries — Google's results are likely exhausted for these topics
- Remaining queries can use Tier 1 or Tier 3 engines with refined search terms

### Step 10: Execute, Fetch, Synthesize

Follow the same process as Steps 4-6 with the follow-up queries. Apply the same failure recovery rules.

Track cumulative sources across iterations. New iterations ADD to the existing source pool — do not discard sources from prior iterations.

### Step 11: Update Open Question Tracker

After synthesizing new sources, update the status of every open question per Step 8 classification rules. Then loop back to Step 8.

---

## Phase 3: Challenge

This phase always runs. It is NOT optional and NOT convergence-gated.

### Step 12: Generate Adversarial Queries

Select the top 3-5 claims from the brief — prioritize claims that:
- Are central to the executive summary or key findings
- Rest on fewer than 3 independent sources
- Contain quantitative claims (numbers are often wrong or outdated)
- Would significantly change the conclusion if wrong

For each selected claim, generate 1-2 adversarial queries:
- `"[claim subject] criticism problems"` 
- `"[claim subject] debunked wrong"` 
- `"[alternative] better than [claim subject]"` 
- `"[cited statistic] methodology flawed"` 
- `"[claim subject] risks downsides limitations"`

### Step 13: Execute Adversarial Searches

Route ALL adversarial queries through **Tier 4 alternate engines** — `bing`, `duckduckgo`, `yahoo`. Do NOT use Google engines for adversarial queries — the goal is to escape the same index that produced the original claims.

Fire all adversarial search calls in parallel. Apply the same failure recovery rules as Step 4.

Fetch the top 5-8 most relevant adversarial sources using `WebFetch` with this extraction prompt:

> Extract any evidence, data, expert opinions, or arguments that contradict, challenge, or provide alternative perspectives on: [CLAIM]. Include specific counter-claims, methodological criticisms, and alternative interpretations. Note the author and publication date if visible.

### Step 14: Assess Claim Confidence

For each challenged claim, assess its status:

- **Holds** — adversarial search found no credible counterevidence. The claim is well-supported across independent engines and sources.
- **Weakened** — adversarial search found partial counterevidence or important caveats not reflected in the original claim. The claim needs qualification.
- **Refuted** — adversarial search found strong counterevidence from credible sources. The claim should be revised or retracted in the brief.

Update the brief's **Adversarial Findings** sub-section with the results.

---

## User Check-In

After completing Phase 1 (and Phase 2 if it ran), present to the user:

1. The **Executive Summary** from the current brief
2. The **Key Findings** (condensed to top 5)
3. The **Open Questions** with their current status (Q1: RESOLVED, Q2: UNCHANGED, etc.)
4. The question: **"I found [N] sources across [phases completed]. [N] open questions remain: [list UNCHANGED questions]. The Challenge phase will now test the top claims against alternate search engines. Should I proceed with the adversarial check, redirect the research focus, or is this sufficient?"**

Based on the user's response:
- **"Keep going" / "yes" / "continue"** → proceed with the Challenge phase
- **Redirect** (user provides new angle or narrower focus) → incorporate their guidance into the Challenge phase queries
- **"Good enough" / "stop"** → skip Challenge phase and save the current brief

---

## Save Output

Save the final brief as a markdown file in the current working directory.

**Filename convention:**
- Prefix: `deep-research-`
- Slug: kebab-case derived from the topic
- Max 60 characters before `.md`
- Examples: `deep-research-llm-inference-optimization.md`, `deep-research-saas-pricing-strategies.md`

After saving, tell the user the file path. Do not print the entire brief in the conversation — it's in the file. Instead, provide a 2-3 sentence summary of the most important findings and note any claims that were weakened or refuted by the Challenge phase.

---

## Brief Template

```markdown
# [Research Topic]: Deep Research Brief

*Generated: [DATE] | Sources: [N] | Phases: Discover + [N] Deepen + Challenge*

## Executive Summary

[3-5 sentences. Lead with the single most significant finding. Capture the overall picture. Note if any key claims were challenged or refuted in the adversarial phase.]

## Key Findings

[5-10 bullets. Each is a specific, concrete claim with an inline citation: "claim [Source Title](URL)". Order by importance, not by source order.]

## Themes and Consensus

[2-4 themes where multiple independent sources converge. Name the supporting sources for each theme.]

## Contradictions, Debates, and Adversarial Findings

### Source Disagreements

[Where do sources disagree? What claims are made by one source but contradicted or unaddressed by others? Be specific about who says what.]

### Adversarial Findings

[Results from the Challenge phase. For each challenged claim:]

| Claim | Original Source | Counterevidence | Source | Confidence |
|-------|----------------|-----------------|--------|------------|
| [claim text] | [Source Title](URL) | [what was found] | [Counter Source](URL) | Holds / Weakened / Refuted |

## Quantitative Evidence

[Numbers, benchmarks, statistics, market data, or measurable claims. Present as a table if 3+ data points. Always note the source and date for each data point.]

## Open Questions

[Questions with their ID and status history across iterations:]
- Q1: [question] — RESOLVED in Deepen iteration 1 via [Source Title](URL)
- Q2: [question] — NARROWED: originally "[broad question]", now "[specific question]"
- Q3: [question] — UNCHANGED after all iterations
- Q4: [question] — NEW (discovered in Deepen iteration 2) — RESOLVED via [Source]

## Sources

[Numbered list of all sources cited in the brief, tagged with engine origin:]
1. [Title](URL) — one-line description [via google_news]
2. [Title](URL) — one-line description [via WebSearch]
3. [Title](URL) — one-line description [via bing, Deepen iteration 1]
4. [Title](URL) — one-line description [via duckduckgo, Challenge]

## Source Provenance

### Phase 1: Discover
| Query | Engine | Results | Selected | Failures |
|-------|--------|---------|----------|----------|
| [query text] | google_light | 8 | 2 | — |
| [query text] | WebSearch | 5 | 1 | — |
| [query text] | google_news | 3 | 1 | — |
| [query text] | WebSearch | 0 | 0 | FAILED: timeout → retried via google_light (3 results) |

### Phase 2: Deepen (iteration 1)
| Query (targeting) | Engine | Results | Selected | Failures |
|-------------------|--------|---------|----------|----------|
| [query text] (Q2) | bing | 4 | 2 | — |
| [query text] (Q3) | duckduckgo | 6 | 1 | — |

### Phase 3: Challenge
| Challenged Claim | Engine | Results | Relevant Sources | Failures |
|-------------------|--------|---------|-----------------|----------|
| [claim summary] | bing | 5 | 2 | — |
| [claim summary] | duckduckgo | 3 | 1 | — |
| [claim summary] | yahoo | 0 | 0 | FAILED: no results |
```

Every non-trivial claim in the brief MUST have an inline citation linking to a source in the Sources list. Do not invent facts beyond what the fetched sources contain.

---

## Common Rationalizations

| Rationalization | Reality |
|---|---|
| "I already know enough about this topic" | Your training data may be outdated. Fresh sources prevent hallucination. |
| "One search is enough" | Single-source research produces biased results. Multiple engines surface contradictions. |
| "I'll skip fetching, the snippets are sufficient" | Snippets are fragments. Full source content reveals nuance, caveats, and context that snippets omit. |
| "Three iterations is overkill" | Stop criteria exist for a reason — if open questions remain and new sources are appearing, iterate. |
| "The user didn't ask for sources" | Every non-trivial claim needs a citation. Unsourced claims are indistinguishable from hallucination. |
| "The findings are solid, no need to challenge them" | Confirmation bias is the default. The adversarial pass exists to catch it. Always run it. |
| "WebSearch failed, I'll just skip that query" | Failures must be retried via alternate engines. Silent source loss corrupts the brief. |
| "Two iterations is enough, the brief is comprehensive" | Comprehensiveness is measured by open question resolution, not by feeling done. Check the question tracker. |

## Red Flags

- Presenting claims without inline citations
- Using only one search engine for all queries
- Skipping the convergence check
- Fetching entire websites when one page is relevant
- More than 3 sources from the same domain
- Reporting search snippets as findings without fetching the full source
- Skipping the Challenge phase or running it with soft queries
- Not logging search or fetch failures in the provenance table
- Marking open questions as RESOLVED without citing the resolving source
- Using only Google engines in the Deepen/Challenge phases (should use alternate indexes)
- Running adversarial queries through the same engine that produced the original claim
