/** One-shot capture, not a test: run with tsx from an otherwise idle worktree.
 * Creation/reopen use real Next HTTP. Model turns use the actual handler with
 * a registered offline provider (the HTTP route has no engine injection).
 * Only copyFile writes the resulting golden record; never serialize/edit it.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { fauxProvider, fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "lh-drill-golden-"));
const originalEnv = process.env;
const originalFetch = globalThis.fetch;
process.env = {
	PATH: originalEnv.PATH, HOME: profile, TMPDIR: os.tmpdir(), NODE_ENV: "test",
	LH_DATA_DIR: path.join(profile, "data"), LH_AUTH_FILE: path.join(profile, "auth.json"),
	OPENROUTER_API_KEY: "offline-fixture-not-a-real-key", NEXT_TELEMETRY_DISABLED: "1",
};
const socket = createServer();
await new Promise<void>((resolve) => socket.listen(0, "127.0.0.1", resolve));
const port = (socket.address() as { port: number }).port;
await new Promise<void>((resolve) => socket.close(() => resolve()));
const origin = `http://127.0.0.1:${port}`;
const offline = "data:text/javascript," + encodeURIComponent('globalThis.fetch = async () => { throw new Error("Unexpected network in offline golden capture"); };');
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--webpack", "--hostname", "127.0.0.1", "--port", String(port)], {
	cwd: root, env: { ...process.env, NODE_ENV: "development", NODE_OPTIONS: `--import=${offline}` }, stdio: ["ignore", "pipe", "pipe"],
});
let logs = "";
const ended = new Promise((resolve) => server.once("exit", resolve));
async function timeout<T>(promise: Promise<T>, ms = 120_000): Promise<T> {
	let timer: ReturnType<typeof setTimeout>;
	try {
		return await Promise.race([promise, new Promise<never>((_, reject) => {
			timer = setTimeout(() => reject(new Error("Golden capture timeout")), ms);
		})]);
	} finally { clearTimeout(timer!); }
}

try {
	await timeout(new Promise<void>((resolve, reject) => {
		const collect = (chunk: Buffer) => { logs += chunk; if (logs.includes("Ready in")) resolve(); };
		server.stdout.on("data", collect);
		server.stderr.on("data", collect);
		server.once("error", reject);
		server.once("exit", (code) => reject(new Error(`Next exited: ${code}`)));
	}));
	const created = await originalFetch(`${origin}/api/chats`, {
		method: "POST", headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ title: "Golden drill: volume conversions", kind: "practice", practiceMode: "drill" }),
		signal: AbortSignal.timeout(120_000),
	});
	assert.equal(created.status, 200, await created.clone().text());
	const { id } = await created.json() as { id: string };
	globalThis.fetch = async () => { throw new Error("Unexpected network in scripted drill turn"); };
	const { chatStore } = await import("../../src/store/chats.ts");
	const { piModels } = await import("../../src/agent/models.ts");
	const { handleChatRequest } = await import("../../src/server/chat-handler.ts");
	const { runningTurn } = await import("../../src/server/turn-runs.ts");
	const faux = fauxProvider({ provider: "openrouter", models: [{ id: "offline-drill-golden", contextWindow: 1_000_000 }] });
	piModels().setProvider(faux.provider);
	chatStore.saveSettings(id, { model: { provider: "openrouter", id: "offline-drill-golden" } });
	faux.setResponses([
		() => fauxAssistantMessage(fauxToolCall("problem", {
			statement: "Convert 250 L to m³.", mode: "recall", modelSolution: "250 L × (1 m³ / 1000 L) = 0.25 m³.",
		}, { id: "golden-drill-problem" }), { stopReason: "toolUse" }),
		() => fauxAssistantMessage("Arrange the ratio so litres cancel: multiply by 1 m³ / 1000 L. Now apply it to 250 L."),
		() => fauxAssistantMessage(fauxToolCall("conclude", {
			outcome: "solvedWithHints", verdict: "Correct after help arranging the cancellation ratio.", rung: "R4", missClass: "execution", retest: true,
		}, { id: "golden-drill-conclude" }), { stopReason: "toolUse" }),
		() => fauxAssistantMessage("You applied the cancellation ratio correctly after help. A fresh example without help would be useful; choose when to continue."),
	]);
	for (const input of [
		{ type: "text", text: "Help me practise volume conversions." },
		{ type: "thinking", problemCallId: "golden-drill-problem", text: "I am unsure which way to arrange the ratio." },
		{ type: "thinking", problemCallId: "golden-drill-problem", text: "250 L × (1 m³ / 1000 L) = 0.25 m³; the litres cancel." },
	]) {
		const response = await handleChatRequest(new Request(`${origin}/api/chat`, {
			method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chatId: id, input }),
		}));
		assert.equal(response.status, 200, await response.clone().text());
		const run = runningTurn(id);
		if (run) await timeout(new Response(run.subscribe()).text());
	}
	assert.equal(faux.getPendingResponseCount(), 0);
	const reopenedResponse = await originalFetch(`${origin}/api/chats/${id}`, { signal: AbortSignal.timeout(120_000) });
	assert.equal(reopenedResponse.status, 200, await reopenedResponse.clone().text());
	const reopened = await reopenedResponse.json();
	assert.equal(reopened.practiceMode, "drill");
	assert.deepEqual(reopened.turns, chatStore.getChat(id)!.turns);
	assert.equal(reopened.turns.length, 3);
	assert.equal(reopened.turns[2].drillPromptContext.messageIds.length, 2);
	const source = path.join(profile, "data/chats", `${id}.json`);
	const destination = path.join(root, "tests/fixtures/golden-data/chats", `${id}.json`);
	fs.copyFileSync(source, destination, fs.constants.COPYFILE_EXCL);
	assert.deepEqual(fs.readFileSync(destination), fs.readFileSync(source));
	console.log(`Captured verbatim: ${destination}\nHTTP creation and reopen: ${origin}\nScripted provider calls: ${faux.state.callCount}; live model calls: 0`);
} catch (error) {
	console.error(logs);
	throw error;
} finally {
	server.kill("SIGTERM");
	try { await timeout(ended, 10_000); } catch { server.kill("SIGKILL"); await ended; }
	globalThis.fetch = originalFetch;
	process.env = originalEnv;
	fs.rmSync(profile, { recursive: true, force: true });
}
