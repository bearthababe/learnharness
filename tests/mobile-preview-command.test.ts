/** Exercise the command boundary: no preview slot, learner data or browser needed. */
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createServer, type RequestListener } from "node:http";
import { test } from "node:test";

function run(url?: string) {
	const env = { ...process.env };
	delete env.LH_SMOKE_URL;
	delete env.LH_SMOKE_CHAT_ID;
	if (url) env.LH_SMOKE_URL = url;
	return new Promise<{ code: number | string | null; killed: boolean; output: string }>(resolve => {
		execFile(process.execPath, ["scripts/smoke-mobile-preview.mjs"], { env, timeout: 20_000 }, (error, stdout, stderr) => {
			resolve({ code: error?.code ?? 0, killed: error?.killed ?? false, output: stdout + stderr });
		});
	});
}

async function withEndpoint(reply: RequestListener, check: (url: string) => Promise<void>) {
	const server = createServer(reply);
	await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
	const address = server.address();
	assert.ok(address && typeof address !== "string");
	try { await check(`http://127.0.0.1:${address.port}/`); }
	finally {
		server.closeAllConnections();
		await new Promise<void>(resolve => server.close(() => resolve()));
	}
}

test("preview command requires an explicit destination instead of choosing a public slot", async () => {
	const result = await run();
	assert.equal(result.code, 1);
	assert.equal(result.killed, false);
	assert.match(result.output, /LH_SMOKE_URL is required/);
});

test("preview command reports an HTTP failure instead of treating a responding server as a healthy app", async () => {
	await withEndpoint((_request, response) => {
		response.writeHead(503, { "Content-Type": "text/plain" });
		response.end("Preview unavailable");
	}, async url => {
		const result = await run(url);
		assert.equal(result.code, 1);
		assert.equal(result.killed, false);
		assert.match(result.output, /HTTP 503/);
	});
});

test("preview command bounds both missing headers and a never-ending response body", async () => {
	await Promise.all([false, true].map(async sendHeaders => {
		await withEndpoint((_request, response) => {
			if (sendHeaders) {
				response.writeHead(200, { "Content-Type": "text/html" });
				response.write("<!doctype html><title>Learning Harness</title>");
			}
			// Intentionally never finish: a headers-only deadline misses this case.
		}, async url => {
			const result = await run(url);
			assert.equal(result.killed, false, `Command hung with sendHeaders=${sendHeaders}`);
			assert.equal(result.code, 1);
			assert.match(result.output, /HTTP request\/body exceeded 10000ms/);
		});
	}));
});
