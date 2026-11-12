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
process.env.LH_AUTH_FILE = path.join(TMP_DATA, "auth.json");
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

it("§0 (merge proof, round 2): the server's own details, the capture time, deep fields and field names are cut of keys too; so is a filed issue", async () => {
	const { chatStore } = await import("../src/store/chats.ts");
	const { issueText } = await import("../src/server/report-issues.ts");
	// Test-only fake key shapes, built at run time.
	const github = "ghp_" + "Z9y8X7w6V5u4T3s2R1q0P9o8", google = "AIza" + "Sy9876543210zyxwvutsrqponmlk", openai = "sk-" + "proj9876543210fedcba";
	// A key pasted into Home's opening prompt becomes the session's title.
	const chat = chatStore.createChat(`explain this ${openai} please`);
	let deep: Record<string, unknown> = { leaf: `deep ${google}` };
	for (let i = 0; i < 12; i++) deep = { next: deep };
	const report = store.createReport("r-redact-server-2", {
		path: `/chat/${chat.id}`,
		at: `2026-11-12T10:00:00.000Z ${github}`,
		deep,
		fields: { [github]: "named after a key" },
	});
	assert.ok(report && report !== "discarded");
	const stored = fs.readFileSync(path.join(store.bugsDir(), "r-redact-server-2", "report.json"), "utf-8");
	for (const secret of [github, google, openai]) assert.ok(!stored.includes(secret), `stored report holds ${secret.slice(0, 6)}…`);
	const saved = JSON.parse(stored);
	assert.match(saved.server.session.title, /^explain this \[redacted key\] please$/, "the session's title is kept, without the key");
	assert.match(saved.at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/, "a capture time that is not a timestamp becomes the server's clock");
	assert.equal(store.createReport("r-redact-server-3", { path: "/", at: "2026-11-12T10:00:00.000Z" }) && (store.getReport("r-redact-server-3")!.at), "2026-11-12T10:00:00.000Z", "a real capture time stays");
	// A value already cut by an earlier rule stays one "[redacted]".
	assert.equal(store.redactSecrets(`OPENAI_API_KEY=${openai} rest`), "OPENAI_API_KEY=[redacted] rest");
	// A report on disk from before (unredacted) still files without its keys.
	const issue = issueText({ id: "r-old", kind: "bug", at: "2026-11-12T10:00:00.000Z", path: "/", note: `see ${github}`, log: [{ at: "2026-11-12T10:00:00.000Z", kind: "error", text: `boom ${google}` }] });
	for (const secret of [github, google]) assert.ok(!issue.title.includes(secret) && !issue.body.includes(secret), `a filed issue holds ${secret.slice(0, 6)}…`);
});

