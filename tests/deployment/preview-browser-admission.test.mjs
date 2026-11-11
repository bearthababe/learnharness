import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import test from "node:test";
import { previewBrowserAdmitted } from "../../scripts/lib/preview-browser-admission.mjs";
import { proxyFor } from "../../scripts/lib/preview-proxy.mjs";

const chromium = '"Not_A Brand";v="99", "Chromium";v="152", "Google Chrome";v="152"';

test("preview admission requires a verified engine declaration, never the spoofable User-Agent alone", () => {
	assert.equal(previewBrowserAdmitted({ "sec-ch-ua": chromium }), true);
	assert.equal(previewBrowserAdmitted({ "sec-ch-ua": '"Chromium";v="155", "Not A(Brand";v="24"' }), true);
	for (const headers of [
		{}, { "user-agent": "Mozilla/5.0 Chrome/152.0.7977.42 Safari/537.36" },
		{ "sec-ch-ua": '"Firefox";v="159"' }, { "sec-ch-ua": '"Chromium";v="151"' },
		{ "sec-ch-ua": '"Chromium";v="153"' }, { "sec-ch-ua": '"Chromium";v="9999"' },
		{ "sec-ch-ua": '"Chromium";v="152", "Google Chrome";v="151"' },
		{ "sec-ch-ua": '"Chromium";v="152", "Brave";v="152"' },
		{ "sec-ch-ua": '"Chromium";v="152", "Chromium";v="152"' },
		{ "sec-ch-ua": `${chromium}, invalid` }, { "sec-ch-ua": `${chromium}\r\nextra` },
		{ "sec-ch-ua": [chromium] }, { "sec-ch-ua": "x".repeat(513) },
		{ "x-lh-desktop-secret": "not-browser-admission", "x-forwarded-for": "127.0.0.1" },
	]) assert.equal(previewBrowserAdmitted(headers), false, JSON.stringify(headers));
});

test("unsupported preview requests receive only trusted inert text and never reach PR content", async () => {
	const directory = fs.mkdtempSync("/tmp/lh-browser-admission-");
	const socketPath = `${directory}/app.sock`;
	let requests = 0;
	let forwarded;
	const upstream = http.createServer((request, response) => {
		requests++; forwarded = request.headers;
		response.setHeader("content-type", "text/html");
		response.setHeader("set-cookie", "source=untrusted");
		response.end("<script>globalThis.untrustedSourceExecuted=true</script>");
	});
	await new Promise(resolve => upstream.listen(socketPath, resolve));
	const reservation = http.createServer();
	await new Promise(resolve => reservation.listen(0, "127.0.0.1", resolve));
	const port = reservation.address().port;
	await new Promise(resolve => reservation.close(resolve));
	const origin = `http://127.0.0.1:${port}`;
	const proxy = proxyFor({ id: "admission-regression", origin }, socketPath);
	await new Promise(resolve => proxy.listen(port, "127.0.0.1", resolve));
	try {
		for (const suffix of ["/", "/?browser=chrome", "/_next/static/source.js", "/api/chats"]) {
			const response = await fetch(`${origin}${suffix}`, { headers: { "user-agent": "Chrome/152.0.7977.42", "sec-fetch-site": "same-origin" } });
			assert.equal(response.status, 403);
			assert.match(response.headers.get("content-type"), /^text\/plain/);
			assert.equal(response.headers.get("set-cookie"), null);
			assert.equal(response.headers.get("cache-control"), "no-store");
			assert.match(response.headers.get("content-security-policy"), /default-src 'none'/);
			assert.match(response.headers.get("vary"), /Sec-CH-UA/i);
			assert.doesNotMatch(await response.text(), /untrustedSourceExecuted|<script/);
		}
		assert.equal(requests, 0);
		const accepted = await fetch(origin, { headers: { "sec-ch-ua": chromium } });
		assert.equal(accepted.status, 200);
		assert.match(await accepted.text(), /untrustedSourceExecuted/);
		assert.equal(requests, 1);
		assert.equal(forwarded["sec-ch-ua"], undefined);
		assert.match(accepted.headers.get("vary"), /Sec-CH-UA/i);
	} finally {
		proxy.stopUpgrades();
		proxy.closeAllConnections(); upstream.closeAllConnections();
		await Promise.all([new Promise(resolve => proxy.close(resolve)), new Promise(resolve => upstream.close(resolve))]);
		fs.rmSync(directory, { recursive: true, force: true });
	}
});
