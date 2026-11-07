import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { once } from "node:events";
import { createHash } from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { acquireProfile, resolveProfile } from "../../electron/deployment-profile.cjs";
import { backupProfile, treeIdentity } from "../../scripts/lib/deployment-profile.mjs";

test("actual Next startup owns the external default before recovery, never on builds", { timeout: 240_000 }, async context => {
	const root = process.cwd();
	for (const filename of [".env", ".env.local", ".env.development", ".env.development.local"]) assert.equal(fs.existsSync(path.join(root, filename)), false, "Refusing ambient checkout credentials");
	const cache = path.join(os.homedir(), ".cache");
	fs.mkdirSync(cache, { recursive: true });
	const home = fs.mkdtempSync(path.join(cache, "zz-prove-it-profile-next-"));
	context.after(() => fs.rmSync(home, { recursive: true, force: true }));
	const environment = { PATH: process.env.PATH, HOME: home, LH_IGNORE_ENV_KEYS: "1", NEXT_TELEMETRY_DISABLED: "1", LANG: "C.UTF-8" };
	const profile = resolveProfile({ env: {}, home });
	execFileSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", 'const { register } = await import("./instrumentation.ts"); await register();'], {
		cwd: root, env: { ...environment, NEXT_RUNTIME: "nodejs", NEXT_PHASE: "phase-production-build" },
	});
	assert.equal(fs.existsSync(profile.root), false, "Build instrumentation must not create or own a profile");
	const probe = net.createServer();
	await new Promise(resolve => probe.listen(0, "127.0.0.1", resolve));
	const port = probe.address().port;
	await new Promise(resolve => probe.close(resolve));
	let output = "";
	async function start() {
		const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--hostname", "127.0.0.1", "--port", String(port)], {
			cwd: root, env: environment, detached: true, stdio: ["ignore", "pipe", "pipe"],
		});
		child.stdout.on("data", contents => { output += contents; });
		child.stderr.on("data", contents => { output += contents; });
		await once(child, "spawn");
		context.after(async () => {
			if (child.exitCode === null && child.signalCode === null) {
				const exited = once(child, "exit");
				process.kill(-child.pid, "SIGTERM");
				await exited;
			}
		});
		return child;
	}
	const child = await start();
	const url = `http://127.0.0.1:${port}/`;
	try {
		const deadline = Date.now() + 150_000;
		while (true) {
			try {
				const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
				assert.equal(response.status, 200);
				await response.arrayBuffer();
				break;
			} catch (error) {
				if (child.exitCode !== null || Date.now() > deadline) throw new Error(`Next startup failed: ${output}`, { cause: error });
				await new Promise(resolve => setTimeout(resolve, 250));
			}
		}
		assert.throws(() => acquireProfile(profile), /live writer/);
		const lockName = createHash("sha256").update(JSON.stringify([{ path: profile.root, directory: true }])).digest("hex");
		const lockFile = path.join(os.userInfo().homedir, ".local/state/learnharness-profile-writers", `${lockName}.json`);
		assert.equal(fs.existsSync(lockFile), true);
		assert.throws(() => backupProfile(profile), /live writer/);
		const created = await fetch(`${url}api/chats`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "zz-prove-it-external-startup" }) });
		assert.equal(created.status, 200);
		const record = await created.json();
		assert.equal(record.title, "zz-prove-it-external-startup");
		assert.ok(treeIdentity(profile.root).some(entry => entry.path.includes(record.id)), "Actual route writes must be in the external profile");
		const stopped = once(child, "exit");
		process.kill(-child.pid, "SIGTERM");
		await stopped;
		assert.equal(fs.existsSync(lockFile), false, "Graceful Next exit must release its matching lease");
		const owner = acquireProfile(profile);
		try {
			const before = treeIdentity(profile.root);
			output = "";
			const denied = await start();
			if (denied.exitCode === null) await once(denied, "exit");
			assert.match(output, /Profile already has a live writer/);
			assert.deepEqual(treeIdentity(profile.root), before, "Denied startup must not run writing recovery");
		} finally { owner.release(); }
		context.diagnostic(`Next ${url}: external default write, live exclusion, denied-startup byte identity, build-hook refusal; all owned servers stopped`);
	} catch (error) { context.diagnostic(output); throw error; }
});
