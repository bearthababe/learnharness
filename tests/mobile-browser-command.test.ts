/** Exercise the public runner with cheap child processes, including partial runs. */
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test, type TestContext } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { sourceEntries, sourceFingerprint } from "../scripts/mobile-browser-result.mjs";

const setup = `
import { cp, mkdir, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { sourceEntries, sourceFingerprint, reportBrowserEvent as report } from "./mobile-browser-result.mjs";
import { createRunDirectory, processScope } from "./mobile-browser-runner.mjs";
const fixture = await createRunDirectory();
for (const entry of sourceEntries) await cp(entry, path.join(fixture, entry), { recursive: true });
await report({ type: "fixture", directory: fixture, sha256: await sourceFingerprint(fixture) });
`;
const pass = (suite: string) => `await report({ type: "start", suite: "${suite}" }); await report({ type: "pass", suite: "${suite}" });`;
const passAll = ["inputs-notebook", "reveal", "layout"].map(pass).join("\n");

async function command(t: TestContext, body: string, options: { setup?: boolean; dirty?: boolean; storage?: "cache" | "tmp" } = {}) {
	const dir = await mkdtemp(path.join(existsSync("/tmp/opencode") ? "/tmp/opencode" : tmpdir(), "mobile-runner-test-"));
	t.after(() => rm(dir, { recursive: true, force: true }));
	const root = path.join(dir, "repo");
	await mkdir(root);
	for (const entry of sourceEntries) {
		const file = path.join(root, entry);
		if (entry.includes(".")) await writeFile(file, entry === "package.json" ? '{"type":"module"}\n' : "{}\n");
		else await mkdir(file);
	}
	for (const name of ["mobile-browser-runner.mjs", "mobile-browser-result.mjs", "run-mobile-checks.mjs"]) {
		await cp(path.join("scripts", name), path.join(root, "scripts", name));
	}
	await writeFile(path.join(root, "scripts/smoke-mobile-inputs.mjs"), (options.setup === false ? "" : setup) + body);
	const git = (args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
	git(["init"]);
	git(["add", "."]);
	git(["-c", "user.name=Runner test", "-c", "user.email=runner@example.invalid", "-c", "core.hooksPath=/dev/null", "commit", "-m", "Fixture"]);
	const revision = git(["rev-parse", "HEAD"]);
	if (options.dirty) await writeFile(path.join(root, "src/local-change.ts"), "export const changed = true;\n");
	const env: NodeJS.ProcessEnv = { ...process.env, XDG_CACHE_HOME: path.join(dir, "cache"), TMPDIR: path.join(dir, "tmp"), LH_MOBILE_TEST_DIR: path.join(dir, "explicit") };
	if (options.storage) delete env.LH_MOBILE_TEST_DIR;
	if (options.storage === "cache") delete env.TMPDIR;
	const child = spawn(process.execPath, ["scripts/run-mobile-checks.mjs"], { cwd: root, env, stdio: ["ignore", "pipe", "pipe"] });
	let output = "";
	child.stdout.on("data", data => { output += data; });
	child.stderr.on("data", data => { output += data; });
	const finished = new Promise<number | null>((resolve, reject) => { child.once("error", reject); child.once("close", resolve); });
	t.after(async () => { if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM"); await finished; });
	async function result() {
		const match = output.match(/Mobile browser result: (.+)/);
		assert.ok(match, output);
		return JSON.parse(await readFile(match[1]!, "utf8"));
	}
	return { child, dir, root, revision, finished, result, output: () => output };
}

test("runner records all suites, the exact copied source, dirty state and explicit artifact destination", { timeout: 20_000 }, async t => {
	const run = await command(t, passAll, { dirty: true });
	assert.equal(await run.finished, 0, run.output());
	const result = await run.result();
	assert.equal(result.schemaVersion, 1);
	assert.equal(result.status, "passed");
	assert.deepEqual(result.source, { revision: run.revision, dirty: true, sha256: await sourceFingerprint(run.root) });
	assert.ok(result.artifacts.directory.startsWith(path.join(run.dir, "explicit") + path.sep));
	assert.deepEqual(result.suites.map((suite: { status: string }) => suite.status), ["passed", "passed", "passed"]);
	assert.ok(result.suites.every((suite: { startedAt: string; finishedAt: string }) => suite.startedAt && suite.finishedAt));
	assert.ok(result.finishedAt);
});

test("later failure retains earlier passes and explicitly marks unreached suites", { timeout: 20_000 }, async t => {
	const run = await command(t, `${pass("inputs-notebook")} await report({ type: "start", suite: "reveal" }); throw new Error("Reveal fixture failure");`);
	assert.equal(await run.finished, 1);
	const result = await run.result();
	assert.equal(result.status, "failed");
	assert.deepEqual(result.suites.map((suite: { status: string }) => suite.status), ["passed", "failed", "not-run"]);
	assert.match(await readFile(result.artifacts.log, "utf8"), /Reveal fixture failure/);
});

test("setup failure produces a failed receipt with no fabricated suite outcomes", { timeout: 20_000 }, async t => {
	const run = await command(t, 'throw new Error("Browser unavailable");', { setup: false });
	assert.equal(await run.finished, 1);
	const result = await run.result();
	assert.equal(result.status, "failed");
	assert.equal(result.artifacts.fixture, null);
	assert.ok(result.suites.every((suite: { status: string }) => suite.status === "not-run"));
});

test("zero exit without complete suite reports cannot become a passing run", { timeout: 20_000 }, async t => {
	const run = await command(t, pass("inputs-notebook"));
	assert.equal(await run.finished, 1);
	const result = await run.result();
	assert.equal(result.status, "failed");
	assert.match(result.error, /without passing every suite/);
});

test("child failure after all suites pass still fails the aggregate run", { timeout: 20_000 }, async t => {
	const run = await command(t, `${passAll}\nthrow new Error("Cleanup failed");`);
	assert.equal(await run.finished, 1);
	const result = await run.result();
	assert.equal(result.status, "failed");
	assert.ok(result.suites.every((suite: { status: string }) => suite.status === "passed"));
	assert.match(await readFile(result.artifacts.log, "utf8"), /Cleanup failed/);
});

test("a changed copy is rejected before browser suites can pass", { timeout: 20_000 }, async t => {
	const run = await command(t, setup.replace('await report({ type: "fixture"', 'await writeFile(path.join(fixture, "config.ts"), "changed during copy");\nawait report({ type: "fixture"') + passAll, { setup: false });
	assert.equal(await run.finished, 1);
	const result = await run.result();
	assert.equal(result.status, "failed");
	assert.match(result.error, /Copied source changed/);
});

test("TMPDIR still overrides persistent cache", { timeout: 20_000 }, async t => {
	const run = await command(t, passAll, { storage: "tmp" });
	assert.equal(await run.finished, 0, run.output());
	const result = await run.result();
	assert.ok(result.artifacts.directory.startsWith(path.join(run.dir, "tmp") + path.sep));
	assert.equal(result.source.dirty, false);
});

test("Linux defaults to the persistent XDG cache when no explicit parent is set", { skip: process.platform !== "linux", timeout: 20_000 }, async t => {
	const run = await command(t, passAll, { storage: "cache" });
	assert.equal(await run.finished, 0, run.output());
	assert.ok((await run.result()).artifacts.directory.startsWith(path.join(run.dir, "cache/learnharness/mobile-browser") + path.sep));
});

for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
	test(`${signal} retains partial results and stops the owned process tree`, { skip: process.platform !== "linux", timeout: 20_000 }, async t => {
		const run = await command(t, `
const processes = processScope();
const sleeper = processes.spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
await writeFile(path.join(fixture, "owned.json"), JSON.stringify({ child: process.pid, sleeper: sleeper.pid }));
${pass("inputs-notebook")}
await report({ type: "start", suite: "reveal" });
setInterval(() => {}, 1000);
`);
		let result;
		for (let attempt = 0; attempt < 200; attempt++) {
			try { result = await run.result(); } catch { /* Wait for the first atomic receipt. */ }
			if (result?.suites[1].status === "running") break;
			await delay(25);
		}
		assert.equal(result?.suites[1].status, "running", run.output());
		const owned = JSON.parse(await readFile(path.join(result.artifacts.fixture, "owned.json"), "utf8"));
		t.after(() => {
			// Contain a failing regression run using only PIDs recorded by this fixture.
			for (const pid of [owned.child, owned.sleeper]) {
				try { process.kill(-pid, "SIGKILL"); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error; }
			}
		});
		run.child.kill(signal);
		assert.equal(await run.finished, { SIGINT: 130, SIGTERM: 143, SIGHUP: 129 }[signal]);
		result = await run.result();
		assert.equal(result.status, "interrupted");
		assert.equal(result.error, signal);
		assert.deepEqual(result.suites.map((suite: { status: string }) => suite.status), ["passed", "interrupted", "not-run"]);
		for (const pid of [owned.child, owned.sleeper]) {
			try {
				const stat = await readFile(`/proc/${pid}/stat`, "utf8");
				assert.match(stat.slice(stat.lastIndexOf(")") + 2), /^[ZX] /, `Owned process ${pid} is still running`);
			} catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
		}
	});
}
