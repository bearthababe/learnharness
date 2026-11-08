import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { acquireProfile, resolveProfile } from "../../electron/deployment-profile.cjs";
import { backupProfile, listBackups, migrateRepository, profileIO, restoreProfile, treeIdentity } from "../../scripts/lib/deployment-profile.mjs";

const code = process.cwd();
const cache = path.join(os.homedir(), ".cache");
fs.mkdirSync(cache, { recursive: true });

test("non-Linux defaults preserve the existing unmanaged data and auth paths", () => {
	for (const platform of ["darwin", "win32"]) {
		const profile = resolveProfile({ env: {}, codeRoot: code, home: cache, platform });
		assert.equal(profile.managed, false);
		assert.equal(profile.dataDir, path.join(code, "data"));
		assert.equal(profile.authFile, path.join(code, "auth.json"));
	}
});

function fixture(context) {
	const directory = fs.mkdtempSync(path.join(cache, "zz-prove-it-profile-slice-"));
	context.after(() => fs.rmSync(directory, { recursive: true, force: true }));
	const profile = resolveProfile({ env: { LH_PROFILE_DIR: path.join(directory, "profile") } });
	const seed = (value = "initial") => {
		fs.mkdirSync(profile.dataDir, { recursive: true, mode: 0o700 });
		fs.writeFileSync(path.join(profile.dataDir, "learning.json"), value, { mode: 0o600 });
		fs.writeFileSync(profile.authFile, '{"SYNTHETIC":"not-a-credential"}', { mode: 0o600 });
		fs.writeFileSync(path.join(profile.root, "native-subscription.json"), '{"synthetic":true}', { mode: 0o600 });
	};
	return { directory, profile, seed };
}

async function childOwner(context, profile) {
	const source = `
		const { acquireProfile } = require(${JSON.stringify(path.join(code, "electron/deployment-profile.cjs"))});
		try {
			const owner = acquireProfile(JSON.parse(process.argv[1]));
			process.send({ filename: owner.filename, record: owner.record });
			process.on("message", message => {
				if (message === "release") process.send({ released: owner.release() });
				if (message === "exit") process.exit(0);
			});
			process.on("SIGTERM", () => { owner.release(); process.exit(0); });
		} catch (error) { process.send({ error: error.message }); process.exitCode = 3; }
	`;
	const child = spawn(process.execPath, ["-e", source, JSON.stringify(profile)], { stdio: ["ignore", "pipe", "pipe", "ipc"] });
	context.after(async () => {
		if (child.exitCode === null && child.signalCode === null) {
			const exited = once(child, "exit");
			child.kill("SIGTERM");
			await exited;
		}
	});
	const [message] = await once(child, "message");
	return { child, ...message };
}

