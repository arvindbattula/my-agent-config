---
name: deep-research
description: "Convergence-driven deep research on any topic. Generates diverse search queries, routes them to appropriate search engines (WebSearch, SerpAPI specialty engines), fetches and synthesizes sources in iterative rounds until gaps converge, then saves a comprehensive research brief as a markdown file. Use when the user says 'research', 'deep dive', 'investigate', 'comprehensive analysis', 'what do we know about', or asks for a thorough multi-source exploration of a topic. Also triggers for: market analysis, technology evaluation, competitive analysis, literature review, trend analysis, or any request that implies gathering information from many sources and synthesizing it."
---

# Deep Research

Autonomous, convergence-driven research agent. Searches broadly, fetches sources, synthesizes findings, identifies gaps, and iterates until the brief converges — then saves the result as a markdown file.

## Prerequisites

This skill uses the following tools:

- **`WebSearch`** (required) — built-in Claude Code tool for general web search
- **`WebFetch`** (required) — built-in Claude Code tool for fetching and extracting web page content
- **`mcp__serpapi__search`** (optional, recommended) — SerpAPI MCP server providing specialty search engines: `google_light`, `google_news`, `google_finance`, `youtube_search`, `google_shopping`, `google_images`, `google_jobs`

**Fallback behavior:** If `mcp__serpapi__search` is not available, use only `WebSearch` for all queries. Multi-engine routing (Step 2) will be skipped — all queries go through WebSearch instead. The skill still works, but with reduced source diversity since specialty engines (news, finance, YouTube, etc.) won't be available.

---

## Process Overview

1. Scope the research topic
2. Generate diverse queries with engine routing
3. Execute all searches in parallel
4. Select and fetch top sources
5. Synthesize into a structured brief
6. Evaluate convergence — iterate or stop
7. Check in with user (after iteration 1 only)
8. Save final brief to file

---

## Step 1: Scope the Research

Extract the research topic from the user's message. Note any constraints they mentioned:
- Time period (e.g., "in the last 6 months")
- Industry or domain (e.g., "in fintech")
- Geography (e.g., "in the EU")
- Audience (e.g., "for a technical decision-maker")

State the research question back in one sentence before proceeding. Do NOT ask clarifying questions unless the topic is genuinely ambiguous — just start researching.

---

## Step 2: Generate Diverse Queries

Create 5-7 search queries, each probing the topic from a different angle. Select only the angles most relevant to the topic — not every angle applies to every topic.

**Query angles and engine routing:**

| Angle | Example Query | Route To |
|-------|---------------|----------|
| Base factual | `[topic]` | WebSearch + `google_light` (per parallel-web-search rule) |
| Recent developments | `[topic] latest news [YEAR]` | `google_news` only |
| Quantitative / benchmarks | `[topic] benchmarks data statistics` | WebSearch + `google_light` |
| Case studies / examples | `[topic] case study real-world example` | WebSearch + `google_light` |
| Expert analysis | `[topic] expert analysis opinion` | WebSearch + `google_light` |
| Challenges / risks | `[topic] challenges risks criticisms` | WebSearch + `google_light` |
| Future outlook | `[topic] future predictions [YEAR+1]` | WebSearch + `google_light` |
| Market / financial data | `[topic] market size revenue growth` | `google_finance` only |
| Tutorials / walkthroughs | `[topic] tutorial walkthrough demo` | `youtube_search` only |
| Products / pricing | `[topic] pricing comparison alternatives` | `google_shopping` only |
| Hiring / team signals | `[topic] hiring jobs roles` | `google_jobs` only |

Replace `[YEAR]` with the current year. Pick the 5-7 angles that will produce the most useful results for this specific topic.

---

## Step 3: Execute Searches

Fire ALL search calls in a single message with parallel tool calls. For each query:

**If routed to WebSearch + google_light** (the dual-search pattern):
- Call `WebSearch` with the query
- Call `mcp__serpapi__search` with `engine: "google_light"` and `mode: "compact"`
- Both in parallel, per the `parallel-web-search` rule

**If routed to a specialty engine only** (google_news, google_finance, youtube_search, google_shopping, google_jobs):
- Call only `mcp__serpapi__search` with the appropriate `engine` value and `mode: "compact"`
- Do NOT also call WebSearch — specialty engines are sufficient for their domain

**If `mcp__serpapi__search` is not available**, fall back to using `WebSearch` for ALL queries. Skip the engine routing table — send every query through `WebSearch` only. The rest of the pipeline (fetch, synthesize, converge) works the same.

Maximize parallelism. All queries for a single iteration should be dispatched in one batch.

---

## Step 4: Select and Fetch Sources

From all search results across all queries:

1. **Collect URLs** from all results. Record the title, URL, snippet, and which query produced it.

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

---

## Step 5: Synthesize

### Stage A: Chunk Summaries (if >8 sources)

