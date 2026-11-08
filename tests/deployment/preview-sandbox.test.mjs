import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { inspectDependencies, prepareSandbox, spawnSandbox } from "../../scripts/lib/preview-sandbox.mjs";
import { connectPinnedSocket, proxyFor, scopedCookies, scopedSetCookie } from "../../scripts/lib/preview-proxy.mjs";
import { leaseExpired, newLaunch, PREVIEW_LIFETIME_MS, supervise, supervisorPath } from "../../scripts/lib/preview-supervisor.mjs";
import { clearLease } from "../../scripts/lib/ticket-preview.mjs";
import { alive, choosePort, delay, ownerOf, stopOwned } from "../../scripts/lib/ticket-state.mjs";

const root = path.resolve(import.meta.dirname, "../..");
let sandbox;
function fixture() {
	if (!sandbox) sandbox = prepareSandbox({ worktree: root, profile: fs.mkdtempSync(path.join(os.tmpdir(), "lh-test-profile-")), lease: "attack-test" });
	return sandbox;
}
async function execute(command, options) {
	const child = spawnSandbox(fixture(), command, { ...options, stdio: ["ignore", "pipe", "pipe"] });
	let output = "";
	let errors = "";
	child.stdout.on("data", chunk => { output += chunk; });
	child.stderr.on("data", chunk => { errors += chunk; });
	const code = await new Promise((resolve, reject) => { child.once("error", reject); child.once("exit", resolve); });
	assert.equal(code, 0, errors);
	return JSON.parse(output);
}

