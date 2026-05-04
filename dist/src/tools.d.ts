import type { AnyAgentTool } from "../api.js";
import { PlurumClient } from "./client.js";
export declare function createSearchTool(getClient: () => PlurumClient): AnyAgentTool;
export declare function createGetExperienceTool(getClient: () => PlurumClient): AnyAgentTool;
export declare function createPublishTool(getClient: () => PlurumClient): AnyAgentTool;
export declare function createReportOutcomeTool(getClient: () => PlurumClient): AnyAgentTool;
export declare function createVoteTool(getClient: () => PlurumClient): AnyAgentTool;