Group fetched sources into chunks of 6-8. For each chunk, internally summarize:
- Key claims with source attribution
- Data points and statistics
- Areas where sources in this chunk agree
- Areas where sources in this chunk disagree

After summarizing a chunk, discard the raw fetched content to manage context. Keep only the chunk summary.

If 8 or fewer sources, skip chunking — work with all sources directly.

### Stage B: Assemble Final Brief

Combine all chunk summaries (or all sources if <=8) into a structured brief. Use this exact template:

```markdown
# [Research Topic]: Deep Research Brief

*Generated: [DATE] | Sources: [N] | Iterations: [N]*

## Executive Summary

[3-5 sentences. Lead with the single most significant finding. Capture the overall picture.]

## Key Findings

[5-10 bullets. Each is a specific, concrete claim with an inline citation: "claim [Source Title](URL)". Order by importance, not by source order.]

## Themes and Consensus

[2-4 themes where multiple independent sources converge. Name the supporting sources for each theme.]

## Contradictions and Debates

[Where do sources disagree? What claims are made by one source but contradicted or unaddressed by others? Be specific about who says what.]

## Quantitative Evidence

[Numbers, benchmarks, statistics, market data, or measurable claims. Present as a table if 3+ data points. Always note the source and date for each data point.]

## Open Questions

[Important questions that remain unanswered after this research. What would need further investigation? Be specific — these feed the convergence loop.]

## Sources

[Numbered list of all sources cited in the brief:]
1. [Title](URL) — one-line description of what this source contributed
2. ...
```

Every non-trivial claim in the brief MUST have an inline citation linking to a source in the Sources list. Do not invent facts beyond what the fetched sources contain.

---

## Step 6: Evaluate Convergence

After producing the brief, evaluate whether to iterate. Check these exit criteria:

**Stop iterating if ANY of these is true:**
- The Open Questions section has zero substantive questions remaining
- The last iteration added fewer than 2 new unique sources (novelty exhausted — searching more will just recycle the same results)
- Iteration count has reached 3 (default cap)
- The user said "good enough" or "stop" at the check-in

**Continue iterating if ALL of these are true:**
- There are substantive open questions remaining
- Previous iteration surfaced fresh sources
- Iteration count is below the cap

**When continuing**, generate 2-4 targeted follow-up queries:
- Each query should aim at a specific open question or weakly-sourced claim
- These should be narrower and more specific than the initial broad queries
- Route follow-up queries to only the most relevant engine (no need for the full dual-search pattern — the goal is gap-filling, not broad discovery)
- Then loop back to Step 3 with these new queries

Track cumulative sources across iterations. New iterations ADD to the existing source pool — do not discard sources from prior iterations.

---

## Step 7: Check In with User (Iteration 1 Only)

After completing the first iteration (Steps 2-6), present to the user:

1. The **Executive Summary** from the current brief
2. The **Key Findings** (condensed to top 5)
3. The **Open Questions** — the gaps that would be investigated in iteration 2+
4. The question: **"I found [N] sources in the first pass. Here are the main gaps: [list gaps]. Should I keep digging to fill these, redirect the research focus, or is this sufficient?"**

Based on the user's response:
- **"Keep going" / "yes" / "continue"** → proceed autonomously through remaining iterations without further check-ins
- **Redirect** (user provides new angle or narrower focus) → incorporate their guidance into follow-up queries, then proceed autonomously
- **"Good enough" / "stop"** → skip to Step 8 and save the current brief

---

## Step 8: Save Output

Save the final brief as a markdown file in the current working directory.

**Filename convention:**
- Prefix: `deep-research-`
- Slug: kebab-case derived from the topic
- Max 60 characters before `.md`
- Examples: `deep-research-llm-inference-optimization.md`, `deep-research-saas-pricing-strategies.md`

After saving, tell the user the file path. Do not print the entire brief in the conversation — it's in the file. Instead, provide a 2-3 sentence summary of the most important findings.

---

## Common Rationalizations

| Rationalization | Reality |
|---|---|
| "I already know enough about this topic" | Your training data may be outdated. Fresh sources prevent hallucination. |
| "One search is enough" | Single-source research produces biased results. Multiple engines surface contradictions. |
| "I'll skip fetching, the snippets are sufficient" | Snippets are fragments. Full source content reveals nuance, caveats, and context that snippets omit. |
| "Three iterations is overkill" | Stop criteria exist for a reason — if open questions remain and new sources are appearing, iterate. |
| "The user didn't ask for sources" | Every non-trivial claim needs a citation. Unsourced claims are indistinguishable from hallucination. |

## Red Flags

- Presenting claims without inline citations
- Using only one search engine for all queries
- Skipping the convergence check (Step 6)
- Fetching entire websites when one page is relevant
- More than 3 sources from the same domain
- Reporting search snippets as findings without fetching the full source
