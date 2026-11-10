import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { spawn, execFileSync } from "node:child_process";
import { once } from "node:events";
import { newLaunch } from "../../scripts/lib/preview-supervisor.mjs";
import { previewHelperCommand } from "../../scripts/lib/preview-subscription-helper.mjs";
import { prepareSandbox, spawnSandbox } from "../../scripts/lib/preview-sandbox.mjs";

const root = path.resolve(import.meta.dirname, "../..");
const identity = pid => {
	const contents = fs.readFileSync(`/proc/${pid}/stat`, "utf8");
	return { pid, start: contents.slice(contents.lastIndexOf(")") + 2).split(" ")[19], boot: fs.readFileSync("/proc/sys/kernel/random/boot_id", "utf8").trim() };
};
function call(socketPath, lease, endpoint, command) {
	return new Promise((resolve, reject) => {
		const request = http.request({ socketPath, path: endpoint, method: "POST", headers: { "content-type": "application/json", "x-preview-lease": lease } }, response => {
			let body = "";
			response.on("data", chunk => { body += chunk; });
			response.on("error", reject);
			response.on("end", () => resolve({ status: response.statusCode, headers: response.headers, body }));
		});
		request.on("error", reject);
		request.end(JSON.stringify(command));
	});
}
const json = response => JSON.parse(response.body);
async function runRuntime(directory, socketPath, lease, watch = false) {
	const child = spawn(process.execPath, ["--import", "tsx", "tests/deployment/fixtures/preview-runtime.ts", ...(watch ? ["--watch"] : [])], { cwd: root, env: { PATH: process.env.PATH, HOME: directory, NODE_ENV: "test", LH_DATA_DIR: path.join(directory, "data"), LH_AUTH_FILE: path.join(directory, "auth.json"), LH_PREVIEW_PROFILE: "1", LH_PREVIEW_LEASE: lease, LH_PREVIEW_HELPER_SOCKET: socketPath }, stdio: ["ignore", "pipe", "pipe", ...(watch ? ["ipc"] : [])] });
	const owned = identity(child.pid);
	let stdout = "", stderr = "";
	child.stdout.on("data", chunk => { stdout += chunk; }); child.stderr.on("data", chunk => { stderr += chunk; });
	if (watch) { const [value] = await once(child, "message"); return { child, value, identity: owned }; }
	const [code] = await once(child, "exit");
	assert.equal(code, 0, stderr);
	return { ...JSON.parse(stdout.trim()), process: owned, exited: true };
}

