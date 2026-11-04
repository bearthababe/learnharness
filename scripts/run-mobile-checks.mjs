import path from "node:path";
import { appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRunDirectory, processScope, captureOutput, completed } from "./mobile-browser-runner.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const dir = await createRunDirectory();
const log = path.join(dir, "runner.log");
console.log(`Mobile browser logs and disposable fixtures: ${dir}`);
const processes = processScope();
try {
	const child = processes.spawn(process.execPath, ["scripts/smoke-mobile-inputs.mjs", "--all"], {
		cwd: root,
		env: { ...process.env, LH_MOBILE_TEST_DIR: dir },
		stdio: ["ignore", "pipe", "pipe"],
	});
	captureOutput(child, log);
	await completed(child);
} catch (error) {
	appendFileSync(log, `${error.stack}\n`);
	console.error(error);
	process.exitCode = 1;
} finally {
	await processes.close();
	console.log(`Mobile browser artifacts retained: ${dir}`);
}
