import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createRequire } from "node:module";
import { once } from "node:events";
import { pathToFileURL } from "node:url";
import { servicePreviewHelperDirectory, startServicePreviewHelper } from "../../electron/local-service.cjs";
import { createActivity } from "../../electron/deployment-activity.cjs";
import { previewHelperCommand } from "../../scripts/lib/preview-subscription-helper.mjs";
import { bootIdentity, monotonicMilliseconds } from "../../scripts/lib/preview-sandbox.mjs";

const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, "../..");
const launch = () => { const started = monotonicMilliseconds(); return { boot: bootIdentity(), started, deadline: started + 600000 }; };
function request(socketPath, endpoint, command) {
	return new Promise((resolve, reject) => {
		const outgoing = http.request({ socketPath, path: endpoint, method: "POST", headers: { "x-preview-lease": "synthetic-lease", "content-type": "application/json" } }, response => {
			let body = "";
			response.on("data", chunk => { body += chunk; });
			response.on("error", reject);
			response.on("end", () => resolve({ status: response.statusCode, body, headers: response.headers }));
		});
		outgoing.on("error", reject);
		outgoing.end(JSON.stringify(command));
	});
}

test("service helper path is opt-in, short, private and confined outside profiles/code", () => {
	const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "zz-hp-"));
	try {
		const runtime = path.join(temporary, "r");
		const profileRoot = path.join(temporary, "p");
		const codeRoot = path.join(temporary, "code");
		const options = { runtime, profileRoot, codeRoot };
		assert.equal(servicePreviewHelperDirectory(options), null);
		assert.deepEqual(fs.readdirSync(temporary), [], "absent option does not create directories");
		const directory = path.join(runtime, "preview-subscriptions");
		assert.equal(servicePreviewHelperDirectory({ ...options, previewHelperDirectory: directory }), directory);
		for (const previewHelperDirectory of ["relative", "", null, false, temporary, profileRoot, `${profileRoot}-helper`, `${profileRoot}-shell`, codeRoot, path.join(runtime, "../arbitrary")]) {
			assert.throws(() => servicePreviewHelperDirectory({ ...options, previewHelperDirectory }));
		}
		for (const protectedRoot of [runtime, directory]) {
			assert.throws(() => servicePreviewHelperDirectory({ ...options, profileRoot: protectedRoot, previewHelperDirectory: directory }), /separate/);
			assert.throws(() => servicePreviewHelperDirectory({ ...options, codeRoot: protectedRoot, previewHelperDirectory: directory }), /separate/);
		}
		const longRuntime = path.join(temporary, "r".repeat(70));
		assert.throws(() => servicePreviewHelperDirectory({ ...options, runtime: longRuntime, previewHelperDirectory: path.join(longRuntime, "preview-subscriptions") }), /too long/);
		fs.mkdirSync(runtime);
		fs.mkdirSync(profileRoot);
		fs.symlinkSync(profileRoot, directory);
		assert.throws(() => servicePreviewHelperDirectory({ ...options, previewHelperDirectory: directory }), /Unsafe/);
	} finally { fs.rmSync(temporary, { recursive: true, force: true }); }
});

