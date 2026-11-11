import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { sourceFingerprint } from "../../../../scripts/mobile-browser-result.mjs";
import { completed, processScope } from "../../../../scripts/mobile-browser-runner.mjs";
import { Browser, computeExecutablePath } from "@puppeteer/browsers";
import { PUPPETEER_REVISIONS } from "puppeteer-core";

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
	const revision = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
	const source = { revision, dirty: Boolean(execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim()), sha256: await sourceFingerprint(root) };
	const checksum = file => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
	const verifier = { runtimeSha256: checksum(new URL(import.meta.url)), skillSha256: checksum(new URL("../SKILL.md", import.meta.url)), browserScriptSha256: checksum(path.join(root, "scripts/smoke-mobile-preview.mjs")) };
	const log = fs.openSync(path.join(directory, "server.log"), "a", 0o600);
	const child = spawn(process.execPath, [path.join(root, "node_modules/next/dist/bin/next"), "dev", "--hostname", "127.0.0.1", "--port", String(port)], {
		cwd: root, detached: true, stdio: ["ignore", log, log],
		env: { PATH: process.env.PATH, LANG: "C.UTF-8", HOME: path.join(profile, "home"), XDG_CONFIG_HOME: path.join(profile, "home", ".config"),
			LH_DATA_DIR: path.join(profile, "data"), LH_AUTH_FILE: path.join(profile, "auth", "auth.json"), LH_IGNORE_ENV_KEYS: "1", NEXT_TELEMETRY_DISABLED: "1" },
	});
	await new Promise((resolve, reject) => { child.once("spawn", resolve); child.once("error", reject); });
	child.unref();
	fs.closeSync(log);
	fs.writeFileSync(path.join(directory, "instance.json"), JSON.stringify({ pid: child.pid, identity: identity(child.pid), url: `http://127.0.0.1:${port}/`, root, profile, revision, source, verifier }, null, 2));
	console.log(directory);
} else if (command === "health") {
	const instance = metadata();
	assert.equal(identity(instance.pid), instance.identity, "Owned process is gone or replaced");
	let failure;
	for (let attempt = 0; attempt < 120; attempt++) {
		try {
			const response = await fetch(instance.url, { signal: AbortSignal.timeout(5000) });
			assert.equal(response.status, 200);
			await response.arrayBuffer();
			console.log(JSON.stringify(instance));
			failure = undefined;
			break;
		} catch (error) { failure = error; await new Promise(resolve => setTimeout(resolve, 1000)); }
	}
	if (failure) throw failure;
} else if (command === "smoke") {
	const instance = metadata();
	assert.equal(identity(instance.pid), instance.identity, "Owned process is gone or replaced");
	const result = { schemaVersion: 1, status: "running", source: instance.source, verifier: instance.verifier, startedAt: new Date().toISOString(), finishedAt: null, steps: [] };
	const evidence = {};
	const save = () => {
		for (const [name, value] of [["checks.json", result], ["roundtrip.json", evidence]]) {
			const destination = path.join(run, name);
			fs.writeFileSync(destination + ".tmp", JSON.stringify(value, null, 2) + "\n");
			fs.renameSync(destination + ".tmp", destination);
		}
	};
	const step = async (name, operation) => {
		const entry = { name, status: "running", startedAt: new Date().toISOString() };
		result.steps.push(entry);
		save();
		try { await operation(); entry.status = "passed"; }
		catch (error) { entry.status = "failed"; entry.error = error.stack; throw error; }
		finally { entry.finishedAt = new Date().toISOString(); save(); }
	};
	const request = async (route, method = "GET", body) => {
		const response = await json(new URL(route, instance.url), body === undefined ? { method } : { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
		(evidence.requests ??= []).push({ route, method, body, response });
		save();
		return response;
	};
	const list = async () => {
		const response = await request("api/chats");
		assert.equal(response.status, 200);
		return response.body.chats;
	};
	const inputs = [
		{ title: "zz-prove-it-teach-alpha" },
		{ title: "zz-prove-it-teach-beta" },
		{ title: "zz-prove-it-practice", kind: "practice" },
		{ title: "zz-prove-it-drill", kind: "practice", practiceMode: "drill" },
	];
	const created = [];
	try {
		await step("independent empty-profile snapshot", async () => {
			const settings = await request("api/settings");
			const chats = await request("api/chats");
			const keys = await request("api/keys");
			for (const response of [settings, chats, keys]) assert.equal(response.status, 200);
			const baseline = { settings: settings.body, chats: chats.body, keys: keys.body };
			fs.writeFileSync(path.join(run, "baseline.json"), JSON.stringify(baseline, null, 2) + "\n");
			const snapshot = path.join(root, ".prove-it/snapshots/empty-profile.json");
			assert.ok(fs.existsSync(snapshot), "Missing baseline answer key: BLOCKED");
			assert.deepEqual(baseline, JSON.parse(fs.readFileSync(snapshot, "utf8")), "Pre-change empty profile contract");
		});
		await step("four distinct persisted teaching/practice/drill records", async () => {
			for (const input of inputs) {
				const response = await request("api/chats", "POST", input);
				assert.equal(response.status, 200);
				assert.equal(response.body.title, input.title);
				created.push(response.body);
			}
			assert.equal(new Set(created.map(record => record.id)).size, inputs.length);
			const records = await list();
			assert.equal(records.length, inputs.length);
			for (const [index, record] of created.entries()) {
				const stored = records.find(candidate => candidate.id === record.id);
				assert.ok(stored, `Missing persisted record ${record.id}`);
				assert.equal(stored.title, inputs[index].title);
				assert.equal(stored.kind, inputs[index].kind ?? "teach");
				assert.equal(stored.practiceMode, inputs[index].practiceMode);
				const detail = await request(`api/chats/${record.id}`);
				assert.equal(detail.status, 200);
				assert.equal(detail.body.title, inputs[index].title);
				assert.equal(detail.body.kind ?? "teach", inputs[index].kind ?? "teach");
				assert.equal(detail.body.practiceMode, inputs[index].practiceMode);
			}
		});
		await step("invalid drill configurations refuse without writes", async () => {
			const before = await list();
			for (const invalid of [{ practiceMode: "wrong" }, { practiceMode: "drill" }, { kind: "teach", practiceMode: "drill" }]) {
				assert.equal((await request("api/chats", "POST", invalid)).status, 400);
				assert.deepEqual(await list(), before);
			}
		});
		await step("rename one record then reverse it without changing siblings", async () => {
			const before = await list();
			const target = created[1];
			assert.equal((await request(`api/chats/${target.id}`, "PUT", { title: "zz-prove-it-renamed" })).status, 200);
			const changed = await list();
			assert.deepEqual(changed, before.map(record => record.id === target.id ? { ...record, title: "zz-prove-it-renamed" } : record));
			assert.equal((await request(`api/chats/${target.id}`, "PUT", { title: target.title })).status, 200);
			assert.deepEqual(await list(), before);
		});
		await step("explicit-mode deletion removes only the selected record", async () => {
			const before = await list();
			const target = created[2];
			assert.equal((await request(`api/chats/${target.id}`, "DELETE")).status, 400);
			assert.deepEqual(await list(), before);
			const removed = await request(`api/chats/${target.id}?mode=preserve-graph`, "DELETE");
			assert.equal(removed.status, 200);
			assert.equal(removed.body.ok, true);
			assert.deepEqual(await list(), before.filter(record => record.id !== target.id));
			assert.equal((await request(`api/chats/${target.id}`)).status, 404);
		});
		result.status = "passed";
		console.log("checks passed: independent snapshot, four session branches, refusal without writes, reversible rename and selective deletion");
	} catch (error) { result.status = "failed"; result.error = error.stack; throw error; }
	finally { result.finishedAt = new Date().toISOString(); save(); }
} else if (command === "browser") {
	const instance = metadata();
	assert.equal(identity(instance.pid), instance.identity, "Owned process is gone or replaced");
	assert.equal(JSON.parse(fs.readFileSync(path.join(run, "checks.json"), "utf8")).status, "passed", "Run the HTTP smoke before the browser drive");
	const roundtrip = JSON.parse(fs.readFileSync(path.join(run, "roundtrip.json"), "utf8"));
	const records = roundtrip.requests.findLast(request => request.route === "api/chats" && request.method === "GET").response.body.chats;
	const session = records.find(record => record.kind === "teach");
	assert.ok(session, "No surviving synthetic teaching session for the browser drive");
	const supported = computeExecutablePath({ cacheDir: path.join(os.homedir(), ".cache", "puppeteer"), browser: Browser.CHROME, buildId: PUPPETEER_REVISIONS.chrome });
	const executablePath = process.env.CHROMIUM_PATH ?? (fs.existsSync(supported) ? supported : "/usr/bin/chromium");
	const result = { schemaVersion: 1, status: "running", startedAt: new Date().toISOString(), finishedAt: null, source: instance.source, verifier: instance.verifier, url: instance.url, chatId: session.id, warmups: [], browser: { executablePath, supportedVersion: PUPPETEER_REVISIONS.chrome }, temporaryDirectory: null, cleanup: "not-run" };
	const destination = path.join(run, "browser.json");
	const save = () => { fs.writeFileSync(destination + ".tmp", JSON.stringify(result, null, 2) + "\n"); fs.renameSync(destination + ".tmp", destination); };
	const temporary = fs.mkdtempSync(path.join(process.platform === "linux" ? "/tmp" : os.tmpdir(), "lh-proof-"));
	fs.chmodSync(temporary, 0o700);
	result.temporaryDirectory = temporary;
	const processes = processScope();
	const log = fs.openSync(path.join(run, "browser.log"), "a", 0o600);
	save();
	try {
		for (const route of ["", `chat/${session.id}`]) {
			const url = new URL(route, instance.url).href;
			const startedAt = Date.now();
			const response = await fetch(url, { signal: AbortSignal.timeout(120_000) });
			const bytes = (await response.arrayBuffer()).byteLength;
			result.warmups.push({ url, status: response.status, bytes, durationMs: Date.now() - startedAt });
			save();
			assert.equal(response.status, 200, "Public entrypoint must be usable before browser assertions");
		}
		const child = processes.spawn(process.execPath, [path.join(root, "scripts/smoke-mobile-preview.mjs")], {
			cwd: root, stdio: ["ignore", log, log],
			env: { PATH: process.env.PATH, LANG: "C.UTF-8", HOME: path.join(instance.profile, "home"), TMPDIR: temporary, CHROMIUM_PATH: executablePath, LH_SMOKE_URL: instance.url, LH_SMOKE_CHAT_ID: session.id },
		});
		await completed(child);
		result.status = "passed";
		console.log("checks passed: unchanged Home/session browser identity, metadata, icon, reload and read-only guards");
	} catch (error) { result.status = "failed"; result.error = error.stack; throw error; }
	finally {
		try { await processes.close(); fs.rmSync(temporary, { recursive: true }); result.cleanup = "passed"; }
		catch (error) { result.status = "failed"; result.cleanup = "failed"; result.cleanupError = error.stack; throw error; }
		finally { fs.closeSync(log); result.finishedAt = new Date().toISOString(); save(); }
	}
} else if (command === "stop") {
	const instance = metadata();
	if (identity(instance.pid) === instance.identity) {
		try { process.kill(-instance.pid, "SIGTERM"); } catch (error) { if (error.code !== "ESRCH") throw error; }
		await new Promise(resolve => setTimeout(resolve, 1500));
		try { process.kill(-instance.pid, "SIGKILL"); } catch (error) { if (error.code !== "ESRCH") throw error; }
	}
	console.log("owned process group stopped; evidence retained");
} else throw new Error("Usage: runtime.mjs start | health RUN | smoke RUN | browser RUN | stop RUN");
