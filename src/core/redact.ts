/**
 * One definition of "looks like a credential" (round 19 §0: never put
 * auth.json content or keys in a report), used where a report's text is
 * kept — the client's rolling log as it records, the screenshot's text, and
 * the server for every string a report brings with it before anything is
 * stored. The server also cuts the exact keys this instance holds, whatever
 * their shape (src/server/bug-reports.ts); these patterns catch keys it does
 * not hold.
 *
 * Ordinary lesson words stay (merge proof N1, rounds 3–4): "Basic concepts",
 * "Basic HTML5/CSS3 layouts", "Password: how long is long enough?",
 * "TOKEN: the smallest unit of a program", "Bearer authentication/
 * authorization", "sk-learn-pipelines" are not credentials. So:
 * - a key shape needs a key-like tail — a hyphenated tail must hold a
 *   digit, an unhyphenated one is long;
 * - "Basic"/"Bearer"/"Token" count as an auth scheme only in an
 *   Authorization header, or (Bearer) before a token-shaped value;
 * - `NAME: value` counts only when the value is token-shaped (letters and
 *   digits, no spaces); `NAME=value` (a config or env line) always counts,
 *   except a plain number.
 * No lookbehind: the client recorder runs this on older Safari too.
 * Every scan is bounded (key tails and lookaheads 512 characters, names 64),
 * so the time stays linear in the text: the recorder runs this on the page's
 * main thread, and a long hyphenated or repeated run used to take seconds
 * (merge proof, CI run 43292266870 diagnosis).
 */
/** A key's tail: hyphenated runs need a digit; otherwise letters/digits/_ only. */
const tail = (n: number) => `(?:(?=[A-Za-z0-9_-]{0,512}?\\d)[A-Za-z0-9_-]{${n},512}|[A-Za-z0-9_]{${n},512})`;
const KEY_SHAPES = new RegExp(`(^|[^A-Za-z0-9])(?:${[
	// OpenAI/Anthropic/OpenRouter-style, Stripe-style.
	`(?:sk|pk|rk)-${tail(16)}`, "(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9]{8,}",
	// GitHub, GitLab, Slack, Google, AWS.
	"gh[pousr]_[A-Za-z0-9]{12,}", "github_pat_[A-Za-z0-9_]{20,}", `glpat-${tail(16)}`, "xox[abpr]-[A-Za-z0-9-]{10,}", "AIza[0-9A-Za-z_-]{20,}", "AKIA[0-9A-Z]{16}",
	// Providers and search engines the app takes keys for, with the app's own
	// key gate's lengths (src/core/auth-keys.ts): Groq, Tavily (20+ in all),
	// xAI, Firecrawl (20+ in all), Hugging Face, Cerebras, NVIDIA.
	`gsk_${tail(20)}`, `tvly-${tail(15)}`, `xai-${tail(20)}`, `fc-${tail(17)}`, `hf_${tail(20)}`, `csk-${tail(20)}`, `nvapi-${tail(20)}`,
].join("|")})`, "g");
/** A value already cut by an earlier rule. */
const CUT = "\\[redacted[^\\]]*\\]";
/** The next run of non-space (a config value), or an already-cut one. */
const VALUE = `(?:${CUT}|[^\\s&"'\`]+)`;
/** A token-shaped value: letters and digits together, 8+ characters, no spaces. */
const TOKENISH = `(?:${CUT}|(?=[^\\s&"'\`]{0,512}?\\d)(?=[^\\s&"'\`]{0,512}?[A-Za-z])[^\\s&"'\`]{8,})`;
/** `=value` (not a plain number), or `: token-shaped value`. */
const ASSIGNED = `(\\s*=\\s*(?![0-9.]+(?![^\\s&"'\`]))|\\s*:\\s*(?=${TOKENISH}))${VALUE}`;
const ENV_NAME = new RegExp(`\\b((?=[A-Z0-9_]{0,64}_)[A-Z0-9_]{0,64}?(?:API_?KEY|TOKEN|SECRET|PASSWORD|CREDENTIALS?)[A-Z0-9_]{0,64})${ASSIGNED}`, "g");
// Starts only where a name can start (not inside a hyphenated run), so each run is scanned once.
const KEY_NAME = new RegExp(`(^|[^A-Za-z0-9_-])([A-Za-z0-9_-]{0,64}?(?:api[_-]?key|access[_-]?token|auth[_-]?token|refresh[_-]?token|client[_-]?secret|secret[_-]?key|private[_-]?key|password|passwd))${ASSIGNED}`, "gi");

export function redactSecrets(text: string): string {
	return text
		.replace(KEY_SHAPES, "$1[redacted key]")
		// Authorization headers: whatever follows the scheme.
		.replace(new RegExp(`(\\bauthorization["']?\\s*[:=]\\s*["']?(?:Bearer|Basic|Token|Digest)\\s+)${VALUE}`, "gi"), "$1[redacted]")
		// A bearer token outside a header: token-shaped only.
		.replace(/\b([Bb]earer\s+)(?:(?=[A-Za-z0-9._~+/=-]{0,2048}?\d)[A-Za-z0-9._~+/=-]{12,}|[A-Za-z0-9_-]{24,})/g, "$1[redacted]")
		// Keys in URLs.
		.replace(new RegExp(`([?&](?:key|token|api_key|apikey|access_token)=)(?:${CUT}|[^&\\s"'\`<>|#)\\]]+)`, "gi"), "$1[redacted]")
		// Environment-style names (NAME_KEY=value, GITHUB_TOKEN: value) and names
		// that only ever hold one (apiKey=…, client_secret: …, password=…).
		.replace(ENV_NAME, "$1$2[redacted]")
		.replace(KEY_NAME, "$1$2$3[redacted]")
		// "apiKey": "…" in JSON (a quoted name).
		.replace(/("[A-Za-z0-9_-]{0,64}?(?:api[_-]?key|token|secret|password|authorization|credential)s?"\s*:\s*)"[^"]*"/gi, "$1\"[redacted]\"");
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
