import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { prepareSandbox } from "./lib/preview-sandbox.mjs";
import { newLaunch, supervisorPath } from "./lib/preview-supervisor.mjs";
import { proxyFor } from "./lib/preview-proxy.mjs";
import { alive, choosePort, delay, ownerOf, stopOwned } from "./lib/ticket-state.mjs";
import { clearLease } from "./lib/ticket-preview.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const run = path.resolve(process.argv[2] ?? path.join(root, ".prove-it", "runs", `${new Date().toISOString().replaceAll(":", "-")}-preview-sandbox-lifetime`));
fs.mkdirSync(run, { recursive: true, mode: 0o700 });
const record = { status: "running", checker: "same agent (not independent)", deploymentAcceptance: "BLOCKED", startedAt: new Date().toISOString(), checks: [], limitations: ["Full LearnHarness build requires network-fetched Google Fonts; no network exception granted", "Tailnet per-ticket mappings lack scoped authority", "Normal same-host browser cookies are not isolated by ports or a JavaScript cookie override", "Trusted helper and native GUI parity remain separate work", "Final checker must independently evaluate all deployment requirements"] };
const save = () => fs.writeFileSync(path.join(run, "result.json"), JSON.stringify(record, null, 2));
const step = (name, evidence) => { record.checks.push({ name, evidence, time: new Date().toISOString() }); save(); };
const hostCanary = path.join(run, "host-only-canary");
fs.writeFileSync(hostCanary, "synthetic-host-only-no-real-data");
const loopback = net.createServer(socket => socket.end("unrelated-host-service"));
await new Promise(resolve => loopback.listen(0, "127.0.0.1", resolve));
const unrelated = net.createServer(socket => socket.end("unrelated-unix-service"));
const unrelatedDirectory = fs.mkdtempSync("/tmp/lhu-");
const unrelatedSocket = path.join(unrelatedDirectory, "service.sock");
await new Promise(resolve => unrelated.listen(unrelatedSocket, resolve));
const profile = path.join(run, "synthetic-profile");
fs.mkdirSync(profile, { mode: 0o700 });
const sandbox = prepareSandbox({ worktree: root, profile, lease: "real-ten-minute-lease" });
const fixture = path.join(sandbox.directory, "next-fixture");
fs.mkdirSync(path.join(fixture, "app", "api", "probe"), { recursive: true });
const probe = `const fs=require('node:fs');const net=require('node:net');module.exports=async function(){const filenames=${JSON.stringify([hostCanary, process.env.HOME, root + "/.git", root + "/node_modules", unrelatedSocket, "/run/user/1000", "/proc/1/root" + hostCanary])};const denied=Object.fromEntries(filenames.map(filename=>{try{fs.accessSync(filename);return[filename,false]}catch{return[filename,true]}}));const targets=[{host:'127.0.0.1',port:${loopback.address().port}},{host:'100.100.100.100',port:443},{host:'1.1.1.1',port:443},{path:${JSON.stringify(unrelatedSocket)}}];const network=await Promise.all(targets.map(target=>new Promise(resolve=>{const socket=net.connect(target);socket.setTimeout(500);socket.once('connect',()=>{socket.destroy();resolve({target,denied:false})});socket.once('error',error=>resolve({target,denied:true,error:error.code}));socket.once('timeout',()=>{socket.destroy();resolve({target,denied:true,error:'TIMEOUT'})})})));return{denied,network,ambient:Boolean(process.env.OPENAI_API_KEY||process.env.LH_DESKTOP_API_SECRET||process.env.NODE_OPTIONS),helper:process.env.LH_PREVIEW_HELPER_SOCKET??null,pids:fs.readdirSync('/proc').filter(name=>/^\\d+$/.test(name)),home:process.env.HOME}}`;
fs.writeFileSync(path.join(fixture, "probe.cjs"), probe);
fs.writeFileSync(path.join(fixture, "package.json"), JSON.stringify({ name: "synthetic-preview-sandbox-proof", private: true }));
fs.writeFileSync(path.join(fixture, "next.config.js"), "module.exports=async()=>{const fs=require('node:fs');const probe=require('./probe.cjs');fs.writeFileSync('/state/data/build-probe.json',JSON.stringify(await probe()));return{}};");
fs.writeFileSync(path.join(fixture, "app", "layout.js"), "export default function Layout({children}){return <html><body>{children}</body></html>}");
fs.writeFileSync(path.join(fixture, "app", "page.js"), "export default function Page(){return <main><h1>Sandboxed Next lifetime fixture</h1><p>Retained synthetic state, no credentials.</p></main>}");
fs.writeFileSync(path.join(fixture, "app", "api", "probe", "route.js"), "export const dynamic='force-dynamic';export async function GET(){const fs=require('node:fs');const probe=require('../../../probe.cjs');const result=await probe();fs.writeFileSync('/state/data/runtime-probe.json',JSON.stringify(result));return Response.json(result)}");
sandbox.source = fixture;
record.fixtureHash = createHash("sha256").update(probe).digest("hex");
record.sandbox = sandbox;
const launch = newLaunch();
const config = { ticketId: "synthetic-lifetime", lease: "real-ten-minute-lease", launch, sandbox, eventPath: path.join(run, "event.json") };
fs.writeFileSync(path.join(run, "config.json"), JSON.stringify(config, null, 2));
const log = fs.openSync(path.join(run, "server.log"), "a", 0o600);
const child = spawn(process.execPath, [supervisorPath, path.join(run, "config.json")], { detached: true, stdio: ["ignore", log, log], env: { HOME: process.env.HOME, PATH: "/usr/bin", OPENAI_API_KEY: "synthetic-ambient-canary", LH_DESKTOP_API_SECRET: "synthetic-native-canary", NODE_OPTIONS: "--trace-warnings" } });
fs.closeSync(log);
const owner = ownerOf(child.pid);
record.owner = owner;
record.launch = launch;
const port = await choosePort(28500);
const ticket = { id: "synthetic-lifetime", origin: `http://127.0.0.1:${port}/` };
const proxy = proxyFor(ticket, sandbox.socketPath);
await new Promise(resolve => proxy.listen(port, "127.0.0.1", resolve));
record.origin = ticket.origin;
save();
console.log(JSON.stringify({ run, origin: ticket.origin, owner, launch }));
function checkProbe(report) {
	assert.ok(Object.values(report.denied).every(Boolean), JSON.stringify(report));
	assert.ok(report.network.every(target => target.denied), JSON.stringify(report));
	assert.equal(report.ambient, false);
	assert.equal(report.helper, null);
}
try {
	const readyDeadline = Date.now() + 180_000;
	while (!fs.existsSync(sandbox.socketPath)) {
		assert.ok(alive(owner), fs.readFileSync(path.join(run, "server.log"), "utf8"));
		assert.ok(Date.now() < readyDeadline, "Minimal Next fixture did not become ready");
		await delay(300);
	}
	checkProbe(JSON.parse(fs.readFileSync(path.join(profile, "data", "build-probe.json"), "utf8")));
	step("actual-next-build-adversarial-denials", { report: path.join(profile, "data", "build-probe.json") });
	const protocolHeaders = { "sec-ch-ua": '"Chromium";v="152"' };
	const home = await fetch(ticket.origin, { headers: protocolHeaders });
	assert.equal(home.status, 200);
	assert.match(await home.text(), /Sandboxed Next lifetime fixture/);
	const runtime = await (await fetch(ticket.origin + "api/probe", { headers: protocolHeaders })).json();
	checkProbe(runtime);
	step("actual-next-runtime-adversarial-denials-and-http", runtime);
	let interactions = 0;
	while (alive(owner)) {
		assert.ok(Date.now() - Date.parse(launch.launchedAt) < 620_000, "Supervisor exceeded hard lifetime tolerance");
		const response = await fetch(ticket.origin + "api/probe", { headers: protocolHeaders, signal: AbortSignal.timeout(3000) });
		if (response.ok) { checkProbe(await response.json()); interactions++; }
		await delay(2000);
	}
	const elapsed = Date.now() - Date.parse(launch.launchedAt);
	assert.ok(elapsed >= 600_000 && elapsed < 620_000, `Real elapsed lifetime ${elapsed}`);
	const event = JSON.parse(fs.readFileSync(config.eventPath, "utf8"));
	assert.equal(event.status, "expired");
	assert.equal(event.lease, config.lease);
	assert.ok(fs.existsSync(path.join(profile, "data", "runtime-probe.json")));
	const state = { tickets: { original: { claim: config.lease }, replacement: { claim: "new-lease" } }, slots: [{ ticket: "original", claim: config.lease }, { ticket: "replacement", claim: "new-lease" }], queue: ["first", "second"] };
	assert.equal(clearLease(state, "original", event.lease), true);
	assert.equal(clearLease(state, "replacement", event.lease), false);
	assert.equal(state.tickets.replacement.claim, "new-lease");
	assert.deepEqual(state.queue, ["first", "second"]);
	step("real-600-second-expiry-with-interaction-and-retention", { elapsed, interactions, event });
	step("focused-matching-release-and-stale-replacement-protection", state);
	record.status = "builder-checks-passed-deployment-blocked";
} catch (error) { record.status = "failed"; record.error = error.stack; process.exitCode = 1; }
finally {
	await stopOwned(owner);
	proxy.stopUpgrades();
	proxy.closeAllConnections();
	await Promise.all([new Promise(resolve => proxy.close(resolve)), new Promise(resolve => loopback.close(resolve)), new Promise(resolve => unrelated.close(resolve))]);
	record.finishedAt = new Date().toISOString();
	save();
	fs.writeFileSync(path.join(run, "receipt.md"), `# Preview sandbox/lifetime builder receipt\n\nVerdict: BLOCKED\nChecker: same agent (not independent)\nAnswer key: owner-approved private deployment spec, section 4 rows 7 and 9.\n\n## Observed checks\n${record.checks.map(check => `- ${check.name}: ${check.time}`).join("\n")}\n\n## Not covered\n${record.limitations.map(item => `- ${item}`).join("\n")}\n- FIFO manager advancement needs a separate real-manager check; focused lease-state assertions are not that proof.\n- This is a minimal real Next fixture, not full LearnHarness build/native parity.\n\nSynthetic state, build output and evidence retained. See result.json and server.log.\n`);
}
