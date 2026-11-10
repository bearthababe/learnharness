import assert from "node:assert/strict";
import { execFileSync, fork, spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import path from "node:path";
import { createRequire } from "node:module";
import { parseArgs } from "node:util";
import puppeteer from "puppeteer-core";
import { buildIdentity } from "../electron/deployment-build.cjs";
import { controlFor, processIdentity } from "../electron/preview-shell.cjs";
import { controlRequest, readConfiguration } from "../electron/local-service-protocol.cjs";
import { desktopConfiguration, desktopEnvironment } from "./lib/preview-desktop.mjs";
import { alive, delay, freePort, git, ownerOf, ownedGroup, readState, stopOwned } from "./lib/ticket-state.mjs";
import { spawnSandbox } from "./lib/preview-sandbox.mjs";

const require = createRequire(import.meta.url);
const { extractFile } = require("@electron/asar");
const { values } = parseArgs({ options: { run: { type: "string" }, spec: { type: "string" }, binary: { type: "string" }, node: { type: "string" }, "expected-package-source-hash": { type: "string" }, "retry-of": { type: "string" } } });
const root = path.resolve(import.meta.dirname, "..");
const run = path.resolve(values.run ?? `.prove-it/runs/${new Date().toISOString().replaceAll(":", "-")}-zz-prove-it-packaged-preview`);
assert.ok(run.startsWith(path.join(root, ".prove-it/runs") + path.sep), "Evidence must be ignored checkout-local state");
assert.ok(!fs.existsSync(run), "Use a fresh evidence directory");
fs.mkdirSync(run, { recursive: true, mode: 0o700 });
const external = fs.mkdtempSync("/tmp/lh-pp-");
const registry = path.join(external, "registry");
const helperDirectory = path.join(external, "helper");
const runtime = path.join(external, "runtime");
const profile = path.join(external, "normal-profile");
const home = path.join(run, "home");
for (const directory of [helperDirectory, home]) fs.mkdirSync(directory, { mode: 0o700 });
const binary = path.resolve(values.binary ?? "dist/linux-unpacked/learnharness");
const spec = path.resolve(values.spec ?? "/home/bjorn/repo/teach/learnharness/specs/2026-11-06-local-deployment-and-previews.md");
const token = randomUUID();
const ticketId = "zz-prove-it-packaged";
const node = values.node ? JSON.parse(fs.readFileSync(path.resolve(values.node), "utf8")) : null;
const normalHostname = "thinkpad.tailfd9bf6.ts.net";
const normalOrigin = node ? `https://${normalHostname}:8452` : "https://zz-prove-it-normal.invalid";
const excluded = new Set([3000, 3001, 3002, 3109, 3800, 3801, 3802, 3810]);
const ports = [];
const children = [];
const probes = [];
const hash = value => createHash("sha256").update(value).digest("hex");
const checksum = filename => hash(fs.readFileSync(filename));
const environment = { PATH: process.env.PATH, LANG: "C.UTF-8", HOME: home, XDG_CONFIG_HOME: path.join(home, "config"), XDG_CACHE_HOME: path.join(home, "cache"), XDG_DATA_HOME: path.join(home, "data"), LH_IGNORE_ENV_KEYS: "1", NEXT_TELEMETRY_DISABLED: "1", LH_PREVIEW_PROCESS_TOKEN: token };
const titles = ["Exact main eligibility and retry", "Idle gating and interrupted preparation", "Shared normal profile and native parity", "External storage and migration", "Backup rotation and restore", "Code-only rollback", "Browser/desktop preview isolation", "Optional subscription access and model choice", "Hard expiry, stop and queue advancement", "Existing behavior and route ownership"];
const result = { schemaVersion: 1, status: "running", verdict: "BLOCKED", deploymentAcceptance: "BLOCKED", kind: "actual-packaged-loopback-manager-helper-rehearsal", independentChecker: null, checker: "Automation driver; caller supplies a separate independent receipt", startedAt: new Date().toISOString(), run, external, registry, helperDirectory, binary, commands: [], scopedChecks: [], blockers: [], failures: [], owned: {}, checks: titles.map((flow, index) => ({ number: index + 1, status: "blocked", flow, surface: index === 6 ? "actual packaged preview / real manager" : index === 7 ? "actual app / helper / synthetic upstream" : index === 8 ? "real manager manual stop and retained state" : "outside scoped rehearsal", answerKey: `Private approved specification §4 row ${index + 1}`, expected: "Every observation in the full acceptance row, against final accepted source", observed: "BLOCKED: only a scoped rehearsal, not full-row acceptance", commands: [], artifacts: [path.join(run, "deployment.json")], startedAt: null, finishedAt: null })), limitations: ["All ten complete acceptance rows remain BLOCKED", "Existing package is identified by its actual embedded stamp, not relabelled as the current shared checkout", "Loopback manager transport is not dedicated private HTTPS; no tailnet daemon or route is read, modified or adopted", "No elapsed ten-minute expiry/FIFO, final-source parity, physical device, live credential or paid provider claim", "Native preview renderer/bridge/network attacks cannot pass when the packaged shell refuses the loopback origin", "No product build, package rebuild, launcher/install change or real profile access; only the manager's own isolated preview preparation runs"], cleanup: {} };
if (values["retry-of"]) result.retryOf = path.resolve(values["retry-of"]);
if (node) result.visualReview = { status: "pending", artifact: path.join(run, "packaged-preview-home.png"), expected: "Actual packaged preview app visible, not a lock screen or another window", required: "An independent caller must inspect the image and write a separate visual receipt; capturing pixels is not proof of app visibility" };
result.environment = { root, home, runtime, profile, registry, helperDirectory, normalOrigin, transport: node ? "authorized trusted private HTTPS without TLS/DNS bypass" : "loopback refusal negative control", buildStorage: "ignored evidence HOME on repository filesystem; short owned runtime/helper sockets in /tmp" };
if (node) {
	result.kind = "actual-packaged-private-https-manager-helper-rehearsal";
	result.owned.borrowedDaemon = node.owner;
	result.limitations = result.limitations.filter(item => !item.startsWith("Loopback manager") && !item.startsWith("Native preview renderer"));
	result.limitations.push("One authorized source hostname: no multi-source queue claim; preview DevTools/diagnostic/native bridge never enabled", "Packaged preview is observed through its real screen, logs and kernel process state; no injected hostile native renderer or physical-device claim");
}
const write = (filename, value) => {
	const target = path.join(run, filename);
	fs.writeFileSync(`${target}.tmp`, JSON.stringify(value, null, 2) + "\n", { mode: 0o600 });
	fs.renameSync(`${target}.tmp`, target);
};
const save = () => { write("deployment.json", result); write("result.json", result); };
async function check(name, operation) {
	const entry = { name, status: "running", startedAt: new Date().toISOString() };
	result.scopedChecks.push(entry); save();
	try { entry.observed = await operation(); entry.status = "passed"; return entry.observed; }
	catch (error) { entry.status = "failed"; entry.error = error.stack; result.failures.push({ name, error: error.stack }); throw error; }
	finally { entry.finishedAt = new Date().toISOString(); save(); }
}
async function waitFor(operation, description, timeout = 30000) {
	const deadline = Date.now() + timeout;
	while (Date.now() < deadline) { const value = await operation(); if (value) return value; await delay(100); }
	throw new Error(`Timed out: ${description}`);
}
async function choosePort() {
	for (;;) {
		const listener = net.createServer();
		await new Promise((resolve, reject) => { listener.once("error", reject); listener.listen(0, "127.0.0.1", resolve); });
		const port = listener.address().port;
		await new Promise(resolve => listener.close(resolve));
		if (!excluded.has(port) && !ports.includes(port)) { ports.push(port); return port; }
	}
}
function launch(label, command, argumentsList, env, ipc = false) {
	const logPath = path.join(run, `${label}.log`);
	const log = fs.openSync(logPath, "wx", 0o600);
	const options = { cwd: external, env, detached: true, stdio: ["ignore", log, log, ...(ipc ? ["ipc"] : [])] };
	const child = ipc ? fork(command, argumentsList, options) : spawn(command, argumentsList, options);
	fs.closeSync(log);
	const entry = { label, child, owner: null, logPath, exited: false };
	entry.ready = new Promise((resolve, reject) => { child.once("spawn", () => { entry.owner = { ...ownerOf(child.pid), token: env.LH_PREVIEW_PROCESS_TOKEN }; resolve(entry); }); child.once("error", reject); });
	child.once("exit", (code, signal) => { entry.exited = true; entry.code = code; entry.signal = signal; });
	children.push(entry);
	result.commands.push({ command, arguments: argumentsList, label, logPath, at: new Date().toISOString() });
	return entry;
}
function groupMembers(group) {
	return fs.readdirSync("/proc").filter(name => /^\d+$/.test(name)).flatMap(name => {
		try {
			const stat = fs.readFileSync(`/proc/${name}/stat`, "utf8");
			const fields = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
			return Number(fields[2]) === group && !["Z", "X"].includes(fields[0]) ? [{ ...ownerOf(Number(name)), uid: fs.statSync(`/proc/${name}`).uid }] : [];
		} catch { return []; }
	});
}
function cli(...argumentsList) {
	const command = [path.join(root, "scripts/ticket.mjs"), ...argumentsList, "--root", root, "--state-dir", registry];
	const commandEnvironment = { ...environment };
	if (argumentsList[0] === "desktop") {
		for (const name of ["DISPLAY", "WAYLAND_DISPLAY", "XDG_RUNTIME_DIR", "DBUS_SESSION_BUS_ADDRESS", "XAUTHORITY", "XDG_SESSION_TYPE"]) if (process.env[name]) commandEnvironment[name] = process.env[name];
	}
	result.commands.push({ command: process.execPath, arguments: command, at: new Date().toISOString() }); save();
	try { return JSON.parse(execFileSync(process.execPath, command, { cwd: external, env: commandEnvironment, encoding: "utf8", timeout: 40000, stdio: ["ignore", "pipe", "pipe"] })); }
	catch (error) { write(`cli-error-${result.commands.length}.json`, { command, stdout: String(error.stdout ?? ""), stderr: String(error.stderr ?? "") }); throw error; }
}
function request(url, { method = "GET", headers = {}, body, socketPath } = {}) {
	return new Promise((resolve, reject) => {
		const transport = new URL(url).protocol === "https:" ? https : http;
		const outgoing = transport.request(url, { method, headers, ...(socketPath ? { socketPath } : {}), agent: false }, incoming => {
			const chunks = [];
			incoming.on("data", chunk => chunks.push(chunk)); incoming.once("error", reject);
			incoming.once("end", () => { const text = Buffer.concat(chunks).toString(); let data; try { data = JSON.parse(text); } catch { data = text; } resolve({ status: incoming.statusCode, headers: incoming.headers, data, ...(transport === https ? { tls: { authorized: incoming.socket.authorized, protocol: incoming.socket.getProtocol() } } : {}) }); });
		});
		outgoing.setTimeout(45000, () => outgoing.destroy(new Error("Owned HTTP request timed out")));
		outgoing.once("error", reject); outgoing.end(body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body));
	});
}
let normalService;
let normalShell;
let nativeBrowser;
let normalPage;
let helper;
let helperReady;
let first;
let replacement;
let normalCookie;
let managerOwner;
let serviceConfiguration;
let normalBrowser;
let browserPage;
let beforeRoutes;
let beforeDedicatedRoutes;
let packagedDesktop;
const routeSnapshot = dedicated => JSON.parse(execFileSync("/usr/bin/tailscale", [...(dedicated ? [`--socket=${node.socket}`] : []), "serve", "status", "--json"], { env: environment, encoding: "utf8", timeout: 30000 }));
const helperStats = () => new Promise((resolve, reject) => {
	const receive = message => { if (message.stats) { clearTimeout(timer); helper.child.off("message", receive); resolve(message); } };
	const timer = setTimeout(() => { helper.child.off("message", receive); reject(new Error("Helper stats timed out")); }, 10000);
	helper.child.on("message", receive); helper.child.send({ op: "stats" });
});
const readyTicket = () => waitFor(() => {
	const state = readState(registry);
	assert.ok(alive(state.manager), "Actual manager died; inspect manager.log");
	const ticket = state.tickets[ticketId];
	assert.notEqual(ticket?.preview, "error", ticket?.error);
	if (ticket?.process) result.owned.runtime = ticket.process;
	return ticket?.preview === "running" ? ticket : false;
}, "real sandbox build/runtime socket", 300000);
const app = (ticket, route, method = "GET", body, headers = {}) => request(new URL(route, ticket.origin), { method, body, headers: { "sec-ch-ua": '"Chromium";v="152"', "content-type": "application/json", "x-learnharness-subscriptions": "1", ...(method !== "GET" ? { origin: new URL(ticket.origin).origin } : {}), ...headers } });
const helperRequest = (socketPath, lease, route, command) => request(`http://localhost${route}`, { socketPath, method: "POST", headers: { "content-type": "application/json", "x-preview-lease": lease }, body: command });
const admin = (operation, lease) => {
	const argumentsList = [path.join(root, "scripts/preview-subscriptions.mjs"), operation, helperDirectory, ticketId, lease];
	result.commands.push({ command: process.execPath, arguments: argumentsList, at: new Date().toISOString() });
	return JSON.parse(execFileSync(process.execPath, argumentsList, { env: environment, encoding: "utf8", timeout: 10000, stdio: ["ignore", "pipe", "pipe"] }));
};
const normalAPI = (route, method = "GET", body) => normalPage ? normalPage.evaluate(async ({ route, method, body }) => {
	const response = await fetch(route, { method, headers: { "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
	return { status: response.status, data: await response.json() };
}, { route, method, body }) : request(`${serviceConfiguration.origin}${route}`, { method, body, headers: { cookie: `${normalCookie.name}=${normalCookie.value}`, origin: serviceConfiguration.origin, "content-type": "application/json" } });

save();
console.log(`Packaged preview rehearsal evidence: ${run}`);
try {
	await check("exact existing package identity, private key and real Wayland preflight", async () => {
		assert.equal(process.platform, "linux");
		assert.ok(process.env.WAYLAND_DISPLAY && process.env.XDG_RUNTIME_DIR, "Real Wayland session required");
		assert.ok(fs.statSync(path.join(process.env.XDG_RUNTIME_DIR, process.env.WAYLAND_DISPLAY)).isSocket());
		assert.equal(git(root, "-C", path.dirname(git(root, "rev-parse", "--path-format=absolute", "--git-common-dir")), "branch", "--show-current"), "main");
		result.spec = { path: spec, sha256: checksum(spec) };
		result.verifier = { path: import.meta.filename, sha256: checksum(import.meta.filename) };
		result.source = { ...buildIdentity(root), dirty: git(root, "status", "--porcelain"), base: git(root, "merge-base", "HEAD", "origin/main") };
		const asar = path.join(path.dirname(binary), "resources/app.asar");
		const stamp = JSON.parse(fs.readFileSync(path.join(path.dirname(binary), "resources/server/standalone/deployment-build.json"), "utf8"));
		assert.match(stamp.sourceHash, /^[a-f0-9]{64}$/);
		assert.match(stamp.revision, /^[a-f0-9]{40}$/);
		result.package = { binary, binarySha256: checksum(binary), asarSha256: checksum(asar), stamp, shellSha256: hash(extractFile(asar, "electron/preview-shell.cjs")), dispatcherSha256: hash(extractFile(asar, "electron/main.cjs")), finalCurrentSourceClaim: false };
		result.package.expectedSourceHash = values["expected-package-source-hash"] ?? null;
		result.package.sourceMatchesCurrentCheckout = stamp.sourceHash === result.source.sourceHash;
		if (!result.package.sourceMatchesCurrentCheckout) assert.ok(values["expected-package-source-hash"], "Source differs from this package: require --expected-package-source-hash; never relabel an existing package");
		if (values["expected-package-source-hash"]) assert.equal(stamp.sourceHash, values["expected-package-source-hash"], "Accepted package source stamp differs from the explicit expected hash");
		const opener = path.join(path.dirname(binary), "resources/web-subscription-browser.cjs");
		const ingress = path.join(path.dirname(binary), "resources/local-service-ingress.cjs");
		result.package.nativeDependencyClosure = { openerPath: opener, openerSha256: checksum(opener), ingressPath: ingress, ingressSha256: checksum(ingress), packagedNodeLoad: execFileSync(binary, ["-e", `const opener=require(${JSON.stringify(opener)});if(typeof opener.openWebSubscriptionBrowser!=='function')process.exit(1);console.log('PACKAGED_OPENER_MODULE_LOADED');`], { cwd: external, env: { ...environment, ELECTRON_RUN_AS_NODE: "1" }, encoding: "utf8", timeout: 30000 }).trim() };
		result.package.shellMatchesCurrentFile = result.package.shellSha256 === checksum(path.join(root, "electron/preview-shell.cjs"));
		if (node) {
			assert.ok(alive(node.owner), "Authorized borrowed daemon identity must remain live");
			const status = JSON.parse(execFileSync("/usr/bin/tailscale", [`--socket=${node.socket}`, "status", "--json"], { env: environment, encoding: "utf8", timeout: 30000 }));
			assert.equal(status.BackendState, "Running"); assert.equal(status.Self.Online, true);
			result.previewHostname = status.Self.DNSName.replace(/\.$/, "");
			beforeRoutes = routeSnapshot(false); beforeDedicatedRoutes = routeSnapshot(true);
			write("routes-before.json", beforeRoutes); write("dedicated-routes-before.json", beforeDedicatedRoutes);
			assert.deepEqual(beforeDedicatedRoutes, {}, "Dedicated node already serves another mapping: preserve it");
			assert.equal(beforeRoutes.Web?.[`${normalHostname}:8452`]?.Handlers?.["/"]?.Proxy, "http://127.0.0.1:3810");
			assert.ok(!beforeRoutes.AllowFunnel?.[`${normalHostname}:8452`]);
			for (const port of [3800, 3801, 3802, 3810]) assert.ok(await freePort(port), `Port ${port} occupied: preserve its owner`);
		}
		result.owned.ports = ports;
		return { package: result.package, wayland: process.env.WAYLAND_DISPLAY, inheritedElectronRunAsNodeOmittedFromGUI: true, privateSpecHash: result.spec.sha256 };
	});
	const normalPort = node ? 3810 : await choosePort();
	const debugPort = await choosePort();
	const slots = node ? [3800, 3801, 3802] : [await choosePort(), await choosePort(), await choosePort()];
	if (node) ports.push(normalPort, ...slots);
	const originPort = await choosePort();
	await check("actual packaged normal service baseline with synthetic admitted session", async () => {
		normalService = launch("normal-service", process.execPath, [path.join(root, "scripts/local-deployment.mjs"), "service-start", "--electron", binary, "--port", String(normalPort), "--runtime", runtime, "--browser-origin", normalOrigin], { ...environment, LH_PROFILE_DIR: profile, LH_UPDATE_FEED: "http://127.0.0.1:9/" });
		await normalService.ready;
		await waitFor(() => { assert.ok(!normalService.exited, fs.readFileSync(normalService.logPath, "utf8")); return fs.existsSync(path.join(runtime, "service.json")); }, "packaged normal service configuration", 90000);
		const configuration = readConfiguration(path.join(runtime, "service.json"));
		serviceConfiguration = configuration;
		assert.equal(fs.realpathSync(`/proc/${configuration.pid}/exe`), fs.realpathSync(binary));
		assert.equal(configuration.sourceHash, result.package.stamp.sourceHash);
		result.owned.packagedService = ownerOf(configuration.pid);
		const admission = await controlRequest(configuration, { op: "admit", origin: configuration.origin });
		const admitted = await request(`${configuration.origin}/__local/session`, { method: "POST", headers: { origin: configuration.origin, "content-type": "application/json" }, body: { ticket: admission.ticket } });
		assert.equal(admitted.status, 204);
		const match = admitted.headers["set-cookie"]?.[0].match(/^lh-local-session=([a-f0-9]{64});/); assert.ok(match);
		normalCookie = { name: "lh-local-session", value: match[1], httpOnly: true };
		const identity = await normalAPI("/api/runtime"); assert.equal(identity.status, 200); assert.equal(identity.data.sourceHash, result.package.stamp.sourceHash);
		const chat = await normalAPI("/api/chats", "POST", { title: "zz-prove-it packaged normal retained marker" }); assert.equal(chat.status, 200); result.normalChatId = chat.data.id;
		return { packagedService: result.owned.packagedService, runtime: identity.data, syntheticMarker: chat.data.id };
	});
	try {
		await check("actual packaged normal Wayland shell native baseline", async () => {
		const configuration = serviceConfiguration;
		const guiDirectory = path.join(external, "normal-shell"); fs.mkdirSync(guiDirectory, { mode: 0o700 });
		const guiEnvironment = { ...desktopEnvironment(guiDirectory), LH_PROFILE_DIR: profile, LH_IGNORE_ENV_KEYS: "1", LH_UPDATE_FEED: "http://127.0.0.1:9/", LH_PREVIEW_PROCESS_TOKEN: token };
		assert.equal(guiEnvironment.ELECTRON_RUN_AS_NODE, undefined);
		normalShell = launch("normal-shell", binary, [`--local-service=${path.join(runtime, "service.json")}`, "--ozone-platform=wayland", `--remote-debugging-port=${debugPort}`], guiEnvironment);
		await normalShell.ready;
		const version = await waitFor(async () => {
			assert.ok(!normalShell.exited, fs.readFileSync(normalShell.logPath, "utf8"));
			try { return (await request(`http://127.0.0.1:${debugPort}/json/version`)).data; } catch { return false; }
		}, "normal packaged shell CDP", 90000);
		nativeBrowser = await puppeteer.connect({ browserWSEndpoint: version.webSocketDebuggerUrl });
		normalPage = await waitFor(async () => {
			assert.doesNotMatch(fs.readFileSync(normalShell.logPath, "utf8"), /Cannot find module/);
			assert.ok(!normalShell.exited, "Packaged normal shell exited before Home");
			return (await nativeBrowser.pages()).find(page => page.url() === `${configuration.origin}/`);
		}, "normal native Home", 90000);
		await normalPage.waitForSelector('[data-file-path-input][data-placeholder="What do you want to learn?"]', { timeout: 90000 });
		const identity = await normalAPI("/api/runtime"); assert.equal(identity.status, 200); assert.equal(identity.data.sourceHash, result.package.stamp.sourceHash);
		normalCookie = (await normalPage.cookies()).find(cookie => cookie.name === "lh-local-session"); assert.ok(normalCookie?.httpOnly);
		await normalPage.screenshot({ path: path.join(run, "normal-before.png") });
		return { packagedService: result.owned.packagedService, shell: normalShell.owner, chromium: version.Browser, runtime: identity.data, normalNativeBridge: await normalPage.evaluate(() => typeof window.lh), syntheticMarker: result.normalChatId };
		});
	} catch (error) {
		result.blockers.push({ rows: [3, 7, 10], kind: "actual-packaged-native-startup-broken", rootCause: `Actual packaged native startup failed: ${error.message}`, unlock: "Parent must correct the product defect and supply an accepted package; this diagnostic never edits or rebuilds product files.", packageStamp: result.package.stamp, logPath: normalShell?.logPath });
		normalPage = null;
		nativeBrowser?.disconnect(); nativeBrowser = null;
		if (normalShell?.owner) await stopOwned(normalShell.owner);
		save();
	}
	if (normalPage) await check("normal native subscription opener rejects expired opaque action without module failure", async () => {
		const observation = await normalPage.evaluate(async action => {
			try { await window.lh.openSubscriptionBrowser(action); return { resolved: true }; }
			catch (error) { return { error: error.message }; }
		}, `/api/subscriptions/browser?id=${randomUUID()}`);
		assert.match(observation.error ?? "", /Sign-in action expired/);
		assert.doesNotMatch(fs.readFileSync(normalShell.logPath, "utf8"), /Cannot find module/);
		result.limitations.push("Normal native opener exercised an expired synthetic opaque action through real IPC/service; successful provider-page opening/auth remains unproved (no live provider calls)");
		return observation;
	});
	if (node && normalPage) await check("private HTTPS browser and normal native share visible edits and one packaged writer", async () => {
		const tls = await request(normalOrigin); assert.equal(tls.tls.authorized, true);
		const chrome = "/home/bjorn/.cache/puppeteer/chrome/linux-152.0.7977.42/chrome-linux64/chrome";
		normalBrowser = await puppeteer.launch({ executablePath: chrome, headless: true, userDataDir: path.join(home, "normal-browser"), env: environment, protocolTimeout: 20000, args: ["--disable-dev-shm-usage", "--no-proxy-server"] });
		result.owned.normalBrowser = ownerOf(normalBrowser.process().pid);
		browserPage = await normalBrowser.newPage();
		const admission = await controlRequest(serviceConfiguration, { op: "admit", origin: normalOrigin });
		await browserPage.goto(`${normalOrigin}/__local/admit#${admission.ticket}`, { waitUntil: "domcontentloaded", timeout: 60000 });
		await browserPage.waitForSelector('[data-file-path-input][data-placeholder="What do you want to learn?"]');
		const browserRuntime = await browserPage.evaluate(async () => (await fetch("/api/runtime")).json());
		const nativeRuntime = (await normalAPI("/api/runtime")).data;
		for (const field of ["pid", "profileId", "deploymentId", "revision", "sourceHash"]) assert.equal(browserRuntime[field], nativeRuntime[field]);
		const browserMarker = await browserPage.evaluate(async () => { const response = await fetch("/api/chats", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: "zz-prove-it browser edit visible in native" }) }); return { status: response.status, data: await response.json() }; });
		assert.equal(browserMarker.status, 200);
		await normalPage.goto(`${serviceConfiguration.origin}/chat/${browserMarker.data.id}`, { waitUntil: "domcontentloaded" });
		await normalPage.waitForFunction(() => document.body.textContent.includes("zz-prove-it browser edit visible in native"));
		await normalPage.screenshot({ path: path.join(run, "normal-browser-edit-visible-native.png") });
		const title = "zz-prove-it native edit visible in browser";
		assert.equal((await normalAPI(`/api/chats/${browserMarker.data.id}`, "PUT", { title })).status, 200);
		await browserPage.goto(`${normalOrigin}/chat/${browserMarker.data.id}`, { waitUntil: "domcontentloaded" });
		await browserPage.waitForFunction(title => document.body.textContent.includes(title), {}, title);
		await browserPage.screenshot({ path: path.join(run, "normal-native-edit-visible-browser.png") });
		await normalPage.goto(`${serviceConfiguration.origin}/`, { waitUntil: "domcontentloaded" });
		return { tls: tls.tls, browserRuntime, nativeRuntime, marker: browserMarker.data.id, browserToNativeVisible: true, nativeToBrowserVisible: true, providerCalls: 0 };
	});
	await check("sole real manager with real trusted helper and isolated backend", async () => {
		cli("init", "--ports", slots.join(","), "--origin-port", String(originPort));
		if (node) cli("configure-tailnet", "--tailnet-host", normalHostname, "--https-ports", "8453,8454,8455");
		helper = launch("helper", path.join(root, "tests/deployment/fixtures/preview-helper.mjs"), [helperDirectory], environment, true);
		const message = new Promise((resolve, reject) => { const timer = setTimeout(() => reject(new Error("Synthetic helper startup timed out")), 30000); helper.child.once("message", value => { clearTimeout(timer); resolve(value); }); helper.child.once("error", reject); });
		await helper.ready; helperReady = await message; assert.equal(helperReady.ready, true); assert.equal(helperReady.models.length, 2);
		assert.ok(!excluded.has(helperReady.upstreamPort)); ports.push(helperReady.upstreamPort);
		cli("configure-helper", "--helper-directory", helperDirectory);
		cli("preview", ticketId, "--worktree", root, ...(node ? ["--tailnet-socket", node.socket] : []));
		managerOwner = { ...readState(registry).manager, token }; result.owned.manager = managerOwner;
		first = await readyTicket(); write("first-ticket.json", first);
		assert.equal(first.launch.deadline - first.launch.started, 600000);
		assert.equal(first.origin, node ? `https://${result.previewHostname}/` : `http://127.0.0.1:${originPort}/`);
		assert.equal(readState(registry).tailnetHost, node ? normalHostname : null);
		const identity = await app(first, "/api/runtime"); write("preview-runtime.json", identity);
		assert.equal(identity.status, 200); assert.equal(identity.data.sourceHash, first.sandbox.sourceHash);
		if (node) { assert.equal(identity.tls.authorized, true); assert.deepEqual(routeSnapshot(false), beforeRoutes); write("dedicated-routes-active.json", routeSnapshot(true)); }
		return { manager: managerOwner, runtime: first.process, originalLaunch: first.launch, preparedSource: { revision: first.sandbox.revision, sourceHash: first.sandbox.sourceHash }, packageSourceHash: result.package.stamp.sourceHash, transport: node ? "trusted private HTTPS, sole manager-owned dedicated mapping" : "loopback only, not dedicated HTTPS", tls: identity.tls };
	});
	if (!node) await check("actual packaged integration refusal diagnosed without a diagnostic bypass", async () => {
		const state = readState(registry);
		let launcherError;
		try { cli("desktop", ticketId, "--service-config", path.join(runtime, "service.json"), "--normal-origin", normalOrigin); }
		catch (error) { launcherError = String(error.stderr ?? error.message); }
		assert.match(launcherError ?? "", /Choose this normal service's configured private HTTPS origin/);
		const directory = path.join(external, "packaged-preview"); fs.mkdirSync(directory, { mode: 0o700 });
		const controlFile = path.join(directory, "control.json");
		let configurationError;
		try { desktopConfiguration(first, state.manager, normalOrigin, controlFile); }
		catch (error) { configurationError = error.message; }
		assert.match(configurationError ?? "", /Preview shell trust boundary refused/);
		const configuration = { version: 1, ticketId, sourceId: first.sandbox.sourceHash, lease: first.claim, origin: new URL(first.origin).origin, normalOrigin, launch: { started: first.launch.started, deadline: first.launch.deadline, boot: first.launch.boot }, manager: processIdentity(state.manager.pid), server: processIdentity(first.process.pid), controlFile };
		const configFile = path.join(directory, "preview.json");
		fs.writeFileSync(configFile, JSON.stringify(configuration), { mode: 0o600 }); fs.writeFileSync(controlFile, JSON.stringify(controlFor(configuration)), { mode: 0o600 });
		const guiEnvironment = desktopEnvironment(directory); assert.equal(guiEnvironment.ELECTRON_RUN_AS_NODE, undefined);
		const shell = launch("packaged-preview", binary, [`--preview=${configFile}`, "--ozone-platform=wayland"], guiEnvironment);
		await shell.ready; await waitFor(() => shell.exited, "actual packaged loopback refusal");
		const log = fs.readFileSync(shell.logPath, "utf8");
		assert.equal(shell.code, 1); assert.match(log, /PREVIEW_SHELL_STOP configuration-refused/); assert.doesNotMatch(log, /PREVIEW_SHELL_READY|Cannot find module/);
		const blocker = { rows: [7, 8, 9], kind: "required-transport-unavailable", launcherError: launcherError.trim(), configurationError, actualPackageExit: shell.code, actualPackageLog: log, rootCause: "Registry is intentionally loopback (tailnetHost=null). The real desktop launcher requires a configured normal private HTTPS hostname, and both desktopConfiguration and the actual packaged shell reject HTTP/IP preview origins. Packaged diagnostic bypass is forbidden. No preview window or native renderer attack result exists.", unlock: "Parent must supply separately owned trusted private HTTPS source-specific preview hostname/certificate and configured normal HTTPS origin, then rerun through the real desktop manager interface with the final accepted package." };
		result.blockers.push(blocker);
		return blocker;
	});
	if (node) await check("actual packaged preview via ticket desktop CLI uses trusted HTTPS without diagnostic bridge", async () => {
		cli("desktop", ticketId, "--service-config", path.join(runtime, "service.json"), "--normal-origin", normalOrigin);
		packagedDesktop = readState(registry).tickets[ticketId].desktop;
		result.owned.packagedDesktop = packagedDesktop;
		const ready = await waitFor(() => {
			const log = fs.readFileSync(packagedDesktop.logPath, "utf8");
			assert.doesNotMatch(log, /Cannot find module|PREVIEW_SHELL_STOP/);
			assert.ok(alive(packagedDesktop.process), log);
			const match = log.match(/PREVIEW_SHELL_READY (\{[^\n]+\})/);
			return match ? JSON.parse(match[1]) : false;
		}, "accepted packaged HTTPS preview READY", 90000);
		assert.equal(ready.diagnostic, false); assert.equal(ready.sourceId, first.sandbox.sourceHash);
		assert.equal(ready.origin, new URL(first.origin).origin); assert.equal(ready.lease, first.claim);
		assert.equal(fs.realpathSync(`/proc/${packagedDesktop.process.pid}/exe`), fs.realpathSync(binary));
		const configuration = JSON.parse(fs.readFileSync(packagedDesktop.configFile, "utf8"));
		assert.equal(configuration.server.pid, first.process.pid); assert.equal(configuration.manager.pid, managerOwner.pid);
		const processArguments = fs.readFileSync(`/proc/${packagedDesktop.process.pid}/cmdline`, "utf8").split("\0").filter(Boolean);
		write("packaged-preview-process-arguments.json", { processArguments, validatedStartupArguments: ready.arguments });
		const argumentsList = ready.arguments;
		assert.equal(argumentsList[0], `--preview=${packagedDesktop.configFile}`);
		assert.ok(argumentsList.slice(1).every(argument => /^--ozone-platform=(wayland|x11)$/.test(argument)));
		assert.ok(argumentsList.includes("--ozone-platform=wayland"));
		const environmentNames = fs.readFileSync(`/proc/${packagedDesktop.process.pid}/environ`, "utf8").split("\0").filter(Boolean).map(entry => entry.split("=")[0]);
		assert.ok(!environmentNames.some(name => /LH_|ELECTRON_RUN_AS_NODE|REMOTE_DEBUGGING|NODE_OPTIONS/.test(name)));
		const kernel = await waitFor(() => {
			const members = groupMembers(packagedDesktop.process.pid).map(owner => ({ ...owner, arguments: fs.readFileSync(`/proc/${owner.pid}/cmdline`, "utf8").replaceAll("\0", " "), status: fs.readFileSync(`/proc/${owner.pid}/status`, "utf8").split("\n").filter(line => /^(NoNewPrivs|Seccomp|NSpid):/.test(line)) }));
			return members.some(member => member.arguments.includes("--type=renderer")) ? members : false;
		}, "real packaged preview renderer kernel state");
		const renderers = kernel.filter(member => member.arguments.includes("--type=renderer"));
		for (const renderer of renderers) {
			assert.ok(renderer.status.some(line => /^Seccomp:\s+2$/.test(line)));
			assert.ok(renderer.status.some(line => /^NoNewPrivs:\s+1$/.test(line)));
			assert.doesNotMatch(renderer.arguments, /--no-sandbox|--remote-debugging/);
		}
		write("packaged-preview-kernel.json", kernel);
		const displayEnv = { ...environment, WAYLAND_DISPLAY: process.env.WAYLAND_DISPLAY, XDG_RUNTIME_DIR: process.env.XDG_RUNTIME_DIR, HYPRLAND_INSTANCE_SIGNATURE: process.env.HYPRLAND_INSTANCE_SIGNATURE };
		const window = await waitFor(() => JSON.parse(execFileSync("hyprctl", ["-j", "clients"], { env: displayEnv, encoding: "utf8" })).find(client => client.pid === packagedDesktop.process.pid && client.mapped && !client.hidden && client.visible), "actual compositor-visible packaged preview Wayland window");
		await delay(2000);
		assert.ok(alive(packagedDesktop.process));
		execFileSync("grim", ["-g", `${window.at[0]},${window.at[1]} ${window.size[0]}x${window.size[1]}`, path.join(run, "packaged-preview-home.png")], { env: displayEnv });
		write("packaged-preview-window.json", { pid: window.pid, class: window.class, title: window.title, at: window.at, size: window.size, visible: window.visible, captureMethod: "Owned compositor-visible window bounds; no focus or renderer debugging bypass" });
		fs.copyFileSync(packagedDesktop.logPath, path.join(run, "packaged-preview.log"));
		return { ready, configuration, executable: binary, arguments: argumentsList, environmentNames, renderers, screenshot: "packaged-preview-home.png", limitation: "Actual screen/log/kernel inspection, not preview renderer CDP or injected attack instrumentation" };
	}).catch(error => {
		const log = packagedDesktop?.logPath && fs.existsSync(packagedDesktop.logPath) ? fs.readFileSync(packagedDesktop.logPath, "utf8") : "";
		result.blockers.push({ rows: [7, 8, 9], kind: "actual-packaged-desktop-launch-failed", rootCause: log.includes("Missing X server or $DISPLAY") ? "Actual ticket desktop launcher omits --ozone-platform=wayland in this Wayland-only session; accepted Electron selects X11 and exits before PREVIEW_SHELL_READY. Normal direct packaged Wayland startup passed. No diagnostic bypass or preview-renderer claim." : error.message, unlock: "Parent must fix product launcher, then rerun this same real packaged HTTPS path; test sub-agent never edits product files.", logPath: packagedDesktop?.logPath });
		save();
	});
	await check("real cookie-bearing normal and preview ingress network refusals", async () => {
		const configuration = readConfiguration(path.join(runtime, "service.json"));
		const targetOrigin = node ? normalOrigin : configuration.origin;
		const session = node ? (await browserPage.cookies()).find(cookie => cookie.name === "__Host-lh-local-session") : normalCookie;
		assert.ok(session?.httpOnly); if (node) assert.equal(session.secure, true);
		const cookie = `${session.name}=${session.value}`;
		const authenticated = await request(`${targetOrigin}/api/chats`, { headers: { cookie } }); assert.equal(authenticated.status, 200);
		const probes = [];
		for (const [label, target, attacker] of [["normal", targetOrigin, new URL(first.origin).origin], ["preview", new URL(first.origin).origin, targetOrigin]]) {
			for (const method of ["POST", "GET"]) {
				const response = await request(`${target}/api/chats`, { method, headers: { cookie, "sec-ch-ua": '"Chromium";v="152"', "sec-fetch-site": "same-site", ...(method === "POST" ? { origin: attacker, "content-type": "application/json" } : {}), }, ...(method === "POST" ? { body: { title: "zz-prove-it forbidden cross-origin write" } } : {}) });
				assert.equal(response.status, 403, `${label} ${method} must reach ingress and be denied`);
				probes.push({ target: label, method, status: response.status, cookieBearing: true, sameSite: true, originSent: method === "POST" });
			}
		}
		const after = await request(`${targetOrigin}/api/chats`, { headers: { cookie } }); assert.equal(after.status, 200); assert.deepEqual(after.data, authenticated.data);
		const firefox = await app(first, "/", "GET", undefined, { "sec-ch-ua": '"Firefox";v="152"' }); assert.equal(firefox.status, 403);
		const safari = await app(first, "/", "GET", undefined, { "sec-ch-ua": "" }); assert.equal(safari.status, 403);
		return { probes, normalStillAdmitted: true, normalWrites: 0, unsupportedBrowserHintsDenied: true, transport: node ? "trusted private HTTPS with real admitted browser cookie" : "loopback HTTP", limitation: "Real cookie-bearing ingress requests, not real Firefox/Safari or packaged renderer egress proof" };
	});
	await check("actual runtime sandbox denies normal/profile/helper-admin/network access", async () => {
		const config = JSON.parse(fs.readFileSync(path.join(registry, "leases", first.claim, "config.json"), "utf8"));
		const targets = [profile, home, helperDirectory, path.join(root, "auth.json")];
		const source = `const fs=require('node:fs'),net=require('node:net'),assert=require('node:assert/strict');(async()=>{const paths=${JSON.stringify(targets)};for(const target of paths)assert.equal(fs.existsSync(target),false,target);assert.equal(fs.existsSync('/capability/control.sock'),false);assert.equal(process.env.LH_PROFILE_DIR,undefined);assert.equal(process.env.ELECTRON_RUN_AS_NODE,undefined);const denied=await Promise.all(${JSON.stringify([normalPort, helperReady.upstreamPort])}.map(port=>new Promise(resolve=>{const socket=net.connect({host:'127.0.0.1',port});socket.setTimeout(1500);socket.once('connect',()=>{socket.destroy();resolve(false)});socket.once('error',()=>resolve(true));socket.once('timeout',()=>{socket.destroy();resolve(true)})})));assert.ok(denied.every(Boolean));console.log(JSON.stringify({hiddenPaths:paths,helperAdminHidden:true,normalAndUpstreamNetworkDenied:denied}));})().catch(error=>{console.error(error);process.exitCode=1});`;
		const child = spawnSandbox(first.sandbox, ["-e", source], { lease: first.claim, helperSocket: config.helperSocket, stdio: ["ignore", "pipe", "pipe"] });
		const probe = { child, owner: ownerOf(child.pid) }; probes.push(probe);
		let stdout = "", stderr = ""; child.stdout.on("data", chunk => { stdout += chunk; }); child.stderr.on("data", chunk => { stderr += chunk; });
		const code = await new Promise((resolve, reject) => { child.once("error", reject); child.once("exit", resolve); });
		write("sandbox-probe.json", { code, stdout, stderr }); assert.equal(code, 0, stderr);
		return JSON.parse(stdout);
	});
	await check("real app helper default denial, explicit local grant, two model choices and synthetic upstream", async () => {
		const denied = await app(first, "/api/models"); assert.equal(denied.status, 200);
		assert.equal(denied.data.models.filter(model => ["chatgpt", "xai", "github-copilot"].includes(model.provider)).length, 0);
		assert.equal((await helperStats()).stats.length, 0);
		const config = JSON.parse(fs.readFileSync(path.join(registry, "leases", first.claim, "config.json"), "utf8"));
		const deniedRead = await helperRequest(config.helperSocket, first.claim, "/read", { channel: "lh:chatgpt", op: "models", fields: {} }); assert.equal(deniedRead.status, 403);
		const grant = admin("grant", first.claim); assert.equal(grant.granted, true); assert.equal(grant.deadline, first.launch.deadline);
		const catalog = await app(first, "/api/models"); assert.equal(catalog.status, 200);
		const models = catalog.data.models.filter(model => model.provider === "chatgpt" && helperReady.models.includes(model.id)); assert.equal(models.length, 2);
		const chat = await app(first, "/api/chats", "POST", { title: "zz-prove-it packaged preview retained marker" }); assert.equal(chat.status, 200); result.previewChatId = chat.data.id;
		const read = await helperRequest(config.helperSocket, first.claim, "/read", { channel: "lh:chatgpt", op: "models", fields: {} }); assert.equal(read.status, 200);
		const choices = [];
		for (const model of models) {
			const selected = await app(first, `/api/chats/${chat.data.id}/settings`, "PUT", { model: { provider: model.provider, id: model.id } }); assert.equal(selected.status, 200);
			const persisted = await app(first, `/api/chats/${chat.data.id}`); assert.equal(persisted.data.settings.model.id, model.id);
			const fields = { background: false, selectedModelId: model.id, expectedAccountId: read.data.accountId, expectedAuthorityRevision: read.data.authorityRevision };
			const dispatched = await helperRequest(config.helperSocket, first.claim, "/dispatch", { channel: "lh:chatgpt", fields, request: { payload: { model: model.id, input: [] }, headers: { authorization: "Bearer malicious-client-value" } } });
			assert.equal(dispatched.status, 200); assert.match(dispatched.data, /Synthetic preview response/); assert.equal(dispatched.headers.authorization, undefined); assert.equal(dispatched.headers["set-cookie"], undefined);
			choices.push({ provider: model.provider, id: model.id, persisted: true, syntheticResponse: true });
		}
		const wrongLease = await helperRequest(config.helperSocket, randomUUID(), "/read", { channel: "lh:chatgpt", op: "models", fields: {} }); assert.equal(wrongLease.status, 403);
		const upstream = await helperStats(); assert.equal(upstream.stats.length, 2); assert.ok(upstream.stats.every(entry => entry.authenticated && entry.injectedAuthorizationIgnored));
		admin("revoke", first.claim);
		await waitFor(async () => !(await app(first, "/api/models")).data.models.some(model => model.provider === "chatgpt"), "real app catalog revocation");
		const revoked = await helperRequest(config.helperSocket, first.claim, "/read", { channel: "lh:chatgpt", op: "models", fields: {} }).catch(error => ({ status: "transport-refused", code: error.code }));
		assert.notEqual(revoked.status, 200); assert.equal((await helperStats()).stats.length, 2);
		return { defaultDenied: true, grant: { deadline: grant.deadline }, choices, wrongLeaseDenied: true, revoked: { status: revoked.status, code: revoked.code }, upstream, limitation: "Actual LearnHarness model selection API plus actual helper transport, not native preview or in-app model-picker UI proof" };
	});
	await check("real manager manual stop, retained profile, replacement default denial and stale lease safety", async () => {
		const old = first;
		cli("release", ticketId, "--lease", old.claim);
		await waitFor(() => !readState(registry).tickets[ticketId].claim && !ownedGroup(old.process), "matching lease release and runtime termination");
		assert.ok(fs.existsSync(path.join(old.profile, "data")));
		cli("preview", ticketId); replacement = await readyTicket(); write("replacement-ticket.json", replacement);
		assert.notEqual(replacement.claim, old.claim); assert.equal(replacement.profile, old.profile);
		const restored = await app(replacement, `/api/chats/${result.previewChatId}`); assert.equal(restored.status, 200); assert.equal(restored.data.id, result.previewChatId);
		const denied = await app(replacement, "/api/models"); assert.equal(denied.status, 200); assert.equal(denied.data.models.filter(model => ["chatgpt", "xai", "github-copilot"].includes(model.provider)).length, 0);
		assert.throws(() => cli("release", ticketId, "--lease", old.claim), error => {
			assert.match(String(error.stderr), /Stale preview lease; replacement is untouched/);
			return true;
		});
		assert.equal(readState(registry).tickets[ticketId].claim, replacement.claim); assert.ok(alive(replacement.process));
		assert.equal((await helperStats()).stats.length, 2);
		return { oldLease: old.claim, newLease: replacement.claim, retainedProfile: old.profile, retainedChat: restored.data.id, replacementDefaultDenied: true, delayedOldReleaseIgnored: true, limitation: "Manual stop and same-preview reopen only; no shortened-clock or ten-minute/FIFO claim" };
	});
	await check("matching manager stop revokes granted replacement and aborts active synthetic upstream", async () => {
		const config = JSON.parse(fs.readFileSync(path.join(registry, "leases", replacement.claim, "config.json"), "utf8"));
		admin("grant", replacement.claim);
		const read = await helperRequest(config.helperSocket, replacement.claim, "/read", { channel: "lh:chatgpt", op: "models", fields: {} }); assert.equal(read.status, 200);
		const model = helperReady.models[0];
		let dispatch;
		let ended = false;
		let receivedHeaders = false;
		const stream = new Promise(resolve => {
			dispatch = http.request("http://localhost/dispatch", { socketPath: config.helperSocket, method: "POST", headers: { "content-type": "application/json", "x-preview-lease": replacement.claim }, agent: false }, incoming => {
				receivedHeaders = incoming.statusCode === 200; incoming.resume();
				incoming.once("close", () => { ended = true; resolve(); });
			});
			dispatch.once("error", () => { ended = true; resolve(); });
			dispatch.setTimeout(15000, () => dispatch.destroy(new Error("Synthetic hold request timed out")));
			dispatch.end(JSON.stringify({ channel: "lh:chatgpt", fields: { background: false, selectedModelId: model, expectedAccountId: read.data.accountId, expectedAuthorityRevision: read.data.authorityRevision }, request: { payload: { model, hold: true }, headers: {} } }));
		});
		try {
			await waitFor(async () => receivedHeaders && (await helperStats()).active === 1, "actual held upstream active");
			cli("release", ticketId, "--lease", replacement.claim);
			await waitFor(() => !readState(registry).tickets[ticketId].claim && !ownedGroup(replacement.process) && ended, "manager stops runtime and active helper stream");
			await stream;
			await waitFor(async () => (await helperStats()).active === 0, "upstream connection aborted by matching lease stop");
			assert.equal(fs.existsSync(config.helperSocket), false);
			return { grantedReplacementStopped: true, activeUpstreamAborted: true, helperSocketRemoved: true, profileRetained: fs.existsSync(path.join(replacement.profile, "data")), actualElapsedTenMinuteProof: "BLOCKED" };
		} finally { dispatch?.destroy(); }
	});
	await check("actual packaged normal service remains usable and same-writer after preview attacks", async () => {
		if (normalPage) assert.ok(alive(normalShell.owner)); assert.ok(alive(result.owned.packagedService));
		const identity = await normalAPI("/api/runtime"); assert.equal(identity.status, 200); assert.equal(identity.data.pid, result.owned.packagedService.pid); assert.equal(identity.data.sourceHash, result.package.stamp.sourceHash);
		const chat = await normalAPI(`/api/chats/${result.normalChatId}`); assert.equal(chat.status, 200); assert.equal(chat.data.id, result.normalChatId);
		const marker = await normalAPI("/api/chats", "POST", { title: "zz-prove-it normal still writable after preview" }); assert.equal(marker.status, 200);
		if (normalPage) {
			const cookies = await normalPage.cookies(); assert.equal(cookies.find(cookie => cookie.name === normalCookie.name)?.value, normalCookie.value);
			await normalPage.reload({ waitUntil: "domcontentloaded" });
			await normalPage.waitForSelector('[data-file-path-input][data-placeholder="What do you want to learn?"]');
			await normalPage.screenshot({ path: path.join(run, "normal-after.png") });
		}
		if (browserPage) {
			await browserPage.goto(normalOrigin, { waitUntil: "domcontentloaded" });
			await browserPage.waitForSelector('[data-file-path-input][data-placeholder="What do you want to learn?"]');
			const browserRuntime = await browserPage.evaluate(async () => (await fetch("/api/runtime")).json());
			assert.equal(browserRuntime.pid, result.owned.packagedService.pid);
			await browserPage.screenshot({ path: path.join(run, "normal-browser-after.png") });
		}
		return { runtime: identity.data, retainedMarker: chat.data.id, newWrite: marker.data.id, normalSessionStillAdmitted: true, nativeBridge: normalPage ? await normalPage.evaluate(() => typeof window.lh) : "BLOCKED: packaged normal startup failed", limitation: normalPage ? "Scoped shared-service Home/read/write/session regression, not all native/subscription parity" : "Packaged service HTTP read/write/session only. Normal native shell is broken; no native-unaffected claim." };
	});
} catch (error) {
	result.error = error.stack;
	try { if (browserPage) await Promise.race([browserPage.screenshot({ path: path.join(run, "normal-browser-failure.png") }), delay(5000).then(() => { throw new Error("Failure screenshot timed out; original failure retained"); })]); } catch (captureError) { result.failureCaptureError = captureError.message; }
	process.exitCode = 1;
} finally {
	const errors = [];
	try { if (fs.existsSync(path.join(registry, "registry.json"))) { const state = readState(registry); managerOwner ??= state.manager ? { ...state.manager, token } : null; cli("stop"); result.cleanup.registry = readState(registry); assert.ok(!alive(managerOwner)); for (const ticket of Object.values(result.cleanup.registry.tickets)) { assert.ok(!ticket.claim && !ownedGroup(ticket.process)); } result.cleanup.managerAndBackendStopped = true; } } catch (error) { errors.push(error.stack); }
	try { await normalBrowser?.close(); if (result.owned.normalBrowser) assert.ok(!alive(result.owned.normalBrowser)); result.cleanup.normalBrowserStopped = true; } catch (error) { errors.push(error.stack); }
	try { nativeBrowser?.disconnect(); } catch (error) { errors.push(error.stack); }
	for (const entry of [...children].reverse()) {
		try { await entry.ready; if (entry.owner) await stopOwned(entry.owner); await waitFor(() => !ownedGroup(entry.owner), `${entry.label} identity-checked cleanup`); } catch (error) { errors.push(`${entry.label}: ${error.stack}`); }
	}
	for (const probe of probes) {
		try { if (alive(probe.owner)) { probe.child.kill("SIGTERM"); await waitFor(() => !alive(probe.owner), "identity-checked sandbox probe cleanup"); } } catch (error) { errors.push(error.stack); }
	}
	try { if (managerOwner) await stopOwned(managerOwner); if (first?.process) await stopOwned(first.process); if (replacement?.process) await stopOwned(replacement.process); } catch (error) { errors.push(error.stack); }
	for (const filename of [path.join(registry, "manager.log"), path.join(first?.profile ?? external, "server.log")]) if (fs.existsSync(filename)) fs.copyFileSync(filename, path.join(run, path.basename(filename)));
	result.cleanup.children = children.map(entry => ({ label: entry.label, owner: entry.owner, code: entry.code, signal: entry.signal, alive: alive(entry.owner), ownedGroup: ownedGroup(entry.owner), remainingGroupMembers: entry.owner ? groupMembers(entry.owner.pid) : [] }));
	result.cleanup.probes = probes.map(probe => ({ owner: probe.owner, alive: alive(probe.owner) }));
	result.cleanup.managerGroupMembers = managerOwner ? groupMembers(managerOwner.pid) : [];
	result.cleanup.runtimeGroups = [first, replacement].filter(Boolean).map(ticket => ({ owner: ticket.process, remaining: groupMembers(ticket.process.pid) }));
	result.cleanup.packagedDesktop = packagedDesktop ? { owner: packagedDesktop.process, alive: alive(packagedDesktop.process), remaining: groupMembers(packagedDesktop.process.pid) } : null;
	if (result.cleanup.packagedDesktop?.alive || result.cleanup.packagedDesktop?.remaining.length) errors.push("Owned packaged preview shell or renderer remains live");
	result.cleanup.ports = [];
	for (const port of ports) result.cleanup.ports.push({ port, free: await freePort(port) });
	if (result.cleanup.ports.some(entry => !entry.free)) errors.push("An owned port remains occupied");
	if (result.cleanup.children.some(entry => entry.alive || entry.ownedGroup || entry.remainingGroupMembers.length) || result.cleanup.probes.some(entry => entry.alive) || result.cleanup.managerGroupMembers.length || result.cleanup.runtimeGroups.some(entry => entry.remaining.length)) errors.push("An owned process or process-group member remains live");
	result.cleanup.helperControlRemoved = !fs.existsSync(path.join(helperDirectory, "control.sock"));
	result.cleanup.serviceControlRemoved = !fs.existsSync(path.join(runtime, "control.sock"));
	if (!result.cleanup.helperControlRemoved || !result.cleanup.serviceControlRemoved) errors.push("Owned helper/service control socket remains");
	if (node) try {
		assert.ok(alive(node.owner), "Borrowed daemon must remain alive"); result.cleanup.borrowedDaemonRetained = true;
		if (beforeDedicatedRoutes) { const after = routeSnapshot(true); write("dedicated-routes-after.json", after); assert.deepEqual(after, beforeDedicatedRoutes); result.cleanup.dedicatedMappingRestored = true; }
		if (beforeRoutes) { const after = routeSnapshot(false); write("routes-after.json", after); assert.deepEqual(after, beforeRoutes); result.cleanup.unrelatedRoutesUnchanged = true; }
	} catch (error) { errors.push(error.stack); }
	for (const filename of [path.join(registry, "manager.log"), path.join(registry, "profiles", ticketId, "server.log"), packagedDesktop?.logPath].filter(Boolean)) if (fs.existsSync(filename)) fs.copyFileSync(filename, path.join(run, filename === packagedDesktop?.logPath ? "packaged-preview.log" : path.basename(filename)));
	result.cleanup.errors = errors; result.cleanup.complete = errors.length === 0;
	result.sourceAfter = buildIdentity(root);
	result.verifierUnchanged = result.verifier?.sha256 === checksum(import.meta.filename);
	result.sourceUnchanged = result.source?.sourceHash === result.sourceAfter.sourceHash;
	if (!result.sourceUnchanged) result.limitations.push("Shared-checkout source changed during this run; recorded prepared sandbox identity, not final-current-source proof");
	try { if (result.package) { assert.equal(checksum(binary), result.package.binarySha256); assert.equal(checksum(path.join(path.dirname(binary), "resources/app.asar")), result.package.asarSha256); result.package.unchangedDuringRun = true; } } catch (error) { result.package.unchangedDuringRun = false; errors.push(error.message); result.cleanup.complete = false; }
	result.finishedAt = new Date().toISOString();
	result.status = result.error || result.failures.length || errors.length ? "failed-scoped-checks" : result.visualReview?.status === "pending" ? "blocked-pending-visual-review" : result.blockers.length ? "passed-scoped-checks-with-blockers" : "passed-scoped-checks";
	for (const entry of result.checks) {
		entry.startedAt = result.startedAt; entry.finishedAt = result.finishedAt; entry.commands = result.commands;
		if ([7, 8, 9].includes(entry.number)) entry.observed = { completeRow: "BLOCKED", scopedChecks: result.scopedChecks.map(step => ({ name: step.name, status: step.status })), blockers: result.blockers };
	}
	if (result.error || result.failures.length || errors.length || result.visualReview?.status === "pending") process.exitCode = 1;
	save();
	fs.writeFileSync(path.join(run, "receipt.md"), [
		"# BLOCKED: packaged preview / manager / helper rehearsal",
		`All ten complete deployment acceptance rows remain BLOCKED. Scoped result: ${result.status}.`,
		"## Couldn't prove", ...result.limitations.map(item => `- ${item}`), ...result.blockers.map(item => `- Root cause: ${item.rootCause}\n- Unlock: ${item.unlock}`),
		...(result.visualReview ? [`- Visual review: ${result.visualReview.status}. ${result.visualReview.required}`] : []),
		"## Answer key and identity",
		`Private approved specification §4, SHA-256 ${result.spec?.sha256 ?? "unavailable"}; no private contents copied.`,
		`Actual package revision ${result.package?.stamp.revision ?? "unavailable"}, source ${result.package?.stamp.sourceHash ?? "unavailable"}.`,
		`Current checkout source before ${result.source?.sourceHash ?? "unavailable"}, after ${result.sourceAfter.sourceHash}. No relabelling or final-source acceptance.`,
		"Executable, ASAR, resource/module hashes, prepared backend source, process identities and exact commands: deployment.json.",
		`Normal packaged shell Home ${normalPage ? "exercised using normal-only CDP" : "not proved"}; preview DevTools/diagnostic/native bridge never enabled.`,
		"## Scoped checks", ...result.scopedChecks.map(entry => `- ${entry.status.toUpperCase()}: ${entry.name}${entry.error ? `: ${entry.error.split("\n")[0]}` : ""}`),
		"## Failures and retries", result.error ?? (result.failures.length ? result.failures.map(entry => `${entry.name}: ${entry.error}`).join("\n") : "No unexpected scoped failure."),
		values["retry-of"] ? `Prior run retained unchanged: ${result.retryOf}` : "Fresh self-run; prior receipts are not evidence for this run.",
		"## Cleanup", `Identity-checked cleanup complete: ${result.cleanup.complete}.`, ...errors,
		`Retained synthetic state only: ${external}. Evidence/profile retained, never a personal profile. No installation, launcher edit or package build/rebuild; only the sole manager's required sandbox preview builds.`,
		node ? "Existing authorized daemon retained. Only the sole manager creates/removes its dedicated lease mapping; normal/review/other mappings compared unchanged." : "Loopback-only run; no daemon or route operation.",
	].join("\n\n") + "\n", { mode: 0o600 });
	console.log(JSON.stringify({ run, status: result.status, deploymentAcceptance: "BLOCKED", passed: result.scopedChecks.filter(entry => entry.status === "passed").length, blockers: result.blockers.length, cleanup: result.cleanup.complete, error: result.error?.split("\n")[0] }));
}
