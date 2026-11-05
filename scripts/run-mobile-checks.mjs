import path from "node:path";
import { appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { createRunDirectory, processScope, captureOutput, completed } from "./mobile-browser-runner.mjs";
import { createRunResult, sourceFingerprint } from "./mobile-browser-result.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const dir = await createRunDirectory();
const log = path.join(dir, "runner.log");
const receipt = createRunResult(dir);
console.log(`Mobile browser logs and disposable fixtures: ${dir}`);
console.log(`Mobile browser result: ${receipt.file}`);
const processes = processScope({ onSignal: signal => receipt.finish("interrupted", signal) });
let failure;
try {
	const git = args => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
	receipt.setSource({
		revision: git(["rev-parse", "HEAD"]),
		dirty: git(["status", "--porcelain", "--untracked-files=normal"]) !== "",
		sha256: await sourceFingerprint(root),
	});
	const child = processes.spawn(process.execPath, ["scripts/smoke-mobile-inputs.mjs", "--all"], {
		cwd: root,
		env: { ...process.env, LH_MOBILE_TEST_DIR: dir },
		stdio: ["ignore", "pipe", "pipe", "ipc"],
	});
	let eventError;
	child.on("message", event => {
		try { receipt.event(event); }
		catch (error) { eventError ??= error; child.kill("SIGTERM"); }
	});
	captureOutput(child, log);
	try { await completed(child); }
	catch (error) { throw eventError ?? error; }
	if (eventError) throw eventError;
} catch (error) {
	failure = error;
	appendFileSync(log, `${error.stack}\n`);
	console.error(error);
	process.exitCode = 1;
} finally {
	try {
		await processes.close();
		receipt.finish(failure ? "failed" : "passed", failure?.stack ?? null);
	} catch (error) {
		receipt.finish("failed", error.stack);
		console.error(error);
		process.exitCode = 1;
	}
	console.log(`Mobile browser artifacts retained: ${dir}`);
}
