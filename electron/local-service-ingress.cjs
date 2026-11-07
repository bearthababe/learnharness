const { randomBytes } = require("node:crypto");

const COOKIE = "lh-local-session";
const token = () => randomBytes(32).toString("hex");

function createAdmission(origins) {
	const byHost = new Map(origins.map(origin => [new URL(origin).host, origin]));
	if (byHost.size !== origins.length) throw new Error("Service origins must have distinct hosts");
	const tickets = new Map();
	const sessions = new Map();
	function issue(origin) {
		if (!origins.includes(origin)) throw new Error("Origin is not configured");
		for (const [key, value] of tickets) if (value.expires < Date.now()) tickets.delete(key);
		const ticket = token();
		tickets.set(ticket, { origin, expires: Date.now() + 60000 });
		return ticket;
	}
	function exchange(ticket, origin) {
		const grant = tickets.get(ticket);
		if (!grant || grant.origin !== origin) return;
		tickets.delete(ticket);
		if (grant.expires < Date.now()) return;
		const session = token();
		sessions.set(session, origin);
		return session;
	}
	function addressed(request) {
		const origin = byHost.get(request.headers.host);
		if (!origin || !request.url?.startsWith("/") || request.url.startsWith("//") || request.url.includes("\\")) return;
		if (request.headers["sec-fetch-site"] && !["same-origin", "none"].includes(request.headers["sec-fetch-site"])) return;
		if (request.headers.origin && request.headers.origin !== origin) return;
		if (!["GET", "HEAD"].includes(request.method) && request.headers.origin !== origin) return;
		return origin;
	}
	function authenticated(request, origin) {
		const values = (request.headers.cookie || "").split(";").map(value => value.trim()).filter(value => value.startsWith(`${COOKIE}=`));
		return values.length === 1 && sessions.get(values[0].slice(COOKIE.length + 1)) === origin;
	}
	function refuse(response, status = 403) {
		response.writeHead(status, { "Cache-Control": "no-store", "Content-Type": "text/plain", "Referrer-Policy": "no-referrer" });
		response.end("Local service requires an admitted same-origin session.");
	}
	async function handle(request, response, next) {
		const origin = addressed(request);
		if (!origin) return refuse(response);
		const pathname = new URL(request.url, origin).pathname;
		if (pathname === "/__local/admit" && request.method === "GET") {
			const nonce = token();
			response.writeHead(200, { "Cache-Control": "no-store", "Content-Type": "text/html; charset=utf-8", "Referrer-Policy": "no-referrer", "Content-Security-Policy": `default-src 'none'; script-src 'nonce-${nonce}'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'` });
			response.end(`<!doctype html><title>LearnHarness local admission</title><p id="status">Admitting this browser…</p><script nonce="${nonce}">const ticket=location.hash.slice(1);history.replaceState(null,"","/__local/admit");fetch("/__local/session",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({ticket})}).then(response=>{if(!response.ok)throw Error();location.replace("/")}).catch(()=>{document.getElementById("status").textContent="Admission expired. Request a new link locally."});</script>`);
			return;
		}
		if (pathname === "/__local/session" && request.method === "POST") {
			if (request.headers["content-type"] !== "application/json") return refuse(response);
			let contents = "";
			for await (const chunk of request) {
				contents += chunk;
				if (Buffer.byteLength(contents) > 1024) return refuse(response, 413);
			}
			let session;
			try { session = exchange(JSON.parse(contents).ticket, origin); } catch { return refuse(response); }
			if (!session) return refuse(response);
			response.writeHead(204, { "Cache-Control": "no-store", "Set-Cookie": `${COOKIE}=${session}; Path=/; HttpOnly; SameSite=Strict${origin.startsWith("https:") ? "; Secure" : ""}` });
			response.end();
			return;
		}
		if (!authenticated(request, origin)) return refuse(response);
		for (const name of Object.keys(request.headers)) if (name.startsWith("x-forwarded-") || name === "forwarded" || name === "x-learnharness-desktop" || name.startsWith("x-middleware-") || name.startsWith("x-nextjs-")) delete request.headers[name];
		request.headers["x-forwarded-proto"] = new URL(origin).protocol.slice(0, -1);
		return next(request, response);
	}
	return { issue, handle };
}

module.exports = { createAdmission, COOKIE };
