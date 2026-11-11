import assert from "node:assert/strict";

export const outcomes = ["verified", "failed", "blocked", "not-run", "incomplete", "uncertain", "missing-verification", "missing-capability"];

export function aggregate(results) {
	assert.ok(Array.isArray(results));
	if (!results.length) return "missing-verification";
	for (const result of results) assert.ok(outcomes.includes(result), `Unknown outcome: ${result}`);
	for (const status of ["failed", "missing-capability", "blocked", "uncertain", "incomplete", "missing-verification", "not-run"]) {
		if (results.includes(status)) return status;
	}
	return "verified";
}

export function coverage(catalog, observed) {
	const stories = catalog.stories.map(story => ({ ...story, outcome: observed[story.id] ?? (story.automation === "executable" ? "not-run" : story.automation) }));
	return { stories, journey: aggregate(stories.map(story => story.outcome)), efficacyClaim: false, subjectAccuracyClaim: false };
}

export function selectStories(catalog, id) {
	const selected = new Set();
	function visit(storyId) {
		const story = catalog.stories.find(item => item.id === storyId);
		assert.ok(story, `Unknown story: ${storyId}`);
		assert.equal(story.automation, "executable", `${storyId}: ${story.automation}; feature implementation is gated`);
		if (selected.has(storyId)) return;
		selected.add(storyId);
		for (const dependency of story.dependencies) visit(dependency);
	}
	visit(id);
	return [...selected];
}

export function cucumberOutcomes(features, ids) {
	const observed = {};
	for (const id of ids) {
		const scenarios = features.flatMap(feature => feature.elements ?? []).filter(scenario => scenario.tags?.some(tag => tag.name === `@${id}`));
		const statuses = scenarios.flatMap(scenario => scenario.steps.map(step => step.result?.status));
		observed[id] = !statuses.length ? "missing-verification" : statuses.every(status => status === "passed") ? "verified"
			: statuses.some(status => status === "failed" || status === "ambiguous") ? "failed"
			: statuses.some(status => status === "undefined" || status === "pending") ? "missing-verification" : "incomplete";
	}
	return observed;
}

export function assertResolved(features, ids) {
	for (const id of ids) {
		const scenarios = features.flatMap(feature => feature.elements ?? []).filter(scenario => scenario.tags?.some(tag => tag.name === `@${id}`));
		assert.ok(scenarios.length, `${id}: no executable scenario`);
		for (const scenario of scenarios) {
			assert.ok(scenario.steps.length, `${id}: empty scenario`);
			for (const step of scenario.steps) assert.equal(step.result?.status, "skipped", `${id}: unresolved or pending step: ${step.name}`);
		}
	}
}

export class RunBudget {
	constructor(now = () => Date.now()) {
		this.now = now;
		this.started = now();
		this.requests = 0;
		this.learnerTurns = 0;
		this.status = "running";
	}
	admit(kind) {
		assert.ok(["model", "learner"].includes(kind));
		if (this.status !== "running" || this.now() - this.started >= 20 * 60_000 || this.requests >= 30 || this.learnerTurns >= 12) {
			this.status = "incomplete";
			throw new Error("Run cap reached; retain partial evidence; no retries or fallback");
		}
		if (kind === "model") this.requests++;
		else this.learnerTurns++;
	}
	stop() { this.status = "incomplete"; }
}

export function livePreflight() {
	return {
		status: "blocked",
		reasons: ["No owner-approved reference subject/key and evaluator calibration", "No live adapter with proven process/tool isolation and shared dispatch accounting"],
		modelRequests: 0,
		credentialAccess: false,
	};
}
