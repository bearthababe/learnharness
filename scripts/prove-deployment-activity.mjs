import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import net from "node:net";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import puppeteer, { PUPPETEER_REVISIONS } from "puppeteer-core";
import { WebSocketServer } from "ws";
import { DeploymentUpdater } from "./lib/deployment-updater.mjs";
import { ciDecision } from "./lib/deployment-eligibility.mjs";
import { packagedBuild, runPreparation, sameProcess, stopService } from "./lib/deployment-process.mjs";
import { buildIdentity } from "../electron/deployment-build.cjs";
import { processIdentity } from "../electron/deployment-profile.cjs";
import { controlRequest, readConfiguration } from "../electron/local-service-protocol.cjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
assert.equal(process.cwd(), root, "Run from the task checkout");
assert.ok(process.argv.length <= 3, "Usage: node scripts/prove-deployment-activity.mjs [NEW_IGNORED_RUN_DIRECTORY]");
const directory = path.resolve(process.argv[2] || path.join(root, ".prove-it/runs", `${new Date().toISOString().replaceAll(":", "-")}-deployment-activity`));
assert.ok(directory.startsWith(path.join(root, ".prove-it/runs/")), "Evidence must remain ignored");
assert.ok(!fs.existsSync(directory), "Do not overwrite prior evidence");
fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
const spec = "/home/bjorn/repo/teach/learnharness/specs/2026-11-06-local-deployment-and-previews.md";
const checksum = filename => createHash("sha256").update(fs.readFileSync(filename)).digest("hex");
const git = (...args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();
const scopedFiles = ["scripts/prove-deployment-activity.mjs", "components/deployment-activity.tsx", "components/composer.tsx", "components/dictation.tsx", "components/use-notebook-session.ts", "components/handwriting/notebook.tsx", "components/handwriting/submission.tsx", "components/notes-import.tsx", "components/shared-writing.tsx", "scripts/lib/deployment-updater.mjs", "scripts/lib/deployment-process.mjs", "electron/deployment-activity.cjs", "electron/local-service.cjs", "src/server/deployment-work.ts", "src/server/jobs.ts", "tests/deployment/activity.test.mjs", "tests/deployment/updater.test.mjs", "scripts/smoke-mobile-inputs.mjs"];
const fingerprint = () => ({ ...buildIdentity(root), dirty: !!git("status", "--porcelain"), files: Object.fromEntries(scopedFiles.map(filename => [filename, checksum(path.join(root, filename))])) });
function payloadFingerprint(release) {
	const hash = createHash("sha256");
	let files = 0;
	function visit(relative) {
		const target = path.join(release.directory, relative);
		const metadata = fs.lstatSync(target);
		if (metadata.isDirectory()) { for (const name of fs.readdirSync(target).sort()) visit(path.join(relative, name)); return; }
		const bytes = metadata.isSymbolicLink() ? Buffer.from(fs.readlinkSync(target)) : fs.readFileSync(target);
		hash.update(relative).update("\0").update(String(bytes.length)).update("\0").update(bytes).update("\0"); files++;
	}
	for (const target of ["deployment-build.json", "server.js", ".next/BUILD_ID", ".next/server", ".next/static"]) visit(target);
	return { sha256: hash.digest("hex"), files, roots: ["deployment-build.json", "server.js", ".next/BUILD_ID", ".next/server", ".next/static"] };
}
const names = ["Exact main eligibility and retry", "Idle gating and interrupted preparation", "Shared normal profile and native parity", "External storage and migration", "Backup and restore safety", "Code-only rollback", "Browser and desktop preview isolation", "Optional subscription access and model choice", "Hard expiry, stop and queue advancement", "Existing behavior and route ownership"];
const result = {
	schemaVersion: 1, status: "BLOCKED", diagnosticStatus: "running", startedAt: new Date().toISOString(), finishedAt: null,
	checker: "test sub-agent; scoped browser/service diagnostic, not final independent integration acceptance",
	harness: processIdentity(),
	evidenceClass: "Real packaged normal service and actual browser inputs; synthetic provider transport and eligible-CI fixture; no build or cutover",
	command: [process.execPath, ...process.argv.slice(1)], cwd: root,
	source: { ...fingerprint(), baseRevision: git("merge-base", "HEAD", "origin/main") },
	answerKey: { path: spec, sha256: checksum(spec), row: 2, supportingFiles: ["tests/deployment/activity.test.mjs", "tests/deployment/updater.test.mjs", "scripts/smoke-mobile-inputs.mjs"], privateContentPublished: false },
	environment: { node: process.version, platform: process.platform, architecture: process.arch, release: os.release(), freeMemory: os.freemem(), load: os.loadavg() },
	scope: { new: true, copies: "Existing real Notebook updater proof and browser handwriting/audio drivers", sharedCallers: ["client inputs", "server tutor/job pipeline", "updater control channel", "real preparation process group"], changedProduct: false },
	checks: names.map((name, index) => ({ number: index + 1, name, status: "blocked", flow: name, surface: "full deployment acceptance", answerKey: `approved private specification row ${index + 1}`, commands: [], expected: "Complete independent final-source acceptance", observed: "Scoped activity diagnostic only; parent integration and remaining acceptance required", startedAt: null, finishedAt: null, artifacts: [] })),
	scopedChecks: [], preparations: [], processes: [], ports: [], observations: [], provider: [], browser: { console: [], requests: [], activityReports: [], denied: [] }, retries: [],
	limitations: ["All ten full deployment rows remain BLOCKED until parent integration and independent final-source acceptance.", "No build/package, final cutover, installed launcher, tailnet route, personal profile, live provider, paid call or physical-device claim.", "Eligibility is a synthetic exact-SHA CI boundary fixture through real ciDecision; this diagnostic does not prove Git/main observation or row 1.", "Held preparation uses real updater cancellation and runPreparation process groups, not a build/package command.", "Packaged source identity is recorded exactly; a stale package is not final-source acceptance.", "Browser speech uses genuine fake-device capture/worklet and native WebSocket over owned loopback to synthetic ASR, not live ASR accuracy.", "Packaged Electron-Node service was exercised; native Electron renderer/IPC parity and the full standard mobile aggregate suite were deliberately not run.", "Desktop-sized Chromium proves shared activity hooks, not physical iOS Safari, mobile layout, subject accuracy or live-tutor teaching behavior.", "Notes multipart upload/extraction is exercised; handwritten snapshot attachment/submission transfer is a distinct surface not driven by this harness."], cleanup: { status: "not-run" },
};
const atomicJSON = (filename, value) => { fs.writeFileSync(`${filename}.tmp`, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 }); fs.renameSync(`${filename}.tmp`, filename); };
const save = () => atomicJSON(path.join(directory, "deployment.json"), result);
const controller = new AbortController();
const pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
async function waitFor(label, read, timeout = 15000) {
	const deadline = Date.now() + timeout;
	let last;
	while (Date.now() < deadline) {
		controller.signal.throwIfAborted();
		last = await read();
		if (last) return last;
		await pause(50);
	}
	throw new Error(`Timed out waiting for ${label}; last=${JSON.stringify(last)}`);
}
let page;
async function step(name, expected, run, { fatal = false } = {}) {
	controller.signal.throwIfAborted();
	const entry = { name, expected, status: "running", startedAt: new Date().toISOString() };
	result.scopedChecks.push(entry); save(); console.log(`RUN ${name}`);
	try { entry.observed = await run(); entry.status = "passed"; console.log(`PASS ${name}`); }
	catch (error) {
		entry.status = "failed"; entry.error = error.stack; result.diagnosticStatus = "failed"; console.error(`FAIL ${name}: ${error.message}`);
		if (service) { try { entry.activityAtFailure = await activity(); } catch (observationError) { entry.activityError = observationError.message; } }
		if (activePreparation) { updater?.preparation?.abort(new Error("harness-step-failed")); await activePreparation; activePreparation = null; }
		if (page && !page.isClosed()) {
			const prefix = `failure-${result.scopedChecks.length}`;
			try { await page.screenshot({ path: path.join(directory, `${prefix}.png`) }); fs.writeFileSync(path.join(directory, `${prefix}.txt`), await page.evaluate(() => document.body.innerText), { mode: 0o600 }); entry.artifacts = [`${prefix}.png`, `${prefix}.txt`]; } catch (captureError) { entry.captureError = captureError.message; }
		}
		if (fatal) throw error;
	} finally { entry.finishedAt = new Date().toISOString(); save(); }
}
const forbidden = new Set([3000, 3001, 3002, 3109, 3800, 3801, 3802, 3810]);
async function freePort() {
	for (;;) {
		const listener = net.createServer();
		await new Promise((resolve, reject) => { listener.once("error", reject); listener.listen(0, "127.0.0.1", resolve); });
		const port = listener.address().port;
		await new Promise(resolve => listener.close(resolve));
		if (!forbidden.has(port) && !result.ports.includes(port)) { result.ports.push(port); return port; }
	}
}
function offlineTransport() {
	const fs = require("node:fs");
	const net = require("node:net");
	const tls = require("node:tls");
	const dgram = require("node:dgram");
	const http = require("node:http");
	const origin = process.env.ZZ_ACTIVITY_ORIGIN;
	const upstream = process.env.ZZ_ACTIVITY_UPSTREAM;
	const runtime = process.env.ZZ_ACTIVITY_RUNTIME;
	const log = entry => fs.appendFileSync(process.env.ZZ_ACTIVITY_TRANSPORT, `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`);
	const originalFetch = globalThis.fetch;
	const allowed = new Set(["https://openrouter.ai/api/v1/chat/completions", "https://openrouter.ai/api/v1/models", "https://api.deepgram.com/v1/auth/grant"]);
	globalThis.fetch = async (input, init) => {
		const request = new Request(input, init);
		const target = new URL(request.url);
		if (target.origin === origin && ["/__local/session", "/api/runtime"].includes(target.pathname)) return originalFetch(request);
		const endpoint = target.origin + target.pathname;
		if (!allowed.has(endpoint)) { log({ status: "denied", target: endpoint }); throw new Error("Offline activity proof: destination refused"); }
		log({ status: "redirected", target: endpoint, method: request.method });
		return originalFetch(upstream + target.pathname, { method: request.method, headers: request.headers, signal: request.signal, redirect: "manual", ...(["GET", "HEAD"].includes(request.method) ? {} : { body: Buffer.from(await request.arrayBuffer()) }) });
	};
	function permit(args) {
		let options = args[0]; if (Array.isArray(options)) options = options[0];
		if (options && typeof options === "object" && options.path) { if ([`${runtime}/control.sock`, `${runtime}/updater.sock`].includes(options.path)) return; }
		else {
			const port = Number(typeof options === "object" ? options.port : options);
			const host = typeof options === "object" ? options.host || "localhost" : typeof args[1] === "string" ? args[1] : "localhost";
			if (["localhost", "127.0.0.1", "::1"].includes(host) && [Number(new URL(origin).port), Number(new URL(upstream).port)].includes(port)) return;
		}
		log({ status: "socket-denied" }); throw new Error("Offline activity proof: socket refused");
	}
	const connect = net.Socket.prototype.connect;
	net.Socket.prototype.connect = function(...args) { permit(args); return connect.apply(this, args); };
	const secure = tls.connect;
	tls.connect = function(...args) { permit(args); return secure.apply(this, args); };
	dgram.createSocket = () => { throw new Error("Offline activity proof: datagram refused"); };
	const emit = http.Server.prototype.emit;
	http.Server.prototype.emit = function(event, ...args) {
		if (event === "request") { const [request, response] = args; response.once("finish", () => log({ status: "http", path: new URL(request.url, origin).pathname, method: request.method, code: response.statusCode })); }
		return emit.call(this, event, ...args);
	};
	log({ status: "installed", pid: process.pid, electron: process.versions.electron, node: process.version, home: process.env.HOME });
	void globalThis.fetch("https://zz-activity-refusal.invalid/").then(() => process.exit(90), error => log({ status: "denial-self-check", error: error.message }));
	const probe = new net.Socket();
	try { probe.connect(9, "192.0.2.1"); process.exit(91); } catch (error) { if (!error.message.includes("socket refused")) throw error; log({ status: "socket-denial-self-check" }); } finally { probe.destroy(); }
}
let service;
let updater;
let browser;
let fixture;
let websocket;
let cookie;
let home;
let runtime;
let activePreparation;
let heldProvider;
let fixtureMode = "idle";
let fixtureError;
let currentStep = "setup";
let audioBytes = 0;
let speechSocket;
let deferredSpeechClose;
let blockHeartbeat = false;
const signal = name => { controller.abort(new Error(`Interrupted by ${name}`)); heldProvider?.response.destroy(); };
for (const name of ["SIGINT", "SIGTERM", "SIGHUP"]) process.once(name, signal);
async function api(route, method = "GET", body) {
	const response = await fetch(service.origin + route, { method, headers: { Cookie: cookie, Origin: service.origin, "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(20000), redirect: "error" });
	const text = await response.text(); let value;
	try { value = JSON.parse(text); } catch { value = text; }
	result.observations.push({ at: new Date().toISOString(), route, method, status: response.status }); save();
	return { status: response.status, body: value };
}
async function activity() {
	const value = await controlRequest(service, { op: "activity" });
	const signature = JSON.stringify([value.state, value.reasons, value.clients, value.freeze]);
	if (signature !== result.lastActivitySignature) {
		result.observations.push({ kind: "activity-transition", at: new Date().toISOString(), step: currentStep, activity: value }); result.lastActivitySignature = signature; result.lastActivity = value; save();
	}
	return value;
}
async function idle() { return waitFor("actual client/service idle", async () => { const value = await activity(); return value.state === "idle" && value; }); }
async function busy(reason) { return waitFor(`actual activity ${reason}`, async () => { const value = await activity(); return value.state !== "idle" && value.reasons.includes(reason) && value; }); }
function unchanged(label) {
	const current = readConfiguration(path.join(runtime, "service.json"));
	for (const field of ["pid", "start", "boot", "profileId", "profileRoot", "deploymentId", "revision", "sourceHash", "buildId"]) assert.equal(current[field], service[field], `${label}: service ${field} changed`);
	assert.ok(sameProcess(service), `${label}: service restarted`);
}
async function refusesPreparation(label) {
	const before = result.preparations.length;
	await updater.tick();
	assert.equal(result.preparations.length, before, `${label}: preparation started while busy`);
	assert.equal(updater.state.state, "waiting"); assert.equal(updater.state.reason, "application-busy-or-unknown"); unchanged(label);
	await assert.rejects(controlRequest(service, { op: "freeze" }), /Local-service request refused/, `${label}: cutover freeze accepted while busy or unknown`);
	assert.equal((await controlRequest(service, { op: "status" })).maintenance, false);
	const observed = await activity(); assert.equal(observed.freeze, null);
	return { activity: observed, updater: { state: updater.state.state, reason: updater.state.reason }, preparationCount: before, busyCutoverFreeze: "refused" };
}
async function startPreparation() {
	await idle();
	const before = result.preparations.length;
	activePreparation = updater.tick();
	const entry = await waitFor("real held preparation and child identity", async () => {
		const entry = result.preparations[before];
		if (!entry || !fs.existsSync(entry.ready)) return false;
		entry.identities = JSON.parse(fs.readFileSync(entry.ready, "utf8"));
		return entry;
	});
	assert.equal(updater.state.state, "preparing");
	for (const identity of Object.values(entry.identities)) assert.ok(sameProcess(identity));
	save(); return entry;
}
async function cancelled(entry, reason) {
	await busy(reason);
	await waitFor("activity cancels updater preparation", () => entry.status === "cancelled");
	await activePreparation; activePreparation = null;
	assert.equal(entry.reason, "activity-resumed");
	for (const identity of Object.values(entry.identities)) assert.equal(sameProcess(identity), false, "Preparation child survived cancellation");
	assert.equal(updater.state.state, "waiting"); assert.equal(updater.state.reason, "activity-resumed");
	unchanged(reason);
	assert.equal((await controlRequest(service, { op: "status" })).maintenance, false);
	return { cancellation: entry, busyRefusal: await refusesPreparation(reason) };
}
function completeProvider(held = heldProvider, tool = false) {
	assert.ok(held && !held.response.destroyed, "No real upstream response to release");
	const { response, record } = held;
	if (record.mode === "upload-failure") { response.writeHead(503, { "Content-Type": "application/json" }); response.end(JSON.stringify({ error: { message: "Deliberate offline extraction refusal", type: "unavailable" } })); }
	else {
		const chunk = (delta, finish = null) => response.write(`data: ${JSON.stringify({ id: record.id, object: "chat.completion.chunk", created: Math.floor(Date.now() / 1000), model: record.model, choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`);
		if (tool) { chunk({ tool_calls: [{ index: 0, id: `call_${randomUUID()}`, type: "function", function: { name: "research", arguments: JSON.stringify({ question: "ZZ_ACTIVITY_JOB synthetic arithmetic brief; do not browse" }) } }] }); chunk({}, "tool_calls"); }
		else { chunk({ content: "ZZ_ACTIVITY synthetic response. Two plus two is four." }); chunk({}, "stop"); }
		response.end("data: [DONE]\n\n");
	}
	record.releasedAt = new Date().toISOString(); if (heldProvider === held) heldProvider = null; save();
}
async function fill(text) {
	await page.focus('[data-testid="composer"] [contenteditable="true"]');
	await page.keyboard.down("Control"); await page.keyboard.press("KeyA"); await page.keyboard.up("Control"); await page.keyboard.sendCharacter(text);
	if (!text) await page.keyboard.press("Backspace");
}
async function sendFromComposer(text) {
	await fill(text);
	const pending = page.waitForResponse(response => response.url() === `${service.origin}/api/chat` && response.request().method() === "POST", { timeout: 15000 });
	await page.click('[data-testid="composer"] [aria-label="Send"]');
	const response = await pending;
	const body = await response.json();
	assert.equal(response.status(), 200, JSON.stringify(body));
	return { status: response.status(), body, input: "actual composer submit" };
}
async function capture(label) { await page.screenshot({ path: path.join(directory, `${label}.png`) }); }
save();
try {
	await step("packaged preflight and isolated custody", "Existing genuine Linux package, no build; private synthetic HOME/profile and complete exact identity", async () => {
		assert.equal(process.platform, "linux"); assert.ok(os.freemem() > 256 * 1024 * 1024);
		result.package = packagedBuild(process.env.LH_TEST_PACKAGED_BINARY || path.join(root, "dist/linux-unpacked/learnharness"));
		result.package.binarySha256 = checksum(result.package.executable);
		result.package.payload = payloadFingerprint(result.package);
		result.package.files = Object.fromEntries(["local-service.cjs", "deployment-activity.cjs", "deployment-profile.cjs", "local-service-ingress.cjs"].map(filename => [filename, checksum(path.join(result.package.resources, filename))]));
		result.package.matchesCurrentSource = result.package.revision === result.source.revision && result.package.sourceHash === result.source.sourceHash;
		for (const name of fs.readdirSync(result.package.directory)) assert.ok(!/^\.env(?:\.|$)/.test(name), "Ambient packaged dotenv forbidden");
		home = fs.mkdtempSync(path.join(os.tmpdir(), "zz-activity-home-")); runtime = fs.mkdtempSync("/tmp/zz-act-");
		for (const name of ["config", "cache", "data", "state", "run", "tmp", "source", "profile", "profile/data"]) fs.mkdirSync(path.join(home, name), { recursive: true, mode: 0o700 });
		fs.writeFileSync(path.join(home, "profile/auth.json"), JSON.stringify({ OPENROUTER_API_KEY: "zz-activity-not-a-real-key", DEEPGRAM_API_KEY: "zz-activity-not-a-real-key" }), { mode: 0o600 });
		result.roots = { home, runtime, profile: path.join(home, "profile"), browser: path.join(home, "browser"), retained: true };
		return { package: result.package, roots: result.roots };
	}, { fatal: true });
	const port = await freePort(); const upstreamPort = await freePort();
	const origin = `http://127.0.0.1:${port}`; const upstream = `http://127.0.0.1:${upstreamPort}`;
	fixture = http.createServer((request, response) => {
		void (async () => {
			const url = new URL(request.url, upstream); const parts = [];
			for await (const part of request) parts.push(part);
			const text = Buffer.concat(parts).toString("utf8");
			const json = value => { response.writeHead(200, { "Content-Type": "application/json" }); response.end(JSON.stringify(value)); };
			if (url.pathname === "/v1/auth/grant") { assert.equal(request.headers.authorization, "Token zz-activity-not-a-real-key"); return json({ access_token: "zz-activity-synthetic-speech" }); }
			if (url.pathname === "/api/v1/models") return json({ data: [] });
			assert.equal(url.pathname, "/api/v1/chat/completions"); assert.equal(request.headers.authorization, "Bearer zz-activity-not-a-real-key");
			const body = JSON.parse(text); assert.equal(body.stream, true);
			const researcher = JSON.stringify(body.messages).includes("You are a research specialist");
			const record = { id: `zz_${randomUUID()}`, mode: fixtureMode, researcher, model: body.model, at: new Date().toISOString(), step: currentStep, toolNames: (body.tools || []).map(tool => tool.function.name) };
			result.provider.push(record); atomicJSON(path.join(directory, `provider-${result.provider.length}.json`), body); save();
			const hold = fixtureMode === "tutor" || fixtureMode === "job-dispatch" || fixtureMode === "upload-failure" || fixtureMode === "job" && researcher;
			if (fixtureMode !== "upload-failure") { response.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store" }); response.flushHeaders(); response.write(`data: ${JSON.stringify({ id: record.id, choices: [{ index: 0, delta: { role: "assistant", content: "" }, finish_reason: null }] })}\n\n`); }
			const held = { response, record };
			response.once("close", () => { record.closedAt = new Date().toISOString(); save(); });
			if (hold) { assert.ok(!heldProvider, "Unexpected overlapping held provider response"); heldProvider = held; save(); }
			else completeProvider(held);
		})().catch(error => { fixtureError = error; result.fixtureError = error.stack; save(); if (!response.headersSent) response.writeHead(500); response.end("Synthetic upstream fixture failure"); });
	});
	websocket = new WebSocketServer({ server: fixture, path: "/speech", handleProtocols: protocols => protocols.has("bearer") && "bearer" });
	websocket.on("connection", socket => {
		speechSocket = socket;
		socket.on("message", (bytes, binary) => {
			if (binary) { audioBytes += bytes.length; return; }
			const value = JSON.parse(bytes.toString());
			result.observations.push({ speech: value.type, audioBytes, at: new Date().toISOString() }); save();
			if (value.type === "CloseStream") deferredSpeechClose = () => socket.close(1000, "Synthetic speech finished");
		});
	});
	await new Promise((resolve, reject) => { fixture.once("error", reject); fixture.listen(upstreamPort, "127.0.0.1", resolve); });
	const transport = path.join(directory, "transport.cjs"); fs.writeFileSync(transport, `(${offlineTransport.toString()})();\n`, { mode: 0o600 });
	const environment = { PATH: process.env.PATH, HOME: home, LANG: "C.UTF-8", XDG_CONFIG_HOME: path.join(home, "config"), XDG_CACHE_HOME: path.join(home, "cache"), XDG_DATA_HOME: path.join(home, "data"), XDG_STATE_HOME: path.join(home, "state"), XDG_RUNTIME_DIR: path.join(home, "run"), TMPDIR: path.join(home, "tmp"), LH_IGNORE_ENV_KEYS: "1", NEXT_TELEMETRY_DISABLED: "1", NODE_OPTIONS: `--require=${transport}`, ZZ_ACTIVITY_ORIGIN: origin, ZZ_ACTIVITY_UPSTREAM: upstream, ZZ_ACTIVITY_RUNTIME: runtime, ZZ_ACTIVITY_TRANSPORT: path.join(directory, "transport.ndjson") };
	result.environment.allowedKeys = Object.keys(environment); result.environment.service = environment;
	const repository = "synthetic/activity-proof"; const candidate = createHash("sha256").update("zz-activity-synthetic-unbuilt-candidate").digest("hex").slice(0, 40); result.candidate = candidate;
	const observe = async () => ciDecision(candidate, [{ workflow_runs: [{ id: 1, run_attempt: 1, head_sha: candidate, head_branch: "main", event: "push", repository: { full_name: repository }, path: ".github/workflows/ci.yml", created_at: result.startedAt, status: "completed", conclusion: "success" }] }], repository);
	const prepare = async (sha, abortSignal) => {
		const attempt = result.preparations.length + 1;
		const entry = { attempt, sha, ready: path.join(directory, `preparation-${attempt}.json`), status: "running", startedAt: new Date().toISOString() };
		result.preparations.push(entry); save();
		const childSource = `const fs=require('node:fs');process.on('SIGTERM',()=>{});fs.writeFileSync(${JSON.stringify(`${entry.ready}.child`)},String(process.pid));setInterval(()=>{},1000);`;
		const source = `const fs=require('node:fs');const {spawn}=require('node:child_process');const {processIdentity}=require(${JSON.stringify(path.join(root, "electron/deployment-profile.cjs"))});const child=spawn(process.execPath,['-e',${JSON.stringify(childSource)}],{stdio:'ignore'});const timer=setInterval(()=>{if(fs.existsSync(${JSON.stringify(`${entry.ready}.child`)})){fs.writeFileSync(${JSON.stringify(entry.ready)},JSON.stringify({parent:processIdentity(),descendant:processIdentity(child.pid)}));clearInterval(timer);}},20);setInterval(()=>{},1000);`;
		entry.command = [process.execPath, "-e", source]; save();
		try { await runPreparation(entry.command, { env: { PATH: process.env.PATH, HOME: home, TMPDIR: path.join(home, "tmp") }, log: path.join(directory, `preparation-${attempt}.log`), signal: abortSignal }); throw new Error("Held preparation unexpectedly finished"); }
		catch (error) { entry.status = abortSignal.aborted ? "cancelled" : "failed"; entry.reason = error.message; throw error; }
		finally { entry.finishedAt = new Date().toISOString(); save(); }
	};
	updater = new DeploymentUpdater({ profileRoot: result.roots.profile, runtime, releases: path.join(home, "releases"), sourceRoot: path.join(home, "source"), repository, port, browserOrigins: [], initialElectron: result.package.executable }, { observe, prepare, environment });
	await step("real packaged normal-service startup and synthetic auth", "Actual Electron-Node backend, admitted isolated session, synthetic BYOK settings and unknown-user refusal", async () => {
		await updater.initialize(); service = readConfiguration(path.join(runtime, "service.json")); result.service = service; result.processes.push({ kind: "packaged-service", command: fs.readFileSync(`/proc/${service.pid}/cmdline`, "utf8").split("\0").filter(Boolean), ...processIdentity(service.pid) }); save();
		const { ticket } = await controlRequest(service, { op: "admit", origin });
		const response = await fetch(`${origin}/__local/session`, { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify({ ticket }), redirect: "error", signal: AbortSignal.timeout(10000) });
		assert.equal(response.status, 204); cookie = response.headers.get("set-cookie")?.split(";")[0]; assert.ok(cookie);
		const runtimeStatus = await api("/api/runtime"); assert.equal(runtimeStatus.status, 200);
		for (const field of ["pid", "profileId", "deploymentId", "revision", "sourceHash", "buildId"]) assert.equal(runtimeStatus.body[field], service[field]);
		assert.equal((await fetch(`${origin}/api/chats`, { signal: AbortSignal.timeout(10000) })).status, 403);
		const model = { provider: "openrouter", id: "openai/gpt-4.1-mini" };
		const slot = { model, thinkingLevel: "off" };
		const settings = await api("/api/settings/models", "PUT", { strong: slot, cheap: slot, vision: slot }); assert.equal(settings.status, 200, JSON.stringify(settings.body));
		const chat = await api("/api/chats", "POST", { title: "ZZ_ACTIVITY isolated browser session" }); assert.equal(chat.status, 200); result.chat = chat.body;
		return { runtime: runtimeStatus.body, chat: chat.body, activity: await activity() };
	}, { fatal: true });
	await step("real browser startup and fail-closed transport", "Isolated Chrome, actual HTML hydration/activity hook, native microphone and WebSocket transport only to owned fixture", async () => {
		const executablePath = process.env.CHROMIUM_PATH || "/home/bjorn/.cache/puppeteer/chrome/linux-152.0.7977.42/chrome-linux64/chrome";
		result.browser.executable = executablePath; result.browser.version = execFileSync(executablePath, ["--version"], { encoding: "utf8" }).trim(); result.browser.supportedChrome = PUPPETEER_REVISIONS.chrome;
		browser = await puppeteer.launch({ executablePath, headless: true, handleSIGINT: false, handleSIGTERM: false, handleSIGHUP: false, userDataDir: result.roots.browser, env: { ...environment, NODE_OPTIONS: "" }, args: ["--no-sandbox", "--disable-background-networking", "--disable-component-update", "--disable-sync", "--no-first-run", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--autoplay-policy=no-user-gesture-required"] });
		result.processes.push({ kind: "browser", command: browser.process().spawnargs, ...processIdentity(browser.process().pid) });
		const split = cookie.indexOf("="); await browser.defaultBrowserContext().setCookie({ name: cookie.slice(0, split), value: cookie.slice(split + 1), domain: "127.0.0.1", path: "/", httpOnly: true, sameSite: "Strict" });
		page = await browser.newPage(); await page.setViewport({ width: 1180, height: 1000 });
		page.on("console", message => result.browser.console.push({ type: message.type(), text: message.text() })); page.on("pageerror", error => { result.browser.console.push({ type: "pageerror", text: error.message }); save(); });
		await page.setRequestInterception(true);
		page.on("request", request => {
			const url = new URL(request.url());
			if (url.origin === origin && url.pathname === "/__local/activity" && request.method() === "POST") { const body = request.postData(); if (body) { try { result.browser.activityReports.push({ at: new Date().toISOString(), step: currentStep, dropped: blockHeartbeat, ...JSON.parse(body) }); } catch {} } }
			if (blockHeartbeat && url.origin === origin && url.pathname === "/__local/activity") void request.abort("failed");
			else if (["data:", "blob:"].includes(url.protocol) || url.origin === origin) { result.browser.requests.push({ method: request.method(), path: url.pathname }); void request.continue(); }
			else { result.browser.denied.push({ origin: url.origin, path: url.pathname }); void request.abort("blockedbyclient"); }
		});
		await page.evaluateOnNewDocument(speechOrigin => {
			const NativeWebSocket = window.WebSocket;
			window.WebSocket = class extends NativeWebSocket {
				constructor(url, protocols) {
					const target = new URL(url);
					if (target.origin !== "wss://api.deepgram.com" || target.pathname !== "/v1/listen") throw new Error("Offline activity proof: WebSocket refused");
					super(`${speechOrigin}/speech`, protocols);
				}
			};
		}, upstream.replace("http:", "ws:"));
		await page.goto(`${origin}/chat/${result.chat.id}`, { waitUntil: "networkidle2", timeout: 30000 });
		await page.waitForSelector('[data-testid="composer"] [contenteditable="true"]', { timeout: 15000 });
		const transportLog = fs.readFileSync(path.join(directory, "transport.ndjson"), "utf8").trim().split("\n").map(line => JSON.parse(line));
		assert.ok(transportLog.some(entry => entry.status === "installed" && entry.pid === service.pid && entry.electron)); assert.ok(transportLog.some(entry => entry.status === "denial-self-check")); assert.ok(transportLog.some(entry => entry.status === "socket-denial-self-check"));
		return { browser: result.browser.version, activity: await idle(), noMockedActivity: true };
	}, { fatal: true });
	await step("open session alone is idle and permits preparation", "An actual visible open session is idle; real preparation starts with current service untouched", async () => {
		const before = await idle(); const entry = await startPreparation(); unchanged("open-session"); await capture("open-session-preparing");
		await fill("ZZ_ACTIVITY draft"); const cancellation = await cancelled(entry, "composer"); await capture("draft-busy");
		await fill(""); const after = await idle();
		return { before, cancellation, after };
	});
	await step("unfinished handwriting cancels preparation and blocks restart", "Real canvas stroke, persisted unfinished input and updater cancellation; clearing stroke restores idle", async () => {
		currentStep = "handwriting";
		await page.click('[data-testid="open-notebook"]'); await page.waitForFunction(() => document.querySelector('[data-testid="handwriting-notebook"]')?.dataset.ready === "true");
		const entry = await startPreparation();
		const bounds = await page.$eval('[data-testid="notebook-canvas"]', element => { const bounds = element.getBoundingClientRect(); return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height }; });
		const session = await page.createCDPSession();
		const point = { x: bounds.x + bounds.width * 0.3, y: bounds.y + Math.min(150, bounds.height * 0.3), pointerType: "pen" };
		await session.send("Input.dispatchMouseEvent", { type: "mousePressed", ...point, button: "left", buttons: 1, clickCount: 1, force: 0.5 });
		await session.send("Input.dispatchMouseEvent", { type: "mouseMoved", ...point, x: point.x + 30, y: point.y + 25, button: "left", buttons: 1, force: 0.5 });
		await session.send("Input.dispatchMouseEvent", { type: "mouseReleased", ...point, x: point.x + 30, y: point.y + 25, button: "left", buttons: 0, clickCount: 1 }); await session.detach();
		const cancellation = await cancelled(entry, "unfinished-handwriting"); await capture("handwriting-busy");
		await page.click('[aria-label="Undo"]'); const after = await idle();
		return { bounds, cancellation, after };
	});
	await step("actual audio recording and finishing block preparation", "Real fake-device audio frames/worklet/native WebSocket, recording cancellation and finishing remain busy until ASR close", async () => {
		currentStep = "recording";
		const entry = await startPreparation(); await page.click('[data-testid="dictation-toggle"][aria-label="Start dictation"]');
		await waitFor("genuine browser audio reaches owned ASR WebSocket", () => audioBytes > 0 && speechSocket);
		const cancellation = await cancelled(entry, "recording-or-finishing-speech"); await capture("recording-busy");
		await page.click('[data-testid="dictation-toggle"][aria-label="Stop dictation"]');
		await waitFor("real CloseStream after capture finishes", () => deferredSpeechClose);
		const finishing = await busy("recording-or-finishing-speech"); const refusal = await refusesPreparation("finishing-speech");
		deferredSpeechClose(); deferredSpeechClose = null; await idle();
		return { audioBytes, cancellation, finishing, refusal, after: await activity() };
	});
	await step("actual tutor turn cancels preparation and blocks updater", "Real chat handler and provider SSE hold a tutor turn; not a seeded running flag", async () => {
		currentStep = "tutor"; fixtureMode = "tutor";
		const entry = await startPreparation(); const start = await sendFromComposer("ZZ_ACTIVITY tutor arithmetic");
		await waitFor("actual tutor provider request", () => heldProvider && !heldProvider.record.researcher);
		const cancellation = await cancelled(entry, "turn-in-flight"); fixtureMode = "idle"; completeProvider(); await idle();
		return { start, cancellation, after: await activity() };
	});
	await step("actual background research job cancels preparation and blocks updater", "Real tutor tool creates/runs a research job; independently held worker provider remains busy after dispatch", async () => {
		currentStep = "job"; fixtureMode = "job-dispatch";
		const entry = await startPreparation(); const start = await sendFromComposer("ZZ_ACTIVITY dispatch research");
		await waitFor("tutor exposes genuine research tool", () => heldProvider); assert.ok(heldProvider.record.toolNames.includes("research"));
		fixtureMode = "job"; completeProvider(heldProvider, true);
		await waitFor("actual research executor upstream request", () => heldProvider?.record.researcher);
		const cancellation = await cancelled(entry, "jobs-running");
		const jobs = await waitFor("worker remains active after tutor dispatch completes", async () => { const response = await api(`/api/jobs?chatId=${encodeURIComponent(result.chat.id)}`); assert.equal(response.status, 200); return !response.body.turnInFlight && response.body.jobs.some(job => job.status === "running") && response; });
		const workerOnly = await refusesPreparation("independent-running-job");
		fixtureMode = "idle"; completeProvider(); await idle();
		const settled = await api(`/api/jobs?chatId=${encodeURIComponent(result.chat.id)}`); assert.ok(settled.body.jobs.every(job => job.status !== "running"));
		return { start, jobs, cancellation, workerOnly, settled, after: await activity() };
	});
	await step("departing during a tutor turn releases only completed server work", "A real held tutor turn remains busy after navigation; completing it restores idle without discarding unfinished input", async () => {
		currentStep = "departure"; fixtureMode = "tutor";
		const entry = await startPreparation(); const start = await sendFromComposer("ZZ_ACTIVITY held departure");
		await waitFor("actual held tutor request before departure", () => heldProvider && !heldProvider.record.researcher);
		const cancellation = await cancelled(entry, "turn-in-flight");
		await waitFor("actual composer draft cleared before departure", () => page.$eval('[data-testid="composer"] [contenteditable="true"]', element => !element.textContent.trim()));
		await page.goto(origin, { waitUntil: "networkidle2", timeout: 30000 });
		await page.waitForSelector('[data-testid="import-notes"]', { timeout: 15000 });
		const held = await refusesPreparation("departed-client-active-tutor");
		assert.ok(held.activity.reasons.includes("turn-in-flight"));
		fixtureMode = "idle"; completeProvider();
		const after = await idle(); assert.equal(after.clients, 1);
		return { start, cancellation, held, after };
	});
	await step("actual file selection/upload/extraction cancels preparation", "Real browser File input and multipart service request, real extraction provider call; controlled upstream refusal safely returns idle", async () => {
		currentStep = "upload";
		await page.goto(origin, { waitUntil: "networkidle2", timeout: 30000 }); await page.waitForSelector('[data-testid="import-notes"]', { timeout: 15000 });
		const entry = await startPreparation();
		const notes = path.join(home, "ZZ_ACTIVITY_NOTES.txt"); fs.writeFileSync(notes, "ZZ_ACTIVITY synthetic notes: pressure is force divided by area.\n", { mode: 0o600 }); fixtureMode = "upload-failure";
		const input = await page.$('input[type="file"][multiple][accept=".md,.markdown,.txt,.pdf"]'); assert.ok(input, "Actual notes picker unavailable"); await input.uploadFile(notes);
		await waitFor("actual notes extraction provider request", () => heldProvider);
		const cancellation = await cancelled(entry, "upload-or-extraction"); const active = await activity(); assert.ok(active.reasons.includes("extraction"), "Service extraction must be active, not only a browser spinner"); await capture("upload-extraction-busy");
		completeProvider();
		await waitFor("actual import completes controlled refusal", async () => !(await activity()).reasons.includes("upload-or-extraction"), 30000);
		fixtureMode = "idle"; await idle();
		return { input: "real File upload", cancellation, active, after: await activity(), intentionalFailure: "Synthetic upstream HTTP503; no extraction accuracy or live-provider claim" };
	});
	await step("unknown/stale actual browser state blocks preparation and restart", "A real client with blocked activity heartbeat becomes unknown, cancels real preparation and cannot force restart", async () => {
		currentStep = "unknown";
		const entry = await startPreparation();
		blockHeartbeat = true;
		const unknown = await waitFor("real stale client is unknown", async () => { const value = await activity(); return value.state === "unknown" && value; }, 12000);
		await waitFor("unknown cancels preparation", () => entry.status === "cancelled"); await activePreparation; activePreparation = null;
		assert.equal(entry.reason, "activity-resumed"); for (const identity of Object.values(entry.identities)) assert.equal(sameProcess(identity), false);
		const refusal = await refusesPreparation("unknown-client");
		blockHeartbeat = false;
		const restored = await idle(); unchanged("unknown-recovered"); return { unknown, cancellation: entry, refusal, restored };
	});
	await step("idle permits preparation again after actual activity", "No stuck busy state after all cleared input/work; service identity survives another preparation cancellation", async () => {
		const before = await idle(); const entry = await startPreparation();
		await page.goto(`${origin}/chat/${result.chat.id}`, { waitUntil: "networkidle2", timeout: 30000 }); await page.waitForSelector('[data-testid="composer"] [contenteditable="true"]'); await fill("ZZ_ACTIVITY final cancellation");
		await waitFor("final cancellation", () => entry.status === "cancelled"); await activePreparation; activePreparation = null;
		assert.equal(entry.reason, "activity-resumed"); for (const identity of Object.values(entry.identities)) assert.equal(sameProcess(identity), false);
		await fill(""); const after = await idle(); unchanged("final-idle");
		assert.ok(!fixtureError, fixtureError?.stack); return { before, preparation: entry, after };
	});
	await step("unplaced speech recovery blocks updates until explicitly discarded", "Real ASR timing failure retains learner words; preparation/freeze refuse before and after departure, while explicit discard restores idle", async () => {
		currentStep = "unplaced-speech-recovery";
		const recover = async () => {
			const previousSocket = speechSocket;
			const previousBytes = audioBytes;
			await page.click('[data-testid="dictation-toggle"]:is([aria-label="Start dictation"], [aria-label^="Dictation failed: "])');
			await waitFor("fresh real microphone/worklet frames before ASR timing failure", () => speechSocket !== previousSocket && audioBytes > previousBytes);
			speechSocket.send(JSON.stringify({ type: "Results", is_final: true, speech_final: true, start: 0, duration: 3600, channel: { alternatives: [{ transcript: "ZZ_ACTIVITY retained unsubmitted recovery words", words: [{ word: "words", punctuated_word: "words", start: 0, end: 3600 }] }] } }));
			await busy("recording-or-finishing-speech");
			await page.click('[data-testid="dictation-toggle"][aria-label="Stop dictation"]');
			await waitFor("real CloseStream before retained speech recovery", () => deferredSpeechClose);
			deferredSpeechClose(); deferredSpeechClose = null;
			await page.waitForFunction(() => document.querySelector('[aria-label="Dictation recovery"]')?.textContent.includes("ZZ_ACTIVITY retained unsubmitted recovery words"));
			await waitFor("recording finishes without hiding retained learner input", async () => !(await activity()).reasons.includes("recording-or-finishing-speech"));
			await busy("notebook");
			const notebook = await api(`/api/chats/${result.chat.id}/notebook`);
			assert.equal(notebook.status, 200);
			const run = notebook.body.speechRuns.find(run => run.fragments.some(fragment => fragment.text.includes("ZZ_ACTIVITY retained unsubmitted recovery words") && run.unplaced?.includes(fragment.id) && !run.discarded?.includes(fragment.id)));
			assert.ok(run, "Real ASR recovery did not retain unsubmitted speech");
			assert.equal(await page.$eval('[data-testid="composer"] [contenteditable="true"]', element => element.textContent.trim()), "");
			return { run, notebook };
		};
		await idle();
		const first = await recover();
		const beforeDiscard = await refusesPreparation("retained-speech-before-discard");
		await capture("unplaced-speech-before-discard");
		await page.click('[aria-label="Dictation recovery"] article button:last-child');
		const afterDiscard = await idle();
		const discarded = await api(`/api/chats/${result.chat.id}/notebook`);
		assert.equal(discarded.status, 200);
		const retained = discarded.body.speechRuns.find(run => run.id === first.run.id);
		assert.ok(retained);
		assert.deepEqual(retained.fragments, first.run.fragments.filter(fragment => !first.run.unplaced.includes(fragment.id)));
		assert.ok(first.run.unplaced.every(id => retained.discarded?.includes(id)), "Explicit discard did not acknowledge retained words");
		const second = await recover();
		const beforeDeparture = await refusesPreparation("retained-speech-before-departure");
		await page.goto(origin, { waitUntil: "networkidle2", timeout: 30000 });
		await page.waitForSelector('[data-testid="import-notes"]');
		const afterDeparture = await refusesPreparation("retained-speech-after-departure");
		const reopened = await api(`/api/chats/${result.chat.id}/notebook`);
		assert.equal(reopened.status, 200);
		assert.deepEqual(reopened.body.speechRuns.find(run => run.id === second.run.id), second.run);
		await capture("unplaced-speech-retained-after-departure");
		unchanged("retained-speech-recovery");
		return { first, beforeDiscard, afterDiscard, discarded, second, beforeDeparture, afterDeparture, reopened };
	});
	if (result.diagnosticStatus === "running") result.diagnosticStatus = "passed";
} catch (error) { result.diagnosticStatus = controller.signal.aborted ? "interrupted" : "failed"; result.error = error.stack; process.exitCode = 1; }
finally {
	const failures = [];
	if (heldProvider && !heldProvider.response.destroyed) { try { fixtureMode = "idle"; completeProvider(); } catch (error) { failures.push(`provider drain: ${error.message}`); heldProvider.response.destroy(); } }
	try { deferredSpeechClose?.(); for (const socket of websocket?.clients || []) socket.close(1000, "Proof cleanup"); } catch (error) { failures.push(`speech cleanup: ${error.message}`); }
	try { if (page && !page.isClosed()) await page.screenshot({ path: path.join(directory, "final-ui.png") }); } catch (error) { result.browser.finalCaptureError = error.message; }
	try { if (page && !page.isClosed()) await page.close({ runBeforeUnload: true }); } catch (error) { failures.push(`page cleanup: ${error.message}`); }
	try { await browser?.close(); } catch (error) { failures.push(`browser cleanup: ${error.message}`); }
	try { await updater?.close(); await activePreparation; } catch (error) { failures.push(`updater cleanup: ${error.message}`); }
	if (!service && updater?.child?.pid) service = processIdentity(updater.child.pid);
	if (service) { try { if (sameProcess(service)) await stopService(service); assert.equal(sameProcess(service), false); } catch (error) { failures.push(`service cleanup: ${error.message}`); } }
	try { for (const socket of websocket?.clients || []) socket.terminate(); websocket?.close(); fixture?.closeAllConnections(); if (fixture?.listening) await new Promise(resolve => fixture.close(resolve)); } catch (error) { failures.push(`fixture cleanup: ${error.message}`); }
	for (const preparation of result.preparations) {
		try { const identities = preparation.identities || (fs.existsSync(preparation.ready) ? JSON.parse(fs.readFileSync(preparation.ready, "utf8")) : {}); for (const identity of Object.values(identities)) assert.equal(sameProcess(identity), false, `Preparation PID ${identity.pid} survives`); } catch (error) { failures.push(error.message); }
	}
	for (const process of result.processes) { try { assert.equal(sameProcess(process), false, `Owned ${process.kind} PID ${process.pid} survives`); } catch (error) { failures.push(error.message); } }
	for (const port of result.ports) { const listener = net.createServer(); try { await new Promise((resolve, reject) => { listener.once("error", reject); listener.listen(port, "127.0.0.1", resolve); }); await new Promise(resolve => listener.close(resolve)); } catch (error) { failures.push(`Owned port ${port} remains: ${error.message}`); } }
	if (runtime) {
		for (const filename of ["service.json", "control.sock", "updater.sock"]) if (fs.existsSync(path.join(runtime, filename))) failures.push(`Runtime entry survives: ${filename}`);
		if (fs.existsSync(path.join(runtime, "service.log"))) fs.copyFileSync(path.join(runtime, "service.log"), path.join(directory, "service.log"));
	}
	result.cleanup = { status: failures.length ? "failed" : "passed", failures, retainedSyntheticRoots: result.roots, observed: "Only owned identity-checked browser/service/updater/preparation/fixture stopped; synthetic profiles and evidence retained; no shared route, installed launcher or personal profile changed" };
	result.sourceAfter = fingerprint(); result.scopedSourceUnchanged = JSON.stringify(result.source.files) === JSON.stringify(result.sourceAfter.files);
	if (!result.scopedSourceUnchanged) result.limitations.push("Concurrent scoped source changes occurred; parent must rerun after integration stabilizes.");
	if (result.package) {
		try { result.packageAfter = packagedBuild(result.package.executable); result.packageAfter.binarySha256 = checksum(result.package.executable); result.packageAfter.payload = payloadFingerprint(result.packageAfter); result.packageUnchanged = result.packageAfter.buildId === result.package.buildId && result.packageAfter.binarySha256 === result.package.binarySha256 && result.packageAfter.payload.sha256 === result.package.payload.sha256; if (!result.packageUnchanged) result.limitations.push("Package rebuilt concurrently; recorded run is not a final-package claim."); } catch (error) { result.packageAfterError = error.message; }
	}
	if (failures.length || result.diagnosticStatus !== "passed") process.exitCode = 1;
	result.finishedAt = new Date().toISOString();
	Object.assign(result.checks[1], { commands: [result.command], startedAt: result.startedAt, finishedAt: result.finishedAt, observed: `Scoped diagnostic ${result.diagnosticStatus}; parent integration/final-source acceptance still required`, artifacts: ["deployment.json", "receipt.md", "transport.ndjson", "service.log"] });
	assert.equal(result.checks.length, 10); assert.ok(result.checks.every(check => check.status === "blocked")); save();
	fs.writeFileSync(path.join(directory, "receipt.md"), `# Deployment activity diagnostic\n\nVerdict: BLOCKED (all ten full deployment rows).\nScoped diagnostic: ${result.diagnosticStatus}.\nCleanup: ${result.cleanup.status}.\n\n## Scope\nActual packaged Linux normal service, isolated real browser editors/canvas/audio/File upload, real tutor/job/extraction executors against synthetic provider transport, and real updater preparation subprocess groups. No direct activity reports, seeded running-job flags or mocked client state. Source/package identities and exact subprocess commands are in deployment.json.\n\n## Steps\n${result.scopedChecks.map(entry => `- [${entry.status.toUpperCase()}] ${entry.name}${entry.error ? `: ${entry.error.split("\n")[0]}` : ""}`).join("\n")}\n\n## Could not prove\n${result.limitations.map(value => `- ${value}`).join("\n")}\n\n## Cleanup\n${result.cleanup.observed}.\n${failures.map(value => `- ${value}`).join("\n")}\n\n## Left behind\nOnly ignored evidence and synthetic roots listed in deployment.json; no process intentionally retained. Prior failed runs are never overwritten.\n`, { mode: 0o600 });
	console.log(JSON.stringify({ status: result.status, diagnosticStatus: result.diagnosticStatus, error: result.error, cleanup: result.cleanup.status, receipt: path.join(directory, "receipt.md"), machineResult: path.join(directory, "deployment.json") }));
}