test("normal web owner bridge has no default initialization or credential writes", () => {
	const home = fs.mkdtempSync(path.join(os.tmpdir(), "zz-hb-"));
	try {
		for (const enabled of [false, true]) {
			const result = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", `
import assert from 'node:assert/strict';
import fs from 'node:fs';
const key = Symbol.for('learnharness.web-subscription-owner.v1');
if (${enabled}) globalThis[key] = {};
const web = await import('./src/server/web-subscriptions.ts');
assert.equal(typeof globalThis[key]?.getOwner, ${enabled} ? 'function' : 'undefined');
assert.equal(fs.existsSync(process.env.LH_PROFILE_DIR), false);
assert.equal(web.deploymentCredentialActivity(), false);
console.log('lazy bridge checked');
`], { cwd: root, encoding: "utf8", timeout: 30000, env: { PATH: process.env.PATH, HOME: home, NODE_ENV: "test", LH_IGNORE_ENV_KEYS: "1", LH_PROFILE_DIR: path.join(home, "profile") } });
			assert.equal(result.status, 0, result.stderr);
			assert.match(result.stdout, /lazy bridge checked/);
		}
	} finally { fs.rmSync(home, { recursive: true, force: true }); }
});

test("service composition uses the same real web managers, gates freeze and drains before manager teardown", { timeout: 30000 }, async context => {
	const home = fs.mkdtempSync(path.join(os.tmpdir(), "zz-hc-"));
	const profile = path.join(home, "profile");
	fs.mkdirSync(profile, { mode: 0o700 });
	const previous = Object.fromEntries(["LH_PROFILE_DIR", "LH_DATA_DIR", "LH_AUTH_FILE", "LH_DESKTOP_SERVER", "LH_PREVIEW_PROFILE", "LH_IGNORE_ENV_KEYS"].map(name => [name, process.env[name]]));
	process.env.LH_PROFILE_DIR = profile;
	process.env.LH_IGNORE_ENV_KEYS = "1";
	for (const name of ["LH_DATA_DIR", "LH_AUTH_FILE", "LH_DESKTOP_SERVER", "LH_PREVIEW_PROFILE"]) delete process.env[name];
	const { SCOPES } = require("../../electron/chatgpt.cjs");
	const credential = "zz-synthetic-composition-access";
	fs.writeFileSync(path.join(profile, "chatgpt-credentials.json"), JSON.stringify({ version: 1, hostId: "synthetic-host", allowBackgroundUse: true, activeId: "synthetic-account", registrations: [{ id: "synthetic-account", clientId: "oaiapp_synthetic", issuer: "https://auth.openai.com", subject: "synthetic-subject", email: "private-synthetic@example.invalid", tokens: { accessToken: credential, refreshToken: "zz-synthetic-refresh", idToken: "zz-synthetic-id", scopes: SCOPES, expiresAt: Date.now() + 3600000 } }] }), { mode: 0o600 });
	const originalFetch = globalThis.fetch;
	globalThis.fetch = async input => {
		assert.equal(String(input), "https://api.openai.com/v1/models", "no provider calls are allowed");
		return Response.json({ models: ["synthetic-model-one", "synthetic-model-two"].map(slug => ({ slug, display_name: slug, visibility: "list" })) });
	};
	const bridgeKey = Symbol.for("learnharness.web-subscription-owner.v1");
	globalThis[bridgeKey] = {};
	let helper, owner, closing;
	let releaseDrain;
	const drain = new Promise(resolve => { releaseDrain = resolve; });
	const observed = [];
	const upstream = http.createServer(async (incoming, response) => {
		let body = "";
		for await (const chunk of incoming) body += chunk;
		const payload = JSON.parse(body);
		observed.push({ model: payload.model, authenticated: incoming.headers.authorization === `Bearer ${credential}` });
		response.writeHead(200, { "content-type": "text/event-stream", authorization: credential, "set-cookie": `secret=${credential}` });
		response.end("data: synthetic\n\n");
	});
	try {
		const web = await import("../../src/server/web-subscriptions.ts");
		const activity = createActivity();
		let maintenance = false;
		await new Promise(resolve => upstream.listen(0, "127.0.0.1", resolve));
		const runtime = path.join(home, "r");
		fs.mkdirSync(runtime, { mode: 0o700 });
		const directory = servicePreviewHelperDirectory({ previewHelperDirectory: path.join(runtime, "preview-subscriptions"), runtime, profileRoot: profile, codeRoot: root });
		assert.equal(web.deploymentCredentialActivity(), false);
		helper = await startServicePreviewHelper({ directory, getOwner: globalThis[bridgeKey].getOwner, activity, unavailable: () => maintenance, fetch: async (endpoint, options) => {
			assert.equal(endpoint.origin, "https://api.openai.com");
			const response = await originalFetch(`http://127.0.0.1:${upstream.address().port}/synthetic`, options);
			if (JSON.parse(options.body).hold) {
				upstream.emit("held");
				await drain;
			}
			return response;
		} });
		owner = web.webSubscriptionOwner();
		assert.equal(globalThis[bridgeKey].getOwner(), owner);
		assert.equal(web.webSubscriptionOwner().native, owner.native);
		const issued = await helper.issue({ ticketId: "synthetic-ticket", lease: "synthetic-lease", launch: launch() });
		const models = () => request(issued.socketPath, "/read", { channel: "lh:chatgpt", op: "models" });
		assert.equal((await models()).status, 403);
		assert.equal(observed.length, 0);
		await previewHelperCommand(directory, { op: "grant", ticketId: "synthetic-ticket", lease: "synthetic-lease" });
		const catalog = JSON.parse((await models()).body);
		assert.equal(catalog.models.length, 2);
		assert.equal(catalog.status.accounts[0].email, "Preview subscription");
		assert.notEqual(catalog.accountId, "synthetic-account");
		assert.equal(JSON.stringify(catalog).includes(credential), false);
		const dispatch = (model, extra = {}, background = false) => request(issued.socketPath, "/dispatch", { channel: "lh:chatgpt", fields: { background, expectedAccountId: catalog.accountId, expectedAuthorityRevision: catalog.authorityRevision, selectedModelId: model }, request: { payload: { model, stream: true, ...extra }, headers: { authorization: "untrusted" } } });
		for (const model of catalog.models) {
			const response = await dispatch(model.id);
			assert.equal(response.status, 200, response.body);
			assert.equal(response.headers.authorization, undefined);
			assert.equal(response.headers["set-cookie"], undefined);
			assert.equal(response.body.includes(credential), false);
		}
		assert.deepEqual(observed, catalog.models.map(model => ({ model: model.id, authenticated: true })));
		await owner.chatgpt.consent(false);
		assert.equal(JSON.parse((await models()).body).status.allowBackgroundUse, false, "normal owner consent reaches helper without another manager");
		const updated = JSON.parse((await models()).body);
		const denied = await request(issued.socketPath, "/dispatch", { channel: "lh:chatgpt", fields: { background: true, expectedAccountId: updated.accountId, expectedAuthorityRevision: updated.authorityRevision, selectedModelId: updated.models[0].id }, request: { payload: { model: updated.models[0].id } } });
		assert.equal(denied.status, 403);
		assert.equal(observed.length, 2);
		const token = activity.beginFreeze();
		activity.assertFrozen(token);
		assert.equal((await models()).status, 403);
		activity.assertFrozen(token);
		activity.thaw();
		maintenance = true;
		assert.equal((await models()).status, 403);
		maintenance = false;
		assert.equal((await models()).status, 200);
		const heldEvent = once(upstream, "held");
		const held = request(issued.socketPath, "/dispatch", { channel: "lh:chatgpt", fields: { background: false, expectedAccountId: updated.accountId, expectedAuthorityRevision: updated.authorityRevision, selectedModelId: updated.models[0].id }, request: { payload: { model: updated.models[0].id, hold: true } } });
		held.catch(() => {});
		await heldEvent;
		assert.equal(activity.snapshot().state, "busy");
		assert.throws(() => activity.beginFreeze(), /not idle/);
		let stopped = false;
		closing = helper.close().then(() => { stopped = true; });
		await assert.rejects(held);
		assert.equal(stopped, false, "socket closure must not masquerade as completed backend work");
		assert.equal(activity.snapshot().state, "busy");
		releaseDrain();
		await closing;
		await helper.close();
		assert.equal(activity.snapshot().state, "idle");
		await assert.rejects(models());
		await assert.rejects(helper.command({ op: "grant", ticketId: "synthetic-ticket", lease: "synthetic-lease" }));
		assert.equal(fs.existsSync(path.join(directory, "control.sock")), false);
		await web.quiesceDeploymentCredentials();
		assert.equal(web.deploymentCredentialActivity(), false);
		context.diagnostic("Actual normal web owner + real helper Unix sockets + loopback synthetic upstream: default refusal, local grant, two models, shared consent, freeze/maintenance refusal, pending-backend drain, quiescence and socket cleanup. Not packaged app acceptance.");
	} finally {
		const ownedUpstreamPort = upstream.address()?.port ?? null;
		releaseDrain();
		await closing;
		await helper?.close();
		owner?.close();
		upstream.closeAllConnections();
		await new Promise(resolve => upstream.close(resolve));
		globalThis.fetch = originalFetch;
		delete globalThis[bridgeKey];
		for (const [name, value] of Object.entries(previous)) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
		fs.rmSync(home, { recursive: true, force: true });
		assert.equal(fs.existsSync(home), false);
		context.diagnostic(JSON.stringify({ syntheticCleanup: true, pid: process.pid, profile, ownedUpstreamPort, helperClosed: true, upstreamListening: upstream.listening, profileRemoved: !fs.existsSync(home) }));
	}
});