it("§0 (merge proof, round 3): the keys this instance holds never reach a report, whatever their shape; ordinary words stay; the page cannot set server fields", async () => {
	const { authStore } = await import("../src/store/auth.ts");
	const { chatStore } = await import("../src/store/chats.ts");
	const { issueText } = await import("../src/server/report-issues.ts");
	// Test-only fake keys, built at run time: one held in auth.json with no
	// known prefix (a Mistral-style key), one in a secret-named environment variable.
	const held = "zzHeld" + "Mistral0123456789abcdef", fromEnv = "zzEnv" + "Held0123456789abcdef";
	authStore.setAuthVar("MISTRAL_API_KEY", held);
	process.env.ZZ_PROVE_IT_API_KEY = fromEnv;
	try {
		const prefixed = ["gsk_" + "abcdefghijklmnopqrstuvwx1234", "tvly-dev-" + "abcdefghijklmnop1234", "xai-" + "abcdefghijklmnopqrstu123", "fc-" + "0123456789abcdef0123456789abcdef", "hf_" + "abcdefghijklmnopqrstuv1234", "csk-" + "abcdefghijklmnopqrstu123", "nvapi-" + "abcdefghijklmnopqrstu123"];
		const chat = chatStore.createChat(`Basic concepts of probability ${held}`);
		const report = store.createReport("r-redact-held-3", {
			path: `/chat/${chat.id}`, at: "9999-99-99T99:99:99Z",
			note: `tokens: how a tokenizer splits text; ${fromEnv}`,
			log: prefixed.map(key => ({ at: "2026-11-12T10:00:00.000Z", kind: "error", text: `failed with ${key}` })),
			issue: "https://github.com/zz-other/zz-repo/issues/1", server: { session: { title: held } }, noteSeq: 99,
		});
		assert.ok(report && report !== "discarded");
		const stored = fs.readFileSync(path.join(store.bugsDir(), "r-redact-held-3", "report.json"), "utf-8");
		for (const secret of [held, fromEnv, ...prefixed]) assert.ok(!stored.includes(secret), `stored report holds ${secret.slice(0, 6)}…`);
		const saved = JSON.parse(stored);
		assert.equal(saved.server.session.title, "Basic concepts of probability [redacted key]", "ordinary words stay; the held key goes");
		assert.equal(saved.note, "tokens: how a tokenizer splits text; [redacted key]");
		assert.equal(saved.issue, undefined, "the page cannot point filing at an issue");
		assert.equal(saved.noteSeq, 0);
		assert.notEqual(saved.at, "9999-99-99T99:99:99Z", "an impossible capture time becomes the server's clock");
		// A key-shaped id is refused, not stored under a redacted folder.
		assert.equal(store.createReport("ghp_" + "A1b2C3d4E5f6G7h8I9j0K1l2", { path: "/" }), null);
		// A report saved before the key was held is read back, and filed, without it.
		const old = path.join(store.bugsDir(), "r-held-old-1");
		fs.mkdirSync(old, { recursive: true });
		fs.writeFileSync(path.join(old, "report.json"), JSON.stringify({ id: "r-held-old-1", kind: "bug", at: "2026-11-01T10:00:00.000Z", path: "/", note: `see ${held}`, server: { session: { title: fromEnv } } }));
		const readBack = JSON.stringify(store.getReport("r-held-old-1"));
		assert.ok(!readBack.includes(held) && !readBack.includes(fromEnv), "an older report is read back without held keys");
		const issue = issueText(store.getReport("r-held-old-1")!);
		assert.ok(!issue.title.includes(held) && !issue.body.includes(held));
		// Ordinary words and settings names stay as they were.
		for (const text of ["Basic concepts of probability", "tokens: how a tokenizer splits text", "Secret: the ending", "passwords: are hashed", "Bearer bonds", "keyboard-off ask-tutor try:card-layout fc-barcelona hf_hub sk-learn"]) assert.equal(store.redactSecrets(text), text);
		assert.equal(store.redactSecrets("page `/chat/x?key=AIza" + "Sy0123456789abcdefghijklmnopq` here"), "page `/chat/x?key=[redacted]` here");
	} finally {
		authStore.deleteAuthVar("MISTRAL_API_KEY");
		delete process.env.ZZ_PROVE_IT_API_KEY;
	}
});

