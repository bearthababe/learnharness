import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import puppeteer from "puppeteer-core";
import { ownerOf, stopOwned, alive } from "../../../../scripts/lib/ticket-state.mjs";

const binary = path.resolve(process.argv[2] ?? "dist/linux-unpacked/learnharness");
assert.ok(fs.existsSync(binary), "Build the private Linux package first; packaged runtime is BLOCKED");
const directory = path.join(process.cwd(), ".prove-it", "runs", `${new Date().toISOString().replaceAll(":", "-")}-zz-prove-it-packaged`);
const profile = path.join(directory, "profile");
fs.mkdirSync(profile, { recursive: true, mode: 0o700 });
const result = { schemaVersion: 1, status: "running", binary, profile, revision: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(), startedAt: new Date().toISOString(), finishedAt: null, steps: [], cleanup: "not-run" };
const save = () => {
	const destination = path.join(directory, "result.json");
	fs.writeFileSync(destination + ".tmp", JSON.stringify(result, null, 2) + "\n");
	fs.renameSync(destination + ".tmp", destination);
};
const step = async (name, operation) => {
	const entry = { name, status: "running", startedAt: new Date().toISOString() };
	result.steps.push(entry);
	save();
	try { entry.evidence = await operation(); entry.status = "passed"; }
	catch (error) { entry.status = "failed"; entry.error = error.stack; throw error; }
	finally { entry.finishedAt = new Date().toISOString(); save(); }
};
const listener = net.createServer();
await new Promise(resolve => listener.listen(0, "127.0.0.1", resolve));
const port = listener.address().port;
await new Promise(resolve => listener.close(resolve));
const log = fs.openSync(path.join(directory, "electron.log"), "a", 0o600);
const token = randomUUID();
const platform = process.env.WAYLAND_DISPLAY ? "wayland" : process.env.DISPLAY ? "x11" : "headless";
let owner;
let browser;
save();
console.log(`Packaged runtime evidence: ${directory}`);
try {
	const asar = path.join(path.dirname(binary), "resources", "app.asar");
	result.asarSha256 = createHash("sha256").update(fs.readFileSync(asar)).digest("hex");
	const child = spawn(binary, ["--no-sandbox", `--ozone-platform=${platform}`, "--disable-gpu", `--remote-debugging-port=${port}`], {
		detached: true, stdio: ["ignore", log, log], cwd: directory,
		env: { PATH: process.env.PATH, LANG: "C.UTF-8", HOME: profile, XDG_CONFIG_HOME: path.join(profile, ".config"), XDG_DATA_HOME: path.join(profile, ".local", "share"), XDG_CACHE_HOME: path.join(profile, ".cache"), ...(platform === "wayland" ? { XDG_RUNTIME_DIR: process.env.XDG_RUNTIME_DIR, WAYLAND_DISPLAY: process.env.WAYLAND_DISPLAY } : platform === "x11" ? { DISPLAY: process.env.DISPLAY, XAUTHORITY: process.env.XAUTHORITY } : {}), LH_IGNORE_ENV_KEYS: "1", LH_UPDATE_FEED: "http://127.0.0.1:9/", LH_PREVIEW_PROCESS_TOKEN: token },
	});
	child.once("exit", (code, signal) => { result.exit = { code, signal }; save(); });
	await new Promise((resolve, reject) => { child.once("spawn", resolve); child.once("error", reject); });
	child.unref();
	owner = { ...ownerOf(child.pid), token };
	result.process = owner;
	result.display = platform;
	save();
	await step("actual packaged Electron CDP startup", async () => {
		const deadline = Date.now() + 120_000;
		let failure;
		while (Date.now() < deadline) {
			assert.ok(alive(owner), "Owned packaged Electron exited; inspect electron.log");
			try {
				const response = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(2000) });
				assert.equal(response.status, 200);
				const version = await response.json();
				browser = await puppeteer.connect({ browserWSEndpoint: version.webSocketDebuggerUrl });
				return { browser: version.Browser, debugPort: port };
			} catch (error) { failure = error; await new Promise(resolve => setTimeout(resolve, 250)); }
		}
		throw failure;
	});
	await step("packaged Home and synthetic persisted session", async () => {
		let page;
		const deadline = Date.now() + 120_000;
		while (Date.now() < deadline) {
			page = (await browser.pages()).find(candidate => /^http:\/\/127\.0\.0\.1:\d+\/$/.test(candidate.url()));
			if (page) break;
			assert.ok(alive(owner), "Owned packaged Electron exited before Home");
			await new Promise(resolve => setTimeout(resolve, 250));
		}
		assert.ok(page, "No packaged Home page became available");
		await page.waitForSelector('[data-file-path-input][data-placeholder="What do you want to learn?"]', { timeout: 120_000 });
		const evidence = await page.evaluate(async () => {
			const read = async route => {
				const response = await fetch(route);
				return { status: response.status, body: await response.json() };
			};
			const before = await read("/api/chats");
			const response = await fetch("/api/chats", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "zz-prove-it-packaged-session" }) });
			const created = { status: response.status, body: await response.json() };
			const after = await read("/api/chats");
			return { url: location.href, title: document.title, before, created, after };
		});
		assert.equal(evidence.title, "Learning Harness");
		assert.equal(evidence.before.status, 200);
		assert.deepEqual(evidence.before.body, { chats: [] });
		assert.equal(evidence.created.status, 200);
		assert.equal(evidence.after.status, 200);
		assert.equal(evidence.after.body.chats.length, 1);
		assert.equal(evidence.after.body.chats[0].id, evidence.created.body.id);
		assert.equal(evidence.after.body.chats[0].title, "zz-prove-it-packaged-session");
		await page.screenshot({ path: path.join(directory, "home.png") });
		return evidence;
	});
	result.status = "passed";
	console.log("checks passed: actual packaged Electron, isolated Home, synthetic persisted session; not shared-service/native-subscription parity");
} catch (error) {
	result.status = "failed";
	result.error = error.stack;
	process.exitCode = 1;
	console.error(error);
} finally {
	try {
		if (browser) await browser.disconnect();
		await stopOwned(owner);
		assert.ok(!alive(owner), "Owned packaged Electron is still running");
		result.cleanup = "passed";
	} catch (error) { result.cleanup = "failed"; result.status = "failed"; result.cleanupError = error.stack; process.exitCode = 1; }
	fs.closeSync(log);
	result.finishedAt = new Date().toISOString();
	save();
}
