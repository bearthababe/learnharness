import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import dgram from "node:dgram";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { proxyFor } from "../../../../scripts/lib/preview-proxy.mjs";
import { createAdmission } from "../../../../electron/local-service-ingress.cjs";

const { values } = parseArgs({ options: {
	engine: { type: "string" }, tooling: { type: "string" }, executable: { type: "string" },
	run: { type: "string" }, spec: { type: "string" },
} });
assert.ok(["firefox", "webkit", "chromium"].includes(values.engine) && values.tooling && values.run && values.spec,
	"Usage: node browser-egress.mjs --engine firefox|webkit|chromium --tooling PLAYWRIGHT_MODULE --spec PRIVATE_SPEC --run NEW_DIRECTORY [--executable BROWSER]");
const run = path.resolve(values.run);
fs.mkdirSync(run, { mode: 0o700 });
const directory = fs.mkdtempSync("/tmp/lh-engine-egress-");
const root = path.resolve(import.meta.dirname, "../../../..");
const checksum = filename => createHash("sha256").update(fs.readFileSync(filename)).digest("hex");
const sourceFiles = ["scripts/lib/preview-proxy.mjs", "scripts/lib/preview-browser-admission.mjs", "electron/local-service-ingress.cjs", ".agents/skills/prove-learnharness/scripts/browser-egress.mjs"];
const fingerprint = () => Object.fromEntries(sourceFiles.map(filename => [filename, checksum(path.join(root, filename))]));
const expectAdmission = values.engine === "chromium";
const record = {
	schemaVersion: 1, status: "running", checker: "automation driver; not an independent verdict",
	startedAt: new Date().toISOString(), engine: values.engine, source: fingerprint(),
	answerKey: { path: path.resolve(values.spec), sha256: checksum(values.spec), contract: "Preview isolation; section 4 row 7" },
	expected: { preview: expectAdmission ? "Actual PR-like script executes with zero network escape" : "HTTP403, no PR content or execution", controlDatagrams: "greater than zero" },
	checks: [], cleanup: {}, requests: [], limitations: [
		"Synthetic HTTP proxy documents, not trusted private HTTPS or full-app/native/helper proof",
		"Refusal of an unsafe client proves denial, not functional preview support in that browser",
		"Linux WebKit is not physical iOS Safari",
		"All ten complete deployment rows remain BLOCKED",
	],
};
const save = () => {
	const temporary = path.join(run, "result.json.tmp");
	fs.writeFileSync(temporary, `${JSON.stringify(record, null, 2)}\n`, { mode: 0o600 });
	fs.renameSync(temporary, path.join(run, "result.json"));
};
const servers = [];
let browser;
let upstreamRequests = 0;
let target;
const listen = async (server, ...argumentsList) => {
	servers.push(server);
	await new Promise((resolve, reject) => { server.once("error", reject); server.listen(...argumentsList, resolve); });
};
const document = (_request, response) => {
	response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
	response.end(`<!doctype html><p>Owned untrusted source probe</p><script>
globalThis.ownedPreviewProbe={executed:true,candidates:0};
(async()=>{let peer;try{peer=new RTCPeerConnection({iceServers:[{urls:${JSON.stringify(`stun:${target.host}:${target.port}`)}}]});peer.onicecandidate=event=>{if(event.candidate)globalThis.ownedPreviewProbe.candidates++};peer.createDataChannel('owned-source-probe');await peer.setLocalDescription(await peer.createOffer());await new Promise(resolve=>setTimeout(resolve,3500))}catch(error){globalThis.ownedPreviewProbe.refused=error.name}finally{peer?.close()}})();
</script>`);
};
async function probe(name, url, host, { userAgent } = {}) {
	const endpoint = dgram.createSocket("udp4");
	let datagrams = 0;
	endpoint.on("message", () => { datagrams++; });
	const context = await browser.newContext(userAgent ? { userAgent } : {});
	try {
		await new Promise((resolve, reject) => { endpoint.once("error", reject); endpoint.bind(0, host, resolve); });
		target = { host, port: endpoint.address().port };
		const before = upstreamRequests;
		const page = await context.newPage();
		let response;
		page.on("response", incoming => { if (incoming.request().isNavigationRequest() && incoming.request().frame() === page.mainFrame()) response = incoming; });
		await page.goto(url);
		await page.waitForTimeout(3800);
		assert.ok(response, "Actual final main-document response required");
		const observed = { status: response.status(), datagrams, upstreamRequests: upstreamRequests - before,
			renderer: await page.evaluate(() => globalThis.ownedPreviewProbe ?? null),
			contentType: response.headers()["content-type"], policies: { csp: response.headers()["content-security-policy"] ?? null, connectionAllowlist: response.headers()["connection-allowlist"] ?? null } };
		if (name === "normal-control") {
			observed.normalSessionAdmitted = (await context.cookies(url)).some(cookie => cookie.name === "lh-local-session" && cookie.httpOnly);
			observed.passed = observed.status === 200 && observed.datagrams > 0 && observed.renderer?.executed === true && observed.normalSessionAdmitted;
		}
		else if (expectAdmission) observed.passed = observed.status === 200 && observed.datagrams === 0 && observed.renderer?.executed === true && observed.upstreamRequests > 0 && observed.policies.connectionAllowlist === "(response-origin); redirects=allow";
		else {
			observed.passed = observed.status === 403 && observed.datagrams === 0 && observed.renderer === null && observed.upstreamRequests === 0 && /^text\/plain/.test(observed.contentType) && /default-src 'none'/.test(observed.policies.csp);
			if (observed.status === 403 && observed.upstreamRequests === 0) {
				const marker = `/?forged-client-hint=${name}`;
				const forgeryContext = await browser.newContext({ bypassCSP: true, ...(userAgent ? { userAgent } : {}) });
				try {
					const forgeryPage = await forgeryContext.newPage();
					const refusal = await forgeryPage.goto(url);
					observed.forgeryDocumentStatus = refusal.status();
					if (refusal.status() === 403) observed.forgedHintStatus = await forgeryPage.evaluate(async marker => (await fetch(marker, { headers: { "Sec-CH-UA": '"Chromium";v="152", "Google Chrome";v="152"' } })).status, marker);
				} finally { await forgeryContext.close(); }
				const request = record.requests.findLast(request => request.path === marker);
				observed.forgedHintReceived = request?.clientHint ?? null;
				observed.forgeryException = "CSP bypass only on already-refused trusted plain-text document, to test forbidden request-header forgery; no PR content served";
				observed.passed &&= observed.forgeryDocumentStatus === 403 && observed.forgedHintStatus === 403 && request !== undefined && request.clientHint === null && upstreamRequests === before;
			}
		}
		record.checks.push({ name, observed }); save();
	} finally {
		await context.close();
		await new Promise(resolve => { try { endpoint.close(resolve); } catch { resolve(); } });
	}
}
save();
try {
	const host = Object.entries(os.networkInterfaces()).filter(([name]) => name !== "tailscale0")
		.flatMap(([, addresses]) => addresses).find(address => address.family === "IPv4" && !address.internal)?.address;
	assert.ok(host, "A bindable owned non-loopback IPv4 interface is required for the negative control");
	const backend = http.createServer((request, response) => { upstreamRequests++; document(request, response); });
	const socketPath = path.join(directory, "app.sock");
	await listen(backend, socketPath);
	let normalAdmission;
	const normal = http.createServer((request, response) => { void normalAdmission.handle(request, response, () => document(request, response)); });
	await listen(normal, 0, "127.0.0.1");
	const normalOrigin = `http://127.0.0.1:${normal.address().port}`;
	normalAdmission = createAdmission([normalOrigin]);
	assert.equal((await fetch(normalOrigin)).status, 403, "Normal service still requires its own admission");
	const reservation = http.createServer();
	await listen(reservation, 0, "127.0.0.1");
	const port = reservation.address().port;
	await new Promise(resolve => reservation.close(resolve));
	const ticket = { id: "browser-engine-diagnostic", origin: `http://127.0.0.1:${port}` };
	const preview = proxyFor(ticket, socketPath);
	preview.prependListener("request", request => record.requests.push({ path: request.url, clientHint: request.headers["sec-ch-ua"] ?? null }));
	await listen(preview, port, "127.0.0.1");
	const tooling = await import(pathToFileURL(path.resolve(values.tooling)).href);
	const home = path.join(directory, "home");
	fs.mkdirSync(home, { mode: 0o700 });
	browser = await tooling[values.engine].launch({ headless: true,
		...(values.engine === "chromium" ? { chromiumSandbox: true } : {}),
		...(values.executable ? { executablePath: path.resolve(values.executable) } : {}),
		env: { PATH: process.env.PATH, HOME: home, LANG: "C.UTF-8" },
	});
	record.browser = browser.version();
	await probe("preview-first", ticket.origin, host);
	await probe("normal-control", `${normalOrigin}/__local/admit#${normalAdmission.issue(normalOrigin)}`, host);
	await probe("preview-again", ticket.origin, host);
	if (!expectAdmission) await probe("preview-chrome-user-agent", ticket.origin, host, { userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.7977.42 Safari/537.36" });
	record.status = !record.checks.find(check => check.name === "normal-control").observed.passed ? "blocked" : record.checks.every(check => check.observed.passed) ? "passed-scoped-diagnostic" : "failed";
} catch (error) { record.status = "blocked"; record.error = error.stack; }
finally {
	try { await browser?.close(); record.cleanup.browserStopped = !browser?.isConnected(); }
	catch (error) { record.cleanup.browserStopped = false; record.cleanup.browserError = error.message; }
	for (const server of servers) {
		server.stopUpgrades?.();
		if (server.listening) await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
	}
	record.cleanup.listenersClosed = servers.every(server => !server.listening);
	fs.rmSync(directory, { recursive: true, force: true });
	record.cleanup.temporaryProfileRemoved = !fs.existsSync(directory);
	record.sourceAfter = fingerprint();
	record.sourceUnchanged = JSON.stringify(record.source) === JSON.stringify(record.sourceAfter);
	if (!record.sourceUnchanged || !record.cleanup.browserStopped || !record.cleanup.listenersClosed) record.status = "blocked";
	record.finishedAt = new Date().toISOString(); save();
	fs.writeFileSync(path.join(run, "receipt.md"), `# Browser admission and egress diagnostic\n\nVerdict: ${record.status}\nChecker: ${record.checker}\n\nContract: ${record.expected.preview}; a working normal-page control is required.\nObserved: ${record.checks.map(check => `${check.name}: HTTP${check.observed.status}, packets=${check.observed.datagrams}, PR requests=${check.observed.upstreamRequests}, passed=${check.observed.passed}`).join("; ") || "browser startup not reached"}.\n${record.error ?? ""}\n\nAll ten deployment rows remain BLOCKED. A browser refusal is not functional preview support. See result.json for source identity, forgery-control exceptions, policies, cleanup and limitations.\n`, { mode: 0o600 });
}
console.log(JSON.stringify({ run, status: record.status, checks: record.checks.map(check => ({ name: check.name, ...check.observed })), cleanup: record.cleanup }));
process.exitCode = record.status === "passed-scoped-diagnostic" ? 0 : record.status === "failed" ? 1 : 2;
