import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

/** Next 16.3's route exclusions miss the separately copied instrumentation trace.
 * Filter before standalone copying; keep the final payload refusal guard intact.
 * @param {{ distDir: string, projectDir: string }} metadata
 */
export async function filterInstrumentationTrace({ distDir, projectDir }) {
	const traceFile = path.join(distDir, "server", "instrumentation.js.nft.json");
	const trace = JSON.parse(await readFile(traceFile, "utf8"));
	assert.ok(Array.isArray(trace.files) && trace.files.every((file) => typeof file === "string"), "Invalid instrumentation trace");
	trace.files = trace.files.filter((file) => {
		const relative = path.relative(projectDir, path.resolve(path.dirname(traceFile), file));
		if (relative === "data" || relative.startsWith(`data${path.sep}`)) return false;
		// Only project-root credentials: SDK data/auth assets must remain intact.
		if (path.dirname(relative) !== ".") return true;
		return relative !== "auth.json" && !relative.startsWith(".env") &&
			!/^(chatgpt|github-copilot|xai)-credentials\.json/.test(relative);
	});
	await writeFile(traceFile, JSON.stringify(trace));
}
