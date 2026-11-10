import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { spawn, execFileSync } from "node:child_process";
import path from "node:path";

// Live tutor exercise (owner decisions 2026-11-10: D-1 key approved, D-2 roles, D-8 tool limit).
// The tutor is the app's Claude Code route; the learner is Claude; the grader is GPT Sol via Codex.
// Every helper here is pure or takes an injectable runner, so tests never dispatch a model.

export const LIVE_AUTHORIZATION = "initial-exercise-2026-11-10";
/** D-8: teaching, question and planning tools only. Anything else in a tutor registry refuses the run. */
/** send_to_user is the Claude models' message channel (display only); the app adds it for Claude routes. */
export const TUTOR_TOOLS = Object.freeze(["probe", "recall", "quiz", "explain", "ask_user_question", "probe_done", "plan_init", "send_to_user"]);
export const DENIED_TOOLS = Object.freeze(["read", "ls", "find", "grep", "show_image", "research", "pdf", "demo", "visual", "list_sessions", "list_propositions", "find_candidates"]);
const QUESTION_TOOLS = new Set(["probe", "recall", "quiz", "explain", "ask_user_question"]);

/** The owned fixture's chat route (a typechecked file): the real handler and real registries, filtered to D-8 and asserted. */
export const LIVE_ROUTE_FILE = "verification/learning/live/chat-route.ts";

export function liveSettings(tutorModel) {
	const model = { provider: "claude-code", id: tutorModel };
	return { version: 1, claudeCode: { enabled: true }, models: { strong: { model }, cheap: { model } }, graph: { enabled: false } };
}

/** Readiness before any dispatch. Returns blocked reasons; an empty list means ready. */
export async function liveReadiness({ root, env = process.env, which = whichBinary }) {
	const reasons = [];
	if (env.LH_LIVE_AUTHORIZATION !== LIVE_AUTHORIZATION) reasons.push(`Live dispatch needs explicit owner authorization: set LH_LIVE_AUTHORIZATION=${LIVE_AUTHORIZATION} (the initial exercise only; later runs need a new authorization)`);
	const facts = JSON.parse(await fs.readFile(path.join(root, "verification/learning/keys/la-eigen-2x2/facts.json"), "utf8"));
	if (!/^Owner-approved/.test(facts.status ?? "")) reasons.push("Answer key is not owner-approved (D-1)");
	for (const binary of ["claude", "codex"]) if (!which(binary)) reasons.push(`${binary} CLI not found on PATH`);
	return reasons;
}

function whichBinary(name) {
	try { return execFileSync("which", [name], { encoding: "utf8" }).trim() || null; } catch { return null; }
}

/** Parse §7 of key.md into calibration rows. */
export function calibrationRows(keyMarkdown) {
	const rows = [];
	for (const line of keyMarkdown.split("\n")) {
		const match = /^\| (C\d+) \| (.*) \| ([^|]*) \| ([^|]*) \|$/.exec(line);
		if (match) rows.push({ id: match[1], context: match[2], calibrates: match[3].trim(), expected: match[4].trim() });
	}
	return rows;
}

/** The key with §7's expected column removed, so calibration tests the grader instead of its reading. */
export function keyWithoutExpected(keyMarkdown) {
	return keyMarkdown.split("\n").map(line => {
		const match = /^\| (C\d+) \| (.*) \| ([^|]*) \| ([^|]*) \|$/.exec(line);
		// Keep only the judged identifiers; descriptive labels such as "accepts wrong" would leak the answer.
		if (match) return `| ${match[1]} | ${match[2]} | ${(match[3].match(/\bE\d+\b|\bT\d\b|run verdict|brief compliance|brief precedence|out-of-key claim/g) ?? []).join(" / ")} | ? |`;
		if (/^\| ID \| Context and tutor turn \| Calibrates \| Expected \|$/.test(line)) return line;
		return line;
	}).join("\n");
}

