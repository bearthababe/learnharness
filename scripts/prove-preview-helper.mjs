import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { sourceFingerprint } from "./mobile-browser-result.mjs";

const root = process.cwd();
const [flag, spec] = process.argv.slice(2);
assert.ok(flag === "--spec" && spec && process.argv.length === 4, "Usage: node scripts/prove-preview-helper.mjs --spec ABSOLUTE_PRIVATE_SPEC");
const directory = path.join(root, ".prove-it", "runs", `${new Date().toISOString().replaceAll(":", "-")}-zz-prove-it-preview-helper`);
fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
const checkHome = fs.mkdtempSync(path.join(os.tmpdir(), "lhph-proof-home-"));
const checksum = filename => createHash("sha256").update(fs.readFileSync(filename)).digest("hex");
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
const files = ["electron/preview-subscription-owner.cjs", "scripts/lib/preview-subscription-helper.mjs", "scripts/preview-subscriptions.mjs", "src/agent/preview-subscription-runtime.ts", "src/agent/subscription-runtime.ts", "src/agent/chatgpt-stream.ts", "src/agent/subscription-stream.ts", "src/server/web-subscriptions.ts", "tests/deployment/fixtures/preview-helper.mjs", "tests/deployment/fixtures/preview-runtime.ts", "tests/deployment/preview-helper.test.mjs", "scripts/prove-preview-helper.mjs", "docs/preview-subscriptions.md", "scripts/lib/preview-sandbox.mjs", "package-lock.json"];
const names = ["Exact main eligibility and retry", "Idle gating and interrupted preparation", "Shared normal profile and native parity", "External storage and migration", "Backup and restore safety", "Code-only rollback", "Browser and desktop preview isolation", "Optional subscription access and model choice", "Hard expiry, stop and queue advancement", "Existing behavior and route ownership"];
const result = {
	schemaVersion: 1, status: "BLOCKED", checker: "same implementation agent (not independent)", startedAt: new Date().toISOString(), finishedAt: null,
	source: { revision: git("rev-parse", "HEAD"), baseRevision: git("merge-base", "HEAD", "origin/main"), dirty: !!git("status", "--porcelain"), sha256: await sourceFingerprint(root), files: Object.fromEntries(files.map(filename => [filename, checksum(path.join(root, filename))])) },
	answerKey: { path: path.resolve(spec), sha256: checksum(spec), rung: 4, author: "owner-approved independent specification" },
	environment: { node: process.version, platform: process.platform, architecture: process.arch, release: os.release(), cwd: root },
	checks: names.map((name, index) => ({ number: index + 1, name, status: "blocked", flow: name, surface: "full deployment acceptance", answerKey: `approved spec §4 row ${index + 1}`, commands: [], expected: "complete real-process rehearsal accepted by a fresh independent checker", observed: "Scoped helper implementation checks do not satisfy the complete acceptance row.", startedAt: null, finishedAt: null, artifacts: [] })),
	scopedChecks: [], cleanup: { status: "not-run" }, retries: [{ stage: "initial fixture", cause: "Fixture constructed an empty SDK provider collection; fixed to use the public openaiProvider catalog." }, { stage: "typecheck", cause: "New fixture used unnormalized transcript context and an incorrect picker settings shape; fixed the fixture to use normalizeContext and the app's nested model spec." }, { stage: "first recorded regression run", cause: "Synthetic HOME under the evidence checkout was correctly refused by the managed-profile guard. Moved all check HOME/data/auth defaults to an external throwaway directory; the failed receipt is retained." }, { stage: "initial direct regression command", cause: "The earlier ad-hoc regression command inherited shell HOME. Its result is not the isolated proof; default-profile metadata may have been inspected during configuration resolution. No personal profile was intentionally opened or cleaned. Use only this allowlisted external-profile command for the reproducible evidence." }],
	limitations: ["No fresh independent final checker", "No full LearnHarness browser UI picker interaction", "No packaged Electron preview/native-preload proof", "No actual elapsed ten-minute helper lifetime in this scoped run", "No tailnet/hostname/private HTTPS provisioning or route changes", "No live provider compatibility or paid calls", "No full baseline/mobile/browser/package run: heavy builds remain coordinated with the parent"],
};
function save() {
	const destination = path.join(directory, "deployment.json");
	fs.writeFileSync(`${destination}.tmp`, `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 }); fs.renameSync(`${destination}.tmp`, destination);
}
save();
async function check(name, args, log) {
	const entry = { name, command: [process.execPath, ...args], status: "running", startedAt: new Date().toISOString(), finishedAt: null, artifacts: [log] };
	result.scopedChecks.push(entry); save();
	const descriptor = fs.openSync(path.join(directory, log), "w", 0o600);
	try {
		const child = spawn(process.execPath, args, { cwd: root, env: { PATH: process.env.PATH, HOME: checkHome, LH_DATA_DIR: path.join(checkHome, "data"), LH_AUTH_FILE: path.join(checkHome, "auth.json"), LANG: "C.UTF-8", NODE_ENV: "test", LH_IGNORE_ENV_KEYS: "1", NEXT_TELEMETRY_DISABLED: "1" }, stdio: ["ignore", descriptor, descriptor] });
		const code = await new Promise((resolve, reject) => { child.once("error", reject); child.once("exit", resolve); });
		entry.exitCode = code;
		entry.status = code === 0 ? "passed" : "failed";
		assert.equal(code, 0, `Scoped check failed: ${name}; see ${log}`);
	} finally { fs.closeSync(descriptor); entry.finishedAt = new Date().toISOString(); save(); }
}
try {
	await check("real helper, synthetic upstream and bubblewrap app adapters", ["--test", "tests/deployment/preview-helper.test.mjs"], "helper-process.log");
	await check("existing web, desktop IPC and subscription dispatch regressions", ["--import", "tsx", "--test", "tests/web-subscriptions.test.ts", "tests/subscription-stream.test.ts", "tests/chatgpt-stream.test.ts", "tests/subscription-auth.test.ts", "tests/provider-runtime-payload.test.ts", "tests/subscription-background.test.ts"], "regressions.log");
	await check("TypeScript", ["node_modules/typescript/bin/tsc", "--noEmit", "--incremental", "false"], "typecheck.log");
	await check("focused TypeScript lint", ["node_modules/eslint/bin/eslint.js", "src/agent/preview-subscription-runtime.ts", "src/agent/chatgpt-stream.ts", "src/agent/subscription-stream.ts", "src/agent/subscription-runtime.ts", "src/server/web-subscriptions.ts"], "lint.log");
	const helperLog = fs.readFileSync(path.join(directory, "helper-process.log"), "utf8");
	const line = helperLog.split("\n").find(line => line.startsWith('{"scopedChecks"'));
	assert.ok(line, "Missing machine-readable subprocess evidence");
	result.helperEvidence = JSON.parse(line);
	result.cleanup = { status: "passed", observed: "Process test finally stopped its exact helper and synthetic manager, verified control.sock removal, removed owned sandbox transport and disposable profiles; no installed service, route or personal profile was touched." };
} catch (error) { result.error = error.message; result.cleanup = { status: "blocked", observed: "Review the failed subprocess log and its cleanup assertions before acceptance." }; process.exitCode = 1; }
finally {
	fs.rmSync(checkHome, { recursive: true, force: true });
	result.finishedAt = new Date().toISOString();
	result.sourceAfter = { revision: git("rev-parse", "HEAD"), sha256: await sourceFingerprint(root), files: Object.fromEntries(files.map(filename => [filename, checksum(path.join(root, filename))])) };
	result.scopedSourceUnchanged = JSON.stringify(result.source.files) === JSON.stringify(result.sourceAfter.files);
	if (!result.scopedSourceUnchanged) { result.error = "A scoped source file changed during this run; rerun before citing the receipt."; process.exitCode = 1; }
	save();
	const steps = result.scopedChecks.map(entry => `- [${entry.status.toUpperCase()}] ${entry.name}: \`${entry.command.join(" ")}\` → \`${entry.artifacts[0]}\``).join("\n");
	fs.writeFileSync(path.join(directory, "receipt.md"), `# Preview helper scoped verification\n\nVerdict: BLOCKED (deployment acceptance)\nChecker: same implementation agent (not independent)\n\n## Couldn't prove\n${result.limitations.map(item => `- ${item}`).join("\n")}\n\n## Scope and answer keys\nNew helper/adapter refusal, grant, normal model selection/dispatch, revoke, replacement, deadline and manager-death flows: approved independent owner specification, §3 and §4 rows 7–9 (rung 4). Existing subscription/auth/IPC/stream behavior: existing independent tests (rung 3). All ten deployment rows remain BLOCKED.\n\n## Steps\n${steps}\n\n## Source\n- Revision: ${result.source.revision}\n- Scoped files unchanged during checks: ${result.scopedSourceUnchanged}\n- Exact source/spec hashes and timestamps: deployment.json\n\n## Retries and fixes\n${result.retries.map(item => `- ${item.stage}: ${item.cause}`).join("\n")}\n\n## Cleanup\n${result.cleanup.observed}\n\n## Left behind\nThis evidence directory only; synthetic profiles and owned runtime processes were removed by the process test. No personal data, installed service, paid request or route was used.\n`, { mode: 0o600 });
	console.log(directory);
}
