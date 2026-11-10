import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { LIVE_AUTHORIZATION, TUTOR_TOOLS, DENIED_TOOLS, LIVE_ROUTE_FILE, liveSettings, liveReadiness, calibrationRows, keyWithoutExpected, compareCalibration, canonicalOutcome, aggregateRun, pendingQuestion, learnerView, graderTranscript, extractJson, choiceIndices, displayOrder } from "../../scripts/lib/learning-live.mjs";
import { runLiveExercise } from "../../scripts/lib/learning-live-run.mjs";
import { runLimits } from "../../scripts/lib/learning-verification.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const keyText = fs.readFileSync(path.join(root, "verification/learning/keys/la-eigen-2x2/key.md"), "utf8");
const rows = calibrationRows(keyText);
const expected = Object.fromEntries(rows.map(row => [row.id, row.expected]));

test("readiness refuses without explicit authorization or a CLI, and passes only with both", async () => {
	const all = () => "/bin/true";
	assert.match((await liveReadiness({ root, env: {}, which: all })).join(" "), /LH_LIVE_AUTHORIZATION/);
	assert.match((await liveReadiness({ root, env: { LH_LIVE_AUTHORIZATION: LIVE_AUTHORIZATION }, which: name => name === "claude" ? null : "/bin/true" })).join(" "), /claude CLI not found/);
	assert.deepEqual(await liveReadiness({ root, env: { LH_LIVE_AUTHORIZATION: LIVE_AUTHORIZATION }, which: all }), []);
	assert.match((await liveReadiness({ root, env: { LH_LIVE_AUTHORIZATION: "standing" }, which: all })).join(" "), /initial exercise only/);
});

test("calibration covers every §7 example and hides every expected outcome and its hinting label", () => {
	assert.equal(rows.length, keyText.split("\n").filter(line => /^\| C\d+ \|/.test(line)).length, "every calibration row parses");
	assert.ok(rows.length >= 50);
	const blind = keyWithoutExpected(keyText);
	for (const row of rows) {
		const line = blind.split("\n").find(item => item.startsWith(`| ${row.id} |`));
		assert.match(line, /\| \? \|$/);
		assert.ok(!/accepts wrong|reject valid|omitted|copywork|habit|never escalated/.test(line.split("|").at(-3)), `${row.id} label leaks: ${line}`);
	}
	assert.deepEqual(compareCalibration(rows, expected), []);
});

test("calibration needs exact agreement: one wrong label fails, notes in parentheses do not", () => {
	assert.equal(compareCalibration(rows, { ...expected, C2: "complied" }).length, 1);
	assert.equal(compareCalibration(rows, { ...expected, C1: undefined }).length, 1);
	assert.equal(canonicalOutcome("fail (E7 omitted at the normal end)"), "fail");
	assert.notEqual(canonicalOutcome("violated"), canonicalOutcome("violated (material error)"));
	assert.notEqual(canonicalOutcome("incomplete (stopped)"), canonicalOutcome("incomplete (coverage)"));
});

test("the run verdict follows key §5's order", () => {
	const ok = [{ id: "E1", outcome: "complied" }];
	assert.equal(aggregateRun({ expectations: ok, coverageComplete: true }), "pass");
	assert.equal(aggregateRun({ expectations: [...ok, { outcome: "violated" }], stopped: true }), "fail", "a violation stands even after a guard");
	assert.equal(aggregateRun({ expectations: ok, subjectClaims: [{ outcome: "false" }], coverageComplete: true }), "fail");
	assert.equal(aggregateRun({ expectations: [{ outcome: "pending" }], stopped: true }), "incomplete (stopped)");
	assert.equal(aggregateRun({ expectations: ok, deviated: true, coverageComplete: true }), "incomplete (stopped)");
	assert.equal(aggregateRun({ expectations: [{ outcome: "unverified" }], coverageComplete: true }), "unverified");
	assert.equal(aggregateRun({ expectations: ok, subjectClaims: [{ outcome: "unverified" }], coverageComplete: true }), "unverified");
	assert.equal(aggregateRun({ expectations: ok, coverageComplete: false }), "incomplete (coverage)");
});

