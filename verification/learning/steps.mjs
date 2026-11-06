import assert from "node:assert/strict";
import path from "node:path";
import { BeforeAll, AfterAll, Given, When, Then, setDefaultTimeout } from "@cucumber/cucumber";
import { learningBrowser } from "../../scripts/lib/learning-browser.mjs";

setDefaultTimeout(180_000);
let app;
let phase = 0;
let beforeReopen;
let beforeRevision;
let practiceBefore;
let practiceKey = "practice";
BeforeAll({ timeout: 240_000 }, async function () { app = await learningBrowser(process.cwd(), path.resolve(process.env.LH_JOURNEY_RUN)); });
AfterAll(async function () { if (app) await app.close(); });

const teaching = () => app.session("teach");
const toolResults = (record, name) => record.messages.filter(message => message.role === "toolResult" && message.toolName === name && message.isError !== true);
// Learner attempts: composer messages, or practice-dock thinking saved as practice-thinking records.
const userTexts = (record, text) => record.messages.filter(message => (message.role === "user" || (message.role === "custom" && message.customType === "practice-thinking")) && JSON.stringify(message).includes(text));

async function goal() { await teaching(); if (phase < 1) { await app.send("zz-prove-it-goal", "zz-prove-it-probe"); phase = 1; } }
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
async function retry() { await uncertainty(); if (phase < 5) { await app.send("zz-prove-it-retry", "zz-prove-it-retried"); phase = 5; } await teaching(); }

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
	assert.ok(toolResults(record, "plan_init").some(message => message.details?.tree?.nodes.length === 2));
	for (const text of ["zz-prove-it-uncertain", "zz-prove-it-retry"]) assert.equal(userTexts(record, text).length, 1);
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

// LJ-PLAN-REVISE: a revised route replaces the presented plan; earlier work stays.
When("the learner asks for a missing step and the plan is rewritten", async function () {
	beforeRevision = await app.snapshot("before-revision");
	await app.send("zz-prove-it-revise: a bridge step is missing", "zz-prove-it-revised");
});
Then("the presented plan shows the revised route", async function () {
	const record = await app.snapshot("revised");
	const plans = toolResults(record, "plan_init");
	assert.ok(plans.length >= 2, "Both the original and the revised plan results remain in history");
	assert.deepEqual(plans.at(-1).details?.tree?.nodes.map(node => node.id).sort(), ["bridge", "goal", "prerequisite"]);
	const shown = await app.visibleHistory([], ["prerequisite", "bridge", "goal"], "revised-plan");
	assert.deepEqual([...shown].sort(), ["bridge", "goal", "prerequisite"], "The plan popup shows exactly the revised route");
});
Then("earlier teaching work is unchanged", async function () {
	const record = await app.snapshot("revised-history");
	assert.deepEqual(record.messages.slice(0, beforeRevision.messages.length), beforeRevision.messages);
});

// LJ-PRACTICE / LJ-DRILL / LJ-PRACTICE-RESUME: problem → wrong attempt → help → corrected attempt → conclusion.
const practiceBodies = {
	practice: { title: "zz-prove-it-practice", kind: "practice" },
	drill: { title: "zz-prove-it-drill", kind: "practice", practiceMode: "drill" },
	resume: { title: "zz-prove-it-practice-resume", kind: "practice" },
};
async function posed(key) {
	await app.session(key, practiceBodies[key]);
	const record = await app.snapshot(`${key}-before-pose`);
	if (!record.messages.some(message => message.role === "toolResult" && message.toolName === "problem")) await app.send("zz-prove-it-practise unit conversions", "zz-prove-it-problem");
}
async function wrongAttempt(key) {
	await posed(key);
	const record = await app.snapshot(`${key}-before-wrong`);
	if (!userTexts(record, "zz-prove-it-wrong").length) await app.send("zz-prove-it-wrong: 250 × 1000 = 250000 m³", "zz-prove-it-hint");
}
const hidden = async () => assert.ok(!(await app.visibleText()).includes("zz-prove-it-solution"), "The committed solution must stay hidden while the problem is open");

