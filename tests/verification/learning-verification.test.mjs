import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { aggregate, coverage, selectStories, assertResolved, cucumberOutcomes, RunBudget, livePreflight, outcomes, validateCatalog, catalogReport } from "../../scripts/lib/learning-verification.mjs";

const catalog = JSON.parse(fs.readFileSync(new URL("../../verification/learning/stories.json", import.meta.url), "utf8"));
const inventory = JSON.parse(fs.readFileSync(new URL("../../verification/learning/inventory.json", import.meta.url), "utf8"));
const learningDir = new URL("../../verification/learning/", import.meta.url);
const featureTags = new Set(fs.readdirSync(learningDir).filter(name => name.endsWith(".feature")).flatMap(name => fs.readFileSync(new URL(name, learningDir), "utf8").match(/@LJ-[A-Z0-9-]+/g) ?? []));
const clone = value => structuredClone(value);
const scenario = status => [{ elements: [{ tags: [{ name: "@LJ-START" }], steps: [{ name: "real action", result: { status } }] }] }];

test("V-2: only every required expectation passing can verify a journey", () => {
	assert.equal(aggregate(["verified", "verified"]), "verified");
	assert.equal(aggregate([]), "missing-verification");
	for (const status of outcomes.filter(value => value !== "verified")) {
		assert.equal(aggregate(["verified", status, "verified"]), status);
	}
	assert.equal(aggregate(["failed", "blocked", "verified"]), "failed");
	assert.throws(() => aggregate(["looks-good"]), /Unknown outcome/);
});

test("availability is independent of evidence; partial reference coverage cannot become a pass", () => {
	const result = coverage(catalog, { "LJ-START": "verified", "LJ-PROGRESS": "verified", "LJ-RETURN": "verified" });
	assert.notEqual(result.journey, "verified");
	assert.equal(result.stories.find(story => story.id === "LJ-REVIEW").availability, "unavailable");
	assert.equal(result.stories.find(story => story.id === "LJ-REVIEW").outcome, "missing-verification");
	assert.equal(result.subjectAccuracyClaim, false);
	assert.equal(result.efficacyClaim, false);
});

test("V-1: selection includes dependencies and rejects missing verification, blocked and unknown stories", () => {
	assert.deepEqual(selectStories(catalog, "LJ-RETURN"), ["LJ-RETURN", "LJ-PROGRESS", "LJ-START"]);
	assert.deepEqual(selectStories(catalog, "LJ-PRACTICE-RESUME"), ["LJ-PRACTICE-RESUME", "LJ-PRACTICE"]);
	for (const id of ["LJ-BACKUP", "LJ-RECORDS", "LJ-FIND-EARLIER"]) assert.throws(() => selectStories(catalog, id), /missing-verification/);
	for (const id of ["LJ-DRILL-PRESCRIBED", "LJ-DEVICE-CONTINUITY"]) assert.throws(() => selectStories(catalog, id), /blocked/);
	assert.throws(() => selectStories(catalog, "LJ-REVIEW"), /missing-verification/);
	assert.throws(() => selectStories(catalog, "LJ-TUTOR"), /blocked/);
	assert.throws(() => selectStories(catalog, "typo"), /Unknown story/);
});

test("Cucumber resolution rejects absent, pending, undefined, ambiguous and empty scenarios", () => {
	assertResolved(scenario("skipped"), ["LJ-START"]);
	for (const status of ["pending", "undefined", "ambiguous", "failed"]) assert.throws(() => assertResolved(scenario(status), ["LJ-START"]));
	assert.throws(() => assertResolved([], ["LJ-START"]));
	assert.throws(() => assertResolved([{ elements: [{ tags: [{ name: "@LJ-START" }], steps: [] }] }], ["LJ-START"]));
});

test("V-4: a failed required expectation wins; pending, skipped and absent steps never verify", () => {
	assert.equal(cucumberOutcomes(scenario("passed"), ["LJ-START"])["LJ-START"], "verified");
	for (const [status, expected] of [["failed", "failed"], ["ambiguous", "failed"], ["pending", "missing-verification"], ["undefined", "missing-verification"], ["skipped", "incomplete"]]) {
		assert.equal(cucumberOutcomes(scenario(status), ["LJ-START"])["LJ-START"], expected);
	}
	assert.equal(cucumberOutcomes([], ["LJ-START"])["LJ-START"], "missing-verification");
});

test("V-5: controlled accounting refuses dispatch past shared caps and after cancellation", () => {
	const requests = new RunBudget();
	for (let index = 0; index < 30; index++) requests.admit("model");
	assert.throws(() => requests.admit("model"), /cap reached/);
	assert.equal(requests.requests, 30);
	assert.equal(requests.status, "incomplete");
	const turns = new RunBudget();
	for (let index = 0; index < 12; index++) turns.admit("learner");
	assert.throws(() => turns.admit("model"), /cap reached/);
	assert.equal(turns.requests, 0);
	let clock = 0;
	const timed = new RunBudget(() => clock);
	clock = 20 * 60_000;
	assert.throws(() => timed.admit("model"), /cap reached/);
	const cancelled = new RunBudget();
	cancelled.stop();
	assert.throws(() => cancelled.admit("model"), /cap reached/);
});

test("unsafe live execution fails closed before credential access or model dispatch", () => {
	const result = livePreflight();
	assert.equal(result.status, "blocked");
	assert.equal(result.modelRequests, 0);
	assert.equal(result.credentialAccess, false);
	assert.equal(result.reasons.length, 2);
});

