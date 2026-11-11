import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { mock, test } from "node:test";
import { fileURLToPath } from "node:url";
import { prepareSandbox } from "../../scripts/lib/preview-sandbox.mjs";
import { newLaunch } from "../../scripts/lib/preview-supervisor.mjs";
import { alive, choosePort, delay, locked, ownerOf, readState, writeState } from "../../scripts/lib/ticket-state.mjs";

test("real manager releases only matching expired/stopped leases, revokes helpers and advances FIFO", async () => {
	if (!process.execArgv.includes("--experimental-test-module-mocks")) {
		const environment = { ...process.env };
		delete environment.NODE_TEST_CONTEXT;
		const output = execFileSync(process.execPath, ["--experimental-test-module-mocks", "--test", fileURLToPath(import.meta.url)], { encoding: "utf8", env: environment, timeout: 30_000 });
		assert.match(output, /Manager fixture evidence:/);
		console.log(output);
		return;
	}
	const root = path.resolve(import.meta.dirname, "../..");
	const directory = fs.mkdtempSync("/tmp/lh-manager-");
	const profile = path.join(directory, "template-profile");
	fs.mkdirSync(profile);
	const sandbox = prepareSandbox({ worktree: root, profile, lease: "manager-template" });
	const dependencies = path.join(directory, "dependencies");
	fs.mkdirSync(path.join(dependencies, "next", "dist", "bin"), { recursive: true });
	fs.writeFileSync(path.join(dependencies, "next", "dist", "bin", "next"), "process.exit(0)");
	fs.writeFileSync(path.join(dependencies, "next", "index.js"), "module.exports=()=>({prepare:async()=>{},getRequestHandler:()=>((request,response)=>{require('node:fs').writeFileSync('/state/data/retained','synthetic-retained');response.end('sandboxed-manager-fixture')}),getUpgradeHandler:()=>((request,socket)=>socket.destroy())})");
	const worker = path.join(directory, "worker.mjs");
	fs.writeFileSync(worker, `import fs from 'node:fs';import path from 'node:path';import {supervise} from ${JSON.stringify(new URL("../../scripts/lib/preview-supervisor.mjs", import.meta.url).href)};const config=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));for(const name of ['home','data','auth'])fs.mkdirSync(path.join(config.profile,name),{recursive:true});const transport=fs.mkdtempSync('/tmp/lhm-');config.sandbox={...${JSON.stringify(sandbox)},dependencies:${JSON.stringify(dependencies)},profile:config.profile,transport,socketPath:path.join(transport,'app.sock')};await supervise(config);`);
	const original = await import("../../scripts/lib/preview-supervisor.mjs");
	mock.module(new URL("../../scripts/lib/preview-supervisor.mjs", import.meta.url).href, { exports: { ...original, supervisorPath: worker, newLaunch: () => { const launch = newLaunch(); return { ...launch, started: launch.started - 595_000, deadline: launch.deadline - 595_000 }; } } });
	const { runManager, clearLease } = await import("../../scripts/lib/ticket-preview.mjs");
	const ports = [];
	for (let index = 0; index < 9; index++) ports.push(await choosePort(28700 + index, ports));
	const ids = ["one", "two", "three", "four", "five"];
	const tickets = Object.fromEntries(ids.map((id, index) => {
		const retainedProfile = path.join(directory, id);
		fs.mkdirSync(retainedProfile);
		return [id, { id, worktree: root, profile: retainedProfile, preview: "queued", originPort: ports[index + 3], origin: `http://127.0.0.1:${ports[index + 3]}/` }];
	}));
	writeState(directory, { schemaVersion: 1, root, tickets, queue: ids, manager: ownerOf(process.pid), slots: ports.slice(0, 3).map((port, index) => ({ id: index + 1, port, ticket: null, claim: null })), observationIntervalMs: 30_000, tailnetHost: null });
	const issues = [];
	const revocations = [];
	const running = runManager(directory, { helper: { issue: async value => { issues.push(value); return null; }, revoke: async value => { revocations.push(value); } } });
	async function waitFor(predicate, label) {
		const deadline = Date.now() + 15_000;
		while (!predicate(readState(directory))) { assert.ok(Date.now() < deadline, label + ": " + JSON.stringify(readState(directory))); await delay(50); }
		return readState(directory);
	}
	try {
		const first = await waitFor(state => ["one", "two", "three"].every(id => state.tickets[id].preview === "running"), "first three runtime sockets");
		assert.deepEqual(issues.map(issue => issue.ticketId), ["one", "two", "three"]);
		assert.deepEqual(first.queue, ["four", "five"]);
		for (const id of ["one", "two", "three"]) assert.equal(await (await fetch(first.tickets[id].origin, { headers: { "Sec-CH-UA": '"Chromium";v="152"' } })).text(), "sandboxed-manager-fixture");
		const advanced = await waitFor(state => state.tickets.four.preview === "running" && state.tickets.five.preview === "running", "expiry advances FIFO");
		assert.deepEqual(issues.slice(3).map(issue => issue.ticketId), ["four", "five"]);
		assert.ok(["one", "two", "three"].every(id => revocations.some(value => value.ticketId === id && value.lease === first.tickets[id].claim && value.reason === "expired")));
		assert.ok(["one", "two", "three"].every(id => !alive(first.tickets[id].process)));
		assert.equal(fs.readFileSync(path.join(first.tickets.one.profile, "data", "retained"), "utf8"), "synthetic-retained");
		await locked(directory, state => { state.tickets.one.preview = "queued"; state.queue.push("one"); });
		const replacement = await waitFor(state => state.tickets.one.preview === "running", "reopened retained preview");
		assert.notEqual(replacement.tickets.one.claim, first.tickets.one.claim);
		assert.equal(replacement.tickets.one.origin, first.tickets.one.origin);
		await locked(directory, state => { assert.equal(clearLease(state, "one", first.tickets.one.claim), false); });
		fs.writeFileSync(replacement.tickets.one.eventPath, JSON.stringify({ lease: first.tickets.one.claim, status: "expired" }));
		await delay(500);
		assert.equal(readState(directory).tickets.one.claim, replacement.tickets.one.claim);
		assert.ok(alive(replacement.tickets.one.process));
		await locked(directory, state => { state.tickets.four.preview = "releasing"; });
		await waitFor(state => !state.tickets.four.claim, "manual stop");
		assert.ok(revocations.some(value => value.ticketId === "four" && value.lease === advanced.tickets.four.claim && value.reason === "stopped"));
		fs.writeFileSync(path.join(directory, "proof.json"), JSON.stringify({ clock: "focused test launch backdated by 595000ms; production lifetime unchanged", issues, revocations, first, advanced, replacement }, null, 2));
		console.log(`Manager fixture evidence: ${directory}/proof.json`);
	} finally {
		process.emit("SIGTERM");
		await running;
		mock.restoreAll();
		assert.ok(readState(directory).slots.every(slot => !slot.ticket));
	}
});
