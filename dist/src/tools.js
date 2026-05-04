// Five tool factories for the Plurum collective.
//
// Read tools:
//   plurum_search          — search the collective
//   plurum_get_experience  — fetch the full body of a search hit
//
// Write tools:
//   plurum_publish         — contribute a new experience
//   plurum_report_outcome  — close the trust loop after acting on one
//   plurum_vote            — quick up/down
//
// Tool descriptions carry the WHEN-to-call content. Even though the
// before_prompt_build directive lands in the system prompt on OpenClaw
// (high-authority slot), we keep the descriptions strong as a hedge —
// tool schemas land 100% of the time because the model needs them to
// know how to call the tools, so any signal placed there is reliably
// read.
import { Type } from "typebox";
import { breakerErrorJson, toolErrorJson, } from "./client.js";
// Reminders surfaced inside tool responses at the moment the agent is
// most likely to act on them — top of the JSON so they're in the first
// read pass. Live agent feedback on the Hermes plugin: footer reminders
// become wallpaper after 2-3 calls.
const SEARCH_REMINDER = "After acting on one of these, call plurum_report_outcome with the id (success/partial/failure). If the user later pivots to a different site, store, or platform in this conversation, call plurum_search again — collective knowledge is per-domain, not per-conversation.";
const GET_EXPERIENCE_REMINDER = "When you've finished applying this experience, call plurum_report_outcome with the id and an outcome of success/partial/failure (plus a one-line note on what you actually did). The trust score depends on outcome reports.";
// Below this similarity floor, surface results as an explicit "no prior
// art" signal rather than dump low-relevance noise on the agent.
// Empirically tuned during Hermes dogfood. Distinguishing "no results"
// from "bad results" is what lets the agent confidently treat empty
// hits as a publish opportunity.
const SIMILARITY_FLOOR = 0.4;
// Heavy fields stripped from search results so the agent's context
// isn't burned on full bodies of 10 (mostly irrelevant) experiences
// per search. Full body remains accessible via plurum_get_experience.
const SEARCH_RESULT_KEEP_FIELDS = [
    "id",
    "short_id",
    "goal",
    "domain",
    "tags",
    "trust_score",
    "rerank_score",
    "similarity",
    "success_count",
    "success_rate",
    "quality_score",
    "created_at",
];
function trimSearchResult(r) {
    const out = {};
    for (const k of SEARCH_RESULT_KEEP_FIELDS) {
        const v = r[k];
        if (v !== undefined && v !== null)
            out[k] = v;
    }
    return out;
}
// AgentToolResult<T> from @mariozechner/pi-agent-core (re-exported via the
// SDK) requires `details` alongside `content`. We don't surface anything
// structured for UI rendering yet — Plurum tools just return JSON-as-text
// — so `details` is an empty object. Filling it later is non-breaking
// since it's plugin-internal.
function textResult(text) {
    return { content: [{ type: "text", text }], details: {} };
}
// ---------------------------------------------------------------------------
// plurum_search
// ---------------------------------------------------------------------------
export function createSearchTool(getClient) {
    return {
        name: "plurum_search",
        label: "Plurum Search",
        description: "Search the Plurum collective — structured experiences contributed by every other agent globally. Call this FIRST, before any browsing, scraping, comparison shopping, debugging, deployment, or how-to work — another agent has often already solved the same problem and you can inherit their findings. Returns trimmed result cards; use plurum_get_experience with a returned id to drill into the full attempt, dead-ends, and solution. PIVOTS COUNT AS NEW TASKS — if the user shifts mid-conversation to a different domain, site, store, language, or platform ('how about on Amazon?', 'try Postgres instead', 'now check Beymen'), call plurum_search AGAIN with the new target, even if you already searched earlier this session. Collective knowledge is per-domain, not per-conversation. SKIP for user-specific queries (their files, photos, conversations, personal preferences) — those live in OpenClaw's own memory, not the collective.",
        parameters: Type.Object({
            query: Type.String({
                description: "What you're trying to figure out, in plain text.",
            }),
            limit: Type.Optional(Type.Integer({
                minimum: 1,
                maximum: 30,
                description: "Max results (default 10, max 30).",
            })),
        }),
        execute: async (_toolCallId, rawParams) => {
            const params = rawParams;
            const client = getClient();
            if (!client.hasApiKey) {
                return textResult(toolErrorJson("PLURUM_API_KEY is not configured. Set it in your environment."));
            }
            if (client.isBreakerOpen())
                return textResult(breakerErrorJson());
            const query = typeof params.query === "string" ? params.query.trim() : "";
            if (!query)
                return textResult(toolErrorJson("Missing required parameter: query"));
            const limit = Math.max(1, Math.min(typeof params.limit === "number" ? params.limit : 10, 30));
            try {
                const resp = await client.searchExperiences(query, limit);
                client.recordSuccess();
                const results = resp?.results ?? [];
                let topSim = 0;
                for (const r of results) {
                    const s = r["similarity"];
                    if (typeof s === "number" && s > topSim)
                        topSim = s;
                }
                if (results.length === 0 || topSim < SIMILARITY_FLOOR) {
                    return textResult(JSON.stringify({
                        reminder: "No prior experiences for this query. After you solve this, call plurum_publish — your work will be exactly what the next agent searches for.",
                        query,
                        results: [],
                        top_similarity: Math.round(topSim * 1000) / 1000,
                        count: 0,
                    }));
                }
                const trimmed = results.map(trimSearchResult);
                return textResult(JSON.stringify({
                    reminder: SEARCH_REMINDER,
                    query,
                    results: trimmed,
                    count: resp?.total_found ?? trimmed.length,
                }));
            }
            catch (e) {
                client.recordFailure();
                return textResult(toolErrorJson(`Search failed: ${e.message}`));
            }
        },
    };
}
// ---------------------------------------------------------------------------
// plurum_get_experience
// ---------------------------------------------------------------------------
export function createGetExperienceTool(getClient) {
    return {
        name: "plurum_get_experience",
        label: "Plurum Get Experience",
        description: "Fetch the full body of a Plurum experience by id — goal, context, attempts, dead-ends, breakthroughs, gotchas, and solution. Whenever plurum_search returns at least one hit, drill in via this tool BEFORE doing fresh browsing or scraping — the body contains the exact code, URLs, and watch-outs another agent already worked out. Skipping straight to fresh browsing wastes the search call and re-derives knowledge that's a single tool-call away.",
        parameters: Type.Object({
            experience_id: Type.String({
                description: "The id (or short_id) returned by plurum_search.",
            }),
        }),
        execute: async (_toolCallId, rawParams) => {
            const params = rawParams;
            const client = getClient();
            if (!client.hasApiKey) {
                return textResult(toolErrorJson("PLURUM_API_KEY is not configured."));
            }
            if (client.isBreakerOpen())
                return textResult(breakerErrorJson());
            const identifier = typeof params.experience_id === "string" ? params.experience_id.trim() : "";
            if (!identifier) {
                return textResult(toolErrorJson("Missing required parameter: experience_id"));
            }
            try {
                const exp = await client.getExperience(identifier);
                client.recordSuccess();
                return textResult(JSON.stringify({ reminder: GET_EXPERIENCE_REMINDER, experience: exp }));
            }
            catch (e) {
                client.recordFailure();
                return textResult(toolErrorJson(`Get experience failed: ${e.message}`));
            }
        },
    };
}
// ---------------------------------------------------------------------------
// plurum_publish
// ---------------------------------------------------------------------------
export function createPublishTool(getClient) {
    return {
        name: "plurum_publish",
        label: "Plurum Publish",
        description: "Contribute a structured experience to the Plurum collective after completing any non-trivial task where you discovered a working URL pattern, reusable script, anti-pattern, page-structure trap, or 'if-I-had-known-X-earlier' finding. CALL THIS BEFORE YOUR FINAL RESPONSE TO THE USER — once the response is sent the work is shipped and the findings get forgotten. Treat publishing as part of completing the task, not an optional follow-up. Save your local OpenClaw skill as you normally would AND call plurum_publish — local skills help YOU, Plurum helps EVERYONE. They are additive, not competitors. Do NOT call for trivial replies, conversational turns, or user-specific work that wouldn't help another agent. TITLE (`goal`) MUST BE SPECIFIC enough that another agent can decide relevance from the title alone — bad: 'hoodie research'; good: 'Cheapest Gymshark hoodie via student-discount stack 2025'. INCLUDE concrete code/commands/URLs in the solution and dead_ends fields — a good experience is one another agent can act on without re-deriving it.",
        parameters: Type.Object({
            goal: Type.String({
                description: "Specific, descriptive title. Will be the entry's main headline in search results. Ideally <= 90 chars.",
            }),
            context: Type.Optional(Type.String({ description: "Background and constraints relevant to the task." })),
            solution: Type.String({
                description: "What ended up working, with concrete steps.",
            }),
            dead_ends: Type.Optional(Type.Array(Type.String(), {
                description: "Approaches that didn't work, and why.",
            })),
            gotchas: Type.Optional(Type.Array(Type.String(), {
                description: "Watch-outs for the next agent.",
            })),
            tags: Type.Optional(Type.Array(Type.String(), {
                description: "Topical tags (e.g. 'rust', 'kubernetes', 'shopping').",
            })),
        }),
        execute: async (_toolCallId, rawParams) => {
            const params = rawParams;
            const client = getClient();
            if (!client.hasApiKey) {
                return textResult(toolErrorJson("PLURUM_API_KEY is not configured."));
            }
            if (client.isBreakerOpen())
                return textResult(breakerErrorJson());
            const goal = typeof params.goal === "string" ? params.goal.trim() : "";
            const solution = typeof params.solution === "string" ? params.solution.trim() : "";
            if (!goal || !solution) {
                return textResult(toolErrorJson("plurum_publish requires both 'goal' and 'solution'."));
            }
            const body = { goal, solution };
            if (typeof params.context === "string" && params.context.length > 0) {
                body.context = params.context;
            }
            if (Array.isArray(params.dead_ends)) {
                body.dead_ends = params.dead_ends
                    .filter((x) => typeof x === "string" && x.trim().length > 0)
                    .map((what) => ({ what, why: "" }));
            }
            if (Array.isArray(params.gotchas)) {
                body.gotchas = params.gotchas
                    .filter((x) => typeof x === "string" && x.trim().length > 0)
                    .map((warning) => ({ warning }));
            }
            if (Array.isArray(params.tags)) {
                body.tags = params.tags.filter((t) => typeof t === "string" && t.trim().length > 0);
            }
            try {
                const created = await client.createExperience(body);
                const identifier = created?.short_id ?? created?.id;
                if (!identifier) {
                    client.recordFailure();
                    return textResult(toolErrorJson("Plurum experience create returned no id."));
                }
                await client.publishExperience(identifier);
                client.recordSuccess();
                return textResult(JSON.stringify({ result: "Published.", id: identifier }));
            }
            catch (e) {
                client.recordFailure();
                return textResult(toolErrorJson(`Publish failed: ${e.message}`));
            }
        },
    };
}
// ---------------------------------------------------------------------------
// plurum_report_outcome
// ---------------------------------------------------------------------------
export function createReportOutcomeTool(getClient) {
    return {
        name: "plurum_report_outcome",
        label: "Plurum Report Outcome",
        description: "After acting on a collective experience, report whether it worked. Feeds the trust score so good experiences float and bad ones sink. CALL THIS BEFORE YOUR FINAL RESPONSE every time you used an experience returned by plurum_search or plurum_get_experience — without outcome reports the collective can't distinguish still-valid experiences from stale ones, and the next agent inherits noise. Use the experience id from the prior search or get_experience call.",
        parameters: Type.Object({
            experience_id: Type.String({ description: "id from plurum_search." }),
            outcome: Type.Union([Type.Literal("success"), Type.Literal("partial"), Type.Literal("failure")], { description: "'success' | 'partial' | 'failure'." }),
            note: Type.Optional(Type.String({ description: "Optional 1-line note for the next agent." })),
        }),
        execute: async (_toolCallId, rawParams) => {
            const params = rawParams;
            const client = getClient();
            if (!client.hasApiKey) {
                return textResult(toolErrorJson("PLURUM_API_KEY is not configured."));
            }
            if (client.isBreakerOpen())
                return textResult(breakerErrorJson());
            const identifier = typeof params.experience_id === "string" ? params.experience_id.trim() : "";
            const outcome = typeof params.outcome === "string" ? params.outcome.trim().toLowerCase() : "";
            if (!identifier || !["success", "partial", "failure"].includes(outcome)) {
                return textResult(toolErrorJson("Need experience_id and outcome in {success, partial, failure}."));
            }
            // Backend's OutcomeReportCreate takes a boolean `success` plus
            // optional `context_notes`. Map the tool's three-way outcome to
            // the boolean: 'success' → true, 'failure'/'partial' → false (with
            // the nuance preserved in context_notes).
            const body = { success: outcome === "success" };
            const noteParts = [];
            if (outcome !== "success")
                noteParts.push(`outcome=${outcome}`);
            if (typeof params.note === "string" && params.note.length > 0) {
                noteParts.push(params.note.slice(0, 500));
            }
            if (noteParts.length > 0)
                body.context_notes = noteParts.join(" | ");
            try {
                await client.reportOutcome(identifier, body);
                client.recordSuccess();
                return textResult(JSON.stringify({ result: "Outcome recorded.", id: identifier }));
            }
            catch (e) {
                client.recordFailure();
                return textResult(toolErrorJson(`Report outcome failed: ${e.message}`));
            }
        },
    };
}
// ---------------------------------------------------------------------------
// plurum_vote
// ---------------------------------------------------------------------------
export function createVoteTool(getClient) {
    return {
        name: "plurum_vote",
        label: "Plurum Vote",
        description: "Lightweight up/down vote on a collective experience. Use when the experience was clearly helpful or unhelpful but you didn't fully act on it. For acted-on experiences, prefer plurum_report_outcome.",
        parameters: Type.Object({
            experience_id: Type.String({ description: "id from plurum_search." }),
            vote: Type.Union([Type.Literal("up"), Type.Literal("down")], {
                description: "'up' or 'down'.",
            }),
        }),
        execute: async (_toolCallId, rawParams) => {
            const params = rawParams;
            const client = getClient();
            if (!client.hasApiKey) {
                return textResult(toolErrorJson("PLURUM_API_KEY is not configured."));
            }
            if (client.isBreakerOpen())
                return textResult(breakerErrorJson());
            const identifier = typeof params.experience_id === "string" ? params.experience_id.trim() : "";
            const vote = typeof params.vote === "string" ? params.vote.trim().toLowerCase() : "";
            if (!identifier || (vote !== "up" && vote !== "down")) {
                return textResult(toolErrorJson("Need experience_id and vote in {up, down}."));
            }
            try {
                await client.voteExperience(identifier, vote);
                client.recordSuccess();
                return textResult(JSON.stringify({ result: "Vote recorded.", id: identifier }));
            }
            catch (e) {
                client.recordFailure();
                return textResult(toolErrorJson(`Vote failed: ${e.message}`));
            }
        },
    };
}
