import assert from "node:assert/strict";
import http from "node:http";
import { test } from "node:test";
import { createAdmission } from "../../electron/local-service-ingress.cjs";

test("HTTPS admission uses host-bound cookies and rejects sibling-origin or ambiguous sessions", async () => {
	const origin = "https://normal.synthetic.ts.net";
	const admission = createAdmission([origin]);
	let writes = 0;
	const server = http.createServer((request, response) => admission.handle(request, response, () => {
		if (request.method === "POST") writes++;
		response.writeHead(200).end("admitted");
	}));
	await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
	const send = (method, route, headers = {}, contents) => new Promise((resolve, reject) => {
		const request = http.request({ host: "127.0.0.1", port: server.address().port, method, path: route, headers: { host: new URL(origin).host, ...headers } }, response => {
			response.resume();
			response.once("end", () => resolve({ status: response.statusCode, headers: response.headers }));
		});
		request.once("error", reject);
		request.end(contents);
	});
	try {
		const granted = await send("POST", "/__local/session", { origin, "content-type": "application/json" }, JSON.stringify({ ticket: admission.issue(origin) }));
		assert.equal(granted.status, 204);
		const cookie = granted.headers["set-cookie"][0];
		assert.match(cookie, /^__Host-lh-local-session=[a-f0-9]{64}; Path=\/; HttpOnly; SameSite=Strict; Secure$/);
		const session = cookie.split(";")[0];
		assert.equal((await send("GET", "/api/state", { cookie: session, "sec-fetch-site": "same-origin" })).status, 200);
		assert.equal((await send("POST", "/api/state", { cookie: session, origin: "https://preview.synthetic.ts.net", "sec-fetch-site": "same-site" })).status, 403);
		assert.equal((await send("GET", "/api/state", { cookie: session, "sec-fetch-site": "same-site" })).status, 403);
		assert.equal((await send("GET", "/api/state", { cookie: `${session}; ${session}` })).status, 403);
		assert.equal((await send("GET", "/api/state", { cookie: session.replace("__Host-", "") })).status, 403);
		assert.equal(writes, 0);
	} finally {
		await new Promise(resolve => server.close(resolve));
	}
});
