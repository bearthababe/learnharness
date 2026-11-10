import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, it } from "node:test";
import { createFauxCore } from "@earendil-works/pi-ai";

// D-8 (owner decision 2026-11-10): the live tutor exercise gets teaching, question and planning tools only.
// This builds the REAL prober and teacher registries with the live fixture's deny map and checks what remains.
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "lh-live-tools-"));
process.env.LH_DATA_DIR = dataDir;
after(() => fs.rmSync(dataDir, { recursive: true, force: true }));
const { createProberAgent, createTeacherAgent } = await import("../src/agent/teacher-agent.ts");
const { chatStore } = await import("../src/store/chats.ts");
const { jobStore } = await import("../src/store/jobs.ts");
const { TUTOR_TOOLS, DENIED_TOOLS } = await import("../scripts/lib/learning-live.mjs");

function engine() {
	const faux = createFauxCore({});
	return { model: faux.getModel(), streamFn: faux.streamSimple };
}

it("the live fixture's deny map leaves only D-8 tools in the real prober and teacher registries", () => {
	const chatId = chatStore.createChat("zz-prove-it live tools").id;
	const ctx = { chatId, chatStore, jobStore, spawn: () => {}, searchAvailable: () => true, deliver: () => {} };
	const toolToggles = Object.fromEntries(DENIED_TOOLS.map((name: string) => [name, false]));
	for (const [phase, agent] of [
		["prober", createProberAgent(ctx, { engine: engine(), toolToggles })],
		["teacher", createTeacherAgent(ctx, { engine: engine(), toolToggles })],
	] as const) {
		const names = agent.state.tools.map(tool => tool.name);
		const extra = names.filter(name => !TUTOR_TOOLS.includes(name));
		assert.deepEqual(extra, [], `${phase} keeps only teaching, question and planning tools`);
		assert.ok(names.includes("ask_user_question"), `${phase} can still ask`);
	}
	// Without the deny map the same registries do carry file and research tools: the map is what enforces D-8.
	const open = createTeacherAgent(ctx, { engine: engine() }).state.tools.map(tool => tool.name);
	assert.ok(open.includes("read") && open.includes("research"), `unrestricted teacher tools: ${open.join(", ")}`);
});
