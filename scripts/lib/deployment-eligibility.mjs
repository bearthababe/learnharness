import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execute = promisify(execFile);
const commitPattern = /^[a-f0-9]{40}$/;

export class DeploymentHistoryError extends Error {}
export class DeploymentEligibilityError extends Error {}

export function ciDecision(sha, pages, repository) {
	if (!commitPattern.test(sha)) throw new Error("Invalid exact main commit");
	if (!Array.isArray(pages) || !pages.length || pages.some(page => !Array.isArray(page.workflow_runs))) throw new DeploymentEligibilityError("Malformed CI response; local resolution required");
	const runs = pages.flatMap(page => page.workflow_runs).filter(run => run.head_sha === sha && run.head_branch === "main" && ["push", "workflow_dispatch"].includes(run.event));
	for (const run of runs) {
		if (run.repository?.full_name !== repository || run.path !== ".github/workflows/ci.yml" || !Number.isSafeInteger(run.id) || !Number.isSafeInteger(run.run_attempt) || !Number.isFinite(Date.parse(run.created_at))) throw new DeploymentEligibilityError("Ambiguous exact-main CI identity; local resolution required");
	}
	const identities = new Map();
	for (const run of runs) {
		const identity = `${run.id}:${run.run_attempt}`;
		const prior = identities.get(identity);
		if (prior && JSON.stringify(prior) !== JSON.stringify(run)) throw new DeploymentEligibilityError("Conflicting CI observations; local resolution required");
		identities.set(identity, run);
		if (!["queued", "in_progress", "completed", "waiting", "pending", "requested"].includes(run.status) || run.status === "completed" && run.conclusion != null && !["success", "failure", "cancelled", "timed_out", "action_required", "neutral", "skipped", "stale", "startup_failure"].includes(run.conclusion)) throw new DeploymentEligibilityError("Unknown CI outcome; local resolution required");
	}
	runs.sort((left, right) => Date.parse(right.created_at) - Date.parse(left.created_at) || right.id - left.id || right.run_attempt - left.run_attempt);
	const latest = runs[0];
	if (!latest) return { sha, eligible: false, reason: "missing-ci", runId: null };
	const eligible = latest.status === "completed" && latest.conclusion === "success";
	return { sha, eligible, reason: eligible ? "ci-success" : latest.status !== "completed" ? "ci-pending" : `ci-${latest.conclusion || "missing-conclusion"}`, runId: latest.id, attempt: latest.run_attempt };
}

export async function observeMain({ root, repository, previousSha, runningSha, github }) {
	if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository || "")) throw new DeploymentEligibilityError("Explicit GitHub repository is required");
	const git = async (...argumentsList) => (await execute("git", ["-C", root, ...argumentsList], { encoding: "utf8", timeout: 30000, maxBuffer: 4 * 1024 * 1024 })).stdout.trim();
	const remote = await git("remote", "get-url", "origin");
	if (![ `git@github.com:${repository}.git`, `https://github.com/${repository}.git`, `https://github.com/${repository}` ].includes(remote)) throw new DeploymentEligibilityError("Origin does not match the explicit deployment repository");
	await git("fetch", "--no-tags", "origin", "+refs/heads/main:refs/remotes/origin/main");
	const sha = await git("rev-parse", "refs/remotes/origin/main");
	if (!commitPattern.test(sha)) throw new Error("Invalid fetched main commit");
	for (const ancestor of new Set([previousSha, runningSha].filter(Boolean))) {
		if (!commitPattern.test(ancestor)) throw new DeploymentHistoryError("Unknown deployment history; local resolution required");
		try { await git("merge-base", "--is-ancestor", ancestor, sha); }
		catch { throw new DeploymentHistoryError("Main was rewritten, downgraded or disconnected; local resolution required"); }
	}
	const endpoint = `repos/${repository}/actions/workflows/ci.yml/runs?branch=main&head_sha=${sha}&per_page=100`;
	const pages = github ? await github(endpoint) : JSON.parse((await execute("gh", ["api", endpoint, "--paginate", "--slurp"], { encoding: "utf8", timeout: 30000, maxBuffer: 4 * 1024 * 1024 })).stdout);
	return ciDecision(sha, pages, repository);
}

export function candidateDecision(observation, { runningSha, failedSha, retrySha } = {}) {
	if (!observation.eligible) return observation;
	if (observation.sha === runningSha) return { ...observation, eligible: false, reason: "already-running" };
	if (observation.sha === failedSha && observation.sha !== retrySha) return { ...observation, eligible: false, reason: "failed-awaiting-new-main-or-local-retry" };
	return observation;
}
