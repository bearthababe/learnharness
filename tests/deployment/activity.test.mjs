import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createActivity } from "../../electron/deployment-activity.cjs";
import { runPreparation } from "../../scripts/lib/deployment-process.mjs";

test("the writer barrier observes freeze without reading mutable server work", () => {
	let observations = 0;
	const activity = createActivity({ work: () => { observations++; return []; } });
	assert.equal(activity.isFrozen(), false);
	assert.equal(observations, 0);
	activity.beginFreeze();
	const before = observations;
	assert.equal(activity.isFrozen(), true);
	assert.equal(observations, before);
	activity.thaw();
	assert.equal(activity.isFrozen(), false);
});

test("client admission, stale/disconnected drafts and server work fail closed", () => {
	let clock = 100;
	let jobs = [];
	const activity = createActivity({ now: () => clock, work: () => jobs });
	const id = activity.open("session");
	assert.equal(activity.snapshot().state, "unknown");
	assert.throws(() => activity.beginFreeze());
	assert.throws(() => activity.report("wrong-session", { id, sequence: 1, reasons: [] }));
	activity.report("session", { id, sequence: 1, reasons: ["composer"] });
	assert.equal(activity.snapshot().state, "busy");
	activity.report("session", { id, sequence: 2, reasons: ["composer"], leave: true });
	clock += 6000;
	assert.equal(activity.snapshot().state, "unknown");
	activity.report("session", { id, sequence: 3, reasons: [] });
	assert.equal(activity.snapshot().state, "idle");
	jobs = ["tutor"];
	assert.equal(activity.snapshot().state, "busy");
	jobs = [];
	assert.equal(activity.snapshot().state, "idle");
});

test("freeze requires fresh acknowledgements from every idle client and excludes new writes", () => {
	const activity = createActivity();
	const first = activity.open("session");
	const second = activity.open("session");
	activity.report("session", { id: first, sequence: 1, reasons: [] });
	activity.report("session", { id: second, sequence: 1, reasons: [] });
	const freeze = activity.beginFreeze();
	assert.throws(() => activity.assertFrozen(freeze));
	assert.throws(() => activity.enterRequest());
	activity.report("session", { id: first, sequence: 2, reasons: [], freeze });
	assert.throws(() => activity.assertFrozen(freeze));
	activity.report("session", { id: second, sequence: 2, reasons: [], freeze });
	activity.assertFrozen(freeze);
	activity.report("session", { id: first, sequence: 3, reasons: ["unfinished-handwriting"], freeze });
	assert.throws(() => activity.assertFrozen(freeze));
	activity.thaw();
	assert.doesNotThrow(() => activity.enterRequest()());
});

test("real preparation cancellation terminates a signal-resistant build descendant", async context => {
	const directory = fs.mkdtempSync(path.join(os.tmpdir(), "lh-preparation-"));
	context.after(() => fs.rmSync(directory, { recursive: true, force: true }));
	const childFile = path.join(directory, "descendant");
	const script = `const fs=require('node:fs'); const {spawn}=require('node:child_process'); const child=spawn(process.execPath,['-e',\`process.on('SIGTERM',()=>{});setInterval(()=>{},1000)\`],{stdio:'ignore'});fs.writeFileSync(${JSON.stringify(childFile)},String(child.pid));setInterval(()=>{},1000);`;
	const controller = new AbortController();
	const running = runPreparation([process.execPath, "-e", script], { log: path.join(directory, "build.log"), signal: controller.signal });
	for (let attempt = 0; !fs.existsSync(childFile) && attempt < 100; attempt++) await new Promise(resolve => setTimeout(resolve, 10));
	assert.ok(fs.existsSync(childFile));
	const descendant = Number(fs.readFileSync(childFile, "utf8"));
	controller.abort(new Error("real-client-activity"));
	await assert.rejects(running, /real-client-activity/);
	let active = false;
	try { const contents = fs.readFileSync(`/proc/${descendant}/stat`, "utf8"); active = contents.slice(contents.lastIndexOf(")") + 2).split(" ")[0] !== "Z"; } catch {}
	assert.equal(active, false);
});
