import assert from "node:assert/strict";
import path from "node:path";
import { BeforeAll, AfterAll, Given, When, Then, setDefaultTimeout } from "@cucumber/cucumber";
import { learningBrowser } from "../../scripts/lib/learning-browser.mjs";

setDefaultTimeout(180_000);
let app;
let phase = 0;
let beforeReopen;
BeforeAll({ timeout: 240_000 }, async function () { app = await learningBrowser(process.cwd(), path.resolve(process.env.LH_JOURNEY_RUN)); });
AfterAll(async function () { if (app) await app.close(); });

async function goal() { if (phase < 1) { await app.send("zz-prove-it-goal", "zz-prove-it-probe"); phase = 1; } }
async function probe() { await goal(); if (phase < 2) { await app.send("zz-prove-it-floor", "zz-prove-it-handoff"); phase = 2; } }
async function plan() { await probe(); if (phase < 3) { await app.send("zz-prove-it-plan", "zz-prove-it-planned"); phase = 3; } }
async function uncertainty() {
	await plan();
	if (phase < 4) {
		await app.send("zz-prove-it-teach", "zz-prove-it-teaching");
		await app.send("zz-prove-it-uncertain: I do not know", "zz-prove-it-feedback");
		phase = 4;
	}
}
async function retry() { await uncertainty(); if (phase < 5) { await app.send("zz-prove-it-retry", "zz-prove-it-retried"); phase = 5; } }

Given("an owned synthetic learning application", function () { assert.ok(app); });
When("the learner starts from a synthetic goal", goal);
When("the learner answers the prerequisite probe", probe);
Then("a successful probe handoff is saved", async function () {
	const record = await app.snapshot("probe-result");
	assert.ok(record.messages.some(message => message.role === "toolResult" && message.toolName === "probe_done" && message.isError !== true && message.details?.ok === true), "Require successful result, not just attempted probe_done");
});
Given("a successfully probed synthetic conversation", probe);
When("the learner requests the teaching plan", plan);
When("the learner studies and expresses uncertainty", uncertainty);
When("the learner retries after scripted feedback", retry);
Then("the plan and distinct learner attempts are saved", async function () {
	const record = await app.snapshot("retry-result");
	assert.ok(record.messages.some(message => message.role === "toolResult" && message.toolName === "plan_init" && message.isError !== true && message.details?.tree?.nodes.length === 2));
	for (const text of ["zz-prove-it-uncertain", "zz-prove-it-retry"]) assert.equal(record.messages.filter(message => message.role === "user" && JSON.stringify(message.content).includes(text)).length, 1);
});
Given("a synthetic conversation with a plan and retry evidence", retry);
When("the learner closes and reopens the conversation", async function () { beforeReopen = await app.snapshot("before-reopen"); await app.reopen(); });
Then("earlier work and the plan remain accessible", async function () {
	await app.visibleHistory();
	assert.deepEqual((await app.snapshot("reopened")).messages, beforeReopen.messages);
});
When("the learner continues the conversation", async function () { await app.send("zz-prove-it-continue", "zz-prove-it-continued"); });
Then("the continuation is saved without losing earlier work", async function () {
	const after = await app.snapshot("continued");
	assert.deepEqual(after.messages.slice(0, beforeReopen.messages.length), beforeReopen.messages);
	assert.ok(after.messages.length > beforeReopen.messages.length);
});