test("real helper process: deny, local grant, runtime model switch, revoke, expiry, manager death and replacement", { timeout: 90000 }, async () => {
	const directory = fs.mkdtempSync(path.join(os.tmpdir(), "lhph-"));
	const helperDirectory = path.join(directory, "helper");
	const child = spawn(process.execPath, ["tests/deployment/fixtures/preview-helper.mjs", helperDirectory], { cwd: root, env: { PATH: process.env.PATH, HOME: directory, NODE_ENV: "test" }, stdio: ["ignore", "pipe", "pipe", "ipc"] });
	let output = "";
	child.stdout.on("data", chunk => { output += chunk; }); child.stderr.on("data", chunk => { output += chunk; });
	const manager = spawn(process.execPath, ["-e", "setInterval(()=>{},1000)"], { env: {}, stdio: "ignore" });
	const owned = { helper: identity(child.pid), manager: identity(manager.pid), profiles: [directory], sandboxProcesses: [] };
	const command = value => previewHelperCommand(helperDirectory, value);
	let sandbox;
	let watchedRuntime;
	const sandboxRuntime = async (helperSocket, denied = false) => {
		const process = spawnSandbox(sandbox, ["/app/node_modules/tsx/dist/cli.mjs", "tests/deployment/fixtures/preview-runtime.ts", ...(denied ? ["--denied"] : [])], { lease: "lease-one", helperSocket, stdio: ["ignore", "pipe", "pipe"] });
		owned.sandboxProcesses.push(identity(process.pid));
		let stdout = "", stderr = "";
		process.stdout.on("data", chunk => { stdout += chunk; }); process.stderr.on("data", chunk => { stderr += chunk; });
		const [code] = await once(process, "exit"); assert.equal(code, 0, stderr);
		return JSON.parse(stdout.trim());
	};
	try {
		const [ready] = await once(child, "message"); assert.equal(ready.ready, true);
		owned.upstreamPort = ready.upstreamPort;
		const previousHome = process.env.HOME;
		try { process.env.HOME = directory; sandbox = prepareSandbox({ worktree: root, profile: path.join(directory, "sandbox-profile"), lease: "lease-one" }); }
		finally { if (previousHome === undefined) delete process.env.HOME; else process.env.HOME = previousHome; }
		const fixturePath = path.join(sandbox.source, "tests/deployment/fixtures");
		fs.mkdirSync(fixturePath, { recursive: true }); fs.copyFileSync(path.join(root, "tests/deployment/fixtures/preview-runtime.ts"), path.join(fixturePath, "preview-runtime.ts"));
		assert.equal((await sandboxRuntime(null, true)).defaultDenied, true);
		const first = await command({ op: "issue", ticketId: "synthetic-preview", lease: "lease-one", managerPid: manager.pid, launch: newLaunch() });
		const read = (socket = first.socketPath, lease = "lease-one") => call(socket, lease, "/read", { channel: "lh:chatgpt", op: "models" });
		assert.equal((await read()).status, 403);
		assert.equal((await sandboxRuntime(first.socketPath, true)).defaultDenied, true);
		assert.equal((await call(first.socketPath, "lease-one", "/grant", {})).status, 403);
		await assert.rejects(command({ op: "grant", ticketId: "wrong-preview", lease: "lease-one" }));
		const grant = JSON.parse(execFileSync(process.execPath, ["scripts/preview-subscriptions.mjs", "grant", helperDirectory, "synthetic-preview", "lease-one"], { cwd: root, env: {}, encoding: "utf8" }));
		assert.equal(grant.granted, true);
		const models = json(await read()); assert.equal(models.models.length, 2);
		assert.equal(JSON.stringify(models).includes("private-synthetic@example.invalid"), false);
		const runtime = await runRuntime(directory, first.socketPath, "lease-one");
		const sandboxedRuntime = await sandboxRuntime(first.socketPath);
		assert.equal(sandboxedRuntime.results.length, 3); assert.equal(sandboxedRuntime.environmentContainsProviderCredential, false);
		assert.equal(runtime.results.length, 3); assert.equal(runtime.environmentContainsProviderCredential, false);
		assert.notEqual(runtime.results[0].model, runtime.results[1].model);
		watchedRuntime = await runRuntime(directory, first.socketPath, "lease-one", true);
		const snapshot = json(await call(first.socketPath, "lease-one", "/read", { channel: "lh:subscriptions", op: "snapshot" }));
		assert.equal(JSON.stringify(snapshot).includes("synthetic-helper"), false);
		const nativeApis = new Set();
		for (const providerId of ["github-copilot", "xai"]) {
			const status = snapshot.statuses.find(status => status.providerId === providerId);
			for (const api of new Set(snapshot.models[providerId].map(model => model.api))) {
				const model = snapshot.models[providerId].find(model => model.api === api);
				const response = await call(first.socketPath, "lease-one", "/dispatch", { channel: "lh:subscriptions", fields: { background: false, scope: { providerId, connectionId: status.connectionId, epoch: status.epoch, authorityRevision: status.authorityRevision, selectedModelId: model.id } }, request: { payload: { model: model.id, stream: true } } });
				assert.equal(response.status, 200, response.body); nativeApis.add(api);
			}
		}
		assert.deepEqual([...nativeApis].sort(), ["anthropic-messages", "openai-completions", "openai-responses"]);
		const fields = { background: false, expectedAccountId: models.accountId, expectedAuthorityRevision: models.authorityRevision, selectedModelId: models.models[0].id };
		const dispatch = payload => call(first.socketPath, "lease-one", "/dispatch", { channel: "lh:chatgpt", fields, request: { payload, url: "http://unrelated.invalid/private", headers: { authorization: "Bearer malicious-client-value", host: "unrelated.invalid" } } });
		const response = await dispatch({ model: fields.selectedModelId, input: [], stream: true });
		assert.equal(response.status, 200); assert.equal(response.headers.authorization, undefined); assert.equal(response.headers["set-cookie"], undefined);
		const failed = await dispatch({ model: fields.selectedModelId, fail: true }); assert.equal(failed.status, 403);
		assert.equal(failed.body.includes("synthetic-helper"), false);
		assert.equal((await call(first.socketPath, "wrong-lease", "/read", { channel: "lh:chatgpt", op: "models" })).status, 403);
		await command({ op: "revoke", ticketId: "wrong-preview", lease: "lease-one" }); assert.equal((await read()).status, 200);
		const held = dispatch({ model: fields.selectedModelId, hold: true });
		held.catch(() => {});
		child.send({ op: "stats" }); let [stats] = await once(child, "message");
		while (!stats.active) { child.send({ op: "stats" }); [stats] = await once(child, "message"); }
		await command({ op: "revoke", ticketId: "synthetic-preview", lease: "lease-one" });
		await assert.rejects(held); await assert.rejects(read());
		watchedRuntime.child.send({ op: "refresh" });
		const [afterRevocation] = await once(watchedRuntime.child, "message");
		assert.equal(afterRevocation.refreshedAfterRevoke, true);
		if (watchedRuntime.child.exitCode === null) await once(watchedRuntime.child, "exit");
		await assert.rejects(command({ op: "grant", ticketId: "synthetic-preview", lease: "lease-one" }));
		await assert.rejects(command({ op: "issue", ticketId: "synthetic-preview", lease: "lease-one", managerPid: manager.pid, launch: newLaunch() }));
		const second = await command({ op: "issue", ticketId: "synthetic-preview", lease: "lease-two", managerPid: manager.pid, launch: newLaunch() });
		assert.equal((await read(second.socketPath, "lease-two")).status, 403);
		await command({ op: "grant", ticketId: "synthetic-preview", lease: "lease-two" });
		await command({ op: "revoke", ticketId: "synthetic-preview", lease: "lease-one" });
		assert.equal((await read(second.socketPath, "lease-two")).status, 200);
		const secondModels = json(await read(second.socketPath, "lease-two")); assert.notEqual(secondModels.accountId, models.accountId);
		const expiring = newLaunch(); expiring.started -= 599700; expiring.deadline -= 599700;
		const third = await command({ op: "issue", ticketId: "synthetic-other", lease: "lease-three", managerPid: manager.pid, launch: expiring });
		await command({ op: "grant", ticketId: "synthetic-other", lease: "lease-three" });
		assert.equal((await read(third.socketPath, "lease-three")).status, 200);
		await new Promise(resolve => setTimeout(resolve, 400));
		await assert.rejects(read(third.socketPath, "lease-three"));
		manager.kill("SIGKILL"); await once(manager, "exit");
		const dead = await read(second.socketPath, "lease-two").catch(() => null); assert.ok(dead === null || dead.status === 403);
		child.send({ op: "stats" }); [stats] = await once(child, "message");
		assert.equal(stats.stats.every(request => request.authenticated && request.injectedAuthorizationIgnored), true);
		assert.equal(stats.stats.some(request => request.provider === "xai"), true);
		assert.equal(output.includes("synthetic-helper"), false);
		console.log(JSON.stringify({ scopedChecks: "passed", runtime, sandboxedRuntime, watchedRuntime: watchedRuntime.identity, owned, sandboxSourceHash: sandbox.sourceHash, nativeApis: [...nativeApis], upstreamRequests: stats.stats, acceleratedExpiryOnly: true, nativeGUI: "blocked", actualTenMinutes: "blocked" }));
	} finally {
		if (watchedRuntime?.child.exitCode === null && watchedRuntime.child.signalCode === null) { watchedRuntime.child.kill("SIGKILL"); await once(watchedRuntime.child, "exit"); }
		if (manager.exitCode === null && manager.signalCode === null) { manager.kill("SIGKILL"); await once(manager, "exit"); }
		child.kill("SIGTERM"); if (child.exitCode === null && child.signalCode === null) await once(child, "exit");
		assert.equal(fs.existsSync(path.join(helperDirectory, "control.sock")), false);
		if (sandbox) fs.rmSync(sandbox.transport, { recursive: true, force: true });
		fs.rmSync(directory, { recursive: true, force: true });
	}
});
