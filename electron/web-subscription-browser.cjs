"use strict";

const { cookieName } = require("./local-service-ingress.cjs");

/** Desktop-dev has no tabs. Resolve only an opaque action on its own Next
 * server, then open the owner-validated provider page outside the renderer.
 * The caller must authenticate its trusted app main frame first. */
async function openWebSubscriptionBrowser(action, origin, { fetch: request = globalThis.fetch, cookies, openExternal }) {
	if (typeof action !== "string" || !/^\/api\/subscriptions\/browser\?id=[0-9a-f-]{36}$/.test(action)) throw new Error("Invalid sign-in action.");
	const targetURL = new URL(action, origin);
	const headers = { origin, "x-learnharness-subscriptions": "1" };
	if (cookies) {
		const name = cookieName(origin);
		const sessions = await cookies.get({ url: targetURL.href, name });
		if (sessions.length !== 1 || !/^[a-f0-9]{64}$/.test(sessions[0].value)) throw new Error("Sign-in requires an admitted service session.");
		headers.cookie = `${name}=${sessions[0].value}`;
	}
	const response = await request(targetURL, {
		method: "POST", redirect: "manual", credentials: "omit",
		headers,
		signal: AbortSignal.timeout(15000),
	});
	const target = response.headers.get("location");
	if (response.status !== 303 || !target) throw new Error("Sign-in action expired.");
	const parsed = new URL(target);
	if (parsed.protocol !== "https:" || parsed.username || parsed.password) throw new Error("Invalid provider page.");
	await openExternal(target);
}
module.exports = { openWebSubscriptionBrowser };
