import assert from "node:assert/strict";
import test from "node:test";
import { buildIdentity } from "../../electron/deployment-build.cjs";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

test("isolated builds use exactly their prepared source identity without exposing host Git", () => {
	const names = ["LH_PREVIEW_PROFILE", "LH_COMMIT", "LH_SOURCE_SHA256"];
	const original = Object.fromEntries(names.map(name => [name, process.env[name]]));
	try {
		process.env.LH_PREVIEW_PROFILE = "1";
		delete process.env.LH_COMMIT;
		delete process.env.LH_SOURCE_SHA256;
		assert.throws(() => buildIdentity("/not-mounted"), /prepared source identity/);
		process.env.LH_COMMIT = "a".repeat(40);
		process.env.LH_SOURCE_SHA256 = "b".repeat(64);
		assert.deepEqual(buildIdentity("/not-mounted"), { revision: process.env.LH_COMMIT, sourceHash: process.env.LH_SOURCE_SHA256 });
		process.env.LH_SOURCE_SHA256 = "unknown";
		assert.throws(() => buildIdentity("/not-mounted"), /prepared source identity/);
	} finally { for (const name of names) if (original[name] === undefined) delete process.env[name]; else process.env[name] = original[name]; }
});

test("packaged source identity includes shipped public assets", () => {
	const directory = fs.mkdtempSync("/tmp/lh-build-identity-");
	const git = (...argumentsList) => execFileSync("git", ["-C", directory, ...argumentsList], { stdio: "ignore" });
	try {
		fs.mkdirSync(path.join(directory, "public"));
		fs.writeFileSync(path.join(directory, "public", "fixture.txt"), "first");
		git("init", "--initial-branch=main");
		git("add", "public/fixture.txt");
		git("-c", "user.name=Synthetic fixture", "-c", "user.email=fixture@example.invalid", "commit", "-m", "Synthetic asset baseline");
		const before = buildIdentity(directory);
		fs.writeFileSync(path.join(directory, "public", "fixture.txt"), "second");
		const after = buildIdentity(directory);
		assert.equal(after.revision, before.revision);
		assert.notEqual(after.sourceHash, before.sourceHash);
	} finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
