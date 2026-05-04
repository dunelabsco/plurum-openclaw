import type { PluginLogger } from "../api.js";
export type SearchHit = Record<string, unknown>;
export type SearchResponse = {
    results?: SearchHit[];
    total_found?: number;
};
export declare class PlurumClient {
    private readonly apiUrl;
    private readonly apiKey;
    private readonly logger?;
    private consecutiveFailures;
    private breakerOpenUntil;
    constructor(apiUrl: string, apiKey: string, logger?: PluginLogger | undefined);
    get hasApiKey(): boolean;
    isBreakerOpen(): boolean;
    recordSuccess(): void;
    recordFailure(): void;
    private request;
    searchExperiences(query: string, limit?: number): Promise<SearchResponse>;
    getExperience(identifier: string): Promise<Record<string, unknown>>;
    createExperience(body: Record<string, unknown>): Promise<{
        id?: string;
        short_id?: string;
    }>;
    publishExperience(identifier: string): Promise<unknown>;
    reportOutcome(identifier: string, body: Record<string, unknown>): Promise<unknown>;
    voteExperience(identifier: string, vote: "up" | "down"): Promise<unknown>;
}
export declare function toolErrorJson(msg: string): string;
export declare function breakerErrorJson(): string;
