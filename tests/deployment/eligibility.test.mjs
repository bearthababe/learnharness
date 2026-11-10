import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { candidateDecision, ciDecision, DeploymentHistoryError, observeMain } from "../../scripts/lib/deployment-eligibility.mjs";

const newest = "a".repeat(40);
const older = "b".repeat(40);
const repository = "bearthababe/learnharness";
const run = (fields = {}) => ({ id: 100, run_attempt: 1, created_at: "2026-11-07T00:00:00Z", head_sha: newest, head_branch: "main", event: "push", repository: { full_name: repository }, path: ".github/workflows/ci.yml", status: "completed", conclusion: "success", ...fields });
const decide = runs => ciDecision(newest, [{ workflow_runs: runs }], repository);

test("only the newest exact-main complete CI success is eligible", () => {
	assert.equal(decide([run()]).eligible, true);
	assert.equal(decide([run({ head_sha: older })]).reason, "missing-ci");
	for (const conclusion of ["failure", "cancelled", "timed_out", "neutral", "skipped", null]) assert.equal(decide([run({ conclusion })]).eligible, false);
	for (const status of ["queued", "in_progress", "waiting", "pending", "requested"]) assert.equal(decide([run({ status })]).reason, "ci-pending");
	assert.equal(decide([run({ head_branch: "other" }), run({ event: "pull_request" })]).eligible, false);
	assert.equal(decide([]).reason, "missing-ci");
});

test("a later pending/red run or rerun cannot borrow an earlier green", () => {
	for (const fields of [{ status: "queued", conclusion: null }, { conclusion: "failure" }, { conclusion: "cancelled" }]) {
		assert.equal(decide([run(), run({ id: 101, created_at: "2026-11-07T00:01:00Z", ...fields })]).eligible, false);
		assert.equal(decide([run(), run({ run_attempt: 2, ...fields })]).eligible, false);
	}
	assert.equal(ciDecision(newest, [{ workflow_runs: [run()] }, { workflow_runs: [run({ id: 101, conclusion: "failure" })] }], repository).eligible, false);
});

test("CI response ambiguity fails closed rather than authorizing an update", () => {
	for (const pages of [null, [], [{}], [{ workflow_runs: null }]]) assert.throws(() => ciDecision(newest, pages, repository));
	for (const fields of [{ repository: { full_name: "other/repository" } }, { path: ".github/workflows/other.yml" }, { id: "100" }, { run_attempt: undefined }, { created_at: "bad" }]) assert.throws(() => decide([run(fields)]), /Ambiguous/);
	assert.throws(() => ciDecision("unknown", [{ workflow_runs: [] }], repository));
});

test("conflicting attempts and unknown outcomes require local resolution", () => {
	assert.throws(() => decide([run(), run({ conclusion: "failure" })]), /Conflicting CI/);
	assert.throws(() => decide([run({ status: "unrecognized" })]), /Unknown CI/);
	assert.throws(() => decide([run({ conclusion: "unrecognized" })]), /Unknown CI/);
});

test("failed candidates stay suppressed across polls until newer main or explicit matching retry", () => {
	const observation = decide([run()]);
	assert.equal(candidateDecision(observation, { failedSha: newest }).reason, "failed-awaiting-new-main-or-local-retry");
	assert.equal(candidateDecision(observation, { failedSha: newest, retrySha: older }).eligible, false);
	assert.equal(candidateDecision(observation, { failedSha: newest, retrySha: newest }).eligible, true);
	assert.equal(candidateDecision(observation, { failedSha: older }).eligible, true);
	assert.equal(candidateDecision(observation, { runningSha: newest }).reason, "already-running");
	assert.equal(candidateDecision(decide([]), { retrySha: newest }).eligible, false);
});

test("real fetch follows rapid main changes and refuses rewritten deployment history", async context => {
	const directory = fs.mkdtempSync(path.join(os.tmpdir(), "lh-eligibility-"));
	context.after(() => fs.rmSync(directory, { recursive: true, force: true }));
	const upstream = path.join(directory, "upstream");
	const checkout = path.join(directory, "checkout");
	fs.mkdirSync(upstream);
	fs.mkdirSync(checkout);
	const git = (root, ...argumentsList) => execFileSync("git", ["-C", root, ...argumentsList], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, GIT_CONFIG_GLOBAL: os.devNull, GIT_CONFIG_SYSTEM: os.devNull } }).trim();
	for (const root of [upstream, checkout]) {
		git(root, "init", "--initial-branch=main");
		git(root, "config", "user.name", "Synthetic deployment proof");
		git(root, "config", "user.email", "synthetic@example.invalid");
	}
	git(upstream, "commit", "--allow-empty", "-m", "first");
	const first = git(upstream, "rev-parse", "HEAD");
	const transport = path.join(directory, "synthetic-ssh");
	fs.writeFileSync(transport, `#!/bin/sh\nexec git-upload-pack '${upstream}'\n`, { mode: 0o700 });
	git(checkout, "remote", "add", "origin", `git@github.com:${repository}.git`);
	git(checkout, "config", "core.sshCommand", transport);
	git(checkout, "config", "ssh.variant", "simple");
	const github = async endpoint => {
		assert.ok(endpoint.includes("branch=main&head_sha="));
		const sha = new URLSearchParams(endpoint.split("?")[1]).get("head_sha");
		return [{ workflow_runs: [run({ head_sha: sha, conclusion: sha === first ? "success" : "failure" }), run({ head_sha: first })] }];
	};
	assert.equal((await observeMain({ root: checkout, repository, github })).eligible, true);
	git(upstream, "commit", "--allow-empty", "-m", "newest red");
	const second = git(upstream, "rev-parse", "HEAD");
	const observation = await observeMain({ root: checkout, repository, previousSha: first, runningSha: first, github });
	assert.equal(observation.sha, second);
	assert.equal(observation.eligible, false);
	assert.equal(observation.reason, "ci-failure");
	git(upstream, "checkout", "--orphan", "rewritten");
	git(upstream, "commit", "--allow-empty", "-m", "unexpected root");
	git(upstream, "branch", "-f", "main", "HEAD");
	await assert.rejects(observeMain({ root: checkout, repository, previousSha: second, github }), DeploymentHistoryError);
	git(checkout, "remote", "set-url", "origin", "https://github.com/unrelated/repository.git");
	await assert.rejects(observeMain({ root: checkout, repository, github }), /Origin does not match/);
});
