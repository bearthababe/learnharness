/** One parent-owned receipt; child IPC reports suite boundaries, never log parsing. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { writeFileSync, renameSync } from "node:fs";
import { lstat, readdir, readFile, readlink } from "node:fs/promises";
import path from "node:path";

export const sourceEntries = ["app", "components", "src", "lib", "public", "electron", "scripts", "config.ts", "package.json", "package-lock.json", "tsconfig.json", "postcss.config.mjs", "next.config.ts"];
export const suiteNames = ["inputs-notebook", "reveal", "layout"];

// Hash copied source before fixture route substitutions. Dependencies are identified
// by package-lock.json, not by traversing the installed node_modules tree.
export async function sourceFingerprint(root) {
	const hash = createHash("sha256");
	async function visit(relative) {
		const file = path.join(root, relative);
		const stat = await lstat(file);
		const type = stat.isDirectory() ? "directory" : stat.isSymbolicLink() ? "symlink" : "file";
		hash.update(JSON.stringify([relative.split(path.sep).join("/"), type, stat.mode & 0o111]) + "\n");
		if (stat.isDirectory()) {
			for (const name of (await readdir(file)).sort()) await visit(path.join(relative, name));
		} else {
			const bytes = stat.isSymbolicLink() ? Buffer.from(await readlink(file)) : await readFile(file);
			hash.update(`${bytes.length}:`).update(bytes);
		}
	}
	for (const entry of [...sourceEntries].sort()) await visit(entry);
	return hash.digest("hex");
}

export async function reportBrowserEvent(event) {
	if (process.send) await new Promise((resolve, reject) => process.send(event, error => error ? reject(error) : resolve()));
}

export function createRunResult(directory) {
	const file = path.join(directory, "result.json");
	const result = {
		schemaVersion: 1,
		status: "running",
		startedAt: new Date().toISOString(),
		finishedAt: null,
		source: { revision: null, dirty: null, sha256: null },
		artifacts: { directory, log: path.join(directory, "runner.log"), fixture: null },
		suites: suiteNames.map(name => ({ name, status: "not-run", startedAt: null, finishedAt: null, error: null })),
		error: null,
	};
	const save = () => {
		writeFileSync(`${file}.tmp`, JSON.stringify(result, null, 2) + "\n");
		renameSync(`${file}.tmp`, file);
	};
	save();
	return {
		file,
		setSource(source) { result.source = source; save(); },
		event(event) {
			if (result.status !== "running") return;
			if (event.type === "fixture") {
				assert.equal(result.artifacts.fixture, null, "Fixture already recorded");
				assert.equal(event.sha256, result.source.sha256, "Copied source changed after run started; rerun from a stable checkout");
				const relative = path.relative(directory, event.directory);
				assert.ok(relative && !relative.startsWith("..") && !path.isAbsolute(relative), "Fixture must belong to this run");
				result.artifacts.fixture = event.directory;
			} else {
				assert.ok(result.artifacts.fixture, "Suite started before source verification");
				const suite = result.suites.find(item => item.name === event.suite);
				assert.ok(suite, "Unknown browser suite");
				if (event.type === "start") {
					assert.equal(suite.status, "not-run", "Suite already started");
					assert.ok(result.suites.slice(0, result.suites.indexOf(suite)).every(item => item.status === "passed"), "Previous suites must pass first");
					suite.status = "running";
					suite.startedAt = new Date().toISOString();
				} else {
					assert.equal(event.type, "pass", "Unknown browser event");
					assert.equal(suite.status, "running", "Suite must start before passing");
					suite.status = "passed";
					suite.finishedAt = new Date().toISOString();
				}
			}
			save();
		},
		finish(status, error = null) {
			if (result.status !== "running") return;
			if (status === "passed") assert.ok(result.suites.every(item => item.status === "passed"), "Child exited without passing every suite");
			result.status = status;
			result.error = error;
			result.finishedAt = new Date().toISOString();
			for (const suite of result.suites.filter(item => item.status === "running")) {
				suite.status = status;
				suite.error = error;
				suite.finishedAt = result.finishedAt;
			}
			save();
		},
	};
}