const quiz = { type: "toolCall", id: "q1", name: "quiz", arguments: { type: "check", nodeId: "eig", question: "Is (1,-2) an eigenvector of [[4,1],[2,3]]?", options: [{ value: "yes", label: "Yes, λ = 2" }, { value: "no", label: "No" }], correctAnswer: "yes", explanation: "A(1,-2) = 2(1,-2)." } };
const messages = [
	{ role: "user", content: "I want to understand eigenvalues." },
	{ role: "assistant", content: [{ type: "text", text: "Let's start." }, { type: "toolCall", id: "p", name: "probe_done", arguments: { assessment: { summary: "SECRET-ASSESSMENT" } } }] },
	{ role: "assistant", content: [{ type: "thinking", thinking: "SECRET-THOUGHT" }, quiz] },
];

test("the learner sees the question and its options, never the answer, explanation, assessment or hidden reasoning", () => {
	assert.deepEqual(pendingQuestion(messages), { toolCallId: "q1", tool: "quiz", question: quiz.arguments.question, type: "check", options: ["Yes, λ = 2", "No"], multiSelect: false });
	const view = learnerView(messages);
	assert.match(view, /1\. (Yes, λ = 2|No)  2\. (Yes, λ = 2|No)/, "options are numbered in screen order");
	for (const hidden of ["correctAnswer", "\"yes\"", "A(1,-2) = 2(1,-2)", "SECRET-ASSESSMENT", "SECRET-THOUGHT"]) assert.ok(!view.includes(hidden), hidden);
	const answered = [...messages, { role: "toolResult", toolName: "quiz", toolCallId: "q1", content: "answered", details: { answers: [{ label: "Yes, λ = 2" }], thinking: "multiplied it out", explanation: "A(1,-2) = 2(1,-2)." } }];
	assert.equal(pendingQuestion(answered), null);
	const grader = graderTranscript(answered);
	for (const visible of ["correctAnswer", "SECRET-ASSESSMENT", "multiplied it out"]) assert.ok(grader.includes(visible), visible);
	assert.ok(!grader.includes("SECRET-THOUGHT"), "Model-private thinking is not graded");
});

test("the fixture route and settings enforce D-8 and use the Claude Code route with no API provider", () => {
	assert.deepEqual([...TUTOR_TOOLS].sort(), ["ask_user_question", "explain", "plan_init", "probe", "probe_done", "quiz", "recall", "send_to_user"]);
	const route = fs.readFileSync(path.join(root, LIVE_ROUTE_FILE), "utf8");
	assert.match(route, /D-8 tool boundary violated/);
	const list = name => JSON.parse(new RegExp(`const ${name} = (?:new Set\\()?(\\[[^\\]]*\\])`).exec(route)[1]);
	assert.deepEqual(list("ALLOWED"), [...TUTOR_TOOLS], "route allowlist matches the runner's");
	assert.deepEqual(list("DENIED"), [...DENIED_TOOLS], "route deny list matches the runner's");
	const settings = liveSettings("opus");
	assert.equal(settings.models.strong.model.provider, "claude-code");
	assert.equal(settings.claudeCode.enabled, true);
	assert.equal(settings.graph.enabled, false);
	assert.deepEqual(extractJson('noise {"a":{"b":1}} trailing'), { a: { b: 1 } });
});

function fakes({ calibration = expected, grading, stopAfter = 2 } = {}) {
	const calls = { grade: 0, simulate: 0, appStarted: 0, sent: [] };
	let log = [{ role: "user", content: "goal" }];
	const app = async () => {
		calls.appStarted++;
		return {
			errors: [],
			start: async () => {},
			record: async () => ({ messages: log, turnInFlight: false }),
			settle: async () => { log = [...log, { role: "assistant", content: [{ type: "text", text: "tutor reply" }] }]; return { messages: log }; },
			snapshot: async () => {},
			sendMessage: async text => { calls.sent.push(text); },
			answer: async () => {},
			close: async () => {},
		};
	};
	const simulate = async ({ replies }) => { calls.simulate++; return { reply: replies >= stopAfter ? { stop: true } : { message: `learner ${replies}` } }; };
	const grade = async ({ prompt }) => { calls.grade++; return /calibration examples/.test(prompt) ? calibration : grading; };
	return { calls, deps: { app, simulate, grade, versions: { claude: "test", codex: "test" } } };
}
const tempRun = () => fs.mkdtempSync(path.join(os.tmpdir(), "lh-live-"));
const passing = { expectations: [{ id: "E1", outcome: "complied" }], subjectClaims: [], materialErrors: [], coverage: { complete: true }, simulatorDeviation: { deviated: false }, runVerdict: "pass", summary: "ok" };