Given("an owned synthetic practice session", () => { practiceKey = "practice"; return app.session("practice", practiceBodies.practice); });
Given("an owned synthetic drill session", () => { practiceKey = "drill"; return app.session("drill", practiceBodies.drill); });
When("the learner asks to practise and a problem is posed", () => posed("practice"));
When("the learner asks to drill and a problem is posed", () => posed("drill"));
Then("the problem is shown without its committed solution", async function () {
	const dock = await app.practiceDock();
	assert.match(dock.text, /zz-prove-it-problem/);
	await hidden();
});
When("the learner submits incorrect thinking", async function () {
	await wrongAttempt(practiceKey);
});
Then("feedback arrives while the problem stays open and the solution stays hidden", async function () {
	const dock = await app.practiceDock();
	assert.match(dock.text, /zz-prove-it-problem/);
	assert.ok((await app.visibleText()).includes("zz-prove-it-hint"));
	await hidden();
	const record = await app.snapshot("after-wrong");
	assert.equal(toolResults(record, "conclude").length, 0, "A wrong answer does not conclude the problem");
});
When("the learner submits corrected thinking", async function () {
	practiceBefore = await app.snapshot("before-corrected");
	await app.send("zz-prove-it-corrected: 250 L × (1 m³ / 1000 L) = 0.25 m³", "zz-prove-it-concluded");
});
Then("the problem concludes as helped success with the committed solution revealed", async function () {
	const record = await app.snapshot("concluded");
	const calls = record.messages.flatMap(message => message.role === "assistant" ? message.content.filter(part => part.type === "toolCall" && part.name === "conclude") : []);
	assert.equal(calls.length, 1);
	assert.equal(calls[0].arguments.outcome, "solvedWithHints", "Helped correction is not recorded as independent success");
	assert.equal(calls[0].arguments.rung, "R2", "The help actually given is recorded");
	assert.equal(toolResults(record, "conclude").length, 1);
	await app.visibleHistory(["zz-prove-it-solution"], []);
	assert.equal(toolResults(record, "problem").length, 1, "No next problem is posed without the learner's go-ahead");
	assert.ok(await app.nextProblemOffered(), "The learner is offered Next problem and the practice dock is gone");
});
Then("the learner's attempts are saved separately", async function () {
	const record = await app.snapshot("attempts");
	for (const text of ["zz-prove-it-wrong", "zz-prove-it-corrected"]) assert.equal(userTexts(record, text).length, 1, `${text} saved exactly once`);
	assert.deepEqual(record.messages.slice(0, practiceBefore.messages.length), practiceBefore.messages);
});
Then("the session remains a separate drill", async function () {
	const { chats } = await app.list();
	const drill = chats.find(chat => chat.id === app.sessionId("drill"));
	assert.equal(drill?.kind, "practice");
	assert.equal(drill?.practiceMode, "drill");
	for (const chat of chats.filter(chat => chat.id !== drill.id)) assert.notEqual(chat.practiceMode, "drill", "Drilling does not change other sessions");
});

Given("a practice session with an open problem and an earlier attempt", () => { practiceKey = "resume"; return wrongAttempt("resume"); });
When("the learner closes and reopens the practice session", async function () {
	practiceBefore = await app.snapshot("resume-before-reopen");
	await app.reopen("zz-prove-it-hint");
});
Then("the same open problem and earlier attempt remain available", async function () {
	const record = await app.snapshot("resume-reopened");
	assert.deepEqual(record.messages, practiceBefore.messages);
	const problems = record.messages.filter(message => message.role === "toolResult" && message.toolName === "problem");
	const dock = await app.practiceDock();
	assert.equal(dock.problem, problems.at(-1).toolCallId, "The reopened dock belongs to the same open problem");
	await app.visibleHistory(["zz-prove-it-wrong", "zz-prove-it-hint"], []);
	await hidden();
});
