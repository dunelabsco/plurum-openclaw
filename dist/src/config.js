// Config resolution for the Plurum plugin.
//
// The API key is intentionally NOT in the manifest configSchema. Per the
// OpenClaw extension boundary rules, secrets belong in env / credentials
// flows, not in plugin metadata that gets inspected during discovery. We
// read PLURUM_API_KEY from the environment; the URL can be configured via
// the standard plugin config so users can self-host without env edits.
const DEFAULT_API_URL = "https://api.plurum.ai";
export const plurumConfigSchema = {
    jsonSchema: {
        type: "object",
        additionalProperties: false,
        properties: {
            apiUrl: {
                type: "string",
                format: "uri",
                default: DEFAULT_API_URL,
                description: "Plurum API base URL.",
            },
        },
    },
};
export function resolveApiUrl(pluginConfig) {
    if (pluginConfig && typeof pluginConfig === "object") {
        const v = pluginConfig.apiUrl;
        if (typeof v === "string" && v.length > 0)
            return v.replace(/\/+$/, "");
    }
    const fromEnv = process.env.PLURUM_API_URL;
    if (typeof fromEnv === "string" && fromEnv.length > 0) {
        return fromEnv.replace(/\/+$/, "");
    }
    return DEFAULT_API_URL;
}
export function resolveApiKey() {
    return (process.env.PLURUM_API_KEY ?? "").trim();
}
