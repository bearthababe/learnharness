import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { RunBudget, runLimits } from "./learning-verification.mjs";
import { liveApp } from "./learning-live-app.mjs";
import { calibrationRows, keyWithoutExpected, compareCalibration, codexJson, calibrationPrompt, gradingPrompt, simulateLearner, pendingQuestion, learnerView, graderTranscript, aggregateRun } from "./learning-live.mjs";

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

	// 2. The tutor session, driven through the real learner UI.
	const app = await makeApp({ root, run, tutorModel });
	const learnerCwd = path.join(run, "learner-cwd");
	await fs.mkdir(learnerCwd, { recursive: true });
	let stopped = null, finalRecord = null, endedBy = null;
	try {
		await app.start("zz-prove-it live eigenvalues");
		let seen = 0;
		while (true) {
			const current = await app.record();
			const pending = pendingQuestion(current.messages);
			try { budget.admit("learner"); budget.admit("model"); } catch (error) { stopped = error.message; break; }
			live.counts.simulatorRequests++;
			const { reply } = await simulate({ brief, view: learnerView(current.messages), pending, replies: live.counts.learnerTurns, model: learnerModel, cwd: learnerCwd });
			await write(`learner-${String(live.counts.learnerTurns + 1).padStart(3, "0")}.json`, { pending, reply });
			if (reply.stop) { endedBy = "learner brief: the tutor said the goal is reached"; break; }
			if (pending) await app.answer({ option: reply.option, dontKnow: reply.dontKnow === true, text: reply.text, thinking: reply.thinking });
			else await app.sendMessage(reply.message ?? "");
			live.counts.learnerTurns++;
			const settled = await app.settle();
			const tutorCalls = settled.messages.filter(message => message.role === "assistant").length;
			try { for (; seen < tutorCalls; seen++) { live.counts.tutorRequests++; budget.admit("model"); } } catch (error) { stopped = error.message; break; }
			await app.snapshot(`turn-${live.counts.learnerTurns}`);
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
	const gradeDir = path.join(run, "grader");
	await fs.mkdir(gradeDir, { recursive: true });
	await fs.writeFile(path.join(gradeDir, "key.md"), keyText);
	await fs.writeFile(path.join(gradeDir, "learner-brief.md"), brief);
	await fs.writeFile(path.join(gradeDir, "transcript.md"), graderTranscript(finalRecord.messages));
	try { budget.admit("model"); } catch (error) { stopped ??= error.message; }
	live.counts.graderRequests++;
	const grading = await grade({ dir: gradeDir, prompt: gradingPrompt, model: graderModel, effort: graderEffort });
	await write("grading.json", grading);
	const verdict = aggregateRun({
		expectations: grading.expectations, subjectClaims: grading.subjectClaims, materialErrors: grading.materialErrors,
		stopped: Boolean(stopped) || Boolean(result.error), deviated: grading.simulatorDeviation?.deviated === true, coverageComplete: grading.coverage?.complete === true,
	});
	live.verdict = verdict;
	live.graderVerdict = grading.runVerdict;
	live.verdictAgreement = verdict === grading.runVerdict;
	live.summary = grading.summary;
	result.liveOutcome = OUTCOME[verdict];
	result.status = verdict === "pass" ? "checks-passed" : OUTCOME[verdict] === "failed" ? "failed" : "incomplete";
	return result;
}
