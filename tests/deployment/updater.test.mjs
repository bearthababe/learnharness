import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { execFileSync, spawn } from "node:child_process";
import { DeploymentUpdater, updaterRequest } from "../../scripts/lib/deployment-updater.mjs";
import { observeMain } from "../../scripts/lib/deployment-eligibility.mjs";
import { readConfiguration, controlRequest } from "../../electron/local-service-protocol.cjs";
import { stopService, runPreparation, sameProcess } from "../../scripts/lib/deployment-process.mjs";
import { buildIdentity } from "../../electron/deployment-build.cjs";
import { processIdentity } from "../../electron/deployment-profile.cjs";

test("real updater/service persists failure suppression, exact local retry and newest CI across restart", { timeout: 120000 }, async context => {
	const binary = path.resolve(process.env.LH_TEST_PACKAGED_BINARY || "dist/linux-unpacked/learnharness");
	const build = JSON.parse(fs.readFileSync(path.join(path.dirname(binary), "resources/server/standalone/deployment-build.json"), "utf8"));
	assert.equal(build.sourceHash, buildIdentity(process.cwd()).sourceHash, "Build the current private package before updater integration tests");
	const home = fs.mkdtempSync(path.join(os.homedir(), ".cache", "zz-updater-"));
	const runtime = fs.mkdtempSync("/tmp/lhur-");
	fs.chmodSync(home, 0o700);
	const upstream = path.join(home, "upstream");
	const checkout = path.join(home, "checkout");
	const repository = "synthetic/updater";
	const git = (directory, ...argumentsList) => execFileSync("git", ["-C", directory, ...argumentsList], { encoding: "utf8", env: { ...process.env, GIT_CONFIG_GLOBAL: os.devNull, GIT_CONFIG_SYSTEM: os.devNull }, stdio: ["ignore", "pipe", "pipe"] }).trim();
	fs.mkdirSync(upstream); fs.mkdirSync(checkout);
	git(upstream, "init", "--initial-branch=main");
	git(upstream, "fetch", "--no-tags", process.cwd(), build.revision);
	git(upstream, "checkout", "--detach", build.revision);
	git(upstream, "checkout", "-B", "main");
	git(upstream, "config", "user.name", "Synthetic updater"); git(upstream, "config", "user.email", "synthetic@example.invalid");
	git(checkout, "init", "--initial-branch=main");
	const transport = path.join(home, "synthetic-ssh");
	fs.writeFileSync(transport, `#!/bin/sh\nexec git-upload-pack '${upstream}'\n`, { mode: 0o700 });
	git(checkout, "remote", "add", "origin", `git@github.com:${repository}.git`);
	git(checkout, "config", "core.sshCommand", transport); git(checkout, "config", "ssh.variant", "simple");
	const advance = name => { git(upstream, "commit", "--allow-empty", "-m", name); return git(upstream, "rev-parse", "HEAD"); };
	let conclusion = "success";
	let status = "completed";
	let missing = false;
	const observe = input => observeMain({ ...input, github: async endpoint => {
		const sha = new URLSearchParams(endpoint.split("?")[1]).get("head_sha");
		return [{ workflow_runs: missing ? [] : [{ id: 1, run_attempt: 1, head_sha: sha, head_branch: "main", event: "push", repository: { full_name: repository }, path: ".github/workflows/ci.yml", created_at: "2026-11-07T00:00:00Z", status, conclusion }] }];
	} });
	const probe = net.createServer(); await new Promise(resolve => probe.listen(0, "127.0.0.1", resolve)); const port = probe.address().port; await new Promise(resolve => probe.close(resolve));
	const configuration = { profileRoot: path.join(home, "profile"), runtime, previewHelperDirectory: path.join(runtime, "preview-subscriptions"), releases: path.join(home, "releases"), sourceRoot: checkout, repository, port, browserOrigins: [], initialElectron: binary };
	const environment = { HOME: home, PATH: process.env.PATH, LH_IGNORE_ENV_KEYS: "1", NEXT_TELEMETRY_DISABLED: "1" };
	let attempts = 0;
	let hold = false;
	const prepare = async (sha, signal) => { attempts++; await runPreparation([process.execPath, "-e", hold ? "setInterval(()=>{},1000)" : "process.exit(9)"], { env: environment, signal, log: path.join(home, "build.log") }); };
	let updater;
	context.after(async () => {
		await updater?.close();
		try { await stopService(readConfiguration(path.join(configuration.runtime, "service.json"))); } catch (error) { if (fs.existsSync(path.join(configuration.runtime, "service.json"))) throw error; }
		if (!context.passed) {
			context.diagnostic(`Retained failed updater fixture: ${home}; runtime: ${runtime}`);
			return;
		}
		fs.rmSync(home, { recursive: true, force: true });
		fs.rmSync(runtime, { recursive: true, force: true });
	});
	updater = new DeploymentUpdater(configuration, { observe, prepare, environment });
	await updater.initialize();
	const service = readConfiguration(path.join(configuration.runtime, "service.json"));
	assert.equal(service.previewHelperDirectory, configuration.previewHelperDirectory);
	assert.ok(fs.lstatSync(path.join(configuration.previewHelperDirectory, "control.sock")).isSocket());
	assert.equal((await fetch(`${service.origin}/api/runtime`)).status, 403, "Startup health admission must not admit unrelated requests");
	assert.equal((await controlRequest(service, { op: "activity" })).state, "idle", "Startup health must not leave a browser activity lease");
	configuration.previewHelperDirectory = null;
	assert.throws(() => updater.service(), /preview helper mismatch/);
	configuration.previewHelperDirectory = service.previewHelperDirectory;
	assert.equal((await controlRequest(service, { op: "activity" })).state, "idle");
	const candidate = advance("candidate with failed build");
	await updater.tick();
	assert.equal(attempts, 1); assert.equal(updater.state.state, "failed"); assert.deepEqual(updater.state.failed, [candidate]);
	await updater.tick(); assert.equal(attempts, 1); assert.match(updater.state.reason, /failed-awaiting/);
	await updater.close();
	updater = new DeploymentUpdater(configuration, { observe, prepare, environment }); await updater.initialize();
	await updater.tick(); assert.equal(attempts, 1);
	await assert.rejects(updaterRequest(configuration, { op: "retry", sha: "a".repeat(40) }), /refused/);
	await updaterRequest(configuration, { op: "retry", sha: candidate });
	await updater.tick(); assert.equal(attempts, 2);
	advance("newest pending"); status = "in_progress"; conclusion = null;
	await updater.tick(); assert.equal(updater.state.reason, "ci-pending"); assert.equal(attempts, 2);
	for (const outcome of ["failure", "cancelled"]) { status = "completed"; conclusion = outcome; await updater.tick(); assert.equal(updater.state.reason, `ci-${outcome}`); assert.equal(attempts, 2); }
	missing = true; await updater.tick(); assert.equal(updater.state.reason, "missing-ci");
	missing = false; conclusion = "success"; const newest = advance("newest eligible"); await updater.tick();
	assert.equal(attempts, 3); assert.equal(updater.state.candidate, newest);
	advance("eligible while preparation is held"); hold = true;
	const preparing = updater.tick();
	for (let attempt = 0; updater.state.state !== "preparing" && attempt < 100; attempt++) await new Promise(resolve => setTimeout(resolve, 10));
	assert.equal(updater.state.state, "preparing");
	const rapidRed = advance("rapid newer red main"); conclusion = "failure";
	await updater.observePreparation(); await preparing;
	assert.equal(updater.state.candidate, rapidRed);
	assert.equal(updater.state.reason, "candidate-superseded-or-no-longer-eligible");
	assert.equal(updater.state.failed.includes(rapidRed), false);
	assert.equal(readConfiguration(path.join(configuration.runtime, "service.json")).pid, service.pid);
	assert.equal(git(checkout, "remote", "get-url", "origin"), `git@github.com:${repository}.git`);
	await updater.close();
	await stopService(service);
	const bin = path.join(home, "bin"); fs.mkdirSync(bin);
	fs.writeFileSync(path.join(bin, "gh"), `#!${process.execPath}\nconsole.log(JSON.stringify([{ workflow_runs: [] }]));\n`, { mode: 0o700 });
	const configurationFile = path.join(home, "updater.json");
	fs.writeFileSync(configurationFile, JSON.stringify(configuration), { mode: 0o600 });
	const foregroundLog = path.join(home, "foreground.log");
	const descriptor = fs.openSync(foregroundLog, "a", 0o600);
	const foreground = spawn(process.execPath, ["scripts/local-deployment.mjs", "updater-start", "--config", configurationFile, "--approve-local-update"], { env: { ...environment, PATH: `${bin}:${environment.PATH}` }, detached: true, stdio: ["ignore", descriptor, descriptor] });
	fs.closeSync(descriptor);
	const foregroundIdentity = processIdentity(foreground.pid);
	const exited = new Promise(resolve => foreground.once("exit", (code, signal) => resolve({ code, signal })));
	context.after(() => { if (sameProcess(foregroundIdentity)) foreground.kill("SIGTERM"); });
	const readyDeadline = Date.now() + 60000;
	while (Date.now() < readyDeadline) {
		try { if ((await updaterRequest(configuration, { op: "status" })).reason === "missing-ci") break; } catch {}
		if (foreground.exitCode !== null) throw new Error(`Foreground updater exited before readiness: ${fs.readFileSync(foregroundLog, "utf8")}`);
		await new Promise(resolve => setTimeout(resolve, 50));
	}
	assert.equal((await updaterRequest(configuration, { op: "status" })).reason, "missing-ci", fs.readFileSync(foregroundLog, "utf8"));
	const foregroundService = readConfiguration(path.join(configuration.runtime, "service.json"));
	assert.notEqual(foregroundService.pid, service.pid);
	const processGroup = pid => Number(fs.readFileSync(`/proc/${pid}/stat`, "utf8").split(") ").at(-1).split(" ")[2]);
	const foregroundGroup = processGroup(foreground.pid);
	const backendGroup = processGroup(foregroundService.pid);
	assert.equal(foregroundGroup, foreground.pid, "Signal only this disposable foreground process group");
	assert.ok(sameProcess(foregroundIdentity)); process.kill(-foregroundGroup, "SIGINT");
	let timeout;
	try {
		const stopped = await Promise.race([exited, new Promise((resolve, reject) => { timeout = setTimeout(() => reject(new Error("Foreground updater must exit while retaining its backend")), 5000); })]);
		assert.deepEqual(stopped, { code: 0, signal: null });
	} finally { clearTimeout(timeout); }
	assert.notEqual(backendGroup, foregroundGroup, "Retained backend must not receive terminal Ctrl-C with the foreground updater");
	assert.equal((await controlRequest(foregroundService, { op: "status" })).pid, foregroundService.pid);
	assert.equal((await controlRequest(foregroundService, { op: "status" })).updater, "updater-not-running");
});
