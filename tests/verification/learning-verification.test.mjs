import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { aggregate, coverage, selectStories, assertResolved, cucumberOutcomes, RunBudget, livePreflight, outcomes } from "../../scripts/lib/learning-verification.mjs";

const catalog = JSON.parse(fs.readFileSync(new URL("../../verification/learning/stories.json", import.meta.url), "utf8"));
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
	assert.equal(result.stories.find(story => story.id === "LJ-REVIEW").availability, "unknown");
	assert.equal(result.stories.find(story => story.id === "LJ-REVIEW").outcome, "missing-verification");
	assert.equal(result.subjectAccuracyClaim, false);
	assert.equal(result.efficacyClaim, false);
});

test("V-1: selection includes dependencies and rejects missing verification, blocked and unknown stories", () => {
	assert.deepEqual(selectStories(catalog, "LJ-RETURN"), ["LJ-RETURN", "LJ-PROGRESS", "LJ-START"]);
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
