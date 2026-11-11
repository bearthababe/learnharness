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

/** Owner decision 2026-11-10: 100 learner turns; 1,000 requests and 4 hours are runaway guards, not budgets. */
export const runLimits = Object.freeze({ learnerTurns: 100, modelRequests: 1000, minutes: 240 });

export class RunBudget {
	constructor(now = () => Date.now()) {
		this.now = now;
		this.started = now();
		this.requests = 0;
		this.learnerTurns = 0;
		this.status = "running";
		this.halted = false;
	}
	admit(kind) {
		assert.ok(["model", "learner"].includes(kind));
		// Time, the request guard and cancellation halt everything. The learner-turn limit only stops
		// further learner turns, so a run at its turn limit can still be graded. Either way the run is incomplete.
		const timeUp = this.now() - this.started >= runLimits.minutes * 60_000;
		const requestsUp = kind === "model" && this.requests >= runLimits.modelRequests;
		const turnsUp = kind === "learner" && this.learnerTurns >= runLimits.learnerTurns;
		if (this.halted || timeUp || requestsUp || turnsUp) {
			this.status = "incomplete";
			if (timeUp || requestsUp) this.halted = true;
			throw new Error("Run cap reached; retain partial evidence; no retries or fallback");
		}
		if (kind === "model") this.requests++;
		else this.learnerTurns++;
	}
	stop() { this.status = "incomplete"; this.halted = true; }
}


export const availabilities = ["available", "partial", "unavailable", "unknown"];
export const readiness = ["executable", "missing-verification", "blocked"];

/** Structural checks for the story catalog and its source inventory. Returns a list of problems; empty means valid. */
export function validateCatalog(catalog, inventory, featureTags) {
	const problems = [];
	const ids = new Map();
	const sources = Object.keys(catalog.sources ?? {});
	const blockedByDecision = new Set((catalog.decisions ?? []).flatMap(decision => decision.blocks ?? []));
	for (const story of catalog.stories) {
		if (!/^LJ-[A-Z0-9]+(-[A-Z0-9]+)*$/.test(story.id ?? "")) problems.push(`Invalid story id: ${story.id}`);
		if (ids.has(story.id)) problems.push(`Duplicate story id: ${story.id}`);
		ids.set(story.id, story);
	}
	for (const story of catalog.stories) {
		const at = `${story.id}:`;
		for (const field of ["title", "learnerGoal", "availabilityBasis"]) if (typeof story[field] !== "string" || !story[field].trim()) problems.push(`${at} missing ${field}`);
		if (!Array.isArray(story.sources) || !story.sources.length) problems.push(`${at} needs at least one approved source`);
		for (const source of story.sources ?? []) if (!sources.some(key => source === key || source.startsWith(`${key} `))) problems.push(`${at} unknown source ${source}`);
		for (const kind of ["happy", "alternative", "failureOrReturn"]) if (!Array.isArray(story.acceptance?.[kind]) || !story.acceptance[kind].length) problems.push(`${at} missing ${kind} acceptance example`);
		if (!availabilities.includes(story.availability)) problems.push(`${at} invalid availability ${story.availability}`);
		if (!readiness.includes(story.automation)) problems.push(`${at} invalid verification readiness ${story.automation}`);
		for (const field of ["dependencies", "tickets", "claims"]) if (!Array.isArray(story[field])) problems.push(`${at} ${field} must be a list`);
		for (const dependency of story.dependencies ?? []) if (!ids.has(dependency)) problems.push(`${at} unknown dependency ${dependency}`);
		if (story.parent !== undefined && !ids.has(story.parent)) problems.push(`${at} unknown parent ${story.parent}`);
		const scenarios = story.verification?.scenarios;
		if (!Array.isArray(scenarios) || !Array.isArray(story.verification?.supporting)) problems.push(`${at} verification needs scenarios and supporting lists`);
		else if (story.automation === "executable") {
			if (!scenarios.length) problems.push(`${at} executable without a scenario`);
			if (!featureTags.has(`@${story.id}`)) problems.push(`${at} executable but no feature scenario is tagged @${story.id}`);
		} else {
			if (scenarios.length) problems.push(`${at} lists scenarios but is ${story.automation}`);
			if (featureTags.has(`@${story.id}`)) problems.push(`${at} has a tagged scenario but is marked ${story.automation}`);
		}
		if (story.automation === "blocked" && !blockedByDecision.has(story.id)) problems.push(`${at} blocked without a named owner decision`);
	}
	for (const tag of featureTags) if (!ids.has(tag.slice(1))) problems.push(`Feature tag ${tag} has no catalog story`);
	for (const decision of catalog.decisions ?? []) {
		if (!/^D-\d+$/.test(decision.id) || !decision.question || !decision.source) problems.push(`Incomplete decision ${decision.id}`);
		for (const id of decision.blocks ?? []) if (!ids.has(id)) problems.push(`${decision.id} blocks unknown story ${id}`);
	}
	const visiting = new Set(), done = new Set();
	const visit = id => {
		if (done.has(id)) return;
		if (visiting.has(id)) { problems.push(`Dependency cycle through ${id}`); return; }
		visiting.add(id);
		for (const dependency of ids.get(id)?.dependencies ?? []) if (ids.has(dependency)) visit(dependency);
		visiting.delete(id);
		done.add(id);
	};
	for (const id of ids.keys()) visit(id);
	const referenced = new Set();
	for (const row of inventory.rows) {
		const at = `Inventory ${row.source} ${row.locator}:`;
		if (!sources.includes(row.source)) problems.push(`${at} unknown source`);
		if (!row.behavior) problems.push(`${at} missing behavior`);
		if (row.disposition === "story") {
			if (!row.stories?.length) problems.push(`${at} maps to no story`);
			for (const id of row.stories ?? []) if (!ids.has(id)) problems.push(`${at} unknown story ${id}`); else referenced.add(id);
		} else if (["excluded", "deferred"].includes(row.disposition)) {
			if (!row.reason) problems.push(`${at} ${row.disposition} without a reason`);
			if (row.stories?.length) problems.push(`${at} ${row.disposition} rows must not claim stories`);
		} else problems.push(`${at} invalid disposition ${row.disposition}`);
	}
	for (const id of ids.keys()) if (!referenced.has(id) && !ids.get(id).parent) problems.push(`${id}: not traced to any inventoried source behavior`);
	for (const [source, total] of Object.entries(inventory.numbered ?? {})) {
		const counts = new Array(total + 1).fill(0);
		for (const row of inventory.rows.filter(item => item.source === source)) {
			const [from, to] = row.items ?? [];
			for (let item = from; item <= to; item++) counts[item]++;
		}
		for (let item = 1; item <= total; item++) if (counts[item] !== 1) problems.push(`${source} item ${item} is accounted for ${counts[item]} times`);
	}
	return problems;
}

