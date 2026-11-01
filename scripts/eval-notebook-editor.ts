/** Explicit live evaluation, using the same Cheap resolution and engine as the app. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import nextEnv from "@next/env";
import { editorCases } from "./notebook-editor-cases.ts";
import { runNotebookEditor, NOTEBOOK_EDITOR_PROMPT, type NotebookExchange, type NotebookState } from "../src/agent/notebook-editor.ts";
import { piEngineForSpec } from "../src/agent/models.ts";

const arg = (name: string) => process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3);
assert(process.argv.includes("--live"), "Use --live only for an approved evaluation; this consumes the selected connection's usage.");
const outputArg = arg("out");
assert(outputArg, "Supply --out=<new directory>; previous results are never overwritten.");
// External commands need the documented Next environment loader. Config's paths
// were loaded by the engine import, so LH_DATA_DIR/LH_AUTH_FILE must be shell env.
assert(process.env.LH_DATA_DIR && process.env.LH_AUTH_FILE, "Set LH_DATA_DIR and LH_AUTH_FILE explicitly before launching.");
nextEnv.loadEnvConfig(process.cwd());
const { effectiveSettings } = await import("../src/server/stores.ts");
const { initAuthEnv } = await import("../src/server/keys.ts");
const { refreshConnectionCatalog } = await import("../src/server/model-catalog.ts");
const { webSubscriptionOwner } = await import("../src/server/web-subscriptions.ts");
const { isSubscriptionModel } = await import("../src/core/prices.ts");
initAuthEnv();
const cheap = effectiveSettings().models.cheap;
assert(cheap, "Configure the existing Cheap slot before evaluating the notebook editor.");
const output = path.resolve(outputArg);
await mkdir(path.dirname(output), { recursive: true });
await mkdir(output);
const records: Array<Record<string, unknown>> = [];
let failure: string | undefined;
try {
	await refreshConnectionCatalog(cheap.provider);
	// User-requested notebook editing is foreground work, not an autonomous job.
	const engine = piEngineForSpec(cheap, false);
	const sourcePaths = ["src/agent/notebook-editor.ts", "src/agent/models.ts", "src/agent/chatgpt-stream.ts", "scripts/eval-notebook-editor.ts", "scripts/notebook-editor-cases.ts", "docs/research/conversational-math-eval/cases.mjs"];
	const sources = Object.fromEntries(await Promise.all(sourcePaths.map(async (file) => [file, createHash("sha256").update(await readFile(file)).digest("hex")])));
	const manifest = {
		startedAt: new Date().toISOString(), selectedFrom: "models.cheap", requested: cheap,
		effective: { provider: engine.model.provider, id: engine.model.id, thinkingLevel: engine.level, api: engine.model.api },
		billing: isSubscriptionModel(`${cheap.provider}:${cheap.id}`) ? "subscription: API-dollar cost unpriced" : "API: usage reported; no billing estimate in this runner",
		prompt: NOTEBOOK_EDITOR_PROMPT, sources, cases: editorCases,
		turns: editorCases.reduce((sum, fixture) => sum + fixture.steps.length, 0), maxFormatRetriesPerTurn: 1,
		timing: "App engine call through complete response, including one visible format retry if needed; not voice/UI latency.",
		transport: "piEngineForSpec from the resolved Cheap slot; existing ChatGPT runtime when selected; JSON text, no tools",
	};
	await writeFile(path.join(output, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
	for (const fixture of editorCases) {
		let state: NotebookState = { lines: structuredClone(fixture.initial), undo: [] };
		let history: NotebookExchange[] = [];
		for (const [index, turn] of fixture.steps.entries()) {
			const before = structuredClone(state);
			const result = await runNotebookEditor({
				state, history, instruction: turn.instruction, selection: turn.selection,
				cursorLineId: turn.cursorLineId, notebookHistory: fixture.notebookHistory,
			}, { engine, signal: AbortSignal.timeout(180_000) });
			state = result.state; history = result.history;
			const expected = turn.expected ?? before.lines;
			const compact = (value: string) => value.replace(/\s+/g, "");
			const snapshotMatch = state.lines.length === expected.length && state.lines.every((line, i) => line.id === expected[i]?.id && compact(line.latex) === compact(expected[i]!.latex));
			const unrelatedChanges = before.lines.filter((line) => !turn.changed.includes(line.id) && state.lines.find((next) => next.id === line.id)?.latex !== line.latex).map((line) => line.id);
			const actionMatch = result.response?.action === (turn.action ?? "edit");
			const mechanicalPass = snapshotMatch && actionMatch && !unrelatedChanges.length;
			records.push({ caseId: fixture.id, step: index + 1, instruction: turn.instruction, before, expected,
				...result, snapshotMatch, actionMatch, unrelatedChanges, mechanicalPass,
				totalMs: result.attempts.reduce((sum, attempt) => sum + attempt.elapsedMs, 0),
				apiCostUsd: null,
			});
			await writeFile(path.join(output, "turns.json"), JSON.stringify(records, null, 2) + "\n");
			console.log(`${fixture.id}/${index + 1}: ${mechanicalPass ? "MATCH" : "REVIEW"} (${result.attempts.length} request(s))`);
			if (result.attempts.some((attempt) => attempt.failure === "provider")) throw new Error(result.error ?? "Provider failed; partial results saved");
		}
	}
} catch (error) {
	failure = error instanceof Error ? error.message : "Evaluation failed";
	process.exitCode = 1;
} finally {
	webSubscriptionOwner().close();
	await writeFile(path.join(output, "summary.json"), JSON.stringify({ finishedAt: new Date().toISOString(), completedTurns: records.length,
		mechanicalMatches: records.filter((record) => record.mechanicalPass).length,
		failure: failure ?? null, note: "Every clarification and non-exact output requires correctness review; a mechanical match is not independent validation. API dollar cost is not measured.",
	}, null, 2) + "\n");
	if (failure) console.error(failure);
}
