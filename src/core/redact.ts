/**
 * One definition of "looks like a credential" (round 19 §0: never put
 * auth.json content or keys in a report), used where a report's text is
 * kept — the client's rolling log as it records, and the server for every
 * string a report brings with it before anything is stored. The server also
 * cuts the exact keys this instance holds, whatever their shape
 * (src/server/bug-reports.ts); these patterns catch keys it does not hold.
 *
 * Ordinary words stay: "Basic concepts", "tokens: how a tokenizer works",
 * "Bearer bonds" are not credentials (merge proof N1, round 3).
 */
const KEY_SHAPES = new RegExp([
	// OpenAI/Anthropic/OpenRouter-style, Stripe-style.
	"(?:sk|pk|rk)-[A-Za-z0-9_-]{8,}", "(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9]{8,}",
	// GitHub, GitLab, Slack, Google, AWS.
	"gh[pousr]_[A-Za-z0-9]{12,}", "github_pat_[A-Za-z0-9_]{20,}", "glpat-[A-Za-z0-9_-]{16,}", "xox[abpr]-[A-Za-z0-9-]{10,}", "AIza[0-9A-Za-z_-]{20,}", "AKIA[0-9A-Z]{16}",
	// Providers and search engines the app takes keys for: Groq, Tavily, xAI,
	// Firecrawl, Hugging Face, Cerebras, NVIDIA.
	"gsk_[A-Za-z0-9]{20,}", "tvly-(?:dev-|prod-)?[A-Za-z0-9]{16,}", "xai-[A-Za-z0-9]{20,}", "fc-[A-Fa-f0-9]{24,}", "hf_[A-Za-z0-9]{20,}", "csk-[A-Za-z0-9]{20,}", "nvapi-[A-Za-z0-9_-]{20,}",
].map((shape) => `\\b${shape}`).join("|"), "g");
/** A value already cut by an earlier rule, or the next run of non-space. */
const VALUE = "(?:\\[redacted[^\\]]*\\]|[^\\s&\"'`]+)";

export function redactSecrets(text: string): string {
	return text
		.replace(KEY_SHAPES, "[redacted key]")
		// Authorization headers: a token-shaped value only (digits or symbols, or long).
		.replace(/\b([Bb]earer)\s+(?:(?=[A-Za-z0-9._~+/=-]*[0-9._~+/=])[A-Za-z0-9._~+/=-]{8,}|[A-Za-z0-9._~+/=-]{16,})/g, "$1 [redacted]")
		.replace(/\b(Basic)\s+(?=[A-Za-z0-9+/]*[0-9+/=])[A-Za-z0-9+/]{8,}={0,2}/g, "$1 [redacted]")
		// Keys in URLs.
		.replace(/([?&](?:key|token|api_key|apikey|access_token)=)(?:\[redacted[^\]]*\]|[^&\s"'`<>|#)\]]+)/gi, "$1[redacted]")
		// Environment-style names: NAME_KEY=value, GITHUB_TOKEN: value …
		.replace(new RegExp(`\\b([A-Z0-9_]*(?:API_?KEY|TOKEN|SECRET|PASSWORD|CREDENTIALS?)[A-Z0-9_]*)\\s*[:=]\\s*${VALUE}`, "g"), "$1=[redacted]")
		// Names that only ever hold one: apiKey=…, client_secret: …, password: …
		.replace(new RegExp(`\\b([A-Za-z0-9_-]*?(?:api[_-]?key|access[_-]?token|auth[_-]?token|refresh[_-]?token|client[_-]?secret|secret[_-]?key|private[_-]?key|password|passwd))\\s*[:=]\\s*${VALUE}`, "gi"), "$1=[redacted]")
		// "apiKey": "…" in JSON (a quoted name).
		.replace(/("[A-Za-z0-9_-]*?(?:api[_-]?key|token|secret|password|authorization|credential)s?"\s*:\s*)"[^"]*"/gi, "$1\"[redacted]\"");
}

/**
 * Every string inside a value redacted, field names included (objects and
 * arrays walked). Anything nested deeper than `depth` is dropped rather than
 * kept unread. `redact` defaults to the shared patterns.
 */
export function redactDeep<T>(value: T, depth = 8, redact: (text: string) => string = redactSecrets): T {
	if (typeof value === "string") return redact(value) as T;
	if (value === null || typeof value !== "object") return value;
	if (depth <= 0) return "[too deep]" as T;
	if (Array.isArray(value)) return value.map((item) => redactDeep(item, depth - 1, redact)) as T;
	return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [redact(key), redactDeep(item, depth - 1, redact)])) as T;
}