/** Owner-readable catalog view: availability, verification readiness and the latest run outcome stay separate. */
export function catalogReport(catalog, inventory, observed = {}) {
	const lines = [`# Learning-story catalog`, "", catalog.catalogStatus ?? "", ""];
	const count = (field, value) => catalog.stories.filter(story => story[field] === value).length;
	lines.push(`Stories: ${catalog.stories.length}. Availability: ${availabilities.map(value => `${value} ${count("availability", value)}`).join(", ")}. Verification readiness: ${readiness.map(value => `${value} ${count("automation", value)}`).join(", ")}.`, "");
	lines.push("| Story | Availability | Verification readiness | Run outcome | Depends on | Decisions |", "| --- | --- | --- | --- | --- | --- |");
	for (const story of catalog.stories) {
		const decisions = (catalog.decisions ?? []).filter(decision => decision.blocks?.includes(story.id)).map(decision => decision.id).join(", ");
		lines.push(`| ${story.parent ? "↳ " : ""}${story.id}: ${story.title} | ${story.availability} | ${story.automation} | ${observed[story.id] ?? "not-run"} | ${story.dependencies.join(", ")} | ${decisions} |`);
	}
	lines.push("", "## Owner decisions", "");
	for (const decision of catalog.decisions ?? []) lines.push(`- **${decision.id}** (${decision.source}): ${decision.question}${decision.blocks?.length ? ` Blocks: ${decision.blocks.join(", ")}.` : ""}${decision.resolved ? ` **Resolved:** ${decision.resolved}` : ""}`);
	lines.push("", "## Excluded or deferred source behaviors", "");
	for (const row of inventory.rows.filter(item => item.disposition !== "story")) lines.push(`- ${row.disposition}: ${row.source} ${row.locator}: ${row.behavior}. ${row.reason}`);
	lines.push("", "Availability comes from source inspection; it is not a run result. Missing verification is not a product-gap finding. No subject-accuracy or learning-efficacy claim.");
	return lines.join("\n") + "\n";
}
