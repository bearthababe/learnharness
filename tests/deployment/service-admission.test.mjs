import assert from "node:assert/strict";
import http from "node:http";
import { test } from "node:test";
import { createAdmission } from "../../electron/local-service-ingress.cjs";
import { originValue } from "../../electron/local-service-protocol.cjs";

test("real HTTP ingress binds host, origin and one-use session before any app handler", async context => {
	let applicationCalls = 0;
	let admission;
	const server = http.createServer((request, response) => {
		void admission.handle(request, response, incoming => {
			applicationCalls++;
			response.writeHead(200, { "Content-Type": "application/json" });
			response.end(JSON.stringify({ forwarded: incoming.headers["x-forwarded-host"] ?? null, desktop: incoming.headers["x-learnharness-desktop"] ?? null, protocol: incoming.headers["x-forwarded-proto"] }));
		});
	});
	await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
	context.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
	const origin = `http://127.0.0.1:${server.address().port}`;
	const remote = "https://synthetic.invalid:8452";
	admission = createAdmission([origin, remote]);
	const send = (route = "/api/settings", options = {}) => new Promise((resolve, reject) => {
		const request = http.request(origin + route, { method: options.method, headers: options.headers }, response => {
			const chunks = [];
			response.on("data", chunk => chunks.push(chunk));
			response.on("end", () => resolve(new Response([204, 304].includes(response.statusCode) ? null : Buffer.concat(chunks), { status: response.statusCode, headers: response.headers })));
		});
		request.on("error", reject);
		request.end(options.body);
	});
	for (const route of ["/", "/api/settings", "/api/subscriptions", "/api/runtime", "/_next/static/private.js"]) assert.equal((await send(route)).status, 403);
	assert.equal(applicationCalls, 0);
	const ticket = admission.issue(origin);
	const exchange = (value, headers = {}) => send("/__local/session", { method: "POST", headers: { origin, "Content-Type": "application/json", ...headers }, body: JSON.stringify({ ticket: value }) });
	assert.equal((await exchange(ticket, { origin: "https://wrong.invalid" })).status, 403);
	assert.equal((await exchange(ticket, { host: "wrong.invalid" })).status, 403);
	assert.equal((await exchange(ticket, { "sec-fetch-site": "cross-site" })).status, 403);
	const admitted = await exchange(ticket);
	assert.equal(admitted.status, 204);
	const cookie = admitted.headers.get("set-cookie").split(";")[0];
	assert.match(admitted.headers.get("set-cookie"), /HttpOnly; SameSite=Strict/);
	assert.equal((await exchange(ticket)).status, 403, "Admission cannot replay");
	for (const headers of [{}, { cookie: "lh-local-session=wrong" }, { cookie: `${cookie}; ${cookie}` }, { cookie, origin: "https://wrong.invalid" }, { cookie, host: "wrong.invalid" }, { cookie, host: "synthetic.invalid:8452" }, { cookie, "sec-fetch-site": "same-site" }, { cookie, "sec-fetch-site": "cross-site" }]) assert.equal((await send("/api/settings", { headers })).status, 403);
	for (const method of ["POST", "PUT", "PATCH", "DELETE", "OPTIONS"]) {
		assert.equal((await send("/api/settings", { method, headers: { cookie } })).status, 403);
		assert.equal((await send("/api/settings", { method, headers: { cookie, origin } })).status, 200);
	}
	const authorized = await send("/api/runtime", { headers: { cookie, "x-forwarded-host": "attacker.invalid", "x-learnharness-desktop": "forged", "x-forwarded-proto": "ftp" } });
	assert.equal(authorized.status, 200);
	assert.deepEqual(await authorized.json(), { forwarded: null, desktop: null, protocol: "http" });
	const remoteTicket = admission.issue(remote);
	const remoteResponse = await exchange(remoteTicket, { host: "synthetic.invalid:8452", origin: remote });
	assert.equal(remoteResponse.status, 204);
	assert.match(remoteResponse.headers.get("set-cookie"), /; Secure$/);
	assert.equal((await send("/", { headers: { cookie: remoteResponse.headers.get("set-cookie").split(";")[0] } })).status, 403);
	assert.throws(() => admission.issue("https://not-configured.invalid"), /not configured/);
});

test("origin configuration refuses paths, credentials, insecure remote and ambiguous host protocols", () => {
	for (const value of ["http://example.invalid", "https://example.invalid/", "https://user@example.invalid", "https://example.invalid/path", "https://example.invalid?query", "file:///tmp"]) assert.throws(() => originValue(value));
	assert.equal(originValue("http://127.0.0.1:3810"), "http://127.0.0.1:3810");
	assert.throws(() => createAdmission(["http://127.0.0.1:3810", "https://127.0.0.1:3810"]), /distinct hosts/);
});