it("§0 (merge proof, round 4): ordinary lesson phrases stay; glued, encoded and app-shaped keys go; a held key never names a report; old reports are cleaned on disk", async () => {
	const { authStore } = await import("../src/store/auth.ts");
	const { chatStore } = await import("../src/store/chats.ts");
	const { issueText } = await import("../src/server/report-issues.ts");
	const maskRoute = await import("../app/api/bugs/mask/route.ts");
	// Round 4's ordinary phrases: each stays as written (title, note, log)…
	const phrases = [
		"Basic concepts of probability", "tokens: how a tokenizer splits words", "Secret: none of this is secret", "passwords: why length beats complexity", "Bearer bonds and coupon payments",
		"Password: how long is long enough?", "Password strength: hashing and salting", "API keys: what they are and how to keep them safe", "access_token: OAuth explained", "secret_key: Django settings explained",
		"private_key: what signs a message", "TOKEN: the smallest unit of a program", "Tokens: 182000 of 200000", "Bearer tokens in HTTP/2 headers", "Bearer authentication/authorization",
		"Two-factor auth: one-time passwords (OTP)", "The secret key: why we hash passwords", "Secret Santa maths: derangements", "password: field shown on the sign-in screen",
		"Basic 1/2+1/4+1/8 sums", "Basic HTML5/CSS3 layouts", "Basic Math101/Algebra", "basic arithmetic warm-up", "the basic derivatives question froze", "sk-learn-pipelines for beginners",
		"Key=value pairs in Python dicts", "context nearly full, tokens: 182000 of 200000", "MAX_TOKENS=4096 reached", "fc-barcelona-vs-real-madrid",
	];
	for (const [i, phrase] of phrases.entries()) {
		const chat = chatStore.createChat(phrase);
		const report = store.createReport(`r-words-r4-${i}`, { path: `/chat/${chat.id}`, note: phrase, log: [{ at: "2026-11-12T10:00:00.000Z", kind: "warn", text: phrase }] });
		assert.ok(report && report !== "discarded");
		const saved = JSON.parse(fs.readFileSync(path.join(store.bugsDir(), `r-words-r4-${i}`, "report.json"), "utf-8"));
		assert.deepEqual([saved.server.session.title, saved.note, saved.log[0].text], [phrase, phrase, phrase], `"${phrase}" is kept`);
	}
	// …while a password set in a config line is still cut.
	assert.equal(store.redactSecrets("My password=hunter2 is it safe"), "My password=[redacted] is it safe");
	// Test-only fake keys, built at run time.
	const held = "zz+proveit/" + "R4HELDb64key==", groq = "gsk_" + "zzproveitR4GROQ00000000000000000000", firecrawl = "fc-" + "zzproveitFIRECRAWL0000000000";
	authStore.setAuthVar("TOGETHER_API_KEY", held);
	try {
		const report = store.createReport("r-keys-r4-1", {
			path: "/", url: `http://x/chat/c?q=${encodeURIComponent(held)}`, note: `GROQ_KEY_${groq} and ${firecrawl}`,
			log: [{ at: "2026-11-12T10:00:00.000Z", kind: "nav", text: `/chat/c?q=${encodeURIComponent(held)}` }],
		});
		assert.ok(report && report !== "discarded");
		const stored = fs.readFileSync(path.join(store.bugsDir(), "r-keys-r4-1", "report.json"), "utf-8");
		for (const secret of [held, encodeURIComponent(held), groq, firecrawl]) assert.ok(!stored.includes(secret), `stored report holds ${secret.slice(0, 8)}…`);
		// A held key (any shape) never names a report folder.
		const mistral = "zzproveit" + "R4MISTRALHELD0123456789ab";
		authStore.setAuthVar("MISTRAL_API_KEY", mistral);
		for (const id of [mistral, `r-zz-${mistral}`]) {
			assert.equal(store.createReport(id, { path: "/" }), null, "a held key is refused as a report id");
			assert.equal(fs.existsSync(path.join(store.bugsDir(), id)), false);
		}
		// A report saved before its key was held: cleaned on disk once the key is saved.
		const late = "zzproveit" + "R4LATEKEY0123456789abcd";
		store.createReport("r-before-key-r4", { path: "/", note: `before ${late} end` });
		const file = path.join(store.bugsDir(), "r-before-key-r4", "report.json");
		assert.ok(fs.readFileSync(file, "utf-8").includes(late), "nothing held it when it was saved");
		authStore.setAuthVar("DEEPSEEK_API_KEY", late);
		assert.ok(store.scrubReports() >= 1);
		assert.ok(!fs.readFileSync(file, "utf-8").includes(late), "the file the coordinator collects no longer holds it");
		// Which words on the screen hold a held key — whole, or inside a longer
		// word — come back with the key cut out; ordinary words don't come back,
		// and no answer holds a key.
		const glued = `abc${mistral}xyz`;
		const res = await maskRoute.POST(new Request("http://test/api/bugs/mask", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ words: [mistral, "ordinary-words-here", held, glued, "short"] }) }));
		const answer = await res.json() as { held: { word: string; masked: string }[] };
		assert.deepEqual(answer.held.map((entry) => [entry.word, entry.masked]).sort(), [[mistral, "[redacted key]"], [held, "[redacted key]"], [glued, "abc[redacted key]xyz"]].sort());
		assert.ok(!answer.held.some((entry) => entry.masked.includes(mistral) || entry.masked.includes(held)), "an answer never holds a key");
	} finally {
		for (const name of ["TOGETHER_API_KEY", "MISTRAL_API_KEY", "DEEPSEEK_API_KEY"]) authStore.deleteAuthVar(name);
	}
	// An old report with only ordinary content reads back unchanged, deep fields included, and its file is untouched.
	let deep: Record<string, unknown> = { leaf: "zz-prove-it leaf at depth 10" };
	for (let i = 0; i < 10; i++) deep = { next: deep };
	const oldDir = path.join(store.bugsDir(), "r-ordinary-old-r4");
	fs.mkdirSync(oldDir, { recursive: true });
	const old = { id: "r-ordinary-old-r4", kind: "bug", at: "2026-11-01T10:00:00.000Z", path: "/", note: "Basic 1/2+1/4+1/8 sums", deep, log: [{ at: "x", kind: "warn", text: "password: field shown on the sign-in screen" }], server: { session: { title: "Password: how long is long enough?" } } };
	fs.writeFileSync(path.join(oldDir, "report.json"), JSON.stringify(old));
	const { hasScreenshot: _shot, dir: _dir, ...readBack } = store.getReport("r-ordinary-old-r4")!;
	void _shot; void _dir;
	assert.deepEqual(readBack, old);
	assert.equal(fs.readFileSync(path.join(oldDir, "report.json"), "utf-8"), JSON.stringify(old));
	// A rolled-over date is not a capture time; a log time that is not a timestamp files as "--:--:--".
	const rolled = store.createReport("r-rolled-at-r4", { path: "/", at: "2026-02-30T10:00:00.000Z" });
	assert.ok(rolled && rolled !== "discarded" && rolled.at !== "2026-02-30T10:00:00.000Z");
	const issue = issueText({ id: "r-x", kind: "bug", at: "2026-11-12T10:00:00.000Z", path: "/", note: "n", log: [{ at: "xxxxxxxxxxxsk-zzproveitglued", kind: "error", text: "boom" }] });
	assert.ok(issue.body.includes("--:--:-- error boom") && !issue.body.includes("sk-zz"));
});

