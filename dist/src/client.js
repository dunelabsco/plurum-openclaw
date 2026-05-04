// HTTP client + circuit breaker for the Plurum API.
//
// Native fetch (Node 22+ ships it). Mirrors the breaker pattern from the
// Python Hermes plugin: after N consecutive failures, pause API calls for
// a cooldown so a downed backend can't hammer the agent loop. Each tool
// handler owns the success/failure recording so partial pipeline errors
// don't all flow through one path.
const DEFAULT_TIMEOUT_MS = 12_000;
const BREAKER_THRESHOLD = 5;
const BREAKER_COOLDOWN_MS = 120_000;
export class PlurumClient {
    apiUrl;
    apiKey;
    logger;
    consecutiveFailures = 0;
    breakerOpenUntil = 0;
    constructor(apiUrl, apiKey, logger) {
        this.apiUrl = apiUrl;
        this.apiKey = apiKey;
        this.logger = logger;
    }
    get hasApiKey() {
        return this.apiKey.length > 0;
    }
    isBreakerOpen() {
        if (this.consecutiveFailures < BREAKER_THRESHOLD)
            return false;
        if (Date.now() >= this.breakerOpenUntil) {
            this.consecutiveFailures = 0;
            return false;
        }
        return true;
    }
    recordSuccess() {
        this.consecutiveFailures = 0;
    }
    recordFailure() {
        this.consecutiveFailures += 1;
        if (this.consecutiveFailures >= BREAKER_THRESHOLD) {
            this.breakerOpenUntil = Date.now() + BREAKER_COOLDOWN_MS;
            this.logger?.warn?.(`Plurum circuit breaker tripped after ${this.consecutiveFailures} consecutive failures; pausing for ${BREAKER_COOLDOWN_MS / 1000}s.`);
        }
    }
    async request(method, path, body, timeoutMs = DEFAULT_TIMEOUT_MS) {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), timeoutMs);
        try {
            const resp = await fetch(`${this.apiUrl}${path}`, {
                method,
                headers: {
                    "Content-Type": "application/json",
                    ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
                },
                body: body !== undefined ? JSON.stringify(body) : undefined,
                signal: ctrl.signal,
            });
            if (!resp.ok) {
                const detail = (await resp.text()).slice(0, 500);
                throw new Error(`Plurum ${resp.status}: ${detail}`);
            }
            const text = await resp.text();
            return text ? JSON.parse(text) : null;
        }
        finally {
            clearTimeout(timer);
        }
    }
    searchExperiences(query, limit = 10) {
        return this.request("POST", "/api/v1/experiences/search", { query, limit });
    }
    getExperience(identifier) {
        return this.request("GET", `/api/v1/experiences/${encodeURIComponent(identifier)}`);
    }
    createExperience(body) {
        return this.request("POST", "/api/v1/experiences", body);
    }
    publishExperience(identifier) {
        return this.request("POST", `/api/v1/experiences/${encodeURIComponent(identifier)}/publish`);
    }
    reportOutcome(identifier, body) {
        return this.request("POST", `/api/v1/experiences/${encodeURIComponent(identifier)}/outcome`, body);
    }
    voteExperience(identifier, vote) {
        return this.request("POST", `/api/v1/experiences/${encodeURIComponent(identifier)}/vote`, { vote_type: vote });
    }
}
export function toolErrorJson(msg) {
    return JSON.stringify({ error: msg });
}
export function breakerErrorJson() {
    return JSON.stringify({
        error: "Plurum API temporarily unavailable (multiple consecutive failures). The agent's normal flow is unaffected — Plurum will retry automatically in a couple of minutes.",
    });
}