/** Canonical outcome label: notes in parentheses are dropped, except the two that change the meaning. */
export function canonicalOutcome(label) {
	const value = String(label ?? "").toLowerCase().replace(/\s+/g, " ").trim();
	if (value.startsWith("incomplete")) return /incomplete \((stopped|coverage)\)/.exec(value)?.[0] ?? "incomplete";
	if (value.includes("material error")) return "violated (material error)";
	return value.replace(/\s*\(.*$/, "").trim();
}

/** Exact agreement on every calibration example (spec §3: one mismatch means calibration failed). */
export function compareCalibration(rows, answers) {
	return rows.filter(row => canonicalOutcome(answers[row.id]) !== canonicalOutcome(row.expected)).map(row => ({ id: row.id, expected: row.expected, got: answers[row.id] ?? null }));
}

/** Run verdict from per-expectation outcomes, in key §5 order (first match wins). */
export function aggregateRun({ expectations = [], subjectClaims = [], materialErrors = [], stopped = false, deviated = false, coverageComplete = false }) {
	if (materialErrors.length || expectations.some(item => item.outcome === "violated") || subjectClaims.some(claim => claim.outcome === "false")) return "fail";
	if (stopped || deviated) return "incomplete (stopped)";
	if (expectations.some(item => item.outcome === "unverified" || item.outcome === "pending") || subjectClaims.some(claim => claim.outcome === "unverified")) return "unverified";
	if (!coverageComplete) return "incomplete (coverage)";
	return "pass";
}

const text = content => typeof content === "string" ? content : Array.isArray(content) ? content.filter(part => part.type === "text").map(part => part.text).join("\n") : "";

/** The open question the learner must answer, from the saved record (answered calls have a result with details). */
export function pendingQuestion(messages) {
	const answered = new Set(messages.filter(message => message.role === "toolResult" && message.details && typeof message.details === "object").map(message => message.toolCallId));
	for (let index = messages.length - 1; index >= 0; index--) {
		const message = messages[index];
		if (message.role !== "assistant" || !Array.isArray(message.content)) continue;
		for (const call of message.content) {
			if (call.type === "toolCall" && QUESTION_TOOLS.has(call.name) && !answered.has(call.id)) {
				const input = call.arguments ?? {};
				return { toolCallId: call.id, tool: call.name, question: input.question ?? "", type: input.type, options: (input.options ?? []).map(option => option.label ?? String(option)), multiSelect: input.multiSelect === true };
			}
		}
	}
	return null;
}

/** What the learner can see: tutor prose, questions with their options, revealed explanations, and their own inputs. */
export function learnerView(messages) {
	const lines = [];
	for (const message of messages) {
		if (message.role === "user") lines.push(`LEARNER: ${text(message.content)}`);
		else if (message.role === "assistant" && Array.isArray(message.content)) {
			const prose = text(message.content);
			if (prose.trim()) lines.push(`TUTOR: ${prose}`);
			for (const call of message.content.filter(part => part.type === "toolCall")) {
				if (QUESTION_TOOLS.has(call.name)) lines.push(`TUTOR QUESTION (${call.arguments?.type ?? call.name}): ${call.arguments?.question ?? ""}${(call.arguments?.options ?? []).length ? `\n  Options: ${call.arguments.options.map(option => option.label).join(" | ")}` : ""}`);
				if (call.name === "plan_init") lines.push("TUTOR shows a plan map.");
			}
		} else if (message.role === "toolResult" && QUESTION_TOOLS.has(message.toolName) && message.details) {
			const answer = message.details;
			lines.push(`LEARNER ANSWER: ${answer.dontKnow ? "I don't know" : (answer.answers ?? []).map(item => item.label ?? item.value ?? JSON.stringify(item)).join(", ") || answer.text || ""}${answer.thinking ? `\n  Learner's thinking: ${answer.thinking}` : ""}`);
			if (answer.explanation) lines.push(`(Shown after answering) ${answer.explanation}`);
		}
	}
	return lines.join("\n\n");
}

/** Everything the grader needs, including hidden tool arguments, saved assessments and learner thinking. */
export function graderTranscript(messages) {
	return messages.map((message, index) => {
		const head = `### [${index + 1}] ${message.role}${message.toolName ? ` (${message.toolName})` : ""}${message.customType ? ` (${message.customType})` : ""}`;
		const body = message.role === "assistant" && Array.isArray(message.content)
			? message.content.filter(part => part.type !== "thinking").map(part => part.type === "text" ? part.text : part.type === "toolCall" ? `TOOL CALL ${part.name}: ${JSON.stringify(part.arguments)}` : JSON.stringify(part)).join("\n")
			: message.role === "toolResult" ? `${text(message.content)}${message.details ? `\nDETAILS: ${JSON.stringify(message.details)}` : ""}` : text(message.content) || JSON.stringify(message.content ?? message);
		return `${head}\n${body}`;
	}).join("\n\n");
}

/** Run a CLI with stdin, bounded by a timeout; resolves stdout. */
export function runCli(binary, args, { input, cwd, timeoutMs, env = process.env }) {
	return new Promise((resolve, reject) => {
		const child = spawn(binary, args, { cwd, env, stdio: ["pipe", "pipe", "pipe"] });
		let stdout = "", stderr = "";
		const timer = setTimeout(() => { child.kill("SIGTERM"); reject(new Error(`${binary} timed out after ${timeoutMs} ms`)); }, timeoutMs);
		child.stdout.on("data", chunk => { stdout += chunk; });
		child.stderr.on("data", chunk => { stderr += chunk; });
		child.on("error", error => { clearTimeout(timer); reject(error); });
		child.on("close", code => { clearTimeout(timer); code === 0 ? resolve(stdout) : reject(new Error(`${binary} exited ${code}: ${stderr.slice(-2000)}`)); });
		child.stdin.end(input);
	});
}

/** First balanced JSON object in model output. */
export function extractJson(output) {
	const start = output.indexOf("{");
	assert.ok(start >= 0, "No JSON object in model output");
	for (let end = output.lastIndexOf("}"); end > start; end = output.lastIndexOf("}", end - 1)) {
		try { return JSON.parse(output.slice(start, end + 1)); } catch {}
	}
	throw new Error("Unparseable JSON in model output");
}

const CLAUDE_LOCKDOWN = ["--tools", "", "--strict-mcp-config", "--setting-sources", "user", "--settings", JSON.stringify({ disableAllHooks: true, outputStyle: "default", env: { CLAUDE_CODE_DISABLE_CLAUDE_MDS: "1" } }), "--disable-slash-commands", "--no-session-persistence", "--permission-prompts", "none"];

/** One learner reply from Claude: no tools, an empty working directory, only the brief and the visible screen. */
export async function simulateLearner({ brief, view, pending, replies, model, cwd, run = runCli }) {
	const system = `${brief}\n\nYou are this learner. Reply ONLY with one JSON object and nothing else.`;
	const task = pending
		? `The tutor has an open question. You must answer it now (you may pick "I don't know" and put a question of your own in your thinking).\nQuestion: ${pending.question}\nOptions (copy one label exactly${pending.multiSelect ? "; several allowed, separated by |" : ""}): ${pending.options.join(" | ") || "(free text)"}\nReply as {"option": "<exact label or several joined by |, or null>", "dontKnow": <true|false>, "text": "<free-text answer if there are no options, else empty>", "thinking": "<your reasoning in your own words>"}`
		: `It is your turn to write a message to the tutor. Reply as {"message": "<what you type>"}. If the tutor has said your goal is reached, reply {"stop": true} instead.`;
	const prompt = `This is message ${replies + 1} of yours (counting your first).\n\nThe session so far:\n\n${view || "(nothing yet: write your first message)"}\n\n${task}`;
	const output = await run("claude", ["-p", "--output-format", "json", "--model", model, "--system-prompt", system, ...CLAUDE_LOCKDOWN], { input: prompt, cwd, timeoutMs: 10 * 60_000, env: { ...process.env, CLAUDE_CODE_DISABLE_CLAUDE_MDS: "1" } });
	const envelope = JSON.parse(output);
	return { reply: extractJson(envelope.result ?? ""), usage: envelope.usage ?? null };
}

const CODEX_ARGS = (dir, model, effort, outFile) => ["exec", "-m", model, "-c", `model_reasoning_effort="${effort}"`, "--sandbox", "read-only", "--skip-git-repo-check", "--ephemeral", "-C", dir, "--output-last-message", outFile, "-"];

/** One grader request through the owner's Codex login, read-only, in a directory holding only what it may read. */
export async function codexJson({ dir, prompt, model, effort, run = runCli }) {
	const outFile = path.join(dir, "last-message.txt");
	await run("codex", CODEX_ARGS(dir, model, effort, outFile), { input: prompt, cwd: dir, timeoutMs: 30 * 60_000 });
	return extractJson(await fs.readFile(outFile, "utf8"));
}

export const calibrationPrompt = rows => `You are a strict, independent evaluator. Read key.md in this directory: the answer key for judging a LearnHarness tutoring session. Section 7 lists calibration examples with the expected outcome hidden ("?").
For every example, decide the outcome the key's rules require, using the key's exact outcome labels (complied, violated, unverified, pass, fail, incomplete (stopped), incomplete (coverage), not a deviation, violated (material error), and so on).
Reply with ONLY a JSON object mapping each id to its outcome, for these ids: ${rows.map(row => row.id).join(", ")}.`;

export const gradingPrompt = `You are a strict, independent evaluator. Read key.md (the approved answer key), learner-brief.md (what the simulated learner was told) and transcript.md (the full live session, including tool-call arguments and saved learner answers) in this directory.
Judge the session exactly as the key's §3–§5 require. Do not change or soften the key. Allow valid alternative routes and wording.
Reply with ONLY one JSON object:
{"expectations":[{"id":"E1".."E11","episode":"<which part>","outcome":"complied|violated|pending|not applicable|unverified","evidence":"<message numbers>","reason":"<one sentence>"}],
 "subjectClaims":[{"claim":"<tutor claim outside or inside T1–T8 worth checking>","message":<n>,"outcome":"true|false|unverified","support":"<T-id, page or derivation>"}],
 "materialErrors":[{"message":<n>,"truth":"<T-id>","what":"<what was wrong>"}],
 "coverage":{"goalIdeas":{"av_eq_lambda_v":bool,"det_condition":bool,"null_space_eigenvectors":bool,"diagonalization_test":bool},"events":{"zero_vector":"repaired+rechecked|fired-unrepaired|unexercised","why_det":"answered|unanswered|unexercised","repeated_eigenvalue":"repaired+rechecked|fired-unrepaired|unexercised"},"learnerEigenpair":bool,"complete":bool},
 "simulatorDeviation":{"deviated":bool,"message":<n|null>,"reason":"<or empty>"},
 "runVerdict":"pass|fail|unverified|incomplete (stopped)|incomplete (coverage)",
 "summary":"<three sentences for the owner>"}
List one entry per expectation episode that applies. A judgment you cannot decide from the transcript is unverified.`;