test("actual build and runtime namespaces deny host files, environment, network, sockets and native bridge", async () => {
	const host = fs.mkdtempSync("/tmp/lh-host-canary-");
	const marker = path.join(host, "secret");
	fs.writeFileSync(marker, "synthetic-private-value");
	const service = net.createServer(socket => socket.end("host service"));
	await new Promise(resolve => service.listen(0, "127.0.0.1", resolve));
	const socketPath = path.join(host, "unrelated.sock");
	const unix = net.createServer(socket => socket.end("host unix"));
	await new Promise(resolve => unix.listen(socketPath, resolve));
	const original = process.env.OPENAI_API_KEY;
	process.env.OPENAI_API_KEY = "synthetic-ambient-secret";
	try {
		for (const stage of ["build", "runtime"]) {
			const command = `const fs=require('node:fs');const net=require('node:net');(async()=>{const denied=Object.fromEntries(${JSON.stringify([marker, process.env.HOME, root + "/.git", root + "/node_modules", socketPath, "/run/user/1000", "/proc/" + process.pid])}.map(filename=>{try{fs.accessSync(filename);return[filename,false]}catch{return[filename,true]}}));const targets=[{host:'127.0.0.1',port:${service.address().port}},{host:'100.100.100.100',port:443},{host:'1.1.1.1',port:443},{path:${JSON.stringify(socketPath)}}];const network=await Promise.all(targets.map(target=>new Promise(resolve=>{const socket=net.connect(target);socket.setTimeout(500);socket.once('connect',()=>{socket.destroy();resolve(false)});socket.once('error',()=>resolve(true));socket.once('timeout',()=>{socket.destroy();resolve(true)})})));let noSignal=false;try{process.kill(${process.pid},0)}catch{noSignal=true}console.log(JSON.stringify({denied,network,noSignal,ambient:!!process.env.OPENAI_API_KEY,native:!!process.env.LH_DESKTOP_SERVER,helper:process.env.LH_PREVIEW_HELPER_SOCKET??null,stage:${JSON.stringify(stage)}}))})()`;
			const report = await execute(["-e", command], { lease: "attack-test" });
			assert.ok(Object.values(report.denied).every(Boolean), JSON.stringify(report));
			assert.ok(report.network.every(Boolean));
			assert.equal(report.noSignal, true);
			assert.equal(report.ambient, false);
			assert.equal(report.native, false);
			assert.equal(report.helper, null);
			assert.equal(report.stage, stage);
		}
	} finally {
		if (original === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = original;
		await Promise.all([new Promise(resolve => service.close(resolve)), new Promise(resolve => unix.close(resolve))]);
	}
});

test("only an explicitly injected per-lease helper Unix capability can be reached", async () => {
	const directory = fs.mkdtempSync("/tmp/lh-helper-");
	const socketPath = path.join(directory, "helper.sock");
	const helper = net.createServer(socket => socket.end("synthetic-capability-not-provider-credentials"));
	await new Promise(resolve => helper.listen(socketPath, resolve));
	try {
		const report = await execute(["-e", "const net=require('node:net');const socket=net.connect(process.env.LH_PREVIEW_HELPER_SOCKET);socket.on('data',data=>console.log(JSON.stringify({value:String(data),lease:process.env.LH_PREVIEW_LEASE})));socket.on('error',()=>process.exit(2))"], { lease: "approved-lease", helperSocket: socketPath });
		assert.equal(report.value, "synthetic-capability-not-provider-credentials");
		assert.equal(report.lease, "approved-lease");
	} finally { await new Promise(resolve => helper.close(resolve)); }
});

test("dependency mounts reject dotenv secrets, escaping symlinks and unrelated sockets", async () => {
	const directory = fs.mkdtempSync("/tmp/lh-dependency-");
	const secret = path.join(directory, ".env.local");
	fs.writeFileSync(secret, "SYNTHETIC_SECRET=not-a-real-credential");
	assert.throws(() => inspectDependencies(directory), /forbidden/);
	fs.unlinkSync(secret);
	const link = path.join(directory, "ambient-link");
	fs.symlinkSync(process.env.HOME, link);
	assert.throws(() => inspectDependencies(directory), /escapes/);
	fs.unlinkSync(link);
	const socketPath = path.join(directory, "ambient.sock");
	const service = net.createServer();
	await new Promise(resolve => service.listen(socketPath, resolve));
	try { assert.throws(() => inspectDependencies(directory), /non-regular/); }
	finally { await new Promise(resolve => service.close(resolve)); }
});

test("a broken namespace prerequisite fails closed without executing the command on the host", async () => {
	const base = fixture();
	const marker = path.join(base.profile, "must-not-exist");
	const child = spawnSandbox({ ...base, dependencies: "/this-explicit-dependency-does-not-exist" }, ["-e", `require('node:fs').writeFileSync(${JSON.stringify(marker)},'unsafe')`], { stdio: "ignore" });
	const code = await new Promise((resolve, reject) => { child.once("error", reject); child.once("exit", resolve); });
	assert.notEqual(code, 0);
	assert.equal(fs.existsSync(marker), false);
});

test("proxy strips private request headers and normal cookies, and normalizes only valid namespaced Set-Cookie", async () => {
	assert.equal(scopedCookies("normal=secret; lh-preview-test__session=own; lh-preview-other__session=other", "lh-preview-test__"), "session=own");
	assert.equal(scopedSetCookie("session=value; Domain=localhost", "preview__", false), null);
	assert.equal(scopedSetCookie("session=value; Path=/escape", "preview__", false), null);
	assert.equal(scopedSetCookie("session=value; Path=/; Path=/escape", "preview__", false), null);
	assert.equal(scopedSetCookie("session=value; Unknown=thing", "preview__", false), null);
	assert.equal(scopedSetCookie("session=value; SameSite=None", "preview__", true), "preview__session=value; Path=/; SameSite=Strict; HttpOnly; Secure");
	const directory = fs.mkdtempSync("/tmp/lh-proxy-");
	const socketPath = path.join(directory, "app.sock");
	let requests = 0;
	const upstream = http.createServer((request, response) => { requests++; response.setHeader("set-cookie", ["session=own; Path=/; SameSite=None", "escape=x; Domain=localhost", "escape=x; Path=/other"]); response.setHeader("clear-site-data", '"*"'); response.end(JSON.stringify(request.headers)); });
	await new Promise(resolve => upstream.listen(socketPath, resolve));
	const port = await choosePort(28600);
	const ticket = { id: "test", origin: `http://127.0.0.1:${port}/` };
	const proxy = proxyFor(ticket, socketPath);
	await new Promise(resolve => proxy.listen(port, "127.0.0.1", resolve));
	try {
		const response = await fetch(ticket.origin, { headers: { "sec-ch-ua": '"Chromium";v="152"', cookie: "normal=secret; lh-preview-test__session=own", authorization: "private", "x-lh-desktop-secret": "private", "x-forwarded-for": "private", "x-learnharness-subscriptions": "1" } });
		assert.equal(response.status, 200);
		const headers = await response.json();
		assert.equal(headers.cookie, "session=own");
		assert.equal(headers["x-learnharness-subscriptions"], "1");
		for (const name of ["authorization", "x-lh-desktop-secret", "x-forwarded-for"]) assert.equal(headers[name], undefined);
		assert.deepEqual(response.headers.getSetCookie(), ["lh-preview-test__session=own; Path=/; SameSite=Strict; HttpOnly"]);
		assert.equal(response.headers.get("clear-site-data"), null);
		assert.match(response.headers.get("content-security-policy"), /connect-src 'self'/);
		for (const site of ["same-site", "cross-site"]) {
			const refused = await fetch(ticket.origin, { headers: { cookie: "lh-preview-test__session=own", "sec-fetch-site": site } });
			assert.equal(refused.status, 403);
			assert.equal(requests, 1);
		}
	} finally {
		proxy.stopUpgrades(); proxy.closeAllConnections(); upstream.closeAllConnections();
		await Promise.all([new Promise(resolve => proxy.close(resolve)), new Promise(resolve => upstream.close(resolve))]);
	}
});

test("a malicious transport symlink cannot redirect trusted proxy traffic to a host Unix service", async () => {
	const directory = fs.mkdtempSync("/tmp/lh-pin-");
	const target = path.join(directory, "unrelated.sock");
	const socketPath = path.join(directory, "app.sock");
	const server = net.createServer(socket => socket.end("must not be reached"));
	await new Promise(resolve => server.listen(target, resolve));
	fs.symlinkSync(target, socketPath);
	try { assert.throws(() => connectPinnedSocket(socketPath), /socket/); }
	finally { await new Promise(resolve => server.close(resolve)); }
});

test("hard launch deadline is fixed, monotonic, boot-aware and matching-lease release cannot evict replacement", () => {
	const launch = newLaunch();
	assert.equal(launch.deadline - launch.started, PREVIEW_LIFETIME_MS);
	assert.equal(PREVIEW_LIFETIME_MS, 600_000);
	assert.equal(leaseExpired(launch, launch.deadline - 1, launch.boot), false);
	assert.equal(leaseExpired(launch, launch.deadline, launch.boot), true);
	assert.equal(leaseExpired(launch, launch.started, "different-boot"), true);
	const state = { tickets: { first: { claim: "replacement" } }, slots: [{ ticket: "first", claim: "replacement" }], queue: ["second", "third"] };
	assert.equal(clearLease(state, "first", "stale"), false);
	assert.equal(state.tickets.first.claim, "replacement");
	assert.equal(clearLease(state, "first", "replacement"), true);
	assert.equal(state.slots[0].ticket, null);
	assert.deepEqual(state.queue, ["second", "third"]);
});

test("supervisor invokes its trusted revoke hook on pre-expiry and sandbox prerequisite failure", async () => {
	const directory = fs.mkdtempSync("/tmp/lh-revoke-");
	const calls = [];
	const launch = newLaunch();
	await supervise({ ticketId: "early-expired", lease: "expired", eventPath: path.join(directory, "expired.json"), launch: { ...launch, started: launch.started - PREVIEW_LIFETIME_MS, deadline: launch.deadline - PREVIEW_LIFETIME_MS } }, { revokeHelper: async value => calls.push(value) });
	await supervise({ ticketId: "failed", lease: "failed", eventPath: path.join(directory, "failed.json"), launch: newLaunch(), sandbox: { ...fixture(), dependencies: "/missing-explicit-dependency" } }, { revokeHelper: async value => calls.push(value) });
	assert.deepEqual(calls.map(value => [value.ticketId, value.lease, value.reason]), [["early-expired", "expired", "expired"], ["failed", "failed", "failed"]]);
	assert.equal(JSON.parse(fs.readFileSync(path.join(directory, "expired.json"))).status, "expired");
	assert.equal(JSON.parse(fs.readFileSync(path.join(directory, "failed.json"))).status, "failed");
});

test("supervisor stop kills namespace descendants even after untrusted detach; synthetic state survives", async () => {
	const base = fixture();
	const directory = fs.mkdtempSync("/tmp/lh-stop-");
	const dependencies = path.join(directory, "dependencies");
	fs.mkdirSync(path.join(dependencies, "next", "dist", "bin"), { recursive: true });
	fs.writeFileSync(path.join(dependencies, "next", "dist", "bin", "next"), "process.exit(0)");
	fs.writeFileSync(path.join(dependencies, "next", "index.js"), "module.exports=()=>({prepare:async()=>{require('node:child_process').spawn(process.execPath,['-e',`setInterval(()=>require('node:fs').appendFileSync('/state/data/heartbeat','x'),50)`],{detached:true,stdio:'ignore'}).unref()},getRequestHandler:()=>((request,response)=>response.end('fixture')),getUpgradeHandler:()=>((request,socket)=>socket.destroy())})");
	const transport = fs.mkdtempSync("/tmp/lh-stop-sock-");
	const config = { ticketId: "stop-test", lease: "stop-test", launch: newLaunch(), eventPath: path.join(directory, "event.json"), sandbox: { ...base, dependencies, transport, socketPath: path.join(transport, "app.sock") } };
	const filename = path.join(directory, "config.json");
	fs.writeFileSync(filename, JSON.stringify(config));
	const child = spawn(process.execPath, [supervisorPath, filename], { detached: true, stdio: "ignore", env: { HOME: process.env.HOME, PATH: "/usr/bin" } });
	const owner = ownerOf(child.pid);
	const heartbeat = path.join(base.profile, "data", "heartbeat");
	try {
		const deadline = Date.now() + 10_000;
		while (!fs.existsSync(heartbeat)) { assert.ok(alive(owner)); assert.ok(Date.now() < deadline, "Fixture startup timed out"); await delay(50); }
		await stopOwned(owner);
		const size = fs.statSync(heartbeat).size;
		await delay(300);
		assert.equal(fs.statSync(heartbeat).size, size);
		assert.equal(JSON.parse(fs.readFileSync(config.eventPath, "utf8")).status, "stopped");
	} finally { await stopOwned(owner); }
	const abruptTransport = fs.mkdtempSync("/tmp/lh-abrupt-");
	const abruptConfig = { ...config, lease: "abrupt-parent", launch: newLaunch(), eventPath: path.join(directory, "abrupt-event.json"), sandbox: { ...config.sandbox, transport: abruptTransport, socketPath: path.join(abruptTransport, "app.sock") } };
	const abruptFilename = path.join(directory, "abrupt-config.json");
	fs.writeFileSync(abruptFilename, JSON.stringify(abruptConfig));
	fs.writeFileSync(heartbeat, "");
	const abruptChild = spawn(process.execPath, [supervisorPath, abruptFilename], { detached: true, stdio: "ignore", env: { HOME: process.env.HOME, PATH: "/usr/bin" } });
	const abruptOwner = ownerOf(abruptChild.pid);
	let descendants = [];
	try {
		const deadline = Date.now() + 10_000;
		while (fs.statSync(heartbeat).size === 0) { assert.ok(alive(abruptOwner)); assert.ok(Date.now() < deadline); await delay(50); }
		descendants = fs.readFileSync(`/proc/${abruptOwner.pid}/task/${abruptOwner.pid}/children`, "utf8").trim().split(/\s+/).filter(Boolean).map(value => ownerOf(Number(value)));
		process.kill(abruptOwner.pid, "SIGKILL");
		while (alive(abruptOwner)) await delay(10);
		await delay(300);
		const size = fs.statSync(heartbeat).size;
		await delay(300);
		assert.equal(fs.statSync(heartbeat).size, size, "Bubblewrap must kill detached namespace descendants when its supervisor dies abruptly");
	} finally {
		await stopOwned(abruptOwner);
		for (const descendant of descendants) if (alive(descendant)) process.kill(descendant.pid, "SIGKILL");
	}
});
