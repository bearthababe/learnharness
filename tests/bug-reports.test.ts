/**
 * Round 19 (§0): 🐞 reports — the server store (idempotent create under the
 * client's id, ordered note edits, Change shaping, Discard tombstones,
 * redaction) and the client's durable draft (lost responses, reload,
 * offline, Discard before the create lands).
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { it } from "node:test";

const TMP_DATA = fs.mkdtempSync(path.join(os.tmpdir(), "lh-bug-reports-"));
process.env.LH_DATA_DIR = TMP_DATA;
process.env.LH_BUILD_ID = "B-test-1234567";
const logFile = path.join(TMP_DATA, "server.log");
fs.writeFileSync(logFile, ["boot ok", "OPENAI_API_KEY=sk-live1234567890abcdef leaked", "Authorization: Bearer abcdefghijklmnop", "last line"].join("\n"));
process.env.LH_SERVER_LOG = logFile;

const store = await import("../src/server/bug-reports.ts");
const { BugDraft } = await import("../components/bug-draft.ts");

it("§0: a report is created once under the client's id, with the build, the redacted server log tail and no secrets", () => {
	const page = { path: "/chat/nope", at: "2026-11-11T10:00:00.000Z", note: "token sk-abcdefghijklmnop here", log: [{ at: "x", kind: "error", text: "boom" }] };
	const first = store.createReport("r-test-0001", page);
	assert.ok(first && first !== "discarded");
	assert.equal(first.kind, "bug");
	assert.match(String(first.note), /\[redacted key\]/);
	const server = first.server as { buildId: string; serverLog: string[]; serverTime: string };
	assert.equal(server.buildId, "B-test-1234567");
	assert.equal(server.serverLog.length, 4);
	assert.ok(!server.serverLog.join("\n").includes("sk-live"), "keys never reach a report");
	assert.ok(!server.serverLog.join("\n").includes("abcdefghijklmnop"), "bearer tokens never reach a report");
	// The same id again (a retried create) is the same report, not a second one.
	const again = store.createReport("r-test-0001", { ...page, note: "different" });
	assert.ok(again && again !== "discarded");
	assert.equal(again.note, first.note);
	assert.equal(store.listReports().length, 1);
	assert.equal(store.createReport("../../etc", page), null, "an unsafe id is refused");
	const raw = fs.readFileSync(path.join(TMP_DATA, "bugs", "r-test-0001", "report.json"), "utf8");
	assert.ok(!raw.includes("auth.json"));
});

it("§0: note edits apply in order; a Change drops the log and server details", () => {
	store.updateReport("r-test-0001", { note: "second", seq: 2 });
	store.updateReport("r-test-0001", { note: "first (late)", seq: 1 });
	assert.equal(store.getReport("r-test-0001")?.note, "second", "an older edit never overwrites a newer one");
	store.updateReport("r-test-0001", { kind: "change", seq: 3, note: "make it larger" });
	const change = store.getReport("r-test-0001")!;
	assert.equal(change.kind, "change");
	assert.equal(change.log, undefined);
	assert.equal(change.server, undefined);
	assert.equal(change.note, "make it larger");
});

it("§0: Discard removes the report for good — a late create cannot bring it back", () => {
	assert.ok(store.saveScreenshot("r-test-0001", new Uint8Array([0xff, 0xd8, 0xff]), "image/jpeg"));
	assert.equal(store.readScreenshot("r-test-0001")?.type, "image/jpeg");
	store.deleteReport("r-test-0001");
	assert.equal(store.getReport("r-test-0001"), null);
	assert.equal(store.createReport("r-test-0001", { path: "/" }), "discarded");
	assert.equal(store.listReports().length, 0);
});

it("§0: the client draft survives a lost create, a reload and an offline edit, and sends the newest note", async () => {
	let current: { note: string; kind: string; seq: number } | null = null, created = 0, failNext = false, offline = false;
	const persisted = new Map<string, unknown>();
	const send = {
		async create(_id: string, report: Record<string, unknown>) {
			if (offline) throw new Error("offline");
			if (!current) { current = { note: String(report.note ?? ""), kind: String(report.kind), seq: 0 }; created++; }
			if (failNext) { failNext = false; throw new Error("lost create response"); }
			return "saved" as const;
		},
		async edit(_id: string, edit: { note: string; kind: string; seq: number }) {
			if (offline) throw new Error("offline");
			if (edit.seq >= current!.seq) current = { note: edit.note, kind: edit.kind, seq: edit.seq };
		},
		async remove() { current = null; },
	};
	const persist = (value: { id: string }, forget: boolean) => { if (forget) persisted.delete(value.id); else persisted.set(value.id, structuredClone(value)); };
	let draft = new BugDraft({ id: "r-draft-1", kind: "bug", note: "", sequence: 0, savedSequence: -1, created: false, report: { path: "/" } }, send, persist);
	failNext = true;
	draft.update({ note: "typed before the create landed" });
	await assert.rejects(draft.flush(), /lost create/);
	// Reload: the persisted draft finishes — the create is idempotent, the note arrives.
	draft = new BugDraft(persisted.get("r-draft-1") as never, send, persist);
	await draft.flush();
	assert.equal(created, 1);
	assert.equal(current!.note, "typed before the create landed");
	offline = true;
	draft.update({ note: "typed offline" });
	await assert.rejects(draft.flush(), /offline/);
	assert.equal((persisted.get("r-draft-1") as { note: string }).note, "typed offline", "kept on the device");
	offline = false;
	draft.update({ closed: true });
	await draft.flush();
	assert.equal(current!.note, "typed offline");
	assert.equal(persisted.has("r-draft-1"), false, "a closed, fully saved draft is forgotten");
});

it("§0: Discard pressed before the report was saved deletes it once it exists", async () => {
	let exists = false, removed = 0;
	const send = { async create() { exists = true; return "saved" as const; }, async edit() {}, async remove() { exists = false; removed++; } };
	const draft = new BugDraft({ id: "r-draft-2", kind: "bug", note: "", sequence: 0, savedSequence: -1, created: false, report: { path: "/" } }, send, () => {});
	draft.update({ discardPending: true });
	await draft.flush();
	assert.equal(exists, false);
	assert.equal(removed, 1);
});

it("§0 (merge proof): every string a report brings is cut of keys before it is stored, whatever the client did", () => {
	const { redactSecrets } = store;
	// Test-only fake key shapes, built at run time.
	const github = "ghp_" + "A1b2C3d4E5f6G7h8I9j0K1l2", google = "AIza" + "Sy0123456789abcdefghijklmnopq", openai = "sk-" + "proj0123456789abcdef";
	const report = store.createReport("r-redact-client-1", {
		path: "/chat/c?api_key=zz-path-secret",
		note: `token ${github}`,
		url: `http://x/chat/c?key=${google}&ok=1`,
		title: `Bearer ${openai}`,
		log: [
			{ at: "t", kind: "error", text: `fetch failed with ${github} and ${google}` },
			{ at: "t", kind: "warn", text: `OPENROUTER_API_KEY=${openai} in env` },
			{ at: "t", kind: "fetch", text: '{"apiKey": "zz-json-secret"}' },
		],
		device: { settings: { note: `nested ${github}` } },
	});
	assert.ok(report && report !== "discarded");
	const stored = fs.readFileSync(path.join(store.bugsDir(), "r-redact-client-1", "report.json"), "utf-8");
	for (const secret of [github, google, openai, "zz-json-secret", "zz-path-secret"]) assert.ok(!stored.includes(secret), `stored report holds ${secret.slice(0, 6)}…`);
	assert.match(stored, /\[redacted key\]/);
	assert.ok(stored.includes("ok=1"), "the rest of the text stays");
	// One definition for the client's recorder and the server.
	assert.equal(redactSecrets(`x ${github} y`), "x [redacted key] y");
	assert.equal(redactSecrets("http://a/b?token=zz123&q=2"), "http://a/b?token=[redacted]&q=2");
	const recorder = fs.readFileSync("components/bug-recorder.tsx", "utf-8");
	assert.ok(/import \{ redactSecrets \} from "@\/src\/core";/.test(recorder) && recorder.includes("const redact = redactSecrets"), "the client recorder uses the shared redaction");
});
