// Plugin registration — wires the 5 collective tools and the directive
// hook into the OpenClaw runtime.
//
// Architectural choice (vs. the Hermes plugin): the directive lives in
// `before_prompt_build` returning `prependSystemContext`, which the
// OpenClaw runtime concatenates directly into the system prompt
// (verified at `src/agents/pi-embedded-runner/run/attempt.thread-helpers.ts:24`
// upstream — `joinPresentTextSegments([prependSystem, baseSystemPrompt, appendSystem])`).
// That's the high-authority slot the equivalent Hermes hook can't reach
// (Hermes appends pre_llm_call context to the user message tail, a
// low-authority slot). Same plugin, more reliable directive landing.

import type { OpenClawPluginApi } from "../api.js";
import { PlurumClient } from "./client.js";
import { resolveApiKey, resolveApiUrl } from "./config.js";
import { PLURUM_DIRECTIVE } from "./directive.js";
import {
  createGetExperienceTool,
  createPublishTool,
  createReportOutcomeTool,
  createSearchTool,
  createVoteTool,
} from "./tools.js";

export function registerPlurumPlugin(api: OpenClawPluginApi): void {
  // Lazy client factory — re-reads config and env on every tool call so
  // a config edit or `PLURUM_API_KEY` rotation is picked up without
  // restarting the gateway. Cheap: no persistent connection state.
  const getClient = (): PlurumClient =>
    new PlurumClient(
      resolveApiUrl(api.pluginConfig as Record<string, unknown>),
      resolveApiKey(),
      api.logger,
    );

  api.registerTool(() => createSearchTool(getClient), { name: "plurum_search" });
  api.registerTool(() => createGetExperienceTool(getClient), {
    name: "plurum_get_experience",
  });
  api.registerTool(() => createPublishTool(getClient), { name: "plurum_publish" });
  api.registerTool(() => createReportOutcomeTool(getClient), {
    name: "plurum_report_outcome",
  });
  api.registerTool(() => createVoteTool(getClient), { name: "plurum_vote" });

  api.on("before_prompt_build", async () => ({
    prependSystemContext: PLURUM_DIRECTIVE,
  }));

  api.logger?.info?.("Plurum plugin registered (5 tools + system-prompt directive)");
}
