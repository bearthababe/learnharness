/**
 * One definition of "looks like a credential" (round 19 §0: never put
 * auth.json content or keys in a report), used where a report's text is
 * kept — the client's rolling log as it records, and the server for every
 * string a report brings with it before anything is stored.
 */
export function redactSecrets(text: string): string {
	return text
		// Provider keys: OpenAI/Anthropic-style, GitHub, Slack, Google.
		.replace(/\b(sk|pk|rk)-[A-Za-z0-9_-]{8,}/g, "[redacted key]")
		.replace(/\b(gh[pousr]_[A-Za-z0-9]{12,}|github_pat_[A-Za-z0-9_]{20,}|xox[abpr]-[A-Za-z0-9-]{10,}|AIza[0-9A-Za-z_-]{20,})/g, "[redacted key]")
		// Authorization headers.
		.replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi, "$1 [redacted]")
		// Keys in URLs.
		.replace(/([?&](?:key|token|api_key|apikey|access_token)=)[^&\s"']+/gi, "$1[redacted]")
		// NAME_KEY=value, TOKEN: value …
		.replace(/\b([A-Z0-9_]*(?:API_?KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL)[A-Z0-9_]*)\s*[:=]\s*[^\s&]+/gi, "$1=[redacted]")
		// "apiKey": "…" in JSON.
		.replace(/("?(?:api_?key|token|secret|password|authorization)"?\s*:\s*)"[^"]*"/gi, "$1\"[redacted]\"");
}

/** Every string inside a value, redacted (objects and arrays walked; depth-bounded). */
export function redactDeep<T>(value: T, depth = 8): T {
	if (typeof value === "string") return redactSecrets(value) as T;
	if (depth <= 0 || value === null || typeof value !== "object") return value;
	if (Array.isArray(value)) return value.map((item) => redactDeep(item, depth - 1)) as T;
	return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, redactDeep(item, depth - 1)])) as T;
}
