import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { compatibilityManifest, probeProfile } from "../../electron/deployment-compatibility.cjs";

test("rollback probes actual chat v2, graph v1, credentials and ink formats without changing progress", context => {
	const directory = fs.mkdtempSync(path.join(os.tmpdir(), "lh-compatible-"));
	context.after(() => fs.rmSync(directory, { recursive: true, force: true }));
	for (const name of ["chats", "graph", "handwriting"]) fs.mkdirSync(path.join(directory, "data", name), { recursive: true });
	const chat = path.join(directory, "data/chats/zz_prove_it.json");
	fs.writeFileSync(chat, JSON.stringify({ version: 2, id: "zz_prove_it", messages: [{ role: "user", content: "new progress after backup" }], notebook: { modelPickerVersion: 2 } }));
	fs.writeFileSync(path.join(directory, "data/graph/format.json"), '{"version":1}');
	fs.writeFileSync(path.join(directory, "chatgpt-credentials.json"), '{"version":1,"hostId":"synthetic","registrations":[]}');
	fs.writeFileSync(path.join(directory, "data/handwriting/zz_prove_it.json"), '{"version":2,"pageId":"page_initial","head":null,"events":{},"backgrounds":{}}');
	const before = fs.readFileSync(chat, "utf8");
	const manifest = compatibilityManifest(path.resolve(import.meta.dirname, "../.."));
	assert.equal(manifest.versions.chat, 2);
	assert.equal(manifest.notebookModelPicker, 2);
	assert.equal(probeProfile(directory, manifest).files, 4);
	assert.equal(fs.readFileSync(chat, "utf8"), before);
	fs.writeFileSync(chat, before.replace('"modelPickerVersion":2', '"modelPickerVersion":3'));
	assert.throws(() => probeProfile(directory, manifest), /Unknown or newer/);
	fs.writeFileSync(chat, '{"version":3,"id":"zz_prove_it","messages":[]}');
	assert.throws(() => probeProfile(directory, manifest), /Unknown or newer/);
	fs.writeFileSync(chat, before);
	fs.writeFileSync(path.join(directory, "data/graph/source-organization.json"), '{"version":1,"folders":[],"placements":{}}');
	assert.equal(probeProfile(directory, manifest).files, 5);
	fs.writeFileSync(path.join(directory, "data/graph/source-organization.json"), '{"version":2,"folders":[],"placements":{}}');
	assert.throws(() => probeProfile(directory, manifest), /source-organization.*Unknown or newer/);
	fs.writeFileSync(path.join(directory, "data/graph/source-organization.json"), '{"version":1,"folders":[],"placements":{}}');
	fs.writeFileSync(path.join(directory, "data/unknown-format.json"), '{}');
	assert.throws(() => probeProfile(directory, manifest), /Unknown owned/);
});

test("unknown nested formats and symlinks never authorize rollback", context => {
	const directory = fs.mkdtempSync(path.join(os.tmpdir(), "lh-incompatible-"));
	context.after(() => fs.rmSync(directory, { recursive: true, force: true }));
	fs.mkdirSync(path.join(directory, "data/chats"), { recursive: true });
	const filename = path.join(directory, "data/chats/zz_prove_it.json");
	const manifest = compatibilityManifest(path.resolve(import.meta.dirname, "../.."));
	fs.writeFileSync(filename, '{"version":2,"id":"zz_prove_it","messages":[],"notebook":{"schemaVersion":4}}');
	assert.throws(() => probeProfile(directory, manifest), /Unknown nested/);
	fs.unlinkSync(filename); fs.symlinkSync("/dev/null", filename);
	assert.throws(() => probeProfile(directory, manifest), /Unsafe profile/);
});

test("rollback accepts submitted handwriting metadata but refuses unknown nested formats", context => {
	const directory = fs.mkdtempSync(path.join(os.tmpdir(), "lh-compatible-writing-"));
	context.after(() => fs.rmSync(directory, { recursive: true, force: true }));
	fs.mkdirSync(path.join(directory, "data/chats"), { recursive: true });
	const filename = path.join(directory, "data/chats/zz_prove_it.json");
	const manifest = compatibilityManifest(path.resolve(import.meta.dirname, "../.."));
	const chat = { version: 2, id: "zz_prove_it", messages: [
		{ role: "user", content: "earlier progress", sharedWriting: [{ id: "writing_earlier", createdAt: "2026-11-07T00:00:00.000Z", editableSource: { version: 1 } }] },
		{ role: "user", content: "submitted handwriting", sharedWriting: [{ id: "writing_first", createdAt: "2026-11-07T00:01:00.000Z", editableSource: { version: 1 } }, { id: "writing_second", createdAt: "2026-11-07T00:02:00.000Z", editableSource: { version: 1 } }] },
	] };
	const before = JSON.stringify(chat);
	fs.writeFileSync(filename, before);
	assert.equal(probeProfile(directory, manifest).compatible, true);
	assert.equal(fs.readFileSync(filename, "utf8"), before);
	chat.messages[1].sharedWriting[1].editableSource.version = 2;
	fs.writeFileSync(filename, JSON.stringify(chat));
	assert.throws(() => probeProfile(directory, manifest), /Unknown or newer/);
	chat.messages[1].sharedWriting[1].editableSource.version = 1;
	chat.messages[1].sharedWriting[1].editableSource.schemaVersion = 1;
	fs.writeFileSync(filename, JSON.stringify(chat));
	assert.throws(() => probeProfile(directory, manifest), /Unknown nested/);
});