test("default and override resolution, exact conflicts, code roots, and legacy compatibility", context => {
	const { directory } = fixture(context);
	const defaults = resolveProfile({ env: {}, home: directory });
	assert.equal(defaults.root, path.join(directory, ".config/learnharness"));
	assert.equal(defaults.dataDir, path.join(defaults.root, "data"));
	assert.equal(defaults.authFile, path.join(defaults.root, "auth.json"));
	const env = { LH_PROFILE_DIR: path.join(directory, "override") };
	const profile = resolveProfile({ env });
	assert.equal(profile.managed, true);
	assert.equal(resolveProfile({ env: { ...env, LH_DATA_DIR: profile.dataDir, LH_AUTH_FILE: profile.authFile } }).root, profile.root);
	assert.throws(() => resolveProfile({ env: { ...env, LH_DATA_DIR: path.join(directory, "other") } }), /conflicts/);
	assert.throws(() => resolveProfile({ env: { ...env, LH_AUTH_FILE: path.join(directory, "other.json") } }), /conflicts/);
	assert.throws(() => resolveProfile({ env: { LH_PROFILE_DIR: "" } }), /empty/);
	assert.throws(() => resolveProfile({ env: { LH_PROFILE_DIR: path.join(os.userInfo().homedir, ".local/state") } }), /separate from the persistent ownership registry/);
	assert.throws(() => resolveProfile({ env: { LH_PROFILE_DIR: path.join(code, ".prove-it/managed-denied") } }), /outside application code/);
	const release = path.join(directory, "release");
	fs.mkdirSync(release);
	fs.writeFileSync(path.join(release, "package.json"), "{}");
	assert.throws(() => resolveProfile({ env: { LH_PROFILE_DIR: path.join(release, "profile") } }), /checkout, package or release/);
	const legacy = resolveProfile({ env: { LH_DATA_DIR: path.join(code, ".prove-it/synthetic/data"), LH_AUTH_FILE: path.join(code, ".prove-it/synthetic/auth.json") }, home: path.join(code, ".prove-it/synthetic/home") });
	assert.equal(legacy.managed, false);
	assert.equal(legacy.dataDir, path.join(code, ".prove-it/synthetic/data"));
	const nestedLegacy = resolveProfile({ env: { LH_DATA_DIR: directory, LH_AUTH_FILE: path.join(directory, "auth.json") }, home: directory });
	assert.equal(nestedLegacy.managed, false);
	assert.equal(nestedLegacy.authFile, path.join(directory, "auth.json"));
	const environment = { PATH: process.env.PATH, HOME: directory, LH_PROFILE_DIR: profile.root };
	const configured = JSON.parse(execFileSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", 'const { PATHS, AUTH_FILE } = await import("./config.ts"); console.log(JSON.stringify({ data: PATHS.data, auth: AUTH_FILE }));'], { cwd: code, env: environment, encoding: "utf8" }));
	assert.deepEqual(configured, { data: profile.dataDir, auth: profile.authFile });
	assert.equal(fs.existsSync(profile.root), false);
});

test("real processes exclude a second owner, including legacy shared-auth and overlapping roots", async context => {
	const { directory, profile } = fixture(context);
	const first = await childOwner(context, profile);
	assert.ok(first.record.lease);
	const second = await childOwner(context, profile);
	assert.match(second.error, /live writer/);
	const legacyOverlap = await childOwner(context, { managed: false, dataDir: path.join(directory, "other-data"), authFile: profile.authFile });
	assert.match(legacyOverlap.error, /live writer/);
	assert.throws(() => backupProfile(profile), /live writer/);
	first.child.send("release");
	assert.deepEqual((await once(first.child, "message"))[0], { released: true });
	const legacy = { managed: false, dataDir: path.join(directory, "data-one"), authFile: path.join(directory, "shared-auth.json") };
	const shared = await childOwner(context, legacy);
	assert.ok(shared.record);
	const conflict = await childOwner(context, { ...legacy, dataDir: path.join(directory, "data-two") });
	assert.match(conflict.error, /live writer/);
	const dataConflict = await childOwner(context, { ...legacy, authFile: path.join(directory, "other-auth.json") });
	assert.match(dataConflict.error, /live writer/);
});

test("legacy read-only configuration preserves alias paths while writer acquisition still refuses unsafe aliases", context => {
	const { directory } = fixture(context);
	const actual = path.join(directory, "actual");
	fs.mkdirSync(actual);
	const alias = path.join(directory, "alias");
	fs.symlinkSync(actual, alias);
	const environment = { LH_DATA_DIR: path.join(alias, "data"), LH_AUTH_FILE: path.join(alias, "auth.json") };
	const legacy = resolveProfile({ env: environment, home: directory });
	assert.equal(legacy.managed, false);
	assert.equal(legacy.dataDir, environment.LH_DATA_DIR);
	assert.equal(legacy.authFile, environment.LH_AUTH_FILE);
	assert.throws(() => acquireProfile(legacy), /Unsafe profile path/);
	assert.throws(() => resolveProfile({ env: { LH_PROFILE_DIR: alias } }), /Unsafe profile path/);
});

test("killed owners and stale PID-start identities reclaim safely; stale release cannot remove a replacement", async context => {
	const { profile } = fixture(context);
	const dead = await childOwner(context, profile);
	const exited = once(dead.child, "exit");
	dead.child.kill("SIGKILL");
	await exited;
	const reclaimed = acquireProfile(profile);
	assert.notEqual(reclaimed.record.lease, dead.record.lease);
	assert.equal(reclaimed.release(), true);
	const stale = await childOwner(context, profile);
	fs.writeFileSync(stale.filename, JSON.stringify({ ...stale.record, start: "0" }));
	const replacement = acquireProfile(profile);
	stale.child.send("release");
	assert.deepEqual((await once(stale.child, "message"))[0], { released: false });
	replacement.assertOwner();
	assert.equal(replacement.release(), true);
	assert.equal(replacement.release(), false);
});

test("incomplete ownership fails closed without removing its record", context => {
	const { profile } = fixture(context);
	const owner = acquireProfile(profile);
	fs.writeFileSync(owner.filename, "{");
	try { assert.throws(() => acquireProfile(profile), /Incomplete/); assert.equal(fs.readFileSync(owner.filename, "utf8"), "{"); }
	finally { fs.writeFileSync(owner.filename, JSON.stringify(owner.record)); owner.release(); }
});

test("admin ownership also excludes writers configured inside its backup inventory", async context => {
	const { profile } = fixture(context);
	const inventoryRoot = `${profile.root}.backups`;
	const owner = acquireProfile(profile, { additionalDirectories: [inventoryRoot] });
	try {
		const conflicting = await childOwner(context, resolveProfile({ env: { LH_PROFILE_DIR: inventoryRoot } }));
		assert.match(conflicting.error, /live writer/);
	} finally { owner.release(); }
});

test("migration copies only the selected repository, preserving originals and refusing merges", context => {
	const { directory, profile } = fixture(context);
	const repository = path.join(directory, "repository");
	fs.mkdirSync(path.join(repository, ".git"), { recursive: true });
	fs.mkdirSync(path.join(repository, "data/empty"), { recursive: true });
	fs.writeFileSync(path.join(repository, "data/learning.bin"), Buffer.from([0, 1, 2, 255]));
	fs.writeFileSync(path.join(repository, "auth.json"), '{"SYNTHETIC":"fixture-only"}');
	const desktop = path.join(directory, "desktop");
	fs.mkdirSync(desktop);
	fs.writeFileSync(path.join(desktop, "auth.json"), "desktop must remain separate");
	const before = treeIdentity(repository);
	const desktopBefore = treeIdentity(desktop);
	assert.throws(() => migrateRepository(desktop, profile), /not a desktop profile/);
	assert.equal(migrateRepository(repository, profile).migrated, true);
	assert.deepEqual(treeIdentity(repository), before);
	assert.deepEqual(treeIdentity(desktop), desktopBefore);
	assert.deepEqual(treeIdentity(profile.dataDir), treeIdentity(path.join(repository, "data")));
	assert.equal(fs.readFileSync(profile.authFile, "utf8"), fs.readFileSync(path.join(repository, "auth.json"), "utf8"));
	assert.equal(fs.statSync(profile.authFile).mode & 0o777, 0o600);
	assert.throws(() => migrateRepository(repository, profile), /already exists/);
	assert.deepEqual(treeIdentity(repository), before);
});

test("symlinks, hardlinks and special entries are refused, not followed or merged", context => {
	const { directory, profile, seed } = fixture(context);
	seed();
	const link = path.join(directory, "linked");
	fs.symlinkSync(profile.root, link);
	assert.throws(() => resolveProfile({ env: { LH_PROFILE_DIR: link } }), /Unsafe/);
	const nested = path.join(profile.root, "nested-link");
	fs.symlinkSync(profile.authFile, nested);
	assert.throws(() => backupProfile(profile), /Unsupported/);
	fs.unlinkSync(nested);
	fs.linkSync(profile.authFile, nested);
	assert.throws(() => backupProfile(profile), /Unsafe profile path/);
	fs.unlinkSync(nested);
	execFileSync("mkfifo", [nested]);
	assert.throws(() => backupProfile(profile), /Unsupported/);
	assert.equal(fs.existsSync(`${profile.root}.backups`), false);
});

test("one mixed latest-ten rotation and restoration of a copy that the pre-restore backup expires", context => {
	const { profile, seed } = fixture(context);
	const copies = [];
	for (let index = 0; index < 11; index++) {
		seed(`version-${index}`);
		copies.push(backupProfile(profile, { reason: index % 2 ? "pre-restore" : "update" }));
	}
	const inventory = listBackups(profile);
	assert.equal(inventory.length, 10);
	assert.deepEqual(inventory.map(copy => copy.id), copies.slice(1).map(copy => copy.id));
	seed("new-progress");
	const current = treeIdentity(profile.root);
	assert.throws(() => restoreProfile(profile, copies[1].id), /explicit local approval/);
	assert.deepEqual(treeIdentity(profile.root), current);
	assert.deepEqual(listBackups(profile), inventory);
	const result = restoreProfile(profile, copies[1].id, { approved: true });
	assert.equal(result.restored, copies[1].id);
	assert.equal(fs.readFileSync(path.join(profile.dataDir, "learning.json"), "utf8"), "version-1");
	assert.equal(fs.readFileSync(path.join(profile.root, "native-subscription.json"), "utf8"), '{"synthetic":true}');
	const after = listBackups(profile);
	assert.equal(after.length, 10);
	assert.ok(!after.some(copy => copy.id === copies[1].id));
	assert.equal(after.at(-1).reason, "pre-restore");
	assert.deepEqual(after.at(-1).entries, current);
	assert.equal(fs.readFileSync(path.join(`${profile.root}.backups`, result.preserved, "profile/data/learning.json"), "utf8"), "new-progress");
});

test("copy, verification and space failures never prune or change current bytes", context => {
	const { profile, seed } = fixture(context);
	seed();
	const chosen = backupProfile(profile);
	for (let index = 0; index < 9; index++) backupProfile(profile, { reason: index % 2 ? "update" : "pre-restore" });
	seed("valuable-new-progress");
	const current = treeIdentity(profile.root);
	const prior = treeIdentity(`${profile.root}.backups`);
	const failures = [
		{ copyTree(source, destination) { profileIO.copyTree(source, destination); throw new Error("injected partial copy failure"); } },
		{ verifyTree(root, expected) { profileIO.verifyTree(root, expected); if (root.includes(".pending-")) throw new Error("injected verification failure"); } },
		{ checkSpace() { throw new Error("injected insufficient space"); } },
		{ verifyTree(root, expected) { profileIO.verifyTree(root, expected); if (/backups\/000000000011-/.test(root)) throw new Error("injected committed verification failure"); } },
		{ restoreOnly: true, verifyTree(root, expected) { profileIO.verifyTree(root, expected); if (root.includes(".restore-")) throw new Error("injected selected-copy verification failure"); } },
	];
	for (const failure of failures) {
		const { restoreOnly, ...overrides } = failure;
		const io = { ...profileIO, ...overrides };
		if (!restoreOnly) assert.throws(() => backupProfile(profile, { io }), /injected/);
		assert.deepEqual(treeIdentity(profile.root), current);
		assert.deepEqual(treeIdentity(`${profile.root}.backups`), prior);
		assert.throws(() => restoreProfile(profile, chosen.id, { approved: true, io }), /injected/);
		assert.deepEqual(treeIdentity(profile.root), current);
		assert.deepEqual(treeIdentity(`${profile.root}.backups`), prior);
	}
});

test("real content corruption and late pre-restore verification preserve the exact inventory", context => {
	const { profile, seed } = fixture(context);
	seed("old");
	const chosen = backupProfile(profile);
	for (let index = 0; index < 9; index++) backupProfile(profile);
	seed("new");
	const before = treeIdentity(profile.root);
	const inventory = treeIdentity(`${profile.root}.backups`);
	assert.throws(() => backupProfile(profile, { io: { ...profileIO,
		copyTree(source, destination) { profileIO.copyTree(source, destination); fs.writeFileSync(path.join(destination, "data/learning.json"), "corrupt"); },
	} }), /verification failed/);
	assert.deepEqual(treeIdentity(profile.root), before);
	assert.deepEqual(treeIdentity(`${profile.root}.backups`), inventory);
	let currentVerifications = 0;
	assert.throws(() => restoreProfile(profile, chosen.id, { approved: true, io: { ...profileIO,
		verifyTree(root, expected) {
			profileIO.verifyTree(root, expected);
			if (root === profile.root && ++currentVerifications === 2) throw new Error("injected late pre-restore verification failure");
		},
	} }), /late pre-restore/);
	assert.deepEqual(treeIdentity(profile.root), before);
	assert.deepEqual(treeIdentity(`${profile.root}.backups`), inventory);
});

test("failed pruning retains verified copies and current data until successful rotation", context => {
	const { profile, seed } = fixture(context);
	const copies = [];
	for (let index = 0; index < 10; index++) {
		seed(`retained-${index}`);
		copies.push(backupProfile(profile, { reason: index % 2 ? "pre-restore" : "update" }));
	}
	seed("current-progress");
	const current = treeIdentity(profile.root);
	const removal = [];
	const io = { ...profileIO, removeTree(root) {
		removal.push(root);
		throw Object.assign(new Error("injected backup pruning denial"), { code: "EACCES" });
	} };
	assert.throws(() => backupProfile(profile, { io }), { code: "EACCES" });
	assert.deepEqual(treeIdentity(profile.root), current);
	assert.deepEqual(removal, [path.join(`${profile.root}.backups`, copies[0].id)]);
	const retained = listBackups(profile);
	assert.equal(retained.length, 11);
	assert.deepEqual(retained.slice(0, 10), copies);
	assert.deepEqual(retained.at(-1).entries, current);
	const completed = backupProfile(profile);
	const rotated = listBackups(profile);
	assert.equal(rotated.length, 10);
	assert.equal(rotated.at(-1).id, completed.id);
	assert.deepEqual(rotated.slice(0, 8).map(copy => copy.id), copies.slice(2).map(copy => copy.id));
});

test("restore pruning denial rolls back data and retains the verified pre-restore copy", context => {
	const { directory, profile, seed } = fixture(context);
	seed("selected");
	const selected = backupProfile(profile);
	for (let index = 0; index < 9; index++) backupProfile(profile);
	const original = listBackups(profile);
	seed("current-progress");
	const current = treeIdentity(profile.root);
	assert.throws(() => restoreProfile(profile, selected.id, { approved: true, io: { ...profileIO,
		removeTree() { throw Object.assign(new Error("injected restore pruning denial"), { code: "EACCES" }); },
	} }), { code: "EACCES" });
	assert.deepEqual(treeIdentity(profile.root), current);
	const retained = listBackups(profile);
	assert.equal(retained.length, 11);
	assert.deepEqual(retained.slice(0, 10), original);
	assert.equal(retained.at(-1).reason, "pre-restore");
	assert.deepEqual(retained.at(-1).entries, current);
	assert.equal(fs.readdirSync(directory).some(name => name.includes(".restore-")), false);
	const restored = restoreProfile(profile, selected.id, { approved: true });
	assert.equal(restored.restored, selected.id);
	assert.equal(fs.readFileSync(path.join(profile.dataDir, "learning.json"), "utf8"), "selected");
	assert.equal(listBackups(profile).length, 10);
});

test("public local CLI migrates, backs up, lists and explicitly restores only synthetic bytes", context => {
	const { directory, profile } = fixture(context);
	const repository = path.join(directory, "source");
	fs.mkdirSync(path.join(repository, ".git"), { recursive: true });
	fs.mkdirSync(path.join(repository, "data"));
	fs.writeFileSync(path.join(repository, "data/learning.json"), "CLI-original");
	fs.writeFileSync(path.join(repository, "auth.json"), '{"SYNTHETIC":"never-print-fixture-value"}');
	const environment = { PATH: process.env.PATH, HOME: directory, LH_PROFILE_DIR: profile.root };
	const cli = (...argumentsList) => execFileSync(process.execPath, ["scripts/local-deployment.mjs", ...argumentsList], { cwd: code, env: environment, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
	const source = treeIdentity(repository);
	assert.equal(JSON.parse(cli("migrate", "--source-repository", repository)).migrated, true);
	const output = cli("backup", "--reason", "update");
	assert.ok(!output.includes("never-print-fixture-value"));
	const copy = JSON.parse(output);
	assert.equal(JSON.parse(cli("backups")).length, 1);
	fs.writeFileSync(path.join(profile.dataDir, "learning.json"), "CLI-new-progress");
	const before = treeIdentity(profile.root);
	const inventory = treeIdentity(`${profile.root}.backups`);
	assert.throws(() => cli("restore", copy.id), /Command failed/);
	assert.deepEqual(treeIdentity(profile.root), before);
	assert.deepEqual(treeIdentity(`${profile.root}.backups`), inventory);
	assert.equal(JSON.parse(cli("restore", copy.id, "--approve-local-restore")).restored, copy.id);
	assert.equal(fs.readFileSync(path.join(profile.dataDir, "learning.json"), "utf8"), "CLI-original");
	assert.deepEqual(treeIdentity(repository), source);
});

test("kernel-atomic exchange failure leaves the current root intact; post-exchange failure rolls back", context => {
	const { profile, seed } = fixture(context);
	seed("old");
	const chosen = backupProfile(profile);
	seed("current");
	const current = treeIdentity(profile.root);
	const prior = treeIdentity(`${profile.root}.backups`);
	assert.throws(() => restoreProfile(profile, chosen.id, { approved: true, io: { ...profileIO, exchangeRoots() { throw new Error("injected exchange failure"); } } }), /injected/);
	assert.deepEqual(treeIdentity(profile.root), current);
	assert.deepEqual(treeIdentity(`${profile.root}.backups`), prior);
	let exchangeCalls = 0;
	assert.throws(() => restoreProfile(profile, chosen.id, { approved: true, io: { ...profileIO,
		exchangeRoots(left, right) { profileIO.exchangeRoots(left, right); if (++exchangeCalls === 1) throw new Error("injected lost exchange acknowledgement"); },
	} }), /lost exchange acknowledgement/);
	assert.deepEqual(treeIdentity(profile.root), current);
	assert.deepEqual(treeIdentity(`${profile.root}.backups`), prior);
	let exchanged = false;
	const io = { ...profileIO,
		exchangeRoots(left, right) { profileIO.exchangeRoots(left, right); exchanged = true; },
		verifyTree(root, expected) { profileIO.verifyTree(root, expected); if (exchanged && root === profile.root) throw new Error("injected post-exchange verification"); },
	};
	assert.throws(() => restoreProfile(profile, chosen.id, { approved: true, io }), /injected post-exchange/);
	assert.deepEqual(treeIdentity(profile.root), current);
	assert.deepEqual(treeIdentity(`${profile.root}.backups`), prior);
});

test("post-commit cleanup failure reports a completed restore and retained old root, not a false rollback", context => {
	const { profile, seed } = fixture(context);
	seed("selected");
	const chosen = backupProfile(profile);
	seed("current");
	const before = treeIdentity(profile.root);
	const result = restoreProfile(profile, chosen.id, { approved: true, io: { ...profileIO,
		removeTree() { throw Object.assign(new Error("injected staging cleanup failure"), { code: "EACCES" }); },
	} });
	assert.equal(result.restored, chosen.id);
	assert.equal(result.cleanupError, "EACCES");
	assert.deepEqual(treeIdentity(result.retainedRoot), before);
	assert.equal(fs.readFileSync(path.join(profile.dataDir, "learning.json"), "utf8"), "selected");
	assert.deepEqual(listBackups(profile).at(-1).entries, before);
});
