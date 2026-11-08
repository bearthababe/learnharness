import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import dns from "node:dns/promises";
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import path from "node:path";
import puppeteer from "puppeteer-core";
import { createAdmission } from "../electron/local-service-ingress.cjs";
import { alive } from "./lib/ticket-state.mjs";
import { previewCookiePrefix, proxyFor } from "./lib/preview-proxy.mjs";
import { createPreviewTransport } from "./lib/preview-tailnet.mjs";
import { probeBrowserRTC } from "./lib/prove-browser-rtc.mjs";

const [output, configurationPath, configuredNormalOrigin, configuredNormalPort] = process.argv.slice(2);
assert.ok(output && configurationPath && configuredNormalOrigin && configuredNormalPort, "Usage: node scripts/prove-preview-tailnet.mjs RUN OWNED_NODE_JSON NORMAL_HTTPS_ORIGIN NORMAL_LOOPBACK_PORT");
const run = path.resolve(output);
fs.mkdirSync(run, { recursive: true, mode: 0o700 });
const configuration = JSON.parse(fs.readFileSync(configurationPath, "utf8"));
assert.ok(alive(configuration.owner), "Owned disposable daemon is not running");
const tailscale = (...argumentsList) => execFileSync("/usr/bin/tailscale", [`--socket=${configuration.socket}`, ...argumentsList], { encoding: "utf8", timeout: 60_000, stdio: ["ignore", "pipe", "pipe"] });
const systemRoutes = () => JSON.parse(execFileSync("/usr/bin/tailscale", ["serve", "status", "--json"], { encoding: "utf8", timeout: 10_000 }));
const ownedRoutes = () => JSON.parse(tailscale("serve", "status", "--json"));
const node = JSON.parse(tailscale("status", "--json"));
assert.ok(node.BackendState === "Running" && node.Self?.Online && node.Self.DNSName, "Owned node must be authorized and online");
const previewOrigin = `https://${node.Self.DNSName.replace(/\.$/, "")}`;
const normalOrigin = new URL(configuredNormalOrigin).origin;
const diagnosticPath = "/__prove__/ingress-negative-control";
assert.equal(new URL(normalOrigin).protocol, "https:");
assert.notEqual(new URL(normalOrigin).hostname, new URL(previewOrigin).hostname);
assert.equal(new URL(normalOrigin).hostname.split(".").slice(1).join("."), new URL(previewOrigin).hostname.split(".").slice(1).join("."), "Probe requires sibling private tailnet hostnames");
const routesBefore = systemRoutes();
assert.deepEqual(ownedRoutes(), {}, "Disposable node already has Serve configuration; refusing to replace it");
assert.equal(routesBefore.Web?.[new URL(normalOrigin).host]?.Handlers?.["/"]?.Proxy, `http://127.0.0.1:${Number(configuredNormalPort)}`, "Normal fixture requires its already-authorized exact loopback route");
const browserPath = process.env.CHROMIUM_PATH ?? path.join(process.env.HOME, ".cache/puppeteer/chrome/linux-152.0.7977.42/chrome-linux64/chrome");
const fingerprint = () => Object.fromEntries(["scripts/prove-preview-tailnet.mjs", "scripts/lib/preview-proxy.mjs", "scripts/lib/preview-browser-admission.mjs", "scripts/lib/preview-tailnet.mjs", "scripts/lib/prove-browser-rtc.mjs", "electron/local-service-ingress.cjs"].map(filename => [filename, createHash("sha256").update(fs.readFileSync(new URL(`../${filename}`, import.meta.url))).digest("hex")]));
const record = { schemaVersion: 1, status: "running", checker: "builder; independent final acceptance required", startedAt: new Date().toISOString(), source: fingerprint(), origins: { normal: normalOrigin, preview: previewOrigin }, environment: { browserPath, transport: "actual private Tailscale Serve HTTPS; no certificate or DNS overrides" }, limitations: ["Synthetic backend, not full LearnHarness/helper/packaged preview proof", "One real preview hostname; simultaneous pool and per-source hostname provisioning remain unproved", "Physical iOS Safari unproved", "All ten full-deployment rows remain BLOCKED"], steps: [], requests: [], previewRequests: [] };
record.negativeControlExceptions = [];
const save = () => fs.writeFileSync(path.join(run, "result.json"), JSON.stringify(record, null, 2), { mode: 0o600 });
const step = (name, observed) => { record.steps.push({ name, status: "passed", observed, at: new Date().toISOString() }); save(); };
const temporary = fs.mkdtempSync("/tmp/lh-ts-browser-");
const servers = [];
const sockets = new Set();
const listen = async (server, address) => {
	servers.push(server);
	server.on("connection", socket => { sockets.add(socket); socket.once("close", () => sockets.delete(socket)); });
	await new Promise((resolve, reject) => { server.once("error", reject); typeof address === "string" ? server.listen(address, resolve) : server.listen(address, "127.0.0.1", resolve); });
	return server;
};
const inspectTLS = origin => new Promise((resolve, reject) => {
	const request = https.get(origin, { timeout: 60_000, agent: false }, response => {
		const details = { status: response.statusCode, authorized: response.socket.authorized, protocol: response.socket.getProtocol(), subject: response.socket.getPeerCertificate().subject, issuer: response.socket.getPeerCertificate().issuer };
		response.resume();
		response.once("end", () => resolve(details));
	});
	request.once("timeout", () => request.destroy(new Error("Private HTTPS probe timed out")));
	request.once("error", reject);
});
const probeIngress = async (page, targetOrigin, requests) => {
	const firstRequest = requests.length;
	const sourceOrigin = new URL(page.url()).origin;
	const browserObservation = await page.evaluate(async origin => {
		let post;
		try { const response = await fetch(`${origin}/api/write`, { method: "POST", credentials: "include", headers: { "Content-Type": "text/plain" }, body: "must-not-write" }); post = { status: response.status }; }
		catch (error) { post = { browserRefusal: error.name }; }
		await new Promise(resolve => {
			const image = new Image();
			image.onload = image.onerror = () => resolve();
			image.src = `${origin}/pixel?must-not-run`;
		});
		return { post };
	}, targetOrigin);
	const observed = requests.slice(firstRequest);
	const post = observed.find(request => request.path === "/api/write" && request.method === "POST" && request.origin === sourceOrigin && request.status === 403 && request.site === "same-site" && request.hasSessionCookie);
	const image = observed.find(request => request.path === "/pixel?must-not-run" && request.method === "GET" && !request.origin && request.status === 403 && request.site === "same-site" && request.hasSessionCookie);
	assert.ok(post, "Ingress must observe and deny the actual cookie-bearing same-site POST; a browser policy refusal is not ingress proof");
	assert.ok(image, "Ingress must observe and deny the actual cookie-bearing originless same-site image GET");
	return { browserObservation, post, image };
};
let browser;
let proxy;
const transport = createPreviewTransport();
let binding;
let routeOwner;
let writes = 0;
let previewWrites = 0;
save();
try {
	const admission = createAdmission([normalOrigin]);
	await listen(http.createServer((request, response) => {
		response.once("finish", () => { record.requests.push({ method: request.method, path: request.url, host: request.headers.host, origin: request.headers.origin, site: request.headers["sec-fetch-site"], status: response.statusCode, hasSessionCookie: (request.headers.cookie ?? "").includes("__Host-lh-local-session=") }); save(); });
		void admission.handle(request, response, () => {
			if (request.method === "POST" && request.url === "/api/write" || request.url.startsWith("/pixel")) writes++;
			response.writeHead(200, { "Content-Type": "text/html", "Cache-Control": "no-store" });
			response.end("<!doctype html><h1>Admitted synthetic normal service</h1>");
		});
	}), Number(configuredNormalPort));
	const socketPath = path.join(temporary, "app.sock");
	await listen(http.createServer((request, response) => {
		if (request.method === "POST" && request.url === "/api/write" || request.url.startsWith("/pixel")) previewWrites++;
		response.writeHead(200, { "Content-Type": "text/html", "Set-Cookie": "session=synthetic-preview; Path=/; HttpOnly; Secure; SameSite=Strict" });
		response.end("<!doctype html><h1>Synthetic hostile preview</h1>");
	}), socketPath);
	const ticket = { id: "zz-prove-it-tailnet", origin: previewOrigin };
	proxy = proxyFor(ticket, socketPath);
	proxy.prependListener("request", (request, response) => {
		if (request.method !== "GET" || request.url !== diagnosticPath || request.headers["sec-fetch-dest"] !== "document") return;
		const writeHead = response.writeHead.bind(response);
		response.writeHead = (status, headers) => {
			const outgoing = { ...headers };
			const removed = outgoing["connection-allowlist"];
			delete outgoing["connection-allowlist"];
			record.negativeControlExceptions.push({ origin: previewOrigin, path: diagnosticPath, method: request.method, destination: "document", removedHeader: "Connection-Allowlist", removedValue: removed, cspRetained: outgoing["content-security-policy"], purpose: "Actual ingress POST/image refusal only; not preview egress proof" });
			save();
			return writeHead(status, outgoing);
		};
	});
	proxy.on("request", (request, response) => response.once("finish", () => { record.previewRequests.push({ method: request.method, path: request.url, origin: request.headers.origin, site: request.headers["sec-fetch-site"], status: response.statusCode, hasSessionCookie: (request.headers.cookie ?? "").includes(`${previewCookiePrefix(ticket)}session=`) }); save(); }));
	await listen(proxy, 0);
	const proxyPort = proxy.address().port;
	record.owned = { fixtureDirectory: temporary, ports: [Number(configuredNormalPort), proxyPort], daemonRetainedForFurtherVerification: true };
	save();
	binding = await transport.bind(configuration.socket, { normalHostname: new URL(normalOrigin).hostname });
	routeOwner = await transport.start(binding, { lease: randomUUID(), port: proxyPort });
	record.routesConfigured = ownedRoutes();
	await assert.rejects(transport.stop(binding, { ...routeOwner, lease: "stale-lease" }), /ownership changed/);
	assert.deepEqual(ownedRoutes(), record.routesConfigured);
	assert.equal(record.routesConfigured.Web?.[`${new URL(previewOrigin).hostname}:443`]?.Handlers?.["/"]?.Proxy, `http://127.0.0.1:${proxyPort}`);
	assert.ok(!record.routesConfigured.AllowFunnel || Object.values(record.routesConfigured.AllowFunnel).every(value => value === false));
	step("private-hostname-and-trusted-TLS", { dns: await dns.lookup(new URL(previewOrigin).hostname), normal: await inspectTLS(normalOrigin), preview: await inspectTLS(previewOrigin), funnel: false, productionTransport: true, staleLeaseRemovalRefused: true });
	assert.ok(record.steps[0].observed.normal.authorized && record.steps[0].observed.preview.authorized);
	browser = await puppeteer.launch({ executablePath: browserPath, headless: true, userDataDir: path.join(temporary, "browser"), args: ["--disable-dev-shm-usage", "--no-proxy-server"] });
	record.environment.browserVersion = await browser.version();
	record.owned.browserPid = browser.process()?.pid;
	save();
	const context = await browser.createBrowserContext();
	const normal = await context.newPage();
	await normal.goto(`${normalOrigin}/__local/admit#${admission.issue(normalOrigin)}`, { waitUntil: "networkidle0", timeout: 60_000 });
	await normal.waitForFunction(() => document.body.textContent.includes("Admitted synthetic normal service"));
	await normal.evaluate(() => { document.cookie = "lh-normal-canary=original; Path=/; Secure; SameSite=Strict"; });
	const originalSession = (await context.cookies(normalOrigin)).find(cookie => cookie.name === "__Host-lh-local-session");
	assert.ok(originalSession?.httpOnly && originalSession.secure);
	step("browser-admission-through-private-HTTPS", { cookie: originalSession.name, httpOnly: originalSession.httpOnly, secure: originalSession.secure });
	const preview = await context.newPage();
	const response = await preview.goto(previewOrigin, { waitUntil: "networkidle0", timeout: 60_000 });
	assert.equal(response.status(), 200);
	assert.equal(response.headers()["connection-allowlist"], "(response-origin); redirects=allow");
	assert.match(response.headers()["content-security-policy"], /connect-src 'self'/);
	step("primary-preview-retains-production-headers", { connectionAllowlist: response.headers()["connection-allowlist"], csp: response.headers()["content-security-policy"], cspBypassed: false });
	assert.match(await preview.$eval("body", element => element.textContent), /Synthetic hostile preview/);
	const previewRTC = await probeBrowserRTC(preview);
	const controlRTC = await probeBrowserRTC(normal);
	assert.ok(controlRTC.datagrams > 0, "The independent normal-page control must reach the owned STUN endpoint");
	assert.equal(previewRTC.datagrams, 0, "Preview WebRTC must not contact an unrelated UDP service");
	step("browser-webrtc-egress-refused", { preview: previewRTC, normalControl: controlRTC, ownedEndpointsClosed: true });
	const prefix = previewCookiePrefix(ticket);
	assert.match(prefix, /^__Host-/, "HTTPS preview sessions require browser-enforced host-bound cookie names");
	const previewSession = (await context.cookies(previewOrigin)).find(cookie => cookie.name === `${prefix}session`);
	assert.ok(previewSession?.httpOnly && previewSession.secure);
	const domain = new URL(previewOrigin).hostname.split(".").slice(1).join(".");
	await normal.evaluate(({ parentDomain, cookiePrefix }) => { document.cookie = `${cookiePrefix}session=forged; Domain=${parentDomain}; Path=/; Secure; SameSite=Strict`; }, { parentDomain: domain, cookiePrefix: prefix });
	const retainedPreviewSessions = (await context.cookies(previewOrigin)).filter(cookie => cookie.name === `${prefix}session`);
	assert.equal(retainedPreviewSessions.length, 1);
	assert.equal(retainedPreviewSessions[0].value, previewSession.value);
	assert.equal(retainedPreviewSessions[0].domain, new URL(previewOrigin).hostname);
	const attack = await preview.evaluate(parentDomain => {
		const visible = document.cookie;
		document.cookie = "lh-normal-canary=wrong-host; Path=/; Secure; SameSite=Strict";
		document.cookie = `__Host-lh-local-session=forged; Domain=${parentDomain}; Path=/; Secure; SameSite=Strict`;
		return { visible, nativeBridge: typeof window.electronAPI };
	}, domain);
	assert.doesNotMatch(attack.visible, /lh-normal-canary|lh-local-session/);
	assert.equal(attack.nativeBridge, "undefined");
	assert.match(await normal.evaluate(() => document.cookie), /lh-normal-canary=original/);
	const retainedSessions = (await context.cookies(normalOrigin)).filter(cookie => cookie.name === originalSession.name);
	assert.equal(retainedSessions.length, 1);
	assert.equal(retainedSessions[0].value, originalSession.value);
	assert.equal(retainedSessions[0].domain, new URL(normalOrigin).hostname);
	step("sibling-host-cookie-and-session-isolation", { noNormalCookieRead: true, originalCanaryUnchanged: true, originalSessionUnchanged: true, hostBoundPreviewCookie: previewSession.name, browserNativeBridge: attack.nativeBridge });
	const diagnostic = await context.newPage();
	await diagnostic.setBypassCSP(true);
	const nonExemptResponse = await diagnostic.goto(`${previewOrigin}${diagnosticPath}?not-exempt`, { waitUntil: "networkidle0", timeout: 60_000 });
	assert.equal(nonExemptResponse.headers()["connection-allowlist"], response.headers()["connection-allowlist"]);
	const diagnosticResponse = await diagnostic.goto(`${previewOrigin}${diagnosticPath}`, { waitUntil: "networkidle0", timeout: 60_000 });
	assert.equal(diagnosticResponse.status(), 200);
	assert.equal(diagnosticResponse.headers()["connection-allowlist"], undefined);
	assert.equal(diagnosticResponse.headers()["content-security-policy"], response.headers()["content-security-policy"]);
	assert.equal(record.negativeControlExceptions.length, 1);
	assert.equal(record.negativeControlExceptions[0].removedValue, response.headers()["connection-allowlist"]);
	step("exact-path-ingress-negative-control-exception", { path: diagnosticPath, connectionAllowlistRemovedOnlyForExactDocument: true, queryVariantRetainsProductionHeader: true, productionCspRetained: true, cspBypassedOnlyOnSeparateDiagnosticPage: true });
	const csrf = await probeIngress(diagnostic, normalOrigin, record.requests);
	const normalDiagnostic = await context.newPage();
	await normalDiagnostic.goto(`${normalOrigin}${diagnosticPath}`, { waitUntil: "networkidle0", timeout: 60_000 });
	const previewCsrf = await probeIngress(normalDiagnostic, previewOrigin, record.previewRequests);
	assert.equal(writes, 0);
	assert.equal(previewWrites, 0);
	step("both-ingresses-deny-same-site-CSRF", { normal: csrf, preview: previewCsrf, writes, previewWrites, originlessAuthenticatedImageRequestsDeniedOnBoth: true, negativeControlOnly: true });
	await diagnostic.close();
	await normalDiagnostic.close();
	await normal.bringToFront();
	await normal.reload({ waitUntil: "networkidle0" });
	assert.match(await normal.$eval("body", element => element.textContent), /Admitted synthetic normal service/);
	await normal.screenshot({ path: path.join(run, "normal-after-attacks.png") });
	step("normal-still-admitted", { writes, screenshot: "normal-after-attacks.png" });
	record.sourceAfter = fingerprint();
	assert.deepEqual(record.sourceAfter, record.source);
	record.status = "passed-scoped-builder-checks";
} catch (error) {
	record.status = "failed";
	record.error = error.stack;
	process.exitCode = 1;
} finally {
	await browser?.close();
	proxy?.stopUpgrades();
	for (const socket of sockets) socket.destroy();
	await Promise.all(servers.map(server => new Promise(resolve => { if (!server.listening) return resolve(); server.close(resolve); server.closeAllConnections(); })));
	try {
		if (routeOwner) {
			assert.deepEqual(ownedRoutes(), record.routesConfigured, "Disposable routes changed during proof; preserving external change");
			await transport.stop(binding, routeOwner);
		}
		assert.deepEqual(ownedRoutes(), {});
		assert.deepEqual(systemRoutes(), routesBefore);
		record.cleanup = { ownedBrowserStopped: !browser?.connected, listenersClosed: servers.every(server => !server.listening), disposableRoutesRemoved: true, originalRoutesUnchanged: true, authorizedDaemonRetainedForFurtherVerification: true };
	} catch (error) { record.cleanup = { error: error.stack }; record.status = "failed"; process.exitCode = 1; }
	record.finishedAt = new Date().toISOString();
	save();
	console.log(JSON.stringify({ run, status: record.status, steps: record.steps.length, cleanup: record.cleanup, error: record.error }));
}
