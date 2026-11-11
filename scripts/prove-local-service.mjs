import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import puppeteer from "puppeteer-core";
import { ownerOf, stopOwned, alive } from "./lib/ticket-state.mjs";
import { attachService, controlRequest } from "../electron/local-service-protocol.cjs";
import { acquireProfile, resolveProfile } from "../electron/deployment-profile.cjs";
import { backupProfile } from "./lib/deployment-profile.mjs";

const directory = path.resolve(process.argv[2]);
const binary = path.resolve("dist/linux-unpacked/learnharness");
const resources = path.join(path.dirname(binary), "resources");
const build = JSON.parse(fs.readFileSync(path.join(resources, "server/standalone/deployment-build.json"), "utf8"));
const home = fs.mkdtempSync(path.join(os.homedir(), ".cache", "zz-shared-"));
const profile = path.join(home, "LearnHarness");
const runtime = path.join(home, "run");
const browserOrigin = process.env.LH_PROOF_BROWSER_ORIGIN || "http://127.0.0.1:3810";
const environment = { PATH: process.env.PATH, LANG: "C.UTF-8", HOME: home, XDG_CONFIG_HOME: path.join(home, "config"), XDG_CACHE_HOME: path.join(home, "cache"), XDG_DATA_HOME: path.join(home, "local"), XDG_RUNTIME_DIR: process.env.XDG_RUNTIME_DIR, WAYLAND_DISPLAY: "wayland-1", DISPLAY: ":0", LH_PROFILE_DIR: profile, LH_IGNORE_ENV_KEYS: "1", NEXT_TELEMETRY_DISABLED: "1" };
const result = { schemaVersion: 1, status: "running", checker: "builder, not independent", startedAt: new Date().toISOString(), build, home, profile, runtime, browserOrigin, processes: [], steps: [], cleanup: "not-run", limitations: ["No updater/idle/rollback or preview sandbox/helper/expiry proof", "No physical device or live subscription", "Offline subscription status/consent does not prove synthetic upstream login/model switching", "Native render dependencies and browser helper are exercised separately, not by a service agent job"] };
const save = () => {
	fs.writeFileSync(path.join(directory, "shared-process.json.tmp"), JSON.stringify(result, null, 2) + "\n");
	fs.renameSync(path.join(directory, "shared-process.json.tmp"), path.join(directory, "shared-process.json"));
};
async function step(name, operation) {
	const entry = { name, status: "running", startedAt: new Date().toISOString() };
	result.steps.push(entry); save();
	try { entry.evidence = await operation(); entry.status = "passed"; }
	catch (error) { entry.status = "failed"; entry.error = error.message; throw error; }
	finally { entry.finishedAt = new Date().toISOString(); save(); }
}
const owners = [];
const browsers = [];
let web;
async function start(name, argumentsList, extra = {}) {
	const token = randomUUID();
	const log = fs.openSync(path.join(directory, `${name}.log`), "a", 0o600);
	const child = spawn(binary, argumentsList, { detached: true, env: { ...environment, LH_PREVIEW_PROCESS_TOKEN: token, ...extra }, stdio: ["ignore", log, log] });
	fs.closeSync(log);
	await once(child, "spawn");
	const owner = { ...ownerOf(child.pid), token };
	owners.push(owner); result.processes.push({ name, ...owner }); save();
	return { child, owner };
}
async function waitFor(operation, timeout = 90000) {
	const deadline = Date.now() + timeout;
	let failure;
	while (Date.now() < deadline) {
		try { return await operation(); } catch (error) { if (error.message === "Packaged shell exited before CDP") throw error; failure = error; await new Promise(resolve => setTimeout(resolve, 200)); }
	}
	throw failure;
}
async function freePort(port = 0) {
	const listener = net.createServer();
	await new Promise((resolve, reject) => { listener.once("error", reject); listener.listen(port, "127.0.0.1", resolve); });
	const selected = listener.address().port;
	await new Promise(resolve => listener.close(resolve));
	return selected;
}
async function shell(name) {
	const port = await freePort();
	const launched = await start(name, ["--no-sandbox", "--ozone-platform=wayland", "--disable-gpu", `--remote-debugging-port=${port}`, `--local-service=${path.join(runtime, "service.json")}`]);
	const browser = await waitFor(async () => {
		assert.ok(alive(launched.owner), "Packaged shell exited before CDP");
		const version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
		return puppeteer.connect({ browserWSEndpoint: version.webSocketDebuggerUrl, defaultViewport: null });
	});
	browsers.push(browser);
	const page = await waitFor(async () => {
		const candidate = (await browser.pages()).find(entry => entry.url() === "http://127.0.0.1:3810/");
		assert.ok(candidate, "Attached service page is not ready");
		return candidate;
	});
	await page.waitForSelector('[data-testid="settings-entry"]', { timeout: 90000 });
	return { ...launched, browser, page };
}
const api = (page, route, method = "GET", data) => page.evaluate(async (target, verb, payload) => {
	const response = await fetch(target, { method: verb, headers: { "Content-Type": "application/json" }, ...(payload === undefined ? {} : { body: JSON.stringify(payload) }) });
	return { status: response.status, body: await response.json() };
}, route, method, data);
async function settings(page, filename) {
	await page.keyboard.down("Control");
	await page.keyboard.press(",");
	await page.keyboard.up("Control");
	await page.waitForSelector('[data-testid="settings-nav-general"]');
	await page.click('[data-testid="settings-nav-general"]');
	await page.waitForFunction(() => document.querySelector('[data-testid="runtime-status"]')?.textContent?.includes("Updater not running"));
	assert.equal(await page.$('[data-testid="update-check"]'), null);
	assert.equal(await page.$('[data-testid="update-restart"]'), null);
	await page.screenshot({ path: path.join(directory, filename) });
	return page.$eval('[data-testid="runtime-status"]', element => element.textContent);
}
save();
try {
	await freePort(3810);
	const service = await start("service", [path.join(resources, "local-service.cjs"), JSON.stringify({ port: 3810, runtime, browserOrigins: browserOrigin === "http://127.0.0.1:3810" ? [] : [browserOrigin] })], { ELECTRON_RUN_AS_NODE: "1" });
	const configuration = await waitFor(() => attachService(path.join(runtime, "service.json"), build, profile));
	await step("sole packaged service custody and admission", async () => {
		assert.equal(configuration.pid, service.child.pid);
		assert.throws(() => acquireProfile(resolveProfile({ env: { LH_PROFILE_DIR: profile } })), /live writer/);
		assert.throws(() => backupProfile(resolveProfile({ env: { LH_PROFILE_DIR: profile } })), /live writer/);
		assert.equal((await fetch(browserOrigin)).status, 403);
		return await controlRequest(configuration, { op: "status" });
	});
	web = await puppeteer.launch({ executablePath: process.env.CHROMIUM_PATH, headless: true, userDataDir: path.join(home, "browser"), env: { ...environment, LH_PROFILE_DIR: undefined }, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
	result.processes.push({ name: "browser", pid: web.process().pid });
	const page = await web.newPage();
	await page.setViewport({ width: 1280, height: 900 });
	await step("actual browser one-use admission and synthetic write", async () => {
		const { ticket } = await controlRequest(configuration, { op: "admit", origin: browserOrigin });
		await page.goto(`${browserOrigin}/__local/admit#${ticket}`, { waitUntil: "networkidle2" });
		await page.waitForSelector('[data-testid="settings-entry"]', { timeout: 90000 });
		const created = await api(page, "/api/chats", "POST", { title: "zz-prove-it-browser-shared" });
		assert.equal(created.status, 200);
		result.chatId = created.body.id;
		const status = await api(page, "/api/runtime");
		assert.equal(status.body.pid, service.child.pid);
		assert.equal(status.body.revision, build.revision);
		return { chatId: result.chatId, status: status.body };
	});
	const desktop = await shell("shell-first");
	await step("packaged shell attaches with same data and writes back to browser", async () => {
		const record = await api(desktop.page, `/api/chats/${result.chatId}`);
		assert.equal(record.body.title, "zz-prove-it-browser-shared");
		assert.equal((await api(desktop.page, `/api/chats/${result.chatId}`, "PUT", { title: "zz-prove-it-desktop-shared" })).status, 200);
		assert.equal((await api(page, `/api/chats/${result.chatId}`)).body.title, "zz-prove-it-desktop-shared");
		assert.equal(await desktop.page.evaluate(() => window.lh?.subscriptionTransport), "web");
		const status = await api(desktop.page, "/api/runtime");
		assert.equal(status.body.pid, service.child.pid);
		const connections = await api(desktop.page, "/api/subscriptions");
		assert.equal(connections.status, 403, "Subscription controls retain their explicit header requirement");
		const controls = await desktop.page.evaluate(async () => (await fetch("/api/subscriptions", { headers: { "x-learnharness-subscriptions": "1" } })).json());
		assert.equal(controls.chatgpt.accounts.length, 0);
		return { profileId: status.body.profileId, transport: "web", nativeConnections: controls.native.length };
	});
	await step("matching web and packaged General status without upstream controls", async () => {
		const desktopText = await settings(desktop.page, "desktop-settings.png");
		const browserText = await settings(page, "browser-settings.png");
		assert.equal(desktopText, browserText);
		assert.ok(desktopText.includes(build.revision));
		return { desktopText, browserText };
	});
	await step("repeated launch cannot start another backend", async () => {
		const repeated = await start("shell-second", [`--local-service=${path.join(runtime, "service.json")}`, "--no-sandbox", "--ozone-platform=wayland", "--disable-gpu"]);
		if (repeated.child.exitCode === null) await once(repeated.child, "exit");
		assert.equal(repeated.child.exitCode, 0);
		assert.equal((await api(page, "/api/runtime")).body.pid, service.child.pid);
		return { repeatedExit: repeated.child.exitCode, servicePid: service.child.pid };
	});
	await step("wrong revision and profile are refused even with an existing shell", async () => {
		const file = path.join(runtime, "service.json");
		const original = fs.readFileSync(file);
		try {
			fs.writeFileSync(file, JSON.stringify({ ...configuration, revision: "f".repeat(40) }));
			const wrong = await start("shell-wrong-revision", [`--local-service=${file}`, "--no-sandbox", "--ozone-platform=wayland", "--disable-gpu"]);
			if (wrong.child.exitCode === null) await once(wrong.child, "exit");
			assert.equal(wrong.child.exitCode, 1);
		} finally { fs.writeFileSync(file, original); }
		const wrongProfile = await start("shell-wrong-profile", [`--local-service=${file}`, "--no-sandbox", "--ozone-platform=wayland", "--disable-gpu"], { LH_PROFILE_DIR: path.join(home, "wrong") });
		if (wrongProfile.child.exitCode === null) await once(wrongProfile.child, "exit");
		assert.equal(wrongProfile.child.exitCode, 1);
		const privateConflict = await start("shell-private-profile-conflict", ["--no-sandbox", "--ozone-platform=wayland", "--disable-gpu"], { LH_PROFILE_DIR: undefined, XDG_CONFIG_HOME: home });
		if (privateConflict.child.exitCode === null) await once(privateConflict.child, "exit");
		assert.equal(privateConflict.child.exitCode, 1);
		assert.equal(fs.existsSync(path.join(profile, "SingletonLock")), false, "Refused private launch must not poison the managed backup tree with browser symlinks");
		assert.equal((await api(page, "/api/runtime")).body.pid, service.child.pid);
		return { wrongRevisionExit: 1, wrongProfileExit: 1, privateProfileConflictExit: 1, existingServiceUnchanged: true };
	});
	await step("closing and reopening shell preserves independently running service and data", async () => {
		await desktop.page.evaluate(() => window.close()).catch(() => {});
		await waitFor(() => { assert.ok(!alive(desktop.owner)); return true; }, 15000);
		assert.ok(alive(service.owner));
		assert.equal((await api(page, `/api/chats/${result.chatId}`)).body.title, "zz-prove-it-desktop-shared");
		const reopened = await shell("shell-reopened");
		assert.equal((await api(reopened.page, `/api/chats/${result.chatId}`)).body.title, "zz-prove-it-desktop-shared");
		assert.equal((await api(reopened.page, "/api/runtime")).body.pid, service.child.pid);
		return { servicePid: service.child.pid, reopenedPid: reopened.child.pid, shellCacheOutsideProfile: fs.existsSync(`${profile}-shell`) };
	});
	result.status = "checks-passed";
} catch (error) { result.status = "failed"; result.error = error.message; process.exitCode = 1; }
finally {
	try { await web?.close(); } catch {}
	for (const browser of browsers.reverse()) { try { browser.connected && await browser.disconnect(); } catch {} }
	try {
		for (const owner of owners.reverse()) await stopOwned(owner);
		for (const owner of owners) assert.ok(!alive(owner));
		result.cleanup = "passed";
	} catch (error) { result.cleanup = "failed"; result.cleanupError = error.message; process.exitCode = 1; }
	result.finishedAt = new Date().toISOString(); save();
	console.log(JSON.stringify({ status: result.status, cleanup: result.cleanup, evidence: directory, error: result.error }));
}
