import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { execFileSync } from "node:child_process";
import { describe, it } from "node:test";

const REPO_ROOT = path.resolve(import.meta.dirname, "..");
const TSX_LOADER = path.join(REPO_ROOT, "node_modules", "tsx", "dist", "loader.mjs");

describe("LH_DATA_DIR seam", () => {
	it("relocates data/chats/graph under LH_DATA_DIR, keeps prompts ROOT-anchored", async () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lh-seam-"));
		process.env.LH_DATA_DIR = dir;
		try {
			const { PATHS, ROOT } = await import("../config.ts");
			assert.equal(PATHS.data, dir, "PATHS.data resolves the env value (resolved absolute)");
			assert.equal(PATHS.chats, path.join(dir, "chats"));
			assert.equal(PATHS.graph, path.join(dir, "graph"));
			assert.equal(
				PATHS.teacherPrompt,
				path.join(ROOT, "src", "agent", "system-prompt.md"),
				"read-only prompt assets stay bundle-anchored on purpose",
			);
		} finally {
			delete process.env.LH_DATA_DIR;
		}
	});

	it("unset selects the approved external Linux profile without touching the home (fresh child process)", () => {
		const home = fs.mkdtempSync(path.join(os.tmpdir(), "lh-default-profile-"));
		try {
			const environment: NodeJS.ProcessEnv = { ...process.env, HOME: home, USERPROFILE: home };
			for (const name of ["LH_PROFILE_DIR", "LH_DATA_DIR", "LH_AUTH_FILE", "NODE_ENV", "NODE_TEST_CONTEXT"]) delete environment[name];
			const out = execFileSync(
				process.execPath,
				["--import", TSX_LOADER, "--eval", `const configuration = await import(${JSON.stringify(path.join(REPO_ROOT, "config.ts"))}); console.log(JSON.stringify({ data: configuration.PATHS.data, chats: configuration.PATHS.chats }));`],
				{ cwd: REPO_ROOT, encoding: "utf-8", env: environment },
			);
			const parsed = JSON.parse(out) as { data: string; chats: string | null };
			const expected = process.platform === "linux" ? path.join(home, ".config", "learnharness", "data") : path.join(REPO_ROOT, "data");
			assert.equal(parsed.data, expected);
			assert.equal(parsed.chats, path.join(expected, "chats"));
			assert.deepEqual(fs.readdirSync(home), []);
		} finally { fs.rmSync(home, { recursive: true }); }
	});

	function resolveInTestChild(home: string, extra: Record<string, string>, marker: Record<string, string>) {
		const environment: NodeJS.ProcessEnv = { ...process.env, HOME: home, USERPROFILE: home, ...marker, ...extra };
		for (const name of ["LH_PROFILE_DIR", "LH_DATA_DIR", "LH_AUTH_FILE", "NODE_ENV", "NODE_TEST_CONTEXT"]) {
			if (!(name in extra) && !(name in marker)) delete environment[name];
		}
		const out = execFileSync(
			process.execPath,
			["--import", TSX_LOADER, "--eval", `const configuration = await import(${JSON.stringify(path.join(REPO_ROOT, "config.ts"))}); console.log(JSON.stringify({ data: configuration.PATHS.data, profile: process.env.LH_PROFILE_DIR ?? null }));`],
			{ cwd: REPO_ROOT, encoding: "utf-8", env: environment },
		);
		return JSON.parse(out) as { data: string; profile: string | null };
	}

	const markers: Record<string, string>[] = [{ NODE_ENV: "test" }, { NODE_TEST_CONTEXT: "child-v8" }];
	for (const marker of markers) {
		it(`a test process (${Object.keys(marker)[0]}) with no profile gets a throwaway one, never the real home profile`, () => {
			const home = fs.mkdtempSync(path.join(os.tmpdir(), "lh-test-isolation-"));
			try {
				const parsed = resolveInTestChild(home, {}, marker);
				assert.ok(parsed.profile, "the throwaway profile is exported for child processes");
				assert.equal(parsed.data, path.join(parsed.profile!, "data"));
				assert.ok(path.basename(parsed.profile!).startsWith("lh-test-profile-"));
				assert.equal(path.dirname(parsed.profile!), os.tmpdir(), "it lives in the system temp folder");
				assert.ok(!parsed.data.startsWith(home), "nothing resolves under the home");
				assert.deepEqual(fs.readdirSync(home), [], "no ~/.config/learnharness is created");
				fs.rmSync(parsed.profile!, { recursive: true, force: true });
			} finally { fs.rmSync(home, { recursive: true }); }
		});
	}

	it("an explicit LH_DATA_DIR still wins in a test process", () => {
		const home = fs.mkdtempSync(path.join(os.tmpdir(), "lh-test-isolation-"));
		const data = fs.mkdtempSync(path.join(os.tmpdir(), "lh-test-explicit-"));
		try {
			const parsed = resolveInTestChild(home, { LH_DATA_DIR: data }, { NODE_ENV: "test" });
			assert.equal(parsed.data, data);
			assert.equal(parsed.profile, null, "no throwaway profile is invented over an explicit choice");
			assert.deepEqual(fs.readdirSync(home), []);
		} finally { fs.rmSync(home, { recursive: true }); fs.rmSync(data, { recursive: true }); }
	});
});