test("a failed calibration blocks before any tutor session or learner request", async () => {
	const { calls, deps } = fakes({ calibration: { ...expected, C5: "violated" } });
	const result = await runLiveExercise({ root, run: tempRun(), result: {}, deps });
	assert.equal(result.status, "blocked");
	assert.match(result.error, new RegExp(`calibration failed on 1 of ${rows.length}`));
	assert.equal(calls.appStarted, 0);
	assert.equal(calls.simulate, 0);
});

test("a calibrated run drives the session, ends on the brief, grades once and recomputes the verdict", async () => {
	const run = tempRun();
	const { calls, deps } = fakes({ grading: passing });
	const result = await runLiveExercise({ root, run, result: {}, deps });
	assert.equal(result.status, "checks-passed");
	assert.deepEqual(calls.sent, ["learner 0", "learner 1"]);
	assert.equal(calls.grade, 2, "one calibration request and one grading request");
	assert.equal(result.live.counts.learnerTurns, 2);
	assert.equal(result.live.endedBy, "learner brief: the tutor said the goal is reached");
	assert.equal(result.live.verdictAgreement, true);
	for (const file of ["calibration.json", "grading.json", "transcript.md", "final-record.json"]) assert.ok(fs.existsSync(path.join(run, file)), file);
	assert.ok(!fs.readdirSync(path.join(run, "learner-cwd")).length, "The learner's working directory stays empty");
	assert.equal(fs.readFileSync(path.join(run, "grader-calibration/key.md"), "utf8").includes("| violated |"), false, "Calibration key hides outcomes");
});

test("the grader cannot talk a run into a pass: the recomputed verdict wins and disagreement is recorded", async () => {
	const { deps } = fakes({ grading: { ...passing, expectations: [{ id: "E7", outcome: "violated" }] } });
	const result = await runLiveExercise({ root, run: tempRun(), result: {}, deps });
	assert.equal(result.live.verdict, "fail");
	assert.equal(result.live.verdictAgreement, false);
	assert.equal(result.status, "failed");
});

test("the learner-turn guard stops the run as incomplete, never a pass, and keeps the evidence", async () => {
	const { calls, deps } = fakes({ grading: passing, stopAfter: Infinity });
	const run = tempRun();
	const result = await runLiveExercise({ root, run, result: {}, deps });
	assert.equal(result.live.counts.learnerTurns, runLimits.learnerTurns, "all 100 learner turns are used, and no more");
	assert.match(result.live.endedBy, /guard: Run cap reached/);
	assert.equal(result.live.verdict, "incomplete (stopped)");
	assert.notEqual(result.status, "checks-passed");
	assert.ok(calls.simulate <= runLimits.learnerTurns);
	assert.ok(fs.existsSync(path.join(run, "transcript.md")));
});

test("the learner answers by on-screen number; positions follow the shuffled screen order; anything else is a deviation", () => {
	const ask = { tool: "ask_user_question", toolCallId: "x", options: ["a", "b", "c"], multiSelect: false };
	assert.deepEqual(choiceIndices(ask, [2]), [1]);
	assert.deepEqual(choiceIndices(ask, 3), [2]);
	assert.deepEqual(choiceIndices(ask, []), []);
	assert.throws(() => choiceIndices(ask, [4]), /Simulator deviation/);
	assert.throws(() => choiceIndices(ask, ["(1,1)"]), /Simulator deviation/);
	assert.throws(() => choiceIndices(ask, [1, 2]), /several options on a single-choice/);
	assert.deepEqual(choiceIndices({ ...ask, multiSelect: true }, [1, 3]), [0, 2]);
	const quiz = { tool: "probe", toolCallId: "toolu_012Atk2djHRcjfA9f1yQB2MA", options: ["A", "B", "C", "D"] };
	const shown = displayOrder(quiz.tool, quiz.toolCallId, quiz.options);
	assert.deepEqual([...shown].sort(), ["A", "B", "C", "D"]);
	const view = learnerView([{ role: "assistant", content: [{ type: "toolCall", id: quiz.toolCallId, name: "probe", arguments: { question: "Q?", options: quiz.options.map(label => ({ value: label, label })) } }] }]);
	assert.match(view, new RegExp(shown.map((label, index) => `${index + 1}\\. ${label}`).join("  ")), "the learner sees the same numbered order as the screen");
});
