import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { test } from "node:test";
import { acquireCredentialFiles, acquireProfile, resolveProfile } from "../../electron/deployment-profile.cjs";

test("private Linux native custody excludes a managed owner without delegating or colliding with its private child", context => {
	const root = fs.mkdtempSync(path.join(os.homedir(), ".cache", "zz-custody-"));
	context.after(() => fs.rmSync(root, { recursive: true, force: true }));
	const profile = resolveProfile({ env: { LH_PROFILE_DIR: root } });
	const native = acquireCredentialFiles(root);
	try {
		assert.throws(() => acquireProfile(profile), /live writer/);
		assert.throws(() => acquireCredentialFiles(root), /live writer/);
		const legacy = resolveProfile({ env: { LH_DATA_DIR: path.join(root, "data"), LH_AUTH_FILE: path.join(root, "auth.json") } });
		const child = acquireProfile(legacy);
		try { native.assertOwner(); child.assertOwner(); } finally { child.release(); }
	} finally { native.release(); }
	const owner = acquireProfile(profile);
	try { assert.throws(() => acquireCredentialFiles(root), /live writer/); } finally { owner.release(); }
});

test("an actual unmanaged web owner leases native files even when another caller chooses a different auth filename", { timeout: 10000 }, async context => {
	const home = fs.mkdtempSync(path.join(os.homedir(), ".cache", "zz-web-custody-"));
	context.after(() => fs.rmSync(home, { recursive: true, force: true }));
	const data = path.join(home, "data");
	const profileModule = path.resolve("electron/deployment-profile.cjs");
	const child = spawn(process.execPath, ["-e", `const {resolveProfile,ownServerProfile}=require(${JSON.stringify(profileModule)});ownServerProfile(resolveProfile());console.log('ready');setInterval(()=>{},1000);`], { env: { HOME: home, LH_DATA_DIR: data, LH_AUTH_FILE: path.join(home, "other-auth.json") }, stdio: ["ignore", "pipe", "pipe"] });
	context.after(async () => { if (child.exitCode === null && child.signalCode === null) { const exited = once(child, "exit"); child.kill("SIGTERM"); await exited; } });
	await once(child.stdout, "data");
	assert.throws(() => acquireCredentialFiles(home), /live writer/);
	const managed = resolveProfile({ env: { LH_PROFILE_DIR: home } });
	assert.throws(() => acquireProfile(managed), /live writer/);
});
