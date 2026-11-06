import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";

const root = process.cwd();
const [command, run] = process.argv.slice(2);
const metadata = () => JSON.parse(fs.readFileSync(path.join(run, "instance.json"), "utf8"));
const identity = pid => {
	try { return execFileSync("ps", ["-p", String(pid), "-o", "lstart="], { encoding: "utf8" }).trim(); }
	catch { return null; }
};
const json = async (url, options) => {
	const response = await fetch(url, { ...options, signal: AbortSignal.timeout(120_000) });
	return { status: response.status, body: await response.json() };
};
if (command === "start") {
	for (const name of [".env", ".env.local", ".env.development", ".env.development.local"]) {
		assert.ok(!fs.existsSync(path.join(root, name)), `Refusing checkout dotenv: ${name}`);
	}
	const directory = path.join(root, ".prove-it", "runs", `${new Date().toISOString().replaceAll(":", "-")}-zz-prove-it-baseline`);
	fs.mkdirSync(path.join(directory, "profile", "home"), { recursive: true, mode: 0o700 });
	const listener = net.createServer();
	await new Promise(resolve => listener.listen(0, "127.0.0.1", resolve));
	const port = listener.address().port;
	await new Promise(resolve => listener.close(resolve));
	const profile = path.join(directory, "profile");
	const log = fs.openSync(path.join(directory, "server.log"), "a", 0o600);
	const child = spawn(process.execPath, [path.join(root, "node_modules/next/dist/bin/next"), "dev", "--hostname", "127.0.0.1", "--port", String(port)], {
		cwd: root, detached: true, stdio: ["ignore", log, log],
		env: { PATH: process.env.PATH, LANG: "C.UTF-8", HOME: path.join(profile, "home"), XDG_CONFIG_HOME: path.join(profile, "home", ".config"),
			LH_DATA_DIR: path.join(profile, "data"), LH_AUTH_FILE: path.join(profile, "auth", "auth.json"), LH_IGNORE_ENV_KEYS: "1", NEXT_TELEMETRY_DISABLED: "1" },
	});
	await new Promise((resolve, reject) => { child.once("spawn", resolve); child.once("error", reject); });
	child.unref();
	fs.closeSync(log);
	fs.writeFileSync(path.join(directory, "instance.json"), JSON.stringify({ pid: child.pid, identity: identity(child.pid), url: `http://127.0.0.1:${port}/`, root, profile, revision: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim() }, null, 2));
	console.log(directory);
} else if (command === "health") {
	const instance = metadata();
	assert.equal(identity(instance.pid), instance.identity, "Owned process is gone or replaced");
	let failure;
	for (let attempt = 0; attempt < 120; attempt++) {
		try {
			const response = await fetch(instance.url, { signal: AbortSignal.timeout(5000) });
			assert.equal(response.status, 200);
			console.log(JSON.stringify(instance));
			failure = undefined;
			break;
		} catch (error) { failure = error; await new Promise(resolve => setTimeout(resolve, 1000)); }
	}
	if (failure) throw failure;
} else if (command === "smoke") {
	const instance = metadata();
	const settings = await json(new URL("api/settings", instance.url));
	const chats = await json(new URL("api/chats", instance.url));
	const keys = await json(new URL("api/keys", instance.url));
	assert.equal(settings.status, 200);
	assert.equal(chats.status, 200);
	assert.equal(keys.status, 200);
	assert.equal(settings.body.settings, null);
	assert.deepEqual(chats.body, { chats: [] });
	const baseline = { settings: settings.body, chats: chats.body, keys: keys.body };
	fs.writeFileSync(path.join(run, "baseline.json"), JSON.stringify(baseline, null, 2) + "\n");
	const snapshot = path.join(root, ".prove-it/snapshots/empty-profile.json");
	assert.ok(fs.existsSync(snapshot), "Missing baseline answer key: BLOCKED");
	assert.deepEqual(baseline, JSON.parse(fs.readFileSync(snapshot, "utf8")), "Pre-change empty profile contract");
	const created = await json(new URL("api/chats", instance.url), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "zz-prove-it-synthetic" }) });
	assert.ok(created.status >= 200 && created.status < 300);
	const after = await json(new URL("api/chats", instance.url));
	assert.equal(after.body.chats.length, 1);
	const invalid = await json(new URL("api/chats", instance.url), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ practiceMode: "wrong" }) });
	assert.equal(invalid.status, 400);
	const afterRejection = await json(new URL("api/chats", instance.url));
	assert.deepEqual(afterRejection, after);
	fs.writeFileSync(path.join(run, "roundtrip.json"), JSON.stringify({ before: chats, created, after, invalid, afterRejection }, null, 2));
	console.log("checks passed: empty profile, session persistence, invalid drill rejected without write");
} else if (command === "stop") {
	const instance = metadata();
	if (identity(instance.pid) === instance.identity) {
		try { process.kill(-instance.pid, "SIGTERM"); } catch (error) { if (error.code !== "ESRCH") throw error; }
		await new Promise(resolve => setTimeout(resolve, 1500));
		try { process.kill(-instance.pid, "SIGKILL"); } catch (error) { if (error.code !== "ESRCH") throw error; }
	}
	console.log("owned process group stopped; evidence retained");
} else throw new Error("Usage: runtime.mjs start | health RUN | smoke RUN | stop RUN");
