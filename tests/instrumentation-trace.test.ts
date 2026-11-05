import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import test from "node:test";
import nextConfig from "../next.config.ts";

test("production hook excludes local records and credentials from instrumentation while retaining recovery and SDK assets", async () => {
	const root = mkdtempSync(path.join(os.tmpdir(), "lh-instrumentation-trace-"));
	try {
		const distDir = path.join(root, ".next");
		const trace = path.join(distDir, "server", "instrumentation.js.nft.json");
		mkdirSync(path.dirname(trace), { recursive: true });
		const excluded = [
			"data/chats/learner.json", "data/graph/nodes.jsonl", "data/jobs/job.json",
			"auth.json", ".env", ".env.local", ".env.production",
			"chatgpt-credentials.json", "chatgpt-credentials.json.fixture.tmp",
			"github-copilot-credentials.json", "xai-credentials.json",
		];
		const retained = [
			".next/server/instrumentation.js", ".next/server/chunks/recovery.js",
			"src/agent/prompts/teacher/20-teaching.md",
			"node_modules/@earendil-works/pi-ai/dist/providers/data/openai.json",
			"node_modules/@earendil-works/pi-ai/dist/auth/oauth/trusted-url.js",
			"node_modules/gcp-metadata/build/src/index.js",
			"node_modules/some-sdk/data/catalog.json",
			"node_modules/some-sdk/auth.json", "database/schema.json",
		];
		const relative = (file: string) => path.relative(path.dirname(trace), path.join(root, file));
		for (const file of [...excluded, ...retained]) {
			const target = path.join(root, file);
			mkdirSync(path.dirname(target), { recursive: true });
			writeFileSync(target, "synthetic fixture");
		}
		writeFileSync(trace, JSON.stringify({ version: 1, files: [...excluded, ...retained].map(relative) }));
		const hook = nextConfig.compiler?.runAfterProductionCompile;
		assert.ok(hook, "the real production build must filter the instrumentation trace before standalone copying");
		for (let run = 0; run < 2; run++) {
			await hook({ distDir, projectDir: root });
			assert.deepEqual(JSON.parse(readFileSync(trace, "utf8")), { version: 1, files: retained.map(relative) });
		}
		for (const file of excluded) assert.equal(readFileSync(path.join(root, file), "utf8"), "synthetic fixture", "source records must remain untouched");
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});
