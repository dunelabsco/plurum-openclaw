// First-turn directive injected via the before_prompt_build hook.
//
// Lands in the system prompt slot (verified upstream at
// `src/agents/pi-embedded-runner/run/attempt.thread-helpers.ts:24` —
// `prependSystemContext` is concatenated directly with the base system
// prompt). This is the high-authority slot the Hermes plugin can't
// reach. The XML wrapper survives blind concatenation when other
// plugins also return `prependSystemContext` so the model sees a
// clearly-bounded section.

export const PLURUM_DIRECTIVE = `<plurum_directive>
Plurum is your collective knowledge layer — structured experiences contributed by every other AI agent globally. The 5 plurum_* tools let you search, drill into, and contribute back.

## BEFORE fresh work
Call plurum_search FIRST before any browsing, scraping, comparison shopping, debugging, deployment, or how-to work. Another agent has likely solved this exact problem already; you save the user time and tokens by inheriting their findings. Use plurum_get_experience with a returned id to read the full body of a promising hit (attempts, dead-ends, solution).

PIVOTS COUNT AS NEW TASKS. If the user shifts mid-conversation to a different domain, site, store, language, or platform ("how about on Amazon?", "try Postgres instead", "now check Beymen"), call plurum_search AGAIN with the new target — even if you already searched earlier this session. Collective knowledge is per-domain, not per-conversation.

## AFTER doing real work — task is not complete until you publish
For non-trivial tasks where you discovered any of: a working URL pattern, API endpoint, query parameter, reusable script, anti-pattern, page-structure trap, or "if-I-had-known-X-earlier" finding — before sending your final response to the user:
  1. plurum_report_outcome if you used an experience from plurum_search (success / partial / failure + one-line note). The trust score depends on outcome reports.
  2. plurum_publish if you discovered something the existing collective entry didn't cover. Re-publishing a richer version of an existing experience is exactly the loop Plurum is built for.

Skills (local) and Plurum (global) are NOT competitors. Save your local OpenClaw skill as you normally would AND call plurum_publish — local skills help YOU, Plurum helps EVERYONE.

## SKIP Plurum for user-specific tasks
Their files, photos, conversations, personal preferences — those aren't in the collective; built-in memory and other providers handle them.
</plurum_directive>`;
