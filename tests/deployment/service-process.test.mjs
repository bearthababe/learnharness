import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import http from "node:http";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { test } from "node:test";
import { buildIdentity } from "../../electron/deployment-build.cjs";
import { acquireProfile, acquireCredentialFiles, resolveProfile } from "../../electron/deployment-profile.cjs";
import { attachService, readConfiguration, controlRequest } from "../../electron/local-service-protocol.cjs";
import { backupProfile, treeIdentity } from "../../scripts/lib/deployment-profile.mjs";

test("packaged real service owns all profile writers, admits clients and refuses attachment conflicts", { timeout: 180000 }, async context => {
	const binary = path.resolve(process.env.LH_TEST_PACKAGED_BINARY || "dist/linux-unpacked/learnharness");
	const resources = path.join(path.dirname(binary), "resources");
	assert.ok(fs.existsSync(path.join(resources, "local-service.cjs")), "Build the private Linux package before test:deployment");
	const build = JSON.parse(fs.readFileSync(path.join(resources, "server/standalone/deployment-build.json"), "utf8"));
	assert.equal(build.sourceHash, buildIdentity(process.cwd()).sourceHash, "Refusing stale packaged sources");
	const home = fs.mkdtempSync(path.join(os.homedir(), ".cache", "zz-ls-"));
	const runtime = path.join(home, "run");
	const profile = resolveProfile({ home, env: {} });
	const environment = { PATH: process.env.PATH, HOME: home, XDG_CONFIG_HOME: path.join(home, "config"), XDG_CACHE_HOME: path.join(home, "cache"), LH_IGNORE_ENV_KEYS: "1", ELECTRON_RUN_AS_NODE: "1", NEXT_TELEMETRY_DISABLED: "1" };
	const probe = net.createServer();
	await new Promise(resolve => probe.listen(0, "127.0.0.1", resolve));
	const port = probe.address().port;
	await new Promise(resolve => probe.close(resolve));
	let output = "";
	const remoteOrigin = "https://zz-prove-it.invalid:8452";
	const start = extra => {
		const child = spawn(binary, [path.join(resources, "local-service.cjs"), JSON.stringify({ port, runtime, browserOrigins: [remoteOrigin], ...extra })], { env: environment, detached: true, stdio: ["ignore", "pipe", "pipe"] });
		child.stdout.on("data", contents => { output += contents; });
		child.stderr.on("data", contents => { output += contents; });
		context.after(async () => {
			if (child.exitCode === null && child.signalCode === null) { const exited = once(child, "exit"); child.kill("SIGTERM"); await exited; }
		});
		return child;
	};
	const child = start();
	const configurationFile = path.join(runtime, "service.json");
	try {
		const deadline = Date.now() + 90000;
		while (!fs.existsSync(configurationFile)) {
			assert.equal(child.exitCode, null, output);
			assert.ok(Date.now() < deadline, `Service startup deadline: ${output}`);
			await new Promise(resolve => setTimeout(resolve, 100));
		}
		const configuration = readConfiguration(configurationFile);
		assert.equal(configuration.pid, child.pid);
		assert.equal((await controlRequest(configuration, { op: "status" })).updater, "updater-not-running");
		assert.equal((await attachService(configurationFile, build, profile.root)).profileId, configuration.profileId);
		await assert.rejects(attachService(configurationFile, { ...build, revision: "f".repeat(40) }, profile.root), /build does not match/);
		await assert.rejects(attachService(configurationFile, build, path.join(home, "wrong-profile")), /profile does not match/);
		await assert.rejects(controlRequest({ ...configuration, deploymentId: "wrong" }, { op: "status" }), /refused/);
		await assert.rejects(controlRequest(configuration, { op: "backup" }), /refused/);
		assert.throws(() => acquireProfile(profile), /live writer/);
		assert.throws(() => acquireCredentialFiles(profile.root), /live writer/);
		assert.throws(() => backupProfile(profile), /live writer/);
		assert.equal((await fetch(configuration.origin)).status, 403);
		const { ticket } = await controlRequest(configuration, { op: "admit", origin: configuration.origin });
		const admitted = await fetch(`${configuration.origin}/__local/session`, { method: "POST", headers: { origin: configuration.origin, "Content-Type": "application/json" }, body: JSON.stringify({ ticket }) });
		assert.equal(admitted.status, 204);
		const cookie = admitted.headers.get("set-cookie").split(";")[0];
		const request = (route, options = {}) => fetch(configuration.origin + route, { ...options, headers: { cookie, origin: configuration.origin, "Content-Type": "application/json", ...options.headers } });
		const remote = (route, options = {}) => new Promise((resolve, reject) => {
			const outgoing = http.request(configuration.origin + route, { method: options.method, headers: { host: new URL(remoteOrigin).host, origin: remoteOrigin, "Content-Type": "application/json", ...options.headers } }, response => {
				const chunks = [];
				response.on("data", chunk => chunks.push(chunk));
				response.on("end", () => resolve(new Response(response.statusCode === 204 ? null : Buffer.concat(chunks), { status: response.statusCode, headers: response.headers })));
			});
			outgoing.on("error", reject);
			outgoing.end(options.body);
		});
		assert.equal((await request("/")).status, 200);
		const status = await (await request("/api/runtime")).json();
		assert.equal(status.mode, "local-service");
		assert.equal(status.pid, child.pid);
		assert.equal(status.revision, build.revision);
		assert.equal(status.sourceHash, build.sourceHash);
		assert.equal(status.profileId, configuration.profileId);
		assert.equal(status.updateState, "not-configured");
		assert.equal(status.activity, "idle");
		assert.equal((await request("/api/runtime", { headers: { accept: "text/html", "sec-fetch-dest": "document" } })).status, 200);
		assert.equal((await controlRequest(configuration, { op: "activity" })).state, "idle", "API browser-action documents do not own React input state");
		assert.equal(JSON.stringify(status).includes(profile.root), false);
		const created = await request("/api/chats", { method: "POST", body: JSON.stringify({ title: "zz-prove-it-shared-service" }) });
		assert.equal(created.status, 200);
		const chat = await created.json();
		assert.ok(treeIdentity(profile.root).some(entry => entry.path.includes(chat.id)));
		const subscriptions = await request("/api/subscriptions", { headers: { "x-learnharness-subscriptions": "1" } });
		assert.equal(subscriptions.status, 200);
		const connections = await subscriptions.json();
		assert.equal(connections.chatgpt.accounts.length, 0);
		assert.equal(connections.chatgpt.activeId, null);
		assert.equal(connections.native.every(connection => !connection.connected), true);
		for (const providerId of ["chatgpt", "github-copilot", "xai"]) {
			const changed = await request("/api/subscriptions", { method: "POST", headers: { "x-learnharness-subscriptions": "1" }, body: JSON.stringify({ providerId, op: "consent", enabled: false }) });
			assert.equal(changed.status, 200);
			assert.ok(fs.existsSync(path.join(profile.root, `${providerId}-credentials.json`)), "Native consent must be saved only by the service in the managed profile");
		}
		const remoteTicket = await controlRequest(configuration, { op: "admit", origin: remoteOrigin });
		const remoteSession = await remote("/__local/session", { method: "POST", body: JSON.stringify(remoteTicket) });
		assert.equal(remoteSession.status, 204);
		const remoteCookie = remoteSession.headers.get("set-cookie").split(";")[0];
		assert.equal((await remote("/api/subscriptions", { headers: { cookie, "x-learnharness-subscriptions": "1" } })).status, 403, "Loopback admission cannot transfer to the configured HTTPS origin");
		const remoteConnections = await remote("/api/subscriptions", { headers: { cookie: remoteCookie, "x-learnharness-subscriptions": "1" } });
		assert.equal(remoteConnections.status, 200, "HTTPS addressed subscription controls must retain their canonical origin behind ingress");
		assert.equal((await remoteConnections.json()).native.every(connection => connection.allowBackgroundUse === false), true);
		const remoteConsent = await remote("/api/subscriptions", { method: "POST", headers: { cookie: remoteCookie, "x-learnharness-subscriptions": "1" }, body: JSON.stringify({ providerId: "xai", op: "consent", enabled: true }) });
		assert.equal(remoteConsent.status, 200);
		const sharedConnections = await request("/api/subscriptions", { headers: { "x-learnharness-subscriptions": "1" } });
		assert.equal((await sharedConnections.json()).native.find(connection => connection.providerId === "xai").allowBackgroundUse, true);
		assert.equal((await request("/api/keys/OPENAI_API_KEY", { method: "PUT", body: JSON.stringify({ value: "sk-zz-prove-it-synthetic-not-a-real-key" }) })).status, 200);
		assert.equal(fs.statSync(profile.authFile).mode & 0o777, 0o600);
		assert.equal((await request("/api/keys/OPENAI_API_KEY", { method: "DELETE" })).status, 200);
		assert.equal((await request("/api/settings/general", { method: "PUT", body: JSON.stringify({ autoUpdate: false }) })).status, 200);
		assert.equal(JSON.parse(fs.readFileSync(path.join(profile.dataDir, "settings.json"), "utf8")).general.autoUpdate, false);
		const before = treeIdentity(profile.root);
		const denied = start({ runtime: path.join(home, "other") });
		if (denied.exitCode === null) await once(denied, "exit");
		assert.equal(denied.exitCode, 1);
		assert.deepEqual(treeIdentity(profile.root), before);
		const occupied = net.createServer();
		await assert.rejects(new Promise((resolve, reject) => { occupied.once("error", reject); occupied.listen(port, "127.0.0.1", resolve); }), { code: "EADDRINUSE" });
		const exited = once(child, "exit");
		child.kill("SIGTERM");
		await exited;
		assert.equal(fs.existsSync(configurationFile), false);
		const lease = acquireProfile(profile);
		lease.release();
		const backup = backupProfile(profile);
		for (const filename of ["chatgpt-credentials.json", "github-copilot-credentials.json", "xai-credentials.json", "auth.json", "data/settings.json"]) assert.ok(backup.entries.some(entry => entry.path === filename));
		context.diagnostic(`Packaged service ${build.revision}: admitted status, chat write, credential-free subscription controls, single writer and conflict refusals; owned processes stopped; synthetic HOME ${home}`);
	} catch (error) { context.diagnostic(output); throw error; }
});