test("the actual CLI exits nonzero on runtime skips and pending checks, even when Cucumber exits zero", () => {
	const root = fileURLToPath(new URL("../../", import.meta.url));
	for (const command of [["select", "LJ-START"], ["run", "--story", "LJ-START"]]) {
		for (const status of ["skipped", "pending", "passed"]) {
			const child = spawnSync(process.execPath, ["--import", "./tests/verification/cucumber-process-double.mjs", "scripts/verify-learning.mjs", ...command], { cwd: root, encoding: "utf8", env: { ...process.env, LH_CUCUMBER_TEST_STATUS: status } });
			const result = JSON.parse(child.stdout);
			assert.equal(child.status, status === "passed" ? 0 : 1, `${command.join(" ")}: ${status}`);
			assert.equal(result.status, status === "passed" ? command[0] === "select" ? "executable" : "checks-passed" : "incomplete");
		}
	}
});

test("the catalog and source inventory are complete and consistent", () => {
	assert.deepEqual(validateCatalog(catalog, inventory, featureTags), []);
	for (const id of ["LJ-START", "LJ-PROGRESS", "LJ-RETURN", "LJ-REVIEW", "LJ-CHECK", "LJ-CONTINUE", "LJ-TUTOR"]) {
		assert.ok(catalog.stories.some(story => story.id === id), `Stable foundation id ${id} is preserved`);
	}
	const covered = inventory.rows.filter(row => row.source === "I49").flatMap(row => Array.from({ length: row.items[1] - row.items[0] + 1 }, (_, index) => row.items[0] + index));
	assert.deepEqual(covered.sort((a, b) => a - b), Array.from({ length: 86 }, (_, index) => index + 1), "Every #49 user story is accounted for once");
});

test("catalog validation rejects untraceable, inconsistent and unapproved entries", () => {
	const mutate = (change, pattern) => {
		const next = clone(catalog), rows = clone(inventory), tags = new Set(featureTags);
		change(next, rows, tags);
		const problems = validateCatalog(next, rows, tags);
		assert.ok(problems.some(problem => pattern.test(problem)), `${pattern}: ${problems.join("; ")}`);
	};
	mutate(next => next.stories.push(clone(next.stories[0])), /Duplicate story id/);
	mutate(next => { next.stories[0].dependencies = ["LJ-RETURN"]; }, /Dependency cycle/);
	mutate(next => { next.stories[0].dependencies = ["LJ-NOPE"]; }, /unknown dependency/);
	mutate(next => { next.stories[0].sources = ["a blog post"]; }, /unknown source/);
	mutate(next => { next.stories[0].acceptance.failureOrReturn = []; }, /missing failureOrReturn/);
	mutate(next => { next.stories.find(story => story.id === "LJ-REVIEW").automation = "executable"; }, /executable without a scenario/);
	mutate((next, rows, tags) => tags.delete("@LJ-START"), /no feature scenario is tagged @LJ-START/);
	mutate((next, rows, tags) => tags.add("@LJ-REVIEW"), /has a tagged scenario but is marked missing-verification/);
	mutate((next, rows, tags) => tags.add("@LJ-GHOST"), /no catalog story/);
	mutate(next => { next.decisions = next.decisions.filter(decision => decision.id !== "D-1" && decision.id !== "D-2" && decision.id !== "D-8"); }, /LJ-TUTOR: blocked without a named owner decision/);
	mutate(next => { next.stories.find(story => story.id === "LJ-BACKUP").availability = "probably"; }, /invalid availability/);
	mutate((next, rows) => { rows.rows = rows.rows.filter(row => !row.stories?.includes("LJ-BACKUP")); }, /LJ-BACKUP: not traced/);
	mutate((next, rows) => { rows.rows.find(row => row.disposition === "deferred").reason = ""; }, /deferred without a reason/);
	mutate((next, rows) => { rows.rows.find(row => row.locator === "story 85").items = [84, 85]; }, /I49 item 84 is accounted for 2 times/);
	mutate((next, rows) => { rows.rows = rows.rows.filter(row => row.locator !== "story 86"); }, /I49 item 86 is accounted for 0 times/);
});

test("the owner report keeps availability, readiness and run outcome separate", () => {
	const report = catalogReport(catalog, inventory, { "LJ-PRACTICE": "verified" });
	assert.match(report, /\| LJ-PRACTICE: [^|]+ \| available \| executable \| verified \|/);
	assert.match(report, /\| LJ-BACKUP: [^|]+ \| unavailable \| missing-verification \| not-run \|/);
	assert.match(report, /\*\*D-1\*\*/);
	assert.match(report, /Missing verification is not a product-gap finding/);
	const result = coverage(catalog, Object.fromEntries(catalog.stories.filter(story => story.automation === "executable").map(story => [story.id, "verified"])));
	assert.notEqual(result.journey, "verified", "All executable stories passing cannot verify the whole catalog");
});

test("an invalid catalog refuses every CLI command before any run", () => {
	const root = fileURLToPath(new URL("../../", import.meta.url));
	const child = spawnSync(process.execPath, ["--import", "./tests/verification/catalog-invalid-double.mjs", "scripts/verify-learning.mjs", "select", "LJ-START"], { cwd: root, encoding: "utf8" });
	assert.equal(child.status, 1);
	assert.match(child.stderr, /Story catalog is invalid/);
	assert.equal(child.stdout, "");
});
