import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import { processIdentity, monotonicMilliseconds, bootIdentity, controlFor } from "../electron/preview-shell.cjs";

const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, "..");
const run = path.resolve(process.argv[2] ?? `.prove-it/runs/${new Date().toISOString().replaceAll(":", "-")}-zz-prove-it-preview-shell`);
assert.ok(!fs.existsSync(run), "Proof directory must be new");
fs.mkdirSync(run, { recursive: true, mode: 0o700 });
const processes = [];
const steps = [];
const failures = [];
const requests = [];
const reports = [];
const outsiderRequests = [];
const udpRequests = [];
const outsiderConnections = [];
const browserAdmissions = [];
const startedAt = new Date().toISOString();
const checks = Array.from({ length: 10 }, (_, index) => ({
	number: index + 1, status: "blocked", flow: "Final integrated local deployment acceptance", surface: index === 6 ? "packaged source-specific native preview" : "outside isolated native shell diagnostic scope",
	answerKey: "owner-approved private local deployment specification, section 4", commands: [],
	expected: "Actual rebuilt packaged app and integrated deployment environments", observed: "Scoped synthetic shell diagnostic only; final rebuilt package and integrated acceptance not run",
	startedAt, finishedAt: null, artifacts: [path.join(run, "result.json")],
}));
const receipts = { schemaVersion: 1, startedAt, finishedAt: null, verdict: "BLOCKED", status: "blocked", independentChecker: null, kind: "unpackaged-native-wayland-loopback-diagnostic", run, steps, failures, cleanup: {}, checks };
receipts.browserAdmissions = browserAdmissions;
receipts.rendererReports = reports;
const save = () => {
	for (const filename of ["result.json", "deployment.json"]) {
		const temporary = path.join(run, `${filename}.tmp`);
		fs.writeFileSync(temporary, JSON.stringify(receipts, null, 2), { mode: 0o600 });
		fs.renameSync(temporary, path.join(run, filename));
	}
};
const step = (name, evidence) => { steps.push({ name, status: "PASS", evidence }); save(); };
const write = (filename, value) => fs.writeFileSync(filename, JSON.stringify(value, null, 2), { mode: 0o600 });
const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
async function waitFor(predicate, description, timeout = 15000) {
	const deadline = Date.now() + timeout;
	while (!predicate()) {
		if (Date.now() >= deadline) throw new Error(`Timed out: ${description}`);
		await delay(40);
	}
}
function owned(command, argumentsList, options = {}) {
	const child = spawn(command, argumentsList, { cwd: root, env: { PATH: process.env.PATH }, detached: true, stdio: ["ignore", "pipe", "pipe", "ipc"], ...options });
	const record = { child, identity: null, stdout: "", stderr: "", exited: false };
	child.once("spawn", () => { record.identity = processIdentity(child.pid); });
	child.once("exit", (code, signal) => { record.exited = true; record.code = code; record.signal = signal; });
	child.stdout?.on("data", chunk => { record.stdout += chunk; });
	child.stderr?.on("data", chunk => { record.stderr += chunk; });
	processes.push(record); return record;
}
function groupMembers(group) {
	return fs.readdirSync("/proc").filter(name => /^\d+$/.test(name)).flatMap(name => {
		try {
			const stat = fs.readFileSync(`/proc/${name}/stat`, "utf8");
			const fields = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
			return Number(fields[2]) === group && fields[0] !== "Z" ? [{ pid: Number(name), arguments: fs.readFileSync(`/proc/${name}/cmdline`, "utf8").replaceAll("\0", " "), status: fs.readFileSync(`/proc/${name}/status`, "utf8").split("\n").filter(line => /^(NoNewPrivs|Seccomp|NSpid):/.test(line)) }] : [];
		} catch { return []; }
	});
}
const stopProcess = async record => {
	if (!record.exited) { record.child.kill("SIGTERM"); await waitFor(() => record.exited, "owned process stop", 5000); }
};
try {
	assert.equal(process.platform, "linux");
	assert.ok(process.env.WAYLAND_DISPLAY && process.env.XDG_RUNTIME_DIR, "Actual Wayland session required");
	receipts.display = { wayland: process.env.WAYLAND_DISPLAY, runtime: process.env.XDG_RUNTIME_DIR };
	receipts.revision = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
	receipts.baseRevision = receipts.revision;
	receipts.dirty = execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" }).trim().length > 0;
	receipts.sources = Object.fromEntries(["scripts/lib/preview-proxy.mjs", "scripts/lib/preview-browser-admission.mjs", "electron/main.cjs", "electron/preview-shell.cjs", "tests/deployment/preview-shell.test.mjs", "tests/deployment/fixtures/preview-shell-server.cjs", "tests/deployment/fixtures/preview-shell-driver.cjs", "scripts/prove-preview-shell.mjs"].map(filename => [filename, createHash("sha256").update(fs.readFileSync(path.join(root, filename))).digest("hex")]));
	const privateSpec = "/home/bjorn/repo/teach/learnharness/specs/2026-11-06-local-deployment-and-previews.md";
	receipts.answerKey = { kind: "owner-approved private specification, section 4 row 7", path: privateSpec, sha256: createHash("sha256").update(fs.readFileSync(privateSpec)).digest("hex") };
	receipts.sourceFingerprint = createHash("sha256").update(JSON.stringify(receipts.sources)).digest("hex");
	receipts.commands = ["node scripts/prove-preview-shell.mjs", "supported Electron runtime + tests/deployment/fixtures/preview-shell-driver.cjs --preview=CONFIG --preview-diagnostic --ozone-platform=wayland"];
	const server = owned(process.execPath, ["tests/deployment/fixtures/preview-shell-server.cjs"]);
	let endpoint;
	server.child.on("message", message => {
		if (message.ready) endpoint = message;
		if (message.report) reports.push(message.report);
		if (message.request) requests.push(message.request);
		if (message.outsiderRequest) outsiderRequests.push(message.outsiderRequest);
		if (message.udpRequest) udpRequests.push(message.udpRequest);
		if (message.outsiderConnection) outsiderConnections.push(message.outsiderConnection);
		if (message.browserAdmission) browserAdmissions.push(message.browserAdmission);
	});
	await waitFor(() => endpoint, "fixture server");
	receipts.ownedPorts = { http: Number(new URL(endpoint.origin).port), outsider: endpoint.outsider, udp: endpoint.udp };
	let manager = owned(process.execPath, ["-e", "setInterval(() => {}, 1000)"]);
	await once(manager.child, "spawn");
	const electron = require("electron");
	receipts.runtime = { executable: electron, electron: require("electron/package.json").version, packaged: false };
	async function launch(label, { remaining = 600000, source = "a", additionalArguments = [] } = {}) {
		const directory = path.join(run, label);
		fs.mkdirSync(directory, { mode: 0o700 });
		const env = {};
		for (const name of ["PATH", "LANG", "DISPLAY", "WAYLAND_DISPLAY", "XDG_RUNTIME_DIR", "DBUS_SESSION_BUS_ADDRESS", "XAUTHORITY", "XDG_SESSION_TYPE"]) if (process.env[name]) env[name] = process.env[name];
		for (const [name, suffix] of Object.entries({ HOME: "home", XDG_CONFIG_HOME: "config", XDG_CACHE_HOME: "cache", XDG_DATA_HOME: "data" })) {
			env[name] = path.join(directory, suffix); fs.mkdirSync(env[name], { mode: 0o700 });
		}
		const now = monotonicMilliseconds();
		const configuration = {
			version: 1, ticketId: "zz-prove-it-preview-shell", sourceId: source.repeat(64), lease: `synthetic-${label}-lease`,
			origin: endpoint.origin, normalOrigin: "https://normal.fixture.invalid",
			launch: { started: now - 600000 + remaining, deadline: now + remaining, boot: bootIdentity() },
			manager: processIdentity(manager.child.pid), server: processIdentity(server.child.pid), controlFile: path.join(directory, "control.json"),
		};
		const filename = path.join(directory, "shell.json");
		write(filename, configuration); write(configuration.controlFile, controlFor(configuration));
		const record = owned(electron, [path.join(root, "tests/deployment/fixtures/preview-shell-driver.cjs"), `--preview=${filename}`, "--preview-diagnostic", "--ozone-platform=wayland", ...additionalArguments], { env, stdio: ["ignore", "pipe", "pipe"] });
		record.label = label; record.directory = directory; record.configuration = configuration;
		await waitFor(() => record.stdout.includes("PREVIEW_SHELL_READY") || record.exited, `${label} native startup`);
		return record;
	}
	const first = await launch("first");
	assert.equal(first.exited, false, first.stderr + first.stdout);
	await waitFor(() => reports.some(report => report.scenario === "first" && report.electronAPI), "renderer attack report");
	await waitFor(() => fs.existsSync(path.join(first.directory, "preview.png")), "native screenshot");
	const firstReport = reports.find(report => report.scenario === "first" && report.electronAPI);
	assert.ok(firstReport, JSON.stringify(reports));
	for (const name of ["electronAPI", "require", "process"]) assert.equal(firstReport[name], "undefined", name);
	for (const name of ["geolocation", "microphone", "camera", "notifications"]) assert.equal(firstReport[name], "denied", name);
	assert.equal(firstReport.popup, true); assert.equal(firstReport.fetch, "TypeError"); assert.equal(firstReport.file, "TypeError");
	assert.equal(firstReport.worker, "blocked"); assert.equal(firstReport.serviceWorker, "SecurityError");
	assert.deepEqual(firstReport.iceCandidates, []);
	assert.deepEqual(udpRequests, []);
	assert.deepEqual(outsiderConnections, []);
	const native = JSON.parse(fs.readFileSync(path.join(first.directory, "native.json")));
	assert.equal(native.windows, 1); assert.equal(native.sandbox, true); assert.equal(native.nodeIntegration, false); assert.equal(native.contextIsolation, true);
	assert.equal(native.preload, null); assert.equal(native.devToolsAttemptOpened, false); assert.deepEqual(native.nativeHandlers, []); assert.equal(native.url, endpoint.origin + "/");
	assert.ok(native.downloads.length > 0 && native.downloads.every(download => download.prevented), "Actual native download cancellation required");
	const members = groupMembers(first.child.pid);
	const renderers = members.filter(member => member.arguments.includes("--type=renderer"));
	assert.ok(renderers.length, "Real renderer process required");
	for (const renderer of renderers) {
		assert.ok(renderer.status.some(line => /^Seccomp:\s+2$/.test(line)), "Renderer seccomp filter required");
		assert.ok(renderer.status.some(line => /^NoNewPrivs:\s+1$/.test(line)), "Renderer no-new-privileges required");
		assert.ok(!renderer.arguments.includes("--no-sandbox"));
	}
	assert.deepEqual(outsiderRequests, []);
	assert.ok(!requests.some(request => request.includes("worker.js")));
	assert.ok(browserAdmissions.some(request => request.path === "/" && request.status === 200 && request.clientHint?.includes('"Chromium";v="152"')), "Actual isolated Electron must pass the production browser-admission proxy");
	step("actual-Electron-preview-browser-admission", { requests: [...browserAdmissions], chrome: native.chrome, limitation: "Genuine source Electron and production proxy; unpackaged loopback diagnostic, not packaged HTTPS acceptance" });
	step("actual-Wayland-renderer-attacks-and-kernel-sandbox", { report: firstReport, native, renderers, requests: [...requests], outsiderRequests: [...outsiderRequests], screenshot: path.join(first.directory, "preview.png") });
	server.child.send({ scenario: "second" });
	const second = await launch("second", { source: "b" });
	assert.equal(second.exited, false, second.stderr + second.stdout);
	await waitFor(() => reports.some(report => report.scenario === "second" && report.electronAPI), "second source report");
	await waitFor(() => fs.existsSync(path.join(second.directory, "native.json")), "second native snapshot");
	const secondReport = reports.find(report => report.scenario === "second" && report.electronAPI);
	const secondNative = JSON.parse(fs.readFileSync(path.join(second.directory, "native.json")));
	assert.equal(firstReport.beforeCookie, ""); assert.equal(secondReport.beforeCookie, "");
	assert.notEqual(native.userData, secondNative.userData); assert.notEqual(native.name, secondNative.name); assert.equal(first.exited, false);
	step("concurrent-source-identity-and-cookie-isolation", { first: { userData: native.userData, name: native.name, cookie: firstReport.afterCookie }, second: { userData: secondNative.userData, name: secondNative.name, beforeCookie: secondReport.beforeCookie, afterCookie: secondReport.afterCookie }, firstStillRunning: !first.exited, limitation: "Both origins are explicitly synthetic loopback diagnostic; this does not prove HTTPS origin separation" });
	write(first.configuration.controlFile, controlFor(first.configuration, "revoked"));
	await waitFor(() => first.exited, "lease revocation shutdown", 3000);
	assert.equal(second.exited, false);
	step("lease-revocation-closes-only-matching-shell", { code: first.code, stdout: first.stdout, secondStillRunning: !second.exited });
	const deadline = await launch("deadline", { remaining: 3200, source: "c" });
	assert.equal(deadline.exited, false, deadline.stderr + deadline.stdout);
	await waitFor(() => deadline.exited, "hard deadline closes native shell", 4500);
	step("fixed-boot-monotonic-deadline", { code: deadline.code, stdout: deadline.stdout, shortenedDiagnostic: "Started timestamp set 596800ms in the past; actual 600000ms invariant retained" });
	const unsafe = await launch("unsafe", { source: "d", additionalArguments: ["--no-sandbox"] });
	assert.equal(unsafe.exited, true); assert.equal(unsafe.code, 1); assert.ok(!unsafe.stdout.includes("PREVIEW_SHELL_READY"));
	step("unsafe-launch-switch-refused", { code: unsafe.code, stdout: unsafe.stdout });
	const renewal = await launch("renewal", { source: "e" });
	assert.equal(renewal.exited, false, renewal.stderr + renewal.stdout);
	const replacement = structuredClone(renewal.configuration);
	replacement.launch.started += 5000; replacement.launch.deadline += 5000;
	write(path.join(renewal.directory, "shell.json"), replacement); write(replacement.controlFile, controlFor(replacement));
	await waitFor(() => renewal.exited, "immutable deadline refuses renewal", 3000);
	step("trusted-file-replacement-cannot-renew-existing-window", { code: renewal.code, stdout: renewal.stdout });
	await stopProcess(manager);
	await waitFor(() => second.exited, "manager death closes surviving shell", 3000);
	step("manager-process-death-closes-native-shell", { code: second.code, stdout: second.stdout });
	const replacementManager = owned(process.execPath, ["-e", "setInterval(() => {}, 1000)"]);
	await once(replacementManager.child, "spawn");
	manager = replacementManager;
	const runtime = await launch("runtime", { source: "f" });
	assert.equal(runtime.exited, false, runtime.stderr + runtime.stdout);
	await stopProcess(server);
	await waitFor(() => runtime.exited, "runtime process death closes native shell", 3000);
	step("server-process-death-closes-native-shell", { code: runtime.code, stdout: runtime.stdout });
	assert.deepEqual(outsiderRequests, []);
	for (const [filename, expected] of Object.entries(receipts.sources)) assert.equal(createHash("sha256").update(fs.readFileSync(path.join(root, filename))).digest("hex"), expected, `Source changed during proof: ${filename}`);
	receipts.scopedStatus = "PASS";
} catch (error) {
	failures.push({ message: error.message, stack: error.stack });
	receipts.scopedStatus = "FAIL";
	process.exitCode = 1;
} finally {
	for (const record of processes.reverse()) {
		try {
			if (!record.exited) record.child.kill("SIGTERM");
			await waitFor(() => record.exited, "owned root process cleanup", 4000);
			if (groupMembers(record.child.pid).length) process.kill(-record.child.pid, "SIGTERM");
			await waitFor(() => groupMembers(record.child.pid).length === 0, "owned process group cleanup", 4000);
		} catch (error) {
			try { process.kill(-record.child.pid, "SIGKILL"); } catch {}
			failures.push({ cleanup: error.message }); process.exitCode = 1;
		}
		if (record.label) {
			fs.writeFileSync(path.join(record.directory, "electron.stdout.log"), record.stdout, { mode: 0o600 });
			fs.writeFileSync(path.join(record.directory, "electron.stderr.log"), record.stderr, { mode: 0o600 });
		}
	}
	receipts.cleanup.processes = processes.map(record => ({ pid: record.child.pid, identity: record.identity, label: record.label, remaining: groupMembers(record.child.pid) }));
	receipts.cleanup.complete = receipts.cleanup.processes.every(record => record.remaining.length === 0);
	receipts.finishedAt = new Date().toISOString();
	for (const check of checks) check.finishedAt = receipts.finishedAt;
	receipts.ownedProfiles = processes.filter(record => record.directory).map(record => record.directory);
	receipts.limitations = ["Not independently checked", "Unpackaged diagnostic, not final accepted package", "Synthetic loopback, not dedicated private HTTPS", "No actual manager/sandbox/helper integration or full native parity", "No mobile or physical-device checks"];
	receipts.reports = reports; receipts.outsiderRequests = outsiderRequests; receipts.udpRequests = udpRequests; receipts.outsiderConnections = outsiderConnections;
	save();
	fs.writeFileSync(path.join(run, "receipt.md"), `# BLOCKED: isolated native preview shell\n\nScoped diagnostic: ${receipts.scopedStatus}. ${steps.length} checks passed. All ten final deployment acceptance rows remain BLOCKED.\n\n## Scope\nNew isolated preview mode and existing main dispatch regression. Compared to owner-approved private specification section 4 row 7 (hash in result.json), not a newly written answer key.\n\n## Couldn't prove\nFinal packaged source-specific shell, real private HTTPS hostname/certificates, actual manager integration, full native/subscription parity and physical-device behavior. This uses current unpackaged Electron with real Wayland windows and synthetic loopback endpoints, not the stale package. Parent must rebuild final package and rerun integrated checks.\n\n## Steps\n${steps.map(entry => `- PASS ${entry.name}`).join("\n")}\n\n## Failures and retries\n${failures.length ? failures.map(failure => `- ${failure.message ?? failure.cleanup}`).join("\n") : "None in this run; inspect prior run directories for earlier failures."}\n\n## Cleanup\nOwned process groups stopped: ${receipts.cleanup.complete}. Retained only synthetic profiles, captures and logs in this run directory. No system install, route changes, live providers or production profile access.\n`, { mode: 0o600 });
	console.log(JSON.stringify({ run, scopedStatus: receipts.scopedStatus, checks: steps.length, cleanup: receipts.cleanup.complete, acceptance: "BLOCKED" }));
}
