#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { coverage, selectStories, assertResolved, cucumberOutcomes, livePreflight, validateCatalog, catalogReport, runLimits } from "./lib/learning-verification.mjs";
import { sourceFingerprint } from "./mobile-browser-result.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const catalogPath = path.join(root, "verification/learning/stories.json");
const learningDir = path.join(root, "verification/learning");
const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
const inventory = JSON.parse(fs.readFileSync(path.join(learningDir, "inventory.json"), "utf8"));
const features = fs.readdirSync(learningDir).filter(name => name.endsWith(".feature")).sort();
const featureTags = new Set(features.flatMap(name => fs.readFileSync(path.join(learningDir, name), "utf8").match(/@LJ-[A-Z0-9-]+/g) ?? []));
const [command = "list", ...args] = process.argv.slice(2);
assert.ok(["list", "report", "validate", "select", "run"].includes(command), "Usage: verify-learning.mjs list | report | validate | select STORY | run [--story STORY] [--live]");
const problems = validateCatalog(catalog, inventory, featureTags);
if (problems.length) {
	console.error(`Story catalog is invalid; no selection or run is admitted:\n- ${problems.join("\n- ")}`);
	process.exit(1);
}
if (command === "validate") {
	console.log(JSON.stringify({ status: "valid", stories: catalog.stories.length, inventoryRows: inventory.rows.length, decisions: catalog.decisions.length }, null, 2));
} else if (command === "list") {
	console.log(JSON.stringify(coverage(catalog, {}), null, 2));
} else if (command === "report") {
	process.stdout.write(catalogReport(catalog, inventory));
} else {
	const stamp = new Date().toISOString().replaceAll(":", "-");
	fs.mkdirSync(path.join(root, ".prove-it/runs"), { recursive: true });
	const run = fs.mkdtempSync(path.join(root, ".prove-it/runs", `${stamp}-zz-prove-it-learning-`));
	const write = (name, data) => fs.writeFileSync(path.join(run, name), JSON.stringify(data, null, 2) + "\n", { mode: 0o600 });
	const sha = file => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
	const git = params => execFileSync("git", params, { cwd: root, encoding: "utf8" }).trim();
	const result = {
		schemaVersion: 1, status: "incomplete", startedAt: new Date().toISOString(),
		candidate: { revision: git(["rev-parse", "HEAD"]), dirty: git(["status", "--porcelain"]) !== "", sourceSha256: await sourceFingerprint(root), verificationSha256: createHash("sha256").update(fs.readdirSync(learningDir, { recursive: true }).map(String).filter(name => fs.statSync(path.join(learningDir, name)).isFile()).sort().map(name => `${name}=${sha(path.join(learningDir, name))}`).join(":")).digest("hex") },
		expectations: { path: catalog.expectations, sha256: sha(path.join(root, catalog.expectations)), approval: catalog.approval },
		environment: { runtime: process.version, platform: process.platform, target: "local synthetic Chromium", mode: "scripted faux provider; not live subject evaluation", nativeElectron: "not-run", iPhoneHomeScreen: "not-run", iPadHomeScreen: "not-run" },
		limits: { ...runLimits, calibration: "separate preflight, not counted", automaticRetries: 0, liveDispatch: "disabled" },
		...coverage(catalog, {}),
	};
	write("result.json", result);
	try {
		if (args.includes("--live")) {
			result.preflight = livePreflight();
			result.status = "blocked";
			throw new Error(result.preflight.reasons.join("; "));
		}
		const storyIndex = args.indexOf("--story");
		if (storyIndex >= 0) assert.ok(args[storyIndex + 1], "--story requires a story id");
		const ids = command === "select" ? selectStories(catalog, args[0]) : storyIndex >= 0 ? selectStories(catalog, args[storyIndex + 1]) : catalog.stories.filter(story => story.automation === "executable").map(story => story.id);
		result.selected = ids;
		const tags = ids.map(id => `@${id}`).join(" or ");
		const cucumber = dry => {
			const file = path.join(run, dry ? "resolution.json" : "cucumber.json");
			const child = spawnSync(process.execPath, [path.join(root, "node_modules/@cucumber/cucumber/bin/cucumber.js"), ...features.map(name => `verification/learning/${name}`), "--import", "verification/learning/steps.mjs", "--tags", tags, "--format", `json:${file}`, "--format", "progress", ...(dry ? ["--dry-run"] : [])], {
				cwd: root, env: { PATH: process.env.PATH, HOME: path.join(run, "home"), LANG: "C.UTF-8", CHROMIUM_PATH: process.env.CHROMIUM_PATH ?? "/usr/bin/chromium", LH_JOURNEY_RUN: run }, encoding: "utf8", timeout: 20 * 60_000,
			});
			fs.writeFileSync(path.join(run, dry ? "resolution.log" : "cucumber.log"), `${child.stdout ?? ""}\n${child.stderr ?? ""}\n${child.error?.stack ?? ""}`);
			assert.ok(fs.existsSync(file), `Cucumber produced no evidence: ${child.error?.message ?? child.stderr}`);
			const evidence = JSON.parse(fs.readFileSync(file, "utf8"));
			if (dry) assertResolved(evidence, ids);
			else Object.assign(result, coverage(catalog, cucumberOutcomes(evidence, ids)));
			assert.equal(child.status, 0, `Cucumber failed; see ${file}`);
		};
		cucumber(true);
		cucumber(false);
		result.status = command === "select" && aggregateSelected(result) === "checks-passed" ? "executable" : aggregateSelected(result);
		if (aggregateSelected(result) !== "checks-passed") process.exitCode = 1;
	} catch (error) {
		result.error = error.message;
		if (result.status !== "blocked") result.status = result.stories.some(story => story.outcome === "failed") ? "failed" : "blocked";
		process.exitCode = 1;
	} finally {
		result.finishedAt = new Date().toISOString();
		write("result.json", result);
		fs.writeFileSync(path.join(run, "coverage.md"), `# Learning verification coverage\n\nCandidate: ${result.candidate.revision} (dirty: ${result.candidate.dirty}); source ${result.candidate.sourceSha256}\n\nChecks: ${result.status}. Intended journey: ${result.journey}. No subject-accuracy or learning-efficacy claim.\n\n| Story | Availability | Readiness | Outcome | Claim |\n| --- | --- | --- | --- | --- |\n${result.stories.map(story => `| ${story.id}: ${story.title} | ${story.availability} | ${story.automation} | ${story.outcome} | ${story.claims.join("; ")} |`).join("\n")}\n\nExpectations: ${result.expectations.path}, SHA-256 ${result.expectations.sha256}.\n\nNot covered: automatic probe-to-teacher wake; actual question grading/assessment ownership; hint size and verdict quality; independent tutor evaluation; evidence-guided adaptation; cross-process durability; unsubmitted draft durability; native Electron; physical iPhone/iPad Home Screen apps.\n\nLive dispatch is disabled. Budget probes are controlled accounting tests, not proof of a live provider boundary. Evidence stays local; no automatic upload or removal.\n${result.error ? `\nError: ${result.error}\n` : ""}`);
		console.log(JSON.stringify({ status: result.status, journey: result.journey, selected: result.selected, error: result.error, evidence: run }, null, 2));
	}
}

function aggregateSelected(result) {
	return result.selected.every(id => result.stories.find(story => story.id === id)?.outcome === "verified") ? "checks-passed" : "incomplete";
}
