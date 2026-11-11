#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { fixture, source } from "../tests/workflow/fixture.mjs";
import { alive, delay, freePort, git, ownedGroup, readState } from "./lib/ticket-state.mjs";

const run = path.join(source, ".prove-it", "runs", `${new Date().toISOString().replaceAll(":", "-")}-zz-prove-it-ticket-previews`);
fs.mkdirSync(run, { recursive: true });
const result = { source: { revision: git(source, "rev-parse", "HEAD"), dirty: Boolean(git(source, "status", "--porcelain")) }, startedAt: new Date().toISOString(), status: "running", steps: [], fixture: null, limitations: ["Loopback CI uses one disposable browser context per source: ports alone do not isolate cookies. This drive does not certify same-context private HTTPS hostname isolation, native/helper parity or the actual ten-minute expiry."] };
function save() { fs.writeFileSync(path.join(run, "result.json"), JSON.stringify(result, null, 2)); }
async function step(name, operation) {
	const record = { name, status: "running", startedAt: new Date().toISOString() };
	result.steps.push(record);
	save();
	console.log(`Starting: ${name}`);
	try { record.evidence = await operation(); record.status = "passed"; }
	catch (error) { record.status = "failed"; record.error = error.stack; throw error; }
	finally { record.finishedAt = new Date().toISOString(); save(); console.log(`${record.status}: ${name}`); }
}
const json = async (url, options) => {
	assert.equal(new URL(page.url()).origin, new URL(url).origin, "Open the source in its verified browser before application requests");
	const response = await page.evaluate(async ({ target, options }) => {
		const response = await fetch(target, { ...options, signal: AbortSignal.timeout(180_000) });
		return { status: response.status, body: await response.text() };
	}, { target: url.href, options });
	assert.equal(response.status, 200, `${url}: HTTP ${response.status}`);
	return JSON.parse(response.body);
};
const post = body => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
let environment;
let browser;
let page;
const sourcePages = new Map();
const processes = [];
const ports = new Set();
const consoleErrors = [];
let closing;
const cleanup = () => closing ??= (async () => {
	await browser?.close();
	if (environment) {
		for (const ticket of Object.values(readState(environment.state).tickets)) {
			if (ticket.process) processes.push(ticket.process);
			for (const port of [ticket.originPort, ticket.backendPort]) if (port) ports.add(port);
		}
		await environment.stop();
		for (const owner of processes) assert.ok(!alive(owner) && !ownedGroup(owner), `Owned process group ${owner.pid} leaked`);
		for (const port of [...ports, ...environment.ports]) assert.ok(await freePort(port), `Owned port ${port} leaked`);
	}
})();
for (const signal of ["SIGTERM", "SIGINT", "SIGHUP"]) process.once(signal, () => {
	result.status = "interrupted";
	result.error = signal;
	save();
	void cleanup().finally(() => process.exit(1));
});

async function ready(id) {
	return environment.waitFor(current => {
		const preview = current.tickets[id];
		assert.notEqual(preview.preview, "error", preview.error);
		return preview.preview === "running";
	}, `${id}: real snapshot build and runtime readiness`, 180_000);
}

