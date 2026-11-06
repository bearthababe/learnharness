/**
 * A raw provider failure ("401: {json}") as a sentence with a next step,
 * keeping the status and the provider's own message. Null for anything that
 * is not in that shape (callers show their message as worded). Pure.
 */
export function friendlyProviderError(message: string): string | null {
	const m = /^(\d{3}): (\{[\s\S]*\})$/.exec(message.trim());
	if (!m) return null;
	let detail = "";
	try {
		const parsed = JSON.parse(m[2]!) as { message?: unknown; error?: unknown };
		detail = String(parsed.message ?? parsed.error ?? "");
	} catch { /* keep the status alone */ }
	const status = Number(m[1]);
	const hint = status === 401 || status === 403
		? "The model provider refused the request; check its key in Settings → Providers."
		: status === 429
			? "The model provider is rate-limiting requests; wait a moment and retry."
			: "The model provider returned an error; retry in a moment.";
	return `${hint} (${status}${detail ? ` · ${detail}` : ""})`;
}