it("§0 (merge proof): Settings → About says where reports go — kept here, and filed in the configured repo when filing is on", async () => {
	const aboutRoute = await import("../app/api/about/route.ts");
	const before = process.env.LH_REPORTS_REPO;
	try {
		delete process.env.LH_REPORTS_REPO;
		assert.equal((await aboutRoute.GET().json()).reportsFiledTo, null);
		process.env.LH_REPORTS_REPO = "zz-prove-it/zz-reports";
		assert.equal((await aboutRoute.GET().json()).reportsFiledTo, "zz-prove-it/zz-reports");
	} finally {
		if (before === undefined) delete process.env.LH_REPORTS_REPO; else process.env.LH_REPORTS_REPO = before;
	}
});

it("§0 (merge proof, CI run 43292266870 diagnosis): redaction stays linear on long hyphenated and repeated runs (the recorder runs it on the page's main thread)", () => {
	const n = 100_000;
	const shapes: Record<string, string> = {
		"hyphenated run": "ab-".repeat(n / 3), "repeated sk-": "sk-".repeat(n / 3), "repeated TOKEN_": "TOKEN_".repeat(n / 6), "repeated password:": "password:".repeat(n / 9),
		"digits and hyphens": "a1-".repeat(n / 3), "quoted letters": "\"a".repeat(n / 2), "bearer then hyphens": "Bearer " + "a-".repeat(n / 2),
	};
	let total = 0;
	for (const [name, text] of Object.entries(shapes)) {
		const started = performance.now();
		store.redactSecrets(text);
		const took = performance.now() - started;
		total += took;
		assert.ok(took < 500, `${name} (${text.length} characters) took ${took.toFixed(0)} ms`);
	}
	assert.ok(total < 1500, `all shapes took ${total.toFixed(0)} ms`);
	// The recorder redacts only what it keeps (bounded input).
	const recorder = fs.readFileSync("components/bug-recorder.tsx", "utf-8");
	assert.ok(recorder.includes("redact(text.slice(0, 4000)).slice(0, 1000)"));
});
