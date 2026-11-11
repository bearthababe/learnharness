import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { RunBudget, runLimits } from "./learning-verification.mjs";
import { liveApp } from "./learning-live-app.mjs";
import { openGate, readGate } from "./live-gate.mjs";
import { answerFor, coverageComplete, calibrationRows, keyWithoutExpected, compareCalibration, codexJson, calibrationPrompt, gradingPrompt, simulateLearner, pendingQuestion, learnerView, graderTranscript, aggregateRun } from "./learning-live.mjs";

const KEY_DIR = "verification/learning/keys/la-eigen-2x2";
const OUTCOME = { pass: "verified", fail: "failed", unverified: "uncertain", "incomplete (stopped)": "incomplete", "incomplete (coverage)": "incomplete" };
const version = binary => { try { return execFileSync(binary, ["--version"], { encoding: "utf8" }).trim(); } catch { return "unknown"; } };

/**
 * The initial live exercise. Order is fixed: calibration (the grader must reproduce every §7 outcome blind),
 * then the tutor session, then grading. Any failure keeps the evidence and never reports a pass.
 */
export async function runLiveExercise({ root, run, result, tutorModel = "opus", learnerModel = "sonnet", graderModel = "gpt-6.1-sol", graderEffort = "high", deps = {} }) {
	const { app: makeApp = liveApp, simulate = simulateLearner, grade = codexJson, now = () => Date.now() } = deps;
	const write = (name, data) => fs.writeFile(path.join(run, name), typeof data === "string" ? data : JSON.stringify(data, null, 2) + "\n");
	const keyText = await fs.readFile(path.join(root, KEY_DIR, "key.md"), "utf8");
	const brief = await fs.readFile(path.join(root, KEY_DIR, "learner-brief.md"), "utf8");
	const sha = text => createHash("sha256").update(text).digest("hex");
	const budget = new RunBudget(now);
	const live = result.live = {
		roles: { tutor: { route: "LearnHarness Claude Code provider", model: tutorModel, tools: "D-8 allowlist" }, learner: { cli: "claude", model: learnerModel, tools: "none" }, grader: { cli: "codex", model: graderModel, effort: graderEffort, sandbox: "read-only" } },
		versions: deps.versions ?? { claude: version("claude"), codex: version("codex") },
		key: { path: KEY_DIR, keySha256: sha(keyText), briefSha256: sha(brief) },
		limits: runLimits,
		counts: { learnerTurns: 0, simulatorRequests: 0, tutorRequests: 0, graderRequests: 0, calibrationRequests: 0 },
	};

	// 1. Calibration preflight: separate, not counted against the run's guard (owner decision 2026-11-10).
	const rows = calibrationRows(keyText);
	const calibrationDir = path.join(run, "grader-calibration");
	await fs.mkdir(calibrationDir, { recursive: true });
	await fs.writeFile(path.join(calibrationDir, "key.md"), keyWithoutExpected(keyText));
	live.counts.calibrationRequests++;
	const answers = await grade({ dir: calibrationDir, prompt: calibrationPrompt(rows), model: graderModel, effort: graderEffort });
	const mismatches = compareCalibration(rows, answers);
	await write("calibration.json", { examples: rows.length, mismatches, answers });
	live.calibration = { examples: rows.length, mismatches: mismatches.length };
	if (mismatches.length) {
		result.status = "blocked";
		result.error = `Grader calibration failed on ${mismatches.length} of ${rows.length} examples (${mismatches.map(item => item.id).join(", ")}); no tutor session was run`;
		return result;
	}

	// 2. The tutor session, driven through the real learner UI. Tutor calls pass the shared gate at dispatch.
	const gate = path.join(run, "tutor-gate.json");
	const deadline = budget.started + runLimits.minutes * 60_000;
	const reopen = () => openGate(gate, { allowed: runLimits.modelRequests - budget.requests, deadline });
	reopen();
	const app = await makeApp({ root, run, tutorModel, gate });
	const learnerCwd = path.join(run, "learner-cwd");
	await fs.mkdir(learnerCwd, { recursive: true });
	let stopped = null, finalRecord = null, endedBy = null;
	try {
		await app.start("zz-prove-it live eigenvalues");
		while (true) {
			const current = await app.record();
			const pending = pendingQuestion(current.messages);
			try { budget.admit("learner"); budget.admit("model"); } catch (error) { stopped = error.message; break; }
			live.counts.simulatorRequests++;
			const { reply } = await simulate({ brief, view: learnerView(current.messages), pending, replies: live.counts.learnerTurns, model: learnerModel, cwd: learnerCwd });
			await write(`learner-${String(live.counts.learnerTurns + 1).padStart(3, "0")}.json`, { pending, reply });
			if (reply.stop) { endedBy = "learner brief: the tutor said the goal is reached"; break; }
			reopen();
			if (pending) await app.answer(answerFor(pending, reply));
			else await app.sendMessage(reply.message ?? "");
			live.counts.learnerTurns++;
			const remaining = deadline - now();
			let timedOut = false;
			try { await app.settle(Math.max(1, Math.min(15 * 60_000, remaining))); }
			catch (error) { if (now() >= deadline) timedOut = true; else throw error; }
			const used = readGate(gate);
			live.counts.tutorRequests += used.used;
			try { for (let call = 0; call < used.used; call++) budget.admit("model"); } catch (error) { stopped = error.message; }
			const compacted = (await app.record()).messages.some(message => message.role === "custom" && message.customType === "compaction");
			if (timedOut) { await app.abort(); stopped = "time guard reached: the running tutor turn was aborted"; }
			else if (compacted) stopped = "compaction occurred: its model calls are outside the tutor gate";
			else if (used.used >= used.allowed) stopped ??= "request guard reached: further tutor dispatch refused";
			await app.snapshot(`turn-${live.counts.learnerTurns}`);
			if (stopped) break;
			if (app.errors.length) throw new Error(`Client errors: ${app.errors.join("; ")}`);
		}
		finalRecord = await app.record();
	} catch (error) {
		result.error = `Live session error: ${error.message}`;
		finalRecord = await app.record().catch(() => null);
	} finally {
		await app.close();
	}
	live.endedBy = endedBy ?? (stopped ? `guard: ${stopped}` : "error");
	if (!finalRecord) { result.status = "blocked"; return result; }
	await write("transcript.md", graderTranscript(finalRecord.messages));
	await write("final-record.json", finalRecord);

	// 3. Independent grading, then the verdict recomputed from the grader's per-expectation findings.
	// A guard that refuses grading leaves the run incomplete, with its evidence; nothing more is dispatched.
	try { budget.admit("model"); } catch (error) {
		stopped ??= error.message;
		live.grading = "skipped: the guard refused the grading request";
		live.verdict = "incomplete (stopped)";
		result.liveOutcome = OUTCOME[live.verdict];
		result.status = "incomplete";
		return result;
	}
	const gradeDir = path.join(run, "grader");
	await fs.mkdir(gradeDir, { recursive: true });
	await fs.writeFile(path.join(gradeDir, "key.md"), keyText);
	await fs.writeFile(path.join(gradeDir, "learner-brief.md"), brief);
	await fs.writeFile(path.join(gradeDir, "transcript.md"), graderTranscript(finalRecord.messages));
	live.counts.graderRequests++;
	const grading = await grade({ dir: gradeDir, prompt: gradingPrompt, model: graderModel, effort: graderEffort });
	await write("grading.json", grading);
	const verdict = aggregateRun({
		expectations: grading.expectations, subjectClaims: grading.subjectClaims, materialErrors: grading.materialErrors,
		stopped: Boolean(stopped) || Boolean(result.error), deviated: grading.simulatorDeviation?.deviated === true, coverageComplete: coverageComplete(grading.coverage),
	});
	live.verdict = verdict;
	live.graderVerdict = grading.runVerdict;
	live.verdictAgreement = verdict === grading.runVerdict;
	live.summary = grading.summary;
	result.liveOutcome = OUTCOME[verdict];
	result.status = verdict === "pass" ? "checks-passed" : OUTCOME[verdict] === "failed" ? "failed" : "incomplete";
	return result;
}