try {
	environment = await fixture({ real: true, tailnetHost: process.env.LH_PROVE_TAILNET_HOST ?? null,
		httpsPorts: process.env.LH_PROVE_HTTPS_PORTS?.split(",").map(Number) });
	result.fixture = environment.directory;
	save();
	const originalRoot = git(environment.root, "rev-parse", "HEAD");
	await step("1,3,4: three concurrent runtimes in unique slots and nonblocking fourth preview", async () => {
		for (const id of ["alpha", "beta", "gamma", "delta"]) await environment.attach(id, id === "delta" ? "full-send" : "full-stop");
		for (const id of ["alpha", "beta", "gamma"]) {
			await environment.cli("preview", id);
			await ready(id);
			console.log(`Ready: ${id}`);
		}
		const state = await environment.waitFor(current => current.slots.every(slot => slot.ticket), "three allocated real previews", 60_000);
		assert.equal(new Set(state.slots.map(slot => slot.ticket)).size, 3);
		assert.ok(["alpha", "beta", "gamma"].every(id => state.tickets[id].preview === "running"));
		await environment.cli("preview", "delta");
		assert.deepEqual(readState(environment.state).queue, ["delta"]);
		const delivery = await environment.cli("delivery", "delta");
		assert.equal(delivery.previewBlocksDelivery, false);
		assert.equal(delivery.mergeAuthority, "selected-skill-only");
		for (const ticket of Object.values(state.tickets)) if (ticket.process) processes.push(ticket.process);
		return { slots: state.slots, queued: "delta", delivery, buildScheduling: "serial to bound CI memory; all three real runtimes overlap" };
	});
	browser = await puppeteer.launch({ executablePath: process.env.CHROMIUM_PATH ?? "/usr/bin/chromium", headless: true, userDataDir: path.join(environment.directory, "zz-prove-it-browser"), args: ["--no-sandbox", "--disable-dev-shm-usage"] });
	const alpha = readState(environment.state).tickets.alpha;
	const route = new URL("zz-prove-it", alpha.reviewUrl).href;
	async function open(url) {
		const ticket = Object.values(readState(environment.state).tickets).find(ticket => ticket.reviewUrl && new URL(ticket.reviewUrl).origin === new URL(url).origin && ticket.preview !== "none");
		assert.ok(ticket, "Review address must identify an allocated source");
		await ready(ticket.id);
		if (!sourcePages.has(ticket.origin)) {
			const context = await browser.createBrowserContext();
			const sourcePage = await context.newPage();
			await sourcePage.setViewport({ width: 375, height: 667, isMobile: true, hasTouch: true });
			sourcePage.setDefaultNavigationTimeout(180_000);
			sourcePage.on("pageerror", error => consoleErrors.push(error.message));
			await sourcePage.setRequestInterception(true);
			sourcePage.on("request", request => {
				const target = new URL(request.url());
				if (["127.0.0.1", process.env.LH_PROVE_TAILNET_HOST].includes(target.hostname) || ["data:", "blob:"].includes(target.protocol)) void request.continue();
				else void request.abort();
			});
			sourcePages.set(ticket.origin, sourcePage);
		}
		page = sourcePages.get(ticket.origin);
		let last;
		for (let attempt = 0; attempt < 30; attempt++) {
			try {
				const response = await page.goto(url, { waitUntil: "domcontentloaded" });
				assert.equal(response.status(), 200);
				await page.waitForSelector('[data-proof="source"]', { timeout: 10_000 });
				return;
			} catch (error) { last = error; await delay(1000); }
		}
		throw last;
	}
	await step("5: running app starts with empty settings/sessions/credential resolution", async () => {
		await open(route);
		assert.equal(new URL(page.url()).origin, new URL(alpha.origin).origin);
		const settings = await json(new URL("api/settings", alpha.origin));
		const chats = await json(new URL("api/chats", alpha.origin));
		const keys = await json(new URL("api/keys", alpha.origin));
		assert.equal(settings.settings, null);
		assert.deepEqual(chats.chats, []);
		assert.ok(keys.keys.every(key => key.present === false && key.source === "none"));
		assert.ok(!fs.existsSync(path.join(alpha.profile, "auth", "auth.json")));
		return { settings, chats, credentialRows: keys.keys.map(key => ({ id: key.id, present: key.present, source: key.source })), origin: page.url() };
	});
	let alphaSourceEdit;
	await step("6: running snapshot stays immutable after a dirty worktree edit", async () => {
		const file = path.join(alpha.worktree, "app", "zz-prove-it", "page.tsx");
		const original = fs.readFileSync(file, "utf8");
		const before = await page.$eval('[data-proof="source"]', node => node.textContent);
		const servingSourceHash = readState(environment.state).tickets.alpha.sandbox.sourceHash;
		assert.match(servingSourceHash, /^[a-f0-9]{64}$/);
		fs.writeFileSync(file, original.replace("zz-prove-it-original", "zz-prove-it-alpha-revised"));
		await open(route);
		assert.equal(await page.$eval('[data-proof="source"]', node => node.textContent), before);
		assert.equal(readState(environment.state).tickets.alpha.sandbox.sourceHash, servingSourceHash);
		assert.ok(fs.readFileSync(path.join(environment.root, "app", "zz-prove-it", "page.tsx"), "utf8").includes("zz-prove-it-original"));
		await page.screenshot({ path: path.join(run, "worktree-preview.png") });
		alphaSourceEdit = { file, original, servingSourceHash };
		return { before, after: before, dirtyEditPendingReopen: "zz-prove-it-alpha-revised", servingSourceHash, review: alpha.reviewUrl, origin: alpha.origin, rootRevisionUnchanged: git(environment.root, "rev-parse", "HEAD") === originalRoot };
	});
	let createdChat;
	await step("7: persist synthetic session, settings, credential and browser state", async () => {
		createdChat = await json(new URL("api/chats", alpha.origin), post({ title: "zz-prove-it-alpha-session" }));
		await json(new URL("api/settings/general", alpha.origin), { ...post({ autoUpdate: false }), method: "PUT" });
		fs.writeFileSync(path.join(alpha.profile, "auth", "auth.json"), JSON.stringify({ OPENAI_API_KEY: "zz-prove-it-synthetic-file-credential" }), { mode: 0o600 });
		await page.evaluate(async () => {
			localStorage.setItem("zz-prove-it-browser", "alpha");
			document.cookie = "zz-prove-it-cookie=alpha;Path=/";
			await new Promise((resolve, reject) => {
				const request = indexedDB.open("zz-prove-it-profile", 1);
				request.onupgradeneeded = () => request.result.createObjectStore("records");
				request.onerror = () => reject(request.error);
				request.onsuccess = () => {
					const transaction = request.result.transaction("records", "readwrite");
					transaction.objectStore("records").put("alpha-ink", "saved");
					transaction.oncomplete = () => { request.result.close(); resolve(); };
					transaction.onerror = () => reject(transaction.error);
				};
			});
		});
		assert.equal(await page.evaluate(() => document.cookie), "zz-prove-it-cookie=alpha");
		assert.ok((await page.browserContext().cookies()).some(cookie => cookie.name === "zz-prove-it-cookie" && cookie.value === "alpha"));
		return { chatsBefore: 0, chatsAfter: (await json(new URL("api/chats", alpha.origin))).chats.length, settingsAfter: (await json(new URL("api/settings", alpha.origin))).settings,
			credentialStored: true, browser: { localStorage: "alpha", indexedDB: "alpha-ink", cookie: "alpha" }, createdChat };
	});
	await step("7: release alpha, next occupant inherits neither server nor browser state", async () => {
		await environment.cli("release", "alpha");
		const state = await environment.waitFor(current => current.tickets.delta.preview === "running" && current.tickets.alpha.preview === "none", "queued preview promotion with real build", 180_000);
		assert.equal(state.tickets.delta.slot, alpha.slot);
		await open(new URL("zz-prove-it", state.tickets.delta.reviewUrl).href);
		assert.equal(await page.evaluate(() => localStorage.getItem("zz-prove-it-browser")), null);
		assert.equal(await page.evaluate(() => document.cookie), "");
		assert.ok(!(await page.evaluate(() => indexedDB.databases())).some(database => database.name === "zz-prove-it-profile"));
		assert.deepEqual((await json(new URL("api/chats", state.tickets.delta.origin))).chats, []);
		assert.equal((await json(new URL("api/settings", state.tickets.delta.origin))).settings, null);
		assert.ok((await json(new URL("api/keys", state.tickets.delta.origin))).keys.every(key => !key.present));
		await page.evaluate(() => { localStorage.setItem("zz-prove-it-browser", "delta"); document.cookie = "zz-prove-it-cookie=delta;Path=/"; });
		return { oldSlot: alpha.slot, nextTicket: "delta", newOrigin: state.tickets.delta.origin, inherited: false };
	});
	await step("7: reopen alpha on another slot and recover its original profile", async () => {
		await environment.cli("release", "beta");
		await environment.waitFor(current => current.tickets.beta.preview === "none", "beta release");
		await environment.cli("preview", "alpha");
		const state = await environment.waitFor(current => current.tickets.alpha.preview === "running", "alpha snapshot rebuild", 180_000);
		assert.notEqual(state.tickets.alpha.slot, alpha.slot);
		assert.equal(state.tickets.alpha.origin, alpha.origin);
		await open(new URL("zz-prove-it", state.tickets.alpha.reviewUrl).href);
		await page.waitForFunction(() => document.querySelector('[data-proof="source"]')?.textContent === "zz-prove-it-alpha-revised", { timeout: 60_000 });
		assert.notEqual(state.tickets.alpha.sandbox.sourceHash, alphaSourceEdit.servingSourceHash);
		fs.writeFileSync(alphaSourceEdit.file, alphaSourceEdit.original);
		assert.equal(await page.evaluate(() => localStorage.getItem("zz-prove-it-browser")), "alpha");
		assert.equal(await page.evaluate(() => document.cookie), "zz-prove-it-cookie=alpha");
		const ink = await page.evaluate(() => new Promise((resolve, reject) => {
			const request = indexedDB.open("zz-prove-it-profile", 1);
			request.onerror = () => reject(request.error);
			request.onsuccess = () => {
				const read = request.result.transaction("records").objectStore("records").get("saved");
				read.onsuccess = () => { resolve(read.result); request.result.close(); };
				read.onerror = () => reject(read.error);
			};
		}));
		assert.equal(ink, "alpha-ink");
		assert.equal((await json(new URL("api/chats", alpha.origin))).chats.length, 1);
		assert.equal((await json(new URL("api/settings", alpha.origin))).settings.general.autoUpdate, false);
		assert.ok((await json(new URL("api/keys", alpha.origin))).keys.some(key => key.id === "OPENAI_API_KEY" && key.present && key.source === "file"));
		return { fromSlot: alpha.slot, toSlot: state.tickets.alpha.slot, stableOrigin: alpha.origin, ink, chats: 1, settingsRetained: true, syntheticCredentialRetained: true };
	});
	await step("8: observer releases only merged ticket and stale handling preserves new owner", async () => {
		await environment.cli("preview", "beta");
		environment.setPR("gamma", 8);
		await environment.cli("pr", "gamma", "--pr", "8");
		const before = readState(environment.state);
		fs.writeFileSync(path.join(before.tickets.gamma.profile, "zz-prove-it-retained.txt"), "retained");
		environment.setPR("gamma", 8, "MERGED");
		const after = await environment.waitFor(current => current.tickets.gamma.merged && current.tickets.beta.preview === "running", "automatic release and queued allocation with real build", 180_000);
		assert.ok(!ownedGroup(before.tickets.gamma.process));
		assert.ok(alive(after.tickets.alpha.process) && alive(after.tickets.delta.process));
		await environment.cli("observe");
		await environment.cli("observe");
		assert.equal(readState(environment.state).tickets.beta.claim, after.tickets.beta.claim);
		assert.equal(fs.readFileSync(path.join(before.tickets.gamma.profile, "zz-prove-it-retained.txt"), "utf8"), "retained");
		return { beforeSlot: before.tickets.gamma.slot, afterOwner: "beta", claim: after.tickets.beta.claim, replayPreservedOwner: true, profileRetained: true, githubTransport: "disposable fake, no live merge" };
	});
	await step("exploratory preview: no ticket setup, immutable dirty-source snapshots and retained state", async () => {
		await environment.cli("release", "beta");
		await environment.waitFor(current => current.tickets.beta.preview === "none", "space for exploration", 60_000);
		const worktree = environment.exploration("spike");
		const head = git(worktree, "rev-parse", "HEAD");
		environment.env.LH_DELIVERY_SKILLS_DIR = path.join(environment.directory, "no-installed-skills");
		await environment.cli("preview", "spike", "--worktree", worktree);
		const started = await environment.waitFor(current => current.tickets.spike.preview === "running", "real exploratory snapshot build", 180_000);
		const spike = started.tickets.spike;
		processes.push(spike.process);
		assert.equal(spike.kind, "exploration");
		assert.equal(spike.delivery, null);
		assert.equal(spike.pr, null);
		assert.equal(spike.thread, null);
		const address = new URL("zz-prove-it", spike.reviewUrl).href;
		await open(address);
		const before = await page.$eval('[data-proof="source"]', node => node.textContent);
		assert.equal(before, "zz-prove-it-original");
		assert.deepEqual(await page.evaluate(() => [localStorage.getItem("zz-prove-it-browser"), document.cookie]), [null, ""]);
		assert.equal((await json(new URL("api/settings", spike.origin))).settings, null);
		const file = path.join(worktree, "app", "zz-prove-it", "page.tsx");
		fs.writeFileSync(file, fs.readFileSync(file, "utf8").replace("zz-prove-it-original", "zz-prove-it-exploratory-edit"));
		await open(address);
		assert.equal(await page.$eval('[data-proof="source"]', node => node.textContent), before);
		await json(new URL("api/settings/general", spike.origin), { ...post({ autoUpdate: false }), method: "PUT" });
		await page.evaluate(() => localStorage.setItem("zz-prove-it-browser", "exploratory"));
		await environment.cli("release", "spike");
		await environment.waitFor(current => current.tickets.spike.preview === "none", "exploratory stop", 60_000);
		assert.ok(!ownedGroup(spike.process));
		await environment.cli("preview", "spike");
		const reopened = await environment.waitFor(current => current.tickets.spike.preview === "running", "exploratory snapshot rebuild", 180_000);
		processes.push(reopened.tickets.spike.process);
		assert.equal(reopened.tickets.spike.origin, spike.origin);
		await open(address);
		await page.waitForFunction(() => document.querySelector('[data-proof="source"]')?.textContent === "zz-prove-it-exploratory-edit", { timeout: 60_000 });
		await page.screenshot({ path: path.join(run, "exploratory-preview.png") });
		assert.equal(await page.evaluate(() => localStorage.getItem("zz-prove-it-browser")), "exploratory");
		assert.equal((await json(new URL("api/settings", spike.origin))).settings.general.autoUpdate, false);
		assert.equal(git(worktree, "rev-parse", "HEAD"), head);
		assert.equal(git(worktree, "branch", "--show-current"), "");
		assert.ok(fs.readFileSync(file, "utf8").includes("zz-prove-it-exploratory-edit"));
		return { before, after: "zz-prove-it-exploratory-edit", origin: spike.origin, sameOriginAfterReopen: true, settingsRetained: true, browserStateRetained: true, sourceUncommitted: true, sourceHeadUnchanged: true, ticketSetup: false };
	});
	await step("privacy/source boundary and owned-process cleanup", async () => {
		assert.equal(git(environment.root, "branch", "--show-current"), "main");
		assert.equal(git(environment.root, "rev-parse", "HEAD"), originalRoot);
		fs.writeFileSync(path.join(run, "console-errors.json"), JSON.stringify(consoleErrors, null, 2));
		await cleanup();
		return { rootUnchanged: true, ownedProcessesStopped: true, portsReleased: true, profilesRetained: true, consoleErrors };
	});
	result.status = "passed";
} catch (error) {
	result.status = "failed";
	result.error = error.stack;
	try { if (page && !page.isClosed()) await page.screenshot({ path: path.join(run, "failure.png") }); } catch {}
	console.error(error);
	process.exitCode = 1;
} finally {
	try { await cleanup(); } catch (error) { result.status = "failed"; result.cleanupError = error.stack; process.exitCode = 1; }
	result.finishedAt = new Date().toISOString();
	if (environment) {
		result.source.fixtureRevision = git(environment.root, "rev-parse", "HEAD");
		result.source.copiedProofSha256 = createHash("sha256").update(fs.readFileSync(path.join(environment.root, "scripts/ticket.mjs"))).digest("hex");
	}
	save();
	console.log(`Workflow preview checks ${result.status}; evidence: ${run}`);
}
