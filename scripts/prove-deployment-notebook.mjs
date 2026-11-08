import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import net from "node:net";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { generateKeyPair, exportJWK, SignJWT } from "jose";
import { DeploymentUpdater } from "./lib/deployment-updater.mjs";
import { observeMain } from "./lib/deployment-eligibility.mjs";
import { packagedBuild, runPreparation, sameProcess, stopService } from "./lib/deployment-process.mjs";
import { buildIdentity } from "../electron/deployment-build.cjs";
import { processIdentity } from "../electron/deployment-profile.cjs";
import { controlRequest, readConfiguration } from "../electron/local-service-protocol.cjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
assert.equal(process.cwd(), root, "Run from the task checkout");
assert.ok(process.argv.length <= 3, "Usage: node scripts/prove-deployment-notebook.mjs [NEW_IGNORED_RUN_DIRECTORY]");
const directory = path.resolve(process.argv[2] || path.join(root, ".prove-it/runs", `${new Date().toISOString().replaceAll(":", "-")}-deployment-notebook`));
assert.ok(directory.startsWith(path.join(root, ".prove-it/runs/")), "Evidence must stay under ignored .prove-it/runs");
assert.ok(!fs.existsSync(directory), "Never overwrite earlier attempts; supply a new evidence directory");
fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
const command = [process.execPath, ...process.argv.slice(1)];
const spec = "/home/bjorn/repo/teach/learnharness/specs/2026-11-06-local-deployment-and-previews.md";
const checksum = filename => createHash("sha256").update(fs.readFileSync(filename)).digest("hex");
const atomicJSON = (filename, value) => {
	fs.writeFileSync(`${filename}.tmp`, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
	fs.renameSync(`${filename}.tmp`, filename);
};
const gitRead = (...args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const scopedFiles = ["scripts/prove-deployment-notebook.mjs", "scripts/lib/deployment-updater.mjs", "scripts/lib/deployment-process.mjs", "electron/local-service.cjs", "src/server/notebook.ts", "src/server/deployment-work.ts", "tests/deployment/activity.test.mjs", "tests/deployment/updater.test.mjs", "tests/notebook-catalog.test.ts", "tests/notebook-models.test.ts"];
const names = ["Exact main eligibility and retry", "Idle gating and interrupted preparation", "Shared normal profile and native parity", "External storage and migration", "Backup and restore safety", "Code-only rollback", "Browser and desktop preview isolation", "Optional subscription access and model choice", "Hard expiry, stop and queue advancement", "Existing behavior and route ownership"];
const result = {
	schemaVersion: 1, status: "BLOCKED", diagnosticStatus: "running", evidenceClass: "BUILDER scoped diagnostic; not final-source/full deployment proof",
	checker: "test sub-agent; builder-authored scoped harness, not final deployment acceptance", startedAt: new Date().toISOString(), finishedAt: null,
	command, cwd: root,
	source: { ...buildIdentity(root), baseRevision: gitRead("merge-base", "HEAD", "origin/main"), dirty: !!gitRead("status", "--porcelain"), files: Object.fromEntries(scopedFiles.map(filename => [filename, checksum(path.join(root, filename))])) },
	answerKey: { path: spec, sha256: checksum(spec), rung: 4, description: "Owner-approved private specification, row 2; unchanged Notebook catalog/model and activity tests are supporting keys" },
	environment: { node: process.version, platform: process.platform, architecture: process.arch, release: os.release(), availableMemory: os.freemem(), load: os.loadavg(), serial: "No build, package, mobile run, helper or other delegate" },
	checks: names.map((name, index) => ({ number: index + 1, name, status: "blocked", flow: name, surface: "full deployment acceptance", answerKey: `private approved specification row ${index + 1}`, commands: [], expected: "Complete independent real-process acceptance on final matching sources", observed: "Narrow Notebook diagnostic cannot satisfy a whole deployment row", startedAt: null, finishedAt: null, artifacts: [] })),
	scope: { new: true, copies: "Existing independent native OAuth/SSE recipe and updater subprocess integration pattern", changedProduct: false, flows: ["Real accepted Notebook executor blocks updater preparation", "Real preparation cancellation and process-tree cleanup", "Idle preparation resumes after real SSE completes"], surfaces: ["packaged Linux Electron-Node normal service", "same-origin admitted HTTP API", "updater control socket", "real git upstream with synthetic exact-SHA CI observer"], notClaimed: ["Client draft/handwriting/recording/upload gating", "tutor/job activity", "browser UI or native renderer", "cutover", "full app smoke"] },
	scopedChecks: [], requests: [], observations: [], preparations: [], commands: [], processes: [], ports: [], retries: [], cleanup: { status: "not-run" },
	limitations: ["All ten deployment rows remain BLOCKED", "Existing package may be stale: parent must rebuild and rerun on final sources", "Synthetic OAuth/SSE establishes no live-provider compatibility", "No full row-2 client/tutor/job matrix, cutover, helper, mobile or tailnet proof", "Network denial is a process-level diagnostic transport, not OS sandbox proof"],
};
const save = () => atomicJSON(path.join(directory, "deployment.json"), result);
save();
fs.writeFileSync(path.join(directory, "command.txt"), `${command.map(argument => `'${argument.replaceAll("'", "'\\''")}'`).join(" ")}\n`, { mode: 0o600 });
const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
async function waitFor(name, operation, timeout = 30000) {
	const deadline = Date.now() + timeout;
	let failure;
	while (Date.now() < deadline) {
		try { return await operation(); } catch (error) { failure = error; }
		await delay(100);
	}
	throw new Error(`${name}: ${failure?.message || "timed out"}`, { cause: failure });
}
async function step(name, expected, operation) {
	const entry = { name, expected, answerKey: "Private approved row 2 and unchanged Notebook/activity tests", status: "running", startedAt: new Date().toISOString(), artifacts: [] };
	result.scopedChecks.push(entry); save();
	try { entry.observed = await operation(entry); entry.status = "passed"; }
	catch (error) { entry.status = "failed"; entry.error = error.stack; throw error; }
	finally { entry.finishedAt = new Date().toISOString(); save(); }
}
const forbiddenPorts = new Set([3000, 3001, 3002, 3800, 3801, 3802, 3810, 3109]);
async function freePort() {
	for (;;) {
		const listener = net.createServer();
		await new Promise((resolve, reject) => { listener.once("error", reject); listener.listen(0, "127.0.0.1", resolve); });
		const port = listener.address().port;
		await new Promise(resolve => listener.close(resolve));
		if (!forbiddenPorts.has(port) && !result.ports.includes(port)) return port;
	}
}
function offlineTransport() {
	const fs = require("node:fs");
	const net = require("node:net");
	const tls = require("node:tls");
	const http = require("node:http");
	const dgram = require("node:dgram");
	const fixture = process.env.ZZ_NOTEBOOK_UPSTREAM;
	const origin = process.env.ZZ_NOTEBOOK_ORIGIN;
	const runtime = process.env.ZZ_NOTEBOOK_RUNTIME;
	const log = entry => fs.appendFileSync(process.env.ZZ_NOTEBOOK_TRANSPORT, `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`);
	const targets = new Set(["https://auth.openai.com/api/accounts/oauth/token", "https://auth.openai.com/.well-known/jwks.json", "https://api.openai.com/v1/models", "https://api.openai.com/v1/responses"]);
	const originalFetch = globalThis.fetch;
	globalThis.fetch = async (input, init) => {
		const request = new Request(input, init);
		const target = new URL(request.url);
		const endpoint = target.origin + target.pathname;
		if (target.origin === origin && ["/__local/session", "/api/runtime"].includes(target.pathname)) return originalFetch(request);
		if (!targets.has(endpoint)) { log({ status: "denied", target: endpoint }); throw new Error("Offline Notebook proof: unknown destination refused"); }
		log({ status: "redirected", target: endpoint, method: request.method });
		const headers = new Headers(request.headers);
		headers.set("zz-original-target", endpoint);
		return originalFetch(fixture + target.pathname, { method: request.method, headers, signal: request.signal, redirect: "manual", ...(["GET", "HEAD"].includes(request.method) ? {} : { body: Buffer.from(await request.arrayBuffer()) }) });
	};
	function assertSocket(argumentsList) {
		let options = argumentsList[0];
		if (Array.isArray(options)) options = options[0];
		if (options && typeof options === "object" && options.path) {
			if ([`${runtime}/control.sock`, `${runtime}/updater.sock`].includes(options.path)) return;
		} else {
			const port = Number(typeof options === "object" ? options.port : options);
			const host = typeof options === "object" ? options.host || "localhost" : typeof argumentsList[1] === "string" ? argumentsList[1] : "localhost";
			if (["127.0.0.1", "::1", "localhost"].includes(host) && [Number(new URL(fixture).port), Number(new URL(origin).port)].includes(port)) return;
		}
		log({ status: "socket-denied" });
		throw new Error("Offline Notebook proof: unowned socket refused");
	}
	const connect = net.Socket.prototype.connect;
	net.Socket.prototype.connect = function(...args) { assertSocket(args); return connect.apply(this, args); };
	const tlsConnect = tls.connect;
	tls.connect = function(...args) { assertSocket(args); return tlsConnect.apply(this, args); };
	dgram.createSocket = () => { log({ status: "datagram-denied" }); throw new Error("Offline Notebook proof: datagram refused"); };
	const emit = http.Server.prototype.emit;
	http.Server.prototype.emit = function(event, ...args) {
		if (event === "request") {
			const [request, response] = args;
			response.once("finish", () => log({ status: "http", path: new URL(request.url, origin).pathname, method: request.method, code: response.statusCode }));
		}
		return emit.call(this, event, ...args);
	};
	log({ status: "installed", electron: process.versions.electron, node: process.version, pid: process.pid, home: process.env.HOME });
	void globalThis.fetch("https://zz-prove-it-denied.invalid/denial-self-check").then(() => { throw new Error("Egress denial self-check failed"); }, error => log({ status: "denial-self-check", message: error.message }));
	const probe = new net.Socket();
	try { probe.connect(9, "192.0.2.1"); throw new Error("Socket denial self-check failed"); }
	catch (error) { if (!error.message.includes("unowned socket refused")) throw error; log({ status: "socket-denial-self-check" }); }
	finally { probe.destroy(); }
}

let fixture;
let updater;
let service;
let home;
let runtime;
let temporary;
let cookie;
let activePreparation;
let held;
let fixtureError;
let sentinel;
let sentinelHash;
let configuration;
const signalController = new AbortController();
const interrupted = signal => { signalController.abort(new Error(`Proof interrupted by ${signal}`)); held?.response.destroy(); };
process.once("SIGTERM", interrupted);
process.once("SIGINT", interrupted);
async function api(route, method = "GET", body, subscriptions = false) {
	signalController.signal.throwIfAborted();
	const response = await fetch(service.origin + route, { method, headers: { Cookie: cookie, Origin: service.origin, "Content-Type": "application/json", ...(subscriptions ? { "x-learnharness-subscriptions": "1" } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), redirect: "manual", signal: AbortSignal.any([signalController.signal, AbortSignal.timeout(15000)]) });
	const text = await response.text();
	let value;
	try { value = JSON.parse(text); } catch { value = text; }
	const observation = { at: new Date().toISOString(), route, method, status: response.status };
	result.observations.push(observation); save();
	return { status: response.status, body: value, response };
}
async function activity() { return controlRequest(service, { op: "activity" }); }
async function preserveCurrent(label) {
	const current = readConfiguration(path.join(runtime, "service.json"));
	for (const field of ["pid", "start", "boot", "profileRoot", "profileId", "deploymentId", "revision", "sourceHash", "buildId", "executable"]) assert.equal(current[field], service[field], `${label}: ${field} changed`);
	assert.ok(sameProcess(service), `${label}: original service stopped`);
	assert.equal(checksum(sentinel), sentinelHash, `${label}: sentinel changed`);
	assert.equal((await controlRequest(service, { op: "status" })).maintenance, false);
	assert.equal(fs.existsSync(path.join(runtime, "admission-handoff.json")), false);
	assert.equal(fs.existsSync(`${configuration.profileRoot}.backups`), false);
	assert.deepEqual(fs.readdirSync(configuration.releases), []);
	return { pid: current.pid, profileId: current.profileId, deploymentId: current.deploymentId, sentinelHash, noHandoff: true, releases: [] };
}
async function preparationStarted(attempt) {
	await waitFor(`preparation subprocess ${attempt}`, async () => {
		result.updaterObservation = structuredClone(updater.state); save();
		assert.equal(updater.state.state, "preparing", JSON.stringify(updater.state));
		assert.equal(result.preparations.length, attempt);
		const entry = result.preparations[attempt - 1];
		assert.ok(fs.existsSync(entry.ready));
		const identities = JSON.parse(fs.readFileSync(entry.ready, "utf8"));
		assert.ok(identities.parent && identities.descendant);
		assert.ok(sameProcess(identities.parent)); assert.ok(sameProcess(identities.descendant));
		entry.identities = identities; save();
	});
}
function releaseHeld(latex) {
	assert.ok(held && !held.response.destroyed && !held.response.writableEnded, "Real upstream SSE must still be held");
	const { response, emit, responseId, record } = held;
	const item = { type: "message", id: `msg_${randomUUID()}`, role: "assistant", status: "completed", content: [{ type: "output_text", text: JSON.stringify({ action: "edit", operations: [{ op: "insert", after: null, id: "L1", latex }] }), annotations: [] }] };
	emit({ type: "response.output_item.added", output_index: 0, item: { ...item, content: [] } });
	emit({ type: "response.output_item.done", output_index: 0, item });
	emit({ type: "response.completed", response: { id: responseId, status: "completed", output: [item], usage: { input_tokens: 20, output_tokens: 10, total_tokens: 30, input_tokens_details: { cached_tokens: 0 } } } });
	record.releasedAt = new Date().toISOString(); response.end(); save();
}

try {
	await step("packaged prerequisites and resource preflight", "Genuine packaged Electron-Node binary, adequate resources; stale identity explicitly diagnostic", async () => {
		assert.equal(process.platform, "linux");
		assert.ok(fs.statfsSync(directory).bavail > 0);
		assert.ok(os.freemem() > 256 * 1024 * 1024, "Insufficient free RAM for serial normal-service proof");
		result.package = packagedBuild(process.env.LH_TEST_PACKAGED_BINARY || path.join(root, "dist/linux-unpacked/learnharness"));
		for (const filename of fs.readdirSync(result.package.directory)) assert.ok(!/^\.env(?:\.|$)/.test(filename), "Packaged dotenv file could load ambient credentials");
		result.package.matchesCurrentSource = result.package.revision === result.source.revision && result.package.sourceHash === result.source.sourceHash;
		result.package.binarySha256 = checksum(result.package.executable);
		home = fs.mkdtempSync(path.join(os.tmpdir(), "zz-notebook-home-"));
		runtime = fs.mkdtempSync("/tmp/zz-nbr-");
		temporary = path.join(home, "tmp");
		for (const target of [temporary, "config", "cache", "data", "state", "run"].map(target => path.isAbsolute(target) ? target : path.join(home, target))) fs.mkdirSync(target, { mode: 0o700 });
		result.roots = { home, runtime, temporary, profile: path.join(home, "profile") };
		return { package: result.package, availableMemory: os.freemem(), noHeavyBuild: true };
	});
	const port = await freePort(); result.ports.push(port);
	const upstreamPort = await freePort(); result.ports.push(upstreamPort);
	const origin = `http://127.0.0.1:${port}`;
	const upstreamOrigin = `http://127.0.0.1:${upstreamPort}`;
	const transport = path.join(directory, "transport.cjs");
	fs.writeFileSync(transport, `(${offlineTransport.toString()})();\n`, { mode: 0o600 });
	const environment = { PATH: process.env.PATH, LANG: "C.UTF-8", HOME: home, XDG_CONFIG_HOME: path.join(home, "config"), XDG_CACHE_HOME: path.join(home, "cache"), XDG_DATA_HOME: path.join(home, "data"), XDG_STATE_HOME: path.join(home, "state"), XDG_RUNTIME_DIR: path.join(home, "run"), TMPDIR: temporary, LH_IGNORE_ENV_KEYS: "1", NEXT_TELEMETRY_DISABLED: "1", NODE_OPTIONS: `--require=${transport}`, ZZ_NOTEBOOK_UPSTREAM: upstreamOrigin, ZZ_NOTEBOOK_ORIGIN: origin, ZZ_NOTEBOOK_RUNTIME: runtime, ZZ_NOTEBOOK_TRANSPORT: path.join(directory, "transport.ndjson") };
	result.environment.allowedKeys = Object.keys(environment);
	result.environment.sanitizedServiceEnvironment = environment;
	const syntheticGitEnvironment = { PATH: process.env.PATH, HOME: home, LANG: "C.UTF-8", GIT_CONFIG_GLOBAL: os.devNull, GIT_CONFIG_SYSTEM: os.devNull, GIT_TERMINAL_PROMPT: "0" };
	const git = (cwd, ...args) => {
		result.commands.push({ command: ["git", "-C", cwd, ...args], at: new Date().toISOString() }); save();
		return execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8", env: syntheticGitEnvironment, stdio: ["ignore", "pipe", "pipe"], timeout: 30000 }).trim();
	};
	const upstream = path.join(home, "upstream");
	const checkout = path.join(home, "checkout");
	const repository = "synthetic/notebook-idle-proof";
	await step("disposable git origin and exact-SHA CI observer", "Real fetch and ancestry checks, entirely local synthetic origin; no repository commit or push", async () => {
		fs.mkdirSync(upstream); fs.mkdirSync(checkout);
		git(upstream, "init", "--initial-branch=main");
		git(upstream, "fetch", "--no-tags", root, result.package.revision);
		git(upstream, "update-ref", "refs/heads/main", result.package.revision);
		git(upstream, "read-tree", result.package.revision);
		git(upstream, "config", "user.name", "Synthetic Notebook proof");
		git(upstream, "config", "user.email", "zz-prove-it@example.invalid");
		git(upstream, "-c", "core.hooksPath=/dev/null", "commit", "--allow-empty", "-m", "zz-prove-it eligible candidate");
		const candidate = git(upstream, "rev-parse", "HEAD");
		git(checkout, "init", "--initial-branch=main");
		const ssh = path.join(home, "synthetic-ssh");
		fs.writeFileSync(ssh, `#!/bin/sh\nexec git-upload-pack '${upstream}'\n`, { mode: 0o700 });
		git(checkout, "remote", "add", "origin", `git@github.com:${repository}.git`);
		git(checkout, "config", "core.sshCommand", ssh);
		git(checkout, "config", "ssh.variant", "simple");
		result.candidate = candidate;
		return { upstream, checkout, candidate, repository, githubNetwork: false };
	});
	const { privateKey, publicKey } = await generateKeyPair("RS256");
	const publicJWK = { ...await exportJWK(publicKey), kid: "zz-notebook-rsa", alg: "RS256", use: "sig" };
	let authorization;
	fixture = http.createServer((request, response) => {
		void (async () => {
			let text = "";
			for await (const chunk of request) { text += chunk; assert.ok(text.length < 2 * 1024 * 1024, "Unexpected upstream body size"); }
			const pathname = new URL(request.url, upstreamOrigin).pathname;
			const record = { at: new Date().toISOString(), path: pathname, method: request.method, originalTarget: request.headers["zz-original-target"] };
			result.requests.push(record); save();
			const json = value => { response.writeHead(200, { "Content-Type": "application/json" }); response.end(JSON.stringify(value)); };
			assert.equal(new URL(record.originalTarget).pathname, pathname);
			if (pathname === "/.well-known/jwks.json") return json({ keys: [publicJWK] });
			if (pathname === "/api/accounts/oauth/token") {
				const fields = new URLSearchParams(text);
				assert.ok(authorization, "No synthetic authorization pending");
				assert.equal(fields.get("code"), authorization.code);
				assert.equal(fields.get("client_id"), authorization.clientId);
				assert.equal(fields.get("grant_type"), "authorization_code");
				assert.equal(createHash("sha256").update(fields.get("code_verifier")).digest("base64url"), authorization.challenge);
				const token = await new SignJWT({ nonce: authorization.nonce, email: "zz-notebook@example.invalid" }).setProtectedHeader({ alg: "RS256", kid: publicJWK.kid }).setIssuer("https://auth.openai.com").setAudience(authorization.clientId).setSubject("zz-notebook-synthetic-subject").setIssuedAt().setExpirationTime("1h").sign(privateKey);
				return json({ id_token: token, access_token: "zz-notebook-access-not-real", refresh_token: "zz-notebook-refresh-not-real", token_type: "Bearer", expires_in: 3600, scope: "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct" });
			}
			assert.equal(request.headers.authorization, "Bearer zz-notebook-access-not-real");
			if (pathname === "/v1/models") return json({ models: ["gpt-6.1-terra", "gpt-6.1-sol"].map(slug => ({ slug, display_name: slug, visibility: "list" })) });
			assert.equal(pathname, "/v1/responses", "Unknown synthetic provider endpoint");
			assert.equal(request.method, "POST");
			const payload = JSON.parse(text);
			assert.ok(["gpt-6.1-terra", "gpt-6.1-sol"].includes(payload.model), "Must use the curated subscription Notebook executor, not BYOK");
			assert.equal(payload.reasoning?.effort, "medium");
			assert.ok(JSON.stringify(payload.input).includes("CURRENT NOTEBOOK AND CONTEXT"));
			assert.ok(JSON.stringify(payload.input).includes("ZZ_DEPLOYMENT_NOTEBOOK"));
			assert.ok(!held || held.response.writableEnded || held.response.destroyed, "Unexpected overlapping upstream execution");
			record.model = payload.model; record.reasoning = payload.reasoning; record.held = true;
			const artifact = `upstream-${payload.model}.json`;
			atomicJSON(path.join(directory, artifact), payload); record.artifact = artifact;
			response.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store", Connection: "keep-alive" });
			response.flushHeaders();
			const emit = event => response.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
			const responseId = `resp_${randomUUID()}`;
			emit({ type: "response.created", response: { id: responseId, status: "in_progress", output: [] } });
			held = { response, emit, responseId, record };
			response.once("close", () => { record.closedAt = new Date().toISOString(); record.finished = response.writableEnded; save(); });
			save();
		})().catch(error => {
			fixtureError = error; result.fixtureError = error.stack; save();
			if (!response.headersSent) response.writeHead(500);
			response.end("Synthetic upstream failed; inspect receipt");
		});
	});
	await new Promise((resolve, reject) => { fixture.once("error", reject); fixture.listen(upstreamPort, "127.0.0.1", resolve); });
	configuration = { profileRoot: path.join(home, "profile"), runtime, releases: path.join(home, "releases"), sourceRoot: checkout, repository, port, browserOrigins: [], initialElectron: result.package.executable };
	const observe = input => observeMain({ ...input, github: async endpoint => {
		const candidate = new URLSearchParams(endpoint.split("?")[1]).get("head_sha");
		assert.equal(candidate, result.candidate);
		result.observations.push({ at: new Date().toISOString(), ciEndpoint: endpoint, sha: candidate, conclusion: "success", synthetic: true }); save();
		return [{ workflow_runs: [{ id: 1, run_attempt: 1, head_sha: candidate, head_branch: "main", event: "push", repository: { full_name: repository }, path: ".github/workflows/ci.yml", created_at: result.startedAt, status: "completed", conclusion: "success" }] }];
	} });
	const prepare = async (sha, signal) => {
		const attempt = result.preparations.length + 1;
		const ready = path.join(directory, `preparation-${attempt}.json`);
		const entry = { attempt, sha, ready, status: "running", startedAt: new Date().toISOString() };
		result.preparations.push(entry); save();
		const childScript = `const fs=require('node:fs');process.on('SIGTERM',()=>{});fs.writeFileSync(${JSON.stringify(`${ready}.child`)},String(process.pid));setInterval(()=>{},1000);`;
		const preparationScript = `const fs=require('node:fs');const {spawn}=require('node:child_process');const {processIdentity}=require(${JSON.stringify(path.join(root, "electron/deployment-profile.cjs"))});const child=spawn(process.execPath,['-e',${JSON.stringify(childScript)}],{stdio:'ignore'});const timer=setInterval(()=>{if(fs.existsSync(${JSON.stringify(`${ready}.child`)})){fs.writeFileSync(${JSON.stringify(ready)},JSON.stringify({parent:processIdentity(),descendant:processIdentity(child.pid)}));clearInterval(timer);}},20);setInterval(()=>{},1000);`;
		entry.command = [process.execPath, "-e", preparationScript]; save();
		try {
			await runPreparation(entry.command, { env: { ...syntheticGitEnvironment, TMPDIR: temporary }, log: path.join(directory, `preparation-${attempt}.log`), signal });
			throw new Error("Held preparation unexpectedly finished; no package/build is authorized");
		} catch (error) {
			entry.status = signal.aborted ? "cancelled" : "failed"; entry.reason = error.message;
			if (entry.identities) entry.aliveAfter = Object.fromEntries(Object.entries(entry.identities).map(([name, identity]) => [name, sameProcess(identity)]));
			throw error;
		} finally { entry.finishedAt = new Date().toISOString(); save(); }
	};
	updater = new DeploymentUpdater(configuration, { observe, prepare, environment });
	await step("start genuine packaged normal service and authenticate synthetic session", "Actual packaged Electron-Node owns an external synthetic profile; real runtime health and idle activity", async () => {
		await updater.initialize();
		service = readConfiguration(path.join(runtime, "service.json"));
		result.processes.push({ kind: "packaged-normal-service", ...processIdentity(service.pid) }); save();
		const { ticket } = await controlRequest(service, { op: "admit", origin: service.origin });
		const admission = await fetch(`${origin}/__local/session`, { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify({ ticket }), signal: AbortSignal.timeout(15000), redirect: "error" });
		assert.equal(admission.status, 204);
		cookie = admission.headers.get("set-cookie")?.split(";")[0]; assert.ok(cookie);
		const status = await api("/api/runtime"); assert.equal(status.status, 200);
		for (const field of ["pid", "profileId", "deploymentId", "revision", "sourceHash", "buildId"]) assert.equal(status.body[field], service[field]);
		assert.equal(service.previewHelperDirectory, null);
		assert.equal((await activity()).state, "idle");
		const installed = fs.readFileSync(path.join(directory, "transport.ndjson"), "utf8").trim().split("\n").map(line => JSON.parse(line));
		assert.ok(installed.some(entry => entry.status === "installed" && entry.electron && entry.pid === service.pid));
		assert.ok(installed.some(entry => entry.status === "denial-self-check"));
		assert.ok(installed.some(entry => entry.status === "socket-denial-self-check"));
		const refused = await fetch(`${origin}/api/chats`, { redirect: "error", signal: AbortSignal.timeout(5000) }); assert.equal(refused.status, 403);
		result.service = service;
		return { runtime: status.body, activity: await activity(), unauthenticatedStatus: refused.status, genuineElectron: installed.find(entry => entry.status === "installed") };
	});
	await step("real synthetic ChatGPT OAuth and curated catalog", "Real PKCE, RS256/JWKS identity verification, subscription consent, Terra/Sol catalog; no seeded credentials or BYOK", async () => {
		const login = await api("/api/subscriptions", "POST", { providerId: "chatgpt", op: "login" }, true);
		assert.equal(login.status, 200); assert.ok(login.body.browserAction);
		const action = await api(login.body.browserAction, "POST", undefined, true);
		assert.equal(action.status, 303);
		const target = new URL(action.response.headers.get("location"));
		assert.equal(target.origin + target.pathname, "https://auth.openai.com/api/accounts/authorize");
		assert.equal(target.searchParams.get("code_challenge_method"), "S256");
		authorization = { code: `zz-code-${randomUUID()}`, clientId: "zz-notebook-synthetic-client", nonce: target.searchParams.get("nonce"), challenge: target.searchParams.get("code_challenge") };
		const callback = new URL(target.searchParams.get("redirect_uri"));
		assert.equal(callback.hostname, "127.0.0.1"); assert.equal(callback.pathname, "/auth/callback");
		assert.ok(!forbiddenPorts.has(Number(callback.port))); result.ports.push(Number(callback.port));
		callback.search = new URLSearchParams({ code: authorization.code, state: target.searchParams.get("state"), client_id: authorization.clientId });
		assert.equal((await fetch(callback, { signal: AbortSignal.timeout(15000), redirect: "error" })).status, 200);
		const connected = await waitFor("synthetic ChatGPT connection", async () => {
			assert.ok(!fixtureError, fixtureError?.stack);
			const status = await api("/api/subscriptions", "GET", undefined, true);
			assert.equal(status.status, 200); assert.equal(status.body.chatgpt.accounts.length, 1); assert.equal(status.body.chatgpt.pending, false);
			return status.body.chatgpt;
		});
		assert.equal((await api("/api/subscriptions", "POST", { providerId: "chatgpt", op: "consent", enabled: true }, true)).status, 200);
		const catalog = await api("/api/models"); assert.equal(catalog.status, 200);
		assert.ok(JSON.stringify(catalog.body).includes("gpt-6.1-terra")); assert.ok(JSON.stringify(catalog.body).includes("gpt-6.1-sol"));
		sentinel = path.join(configuration.profileRoot, "zz-prove-it-preserve.txt");
		fs.writeFileSync(sentinel, "ZZ synthetic learning sentinel: updater must not replace or restore this profile\n", { mode: 0o600 }); sentinelHash = checksum(sentinel);
		assert.equal((await activity()).state, "idle");
		return { connected, models: ["gpt-6.1-terra", "gpt-6.1-sol"], realCredentialFile: fs.existsSync(path.join(configuration.profileRoot, "chatgpt-credentials.json")), activity: await activity() };
	});
	for (const [index, candidate] of ["terra-medium", "sol-medium"].entries()) {
		const model = candidate.startsWith("terra") ? "gpt-6.1-terra" : "gpt-6.1-sol";
		const latex = `z=${index + 41}`;
		await step(`${candidate}: accepted Notebook cancels real held preparation`, "Preparation starts idle; actual accepted curated executor holds SSE; activity cancels process tree without service/profile cutover", async entry => {
			const created = await api("/api/chats", "POST", { title: `zz-prove-it-deployment-notebook-${candidate}` }); assert.equal(created.status, 200);
			const route = `/api/chats/${created.body.id}/notebook`;
			assert.equal((await api(route, "POST", { type: "visibility", visible: true })).status, 200);
			let view = (await api(route)).body;
			const refusal = await api(route, "POST", { type: "candidate", candidate: "deepseek-low", expectedCandidate: view.candidate });
			assert.equal(refusal.status, 400); assert.match(refusal.body.error, /Terra or Sol/);
			if (view.candidate !== candidate) assert.equal((await api(route, "POST", { type: "candidate", candidate, expectedCandidate: view.candidate })).status, 200);
			view = (await api(route)).body;
			const instruction = `ZZ_DEPLOYMENT_NOTEBOOK ${candidate}: insert exactly ${latex}`;
			assert.equal((await api(route, "POST", { type: "draft", expectedRevision: view.draft.revision, text: instruction })).status, 200);
			view = (await api(route)).body;
			assert.equal((await activity()).state, "idle", "This API-only scenario must be idle before executor acceptance; it does not certify browser drafts");
			const attempt = result.preparations.length + 1;
			activePreparation = updater.tick();
			await preparationStarted(attempt);
			const before = await preserveCurrent(`${candidate} preparing`);
			entry.before = { service: before, view, activity: await activity(), attempt }; save();
			const operationId = `zz-${randomUUID()}`;
			const accepted = await api(route, "POST", { type: "apply", id: operationId, contextId: view.contextId, draftRevision: view.draft.revision, instruction, candidate });
			assert.equal(accepted.status, 202, JSON.stringify(accepted.body)); assert.equal(accepted.body.id, operationId);
			await waitFor(`${candidate} real executor reaches held SSE`, async () => {
				assert.ok(!fixtureError, fixtureError?.stack);
				assert.equal(held?.record.model, model); assert.equal(held.response.writableEnded, false); assert.equal(held.response.destroyed, false);
				const live = (await api(route)).body;
				assert.equal(live.pending?.id, operationId); assert.equal(live.pending.status, "running"); assert.equal(live.problem, null);
				const busy = await activity(); assert.equal(busy.state, "busy"); assert.ok(JSON.stringify(busy).includes("notebook-running"));
			});
			await activePreparation; activePreparation = null;
			assert.equal(updater.state.state, "waiting"); assert.equal(updater.state.reason, "activity-resumed");
			assert.equal(updater.state.failed.includes(result.candidate), false);
			const preparation = result.preparations[attempt - 1];
			assert.equal(preparation.status, "cancelled"); assert.equal(preparation.reason, "activity-resumed");
			assert.deepEqual(preparation.aliveAfter, { parent: false, descendant: false });
			const after = await preserveCurrent(`${candidate} cancellation`);
			entry.chatId = created.body.id; entry.route = route; entry.operationId = operationId; entry.latex = latex;
			entry.artifacts.push(`upstream-${model}.json`, `preparation-${attempt}.json`, `preparation-${attempt}.log`, "transport.ndjson");
			return { accepted: { status: accepted.status, id: accepted.body.id }, view: (await api(route)).body, activity: await activity(), updater: structuredClone(updater.state), preparation, service: after };
		});
		const execution = result.scopedChecks.at(-1);
		await step(`${candidate}: repeated busy ticks refuse preparation/cutover`, "Three real eligibility observations while SSE remains open, no second preparation, same current service/profile", async () => {
			const count = result.preparations.length;
			const observations = [];
			for (let tick = 0; tick < 3; tick++) {
				assert.equal(held.response.destroyed, false); assert.equal(held.response.writableEnded, false);
				await updater.tick();
				assert.equal(result.preparations.length, count); assert.equal(updater.state.reason, "application-busy-or-unknown");
				const busy = await activity(); assert.equal(busy.state, "busy"); assert.ok(JSON.stringify(busy).includes("notebook-running"));
				const view = (await api(execution.route)).body; assert.equal(view.pending?.id, execution.operationId);
				observations.push({ tick, at: new Date().toISOString(), updater: structuredClone(updater.state), activity: busy, service: await preserveCurrent(`${candidate} busy tick ${tick}`) });
				await delay(150);
			}
			return { observations, preparations: count, sseHeld: true };
		});
		await step(`${candidate}: release real SSE, persist edit and become idle`, "Real stream completion persists exactly the independent expected edit; no queued/running Notebook work, actual activity idle", async entry => {
			releaseHeld(latex);
			const view = await waitFor(`${candidate} saved completion and idle`, async () => {
				const value = await api(execution.route); assert.equal(value.status, 200);
				assert.equal(value.body.pending, null); assert.equal(value.body.problem, null);
				assert.deepEqual(value.body.lines, [{ id: "L1", latex }]); assert.equal((await activity()).state, "idle"); return value.body;
			});
			const chat = await api(`/api/chats/${execution.chatId}`); assert.equal(chat.status, 200);
			assert.equal(chat.body.notebook, undefined, "Conversation API must not expose executor checkpoints");
			const stored = JSON.parse(fs.readFileSync(path.join(configuration.profileRoot, "data/chats", `${execution.chatId}.json`), "utf8"));
			const operation = stored.notebook.operations.find(value => value.id === execution.operationId);
			assert.ok(operation); assert.equal(operation.candidate, candidate); assert.equal(operation.execution.model, `chatgpt:${model}`);
			assert.equal(operation.execution.attempts.length, 1); assert.equal(operation.execution.attempts[0].thinkingLevel, "medium"); assert.ok(!operation.execution.attempts[0].failure);
			entry.artifacts.push(`notebook-${candidate}-completed.json`); atomicJSON(path.join(directory, entry.artifacts[0]), { view, operation });
			return { view, operationStatus: operation.status, activity: await activity(), service: await preserveCurrent(`${candidate} complete`) };
		});
	}
	await step("idle permits a new real preparation; explicit updater stop retains current service", "After both executors finish, a new held subprocess starts; local stop cancels it and its resistant descendant, retaining the original profile/service", async () => {
		assert.equal((await activity()).state, "idle");
		const attempt = result.preparations.length + 1;
		activePreparation = updater.tick(); await preparationStarted(attempt);
		await preserveCurrent("final idle preparation");
		await updater.close(); await activePreparation; activePreparation = null;
		const preparation = result.preparations.at(-1);
		assert.equal(preparation.reason, "updater-stopping"); assert.deepEqual(preparation.aliveAfter, { parent: false, descendant: false });
		assert.equal(updater.state.state, "stopped");
		return { preparation, state: structuredClone(updater.state), service: await preserveCurrent("updater stopped"), activity: await activity() };
	});
	assert.ok(!fixtureError, fixtureError?.stack);
	assert.equal(result.requests.filter(request => request.path === "/v1/responses").length, 2);
	result.diagnosticStatus = "checks-passed";
} catch (error) {
	result.diagnosticStatus = "failed"; result.error = error.stack; process.exitCode = 1;
} finally {
	const failures = [];
	if (updater) result.updaterBeforeCleanup = structuredClone(updater.state);
	try { if (held && !held.response.writableEnded) held.response.destroy(); } catch (error) { failures.push(error.message); }
	try { await updater?.close(); await activePreparation; } catch (error) { failures.push(`updater cleanup: ${error.message}`); }
	if (!service && updater?.child?.pid) {
		const identity = processIdentity(updater.child.pid);
		if (identity) { service = identity; result.processes.push({ kind: "partially-started-owned-service", ...identity }); }
	}
	if (service) {
		try { if (sameProcess(service)) await stopService(service); assert.equal(sameProcess(service), false); }
		catch (error) { failures.push(`owned service cleanup: ${error.message}`); }
	}
	try { fixture?.closeAllConnections(); if (fixture?.listening) await new Promise(resolve => fixture.close(resolve)); } catch (error) { failures.push(`fixture cleanup: ${error.message}`); }
	for (const preparation of result.preparations) {
		try {
			const identities = preparation.identities || (fs.existsSync(preparation.ready) ? JSON.parse(fs.readFileSync(preparation.ready, "utf8")) : {});
			for (const identity of Object.values(identities)) assert.equal(sameProcess(identity), false, `Owned preparation PID ${identity.pid} still alive`);
		} catch (error) { failures.push(error.message); }
	}
	for (const port of result.ports) {
		const probe = net.createServer();
		try { await new Promise((resolve, reject) => { probe.once("error", reject); probe.listen(port, "127.0.0.1", resolve); }); await new Promise(resolve => probe.close(resolve)); }
		catch (error) { failures.push(`owned port ${port}: ${error.message}`); }
	}
	if (runtime) for (const filename of ["service.json", "control.sock", "updater.sock"]) if (fs.existsSync(path.join(runtime, filename))) failures.push(`Owned runtime entry remains: ${filename}`);
	if (runtime && fs.existsSync(path.join(runtime, "service.log"))) fs.copyFileSync(path.join(runtime, "service.log"), path.join(directory, "service.log"));
	result.cleanup = { status: failures.length ? "failed" : "passed", failures, retainedSyntheticRoots: result.roots, observed: "Only owned updater/preparation/service/fixture stopped; synthetic profiles and all failed evidence retained; no installed service, owner preview, personal credentials or tailnet configuration used" };
	if (failures.length) { result.diagnosticStatus = "failed"; process.exitCode = 1; }
	result.sourceAfter = { ...buildIdentity(root), files: Object.fromEntries(scopedFiles.map(filename => [filename, checksum(path.join(root, filename))])) };
	result.scopedSourceUnchanged = JSON.stringify(result.source.files) === JSON.stringify(result.sourceAfter.files);
	if (!result.scopedSourceUnchanged) result.limitations.push("Scoped source changed concurrently: rerun after parent work stabilizes");
	result.finishedAt = new Date().toISOString();
	result.checks[1].commands = [command]; result.checks[1].artifacts = ["deployment.json", "transport.ndjson", "receipt.md"];
	result.checks[1].observed = `${result.diagnosticStatus}; Terra/Sol held-Notebook cancellation diagnostic only, not the complete row-2 matrix or final-source acceptance`;
	result.checks[1].startedAt = result.startedAt; result.checks[1].finishedAt = result.finishedAt;
	save();
	fs.writeFileSync(path.join(directory, "receipt.md"), `# Notebook updater diagnostic\n\nVerdict: BLOCKED (all ten deployment rows).\nEvidence class: ${result.evidenceClass}.\nScoped result: ${result.diagnosticStatus}.\n\n## Couldn't prove\n${result.limitations.map(value => `- ${value}`).join("\n")}\n\n## Scope and answer keys\nReal accepted curated ChatGPT Terra/Sol Notebook executor over synthetic OAuth/SSE, packaged normal service, real updater preparation subprocesses and real disposable Git fetch with synthetic exact-SHA CI. Compared with the owner-approved private specification row 2 and unchanged Notebook/activity tests; no spec content copied. API-only work does not certify UI client-draft gating.\n\n## Steps\n${result.scopedChecks.map(entry => `- [${entry.status.toUpperCase()}] ${entry.name}${entry.error ? `: ${entry.error.split("\n")[0]}` : ""}`).join("\n")}\n\n## Command\nSee command.txt and deployment.json for exact executable, arguments, environment key allowlist and subprocess commands.\n\n## Retries and fixes\n${result.retries.length ? result.retries.map(entry => `- ${entry}`).join("\n") : "No retries in this run; earlier attempts, if any, remain separate directories."}\n\n## Cleanup\n${result.cleanup.status}: ${result.cleanup.observed}.\n${failures.map(value => `- ${value}`).join("\n")}\n\n## Left behind\nIgnored evidence directory and disposable synthetic HOME/profile/runtime roots recorded in deployment.json; no running process intentionally retained. Current source/package fingerprints and concurrent-source status are recorded, not equated with final-source proof.\n`, { mode: 0o600 });
	console.log(JSON.stringify({ status: result.status, diagnosticStatus: result.diagnosticStatus, error: result.error, cleanup: result.cleanup.status, receipt: path.join(directory, "receipt.md"), machineResult: path.join(directory, "deployment.json") }));
}