test("helper startup refuses occupied and non-private directories without replacing a live control socket", async () => {
	const home = fs.mkdtempSync(path.join(os.tmpdir(), "zz-hf-"));
	const directory = path.join(home, "helper");
	fs.mkdirSync(directory, { mode: 0o700 });
	const occupied = net.createServer();
	const controlPath = path.join(directory, "control.sock");
	await new Promise(resolve => occupied.listen(controlPath, resolve));
	const before = fs.statSync(controlPath).ino;
	const { startPreviewSubscriptionHelper } = await import("../../scripts/lib/preview-subscription-helper.mjs");
	try {
		await assert.rejects(startPreviewSubscriptionHelper({ directory, backend: {} }), { code: "EADDRINUSE" });
		assert.equal(fs.statSync(controlPath).ino, before);
		fs.chmodSync(directory, 0o755);
		await assert.rejects(startPreviewSubscriptionHelper({ directory, backend: {} }), /private/);
	} finally {
		await new Promise(resolve => occupied.close(resolve));
		fs.rmSync(home, { recursive: true, force: true });
	}
});

test("curated extraResources contain the helper's ESM import closure without the scripts tree", async () => {
	const { load } = require("js-yaml");
	const configuration = load(fs.readFileSync(path.join(root, "electron-builder.yml"), "utf8"));
	const scripts = configuration.extraResources.find(resource => resource.from === "scripts/lib");
	assert.deepEqual(scripts.filter, ["preview-subscription-helper.mjs", "preview-sandbox.mjs", "ticket-state.mjs"]);
	assert.equal(scripts.to, "scripts/lib");
	assert.ok(configuration.extraResources.find(resource => resource.from === "electron").filter.includes("preview-subscription-owner.cjs"));
	const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "zz-hr-"));
	let helper;
	try {
		const destination = path.join(temporary, scripts.to);
		fs.mkdirSync(destination, { recursive: true });
		for (const filename of scripts.filter) fs.copyFileSync(path.join(root, scripts.from, filename), path.join(destination, filename));
		const isolated = await import(pathToFileURL(path.join(destination, "preview-subscription-helper.mjs")).href);
		helper = await isolated.startPreviewSubscriptionHelper({ directory: path.join(temporary, "helper"), backend: {} });
		assert.ok(fs.statSync(helper.controlPath).isSocket());
		await helper.close();
		assert.equal(fs.existsSync(helper.controlPath), false);
	} finally {
		await helper?.close();
		fs.rmSync(temporary, { recursive: true, force: true });
	}
});

test("helper shutdown closes idle admin clients and waits for racing issue refusal", async () => {
	const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "zz-hs-"));
	const { startPreviewSubscriptionHelper } = await import("../../scripts/lib/preview-subscription-helper.mjs");
	const helper = await startPreviewSubscriptionHelper({ directory: path.join(temporary, "helper"), backend: { open: () => ({}) } });
	const idle = net.createConnection(helper.controlPath);
	try {
		await once(idle, "connect");
		const issue = helper.issue({ ticketId: "synthetic-ticket", lease: "synthetic-lease", launch: launch() });
		const stopped = helper.close();
		await assert.rejects(issue, /closed/);
		await stopped;
		await helper.close();
		assert.deepEqual(fs.readdirSync(path.join(temporary, "helper")), []);
	} finally {
		idle.destroy();
		await helper.close();
		fs.rmSync(temporary, { recursive: true, force: true });
	}
});
