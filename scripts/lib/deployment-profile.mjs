import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { acquireProfile, containsPath, inspectPath, privateDirectory, resolveProfile } from "../../electron/deployment-profile.cjs";

const digest = contents => createHash("sha256").update(contents).digest("hex");
const exists = filename => fs.existsSync(filename);

export function treeIdentity(root) {
	inspectPath(root);
	const entries = [];
	function visit(relative) {
		const filename = path.join(root, relative);
		const information = fs.lstatSync(filename);
		if (information.isSymbolicLink() || (!information.isDirectory() && !information.isFile()) || information.nlink > 1 && information.isFile()) {
			throw new Error(`Unsupported profile entry: ${filename}`);
		}
		if (information.isDirectory()) {
			entries.push({ path: relative, type: "directory" });
			for (const name of fs.readdirSync(filename).sort()) visit(path.join(relative, name));
		} else {
			const descriptor = fs.openSync(filename, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
			const hash = createHash("sha256");
			const buffer = Buffer.alloc(64 * 1024);
			let bytes = 0;
			try {
				let count;
				while ((count = fs.readSync(descriptor, buffer, 0, buffer.length, null)) > 0) {
					hash.update(buffer.subarray(0, count));
					bytes += count;
				}
			} finally { fs.closeSync(descriptor); }
			entries.push({ path: relative, type: "file", bytes, sha256: hash.digest("hex") });
		}
	}
	visit("");
	return entries;
}

function verifyTree(root, expected) {
	if (JSON.stringify(treeIdentity(root)) !== JSON.stringify(expected)) throw new Error("Profile copy verification failed");
}

function syncDirectory(directory) {
	const descriptor = fs.openSync(directory, "r");
	try { fs.fsyncSync(descriptor); }
	finally { fs.closeSync(descriptor); }
}

function writePrivate(filename, contents) {
	const descriptor = fs.openSync(filename, "wx", 0o600);
	try { fs.writeFileSync(descriptor, contents); fs.fsyncSync(descriptor); }
	finally { fs.closeSync(descriptor); }
}

function copyTree(source, destination) {
	const entries = treeIdentity(source);
	for (const entry of entries) {
		const target = path.join(destination, entry.path);
		if (entry.type === "directory") fs.mkdirSync(target, { mode: 0o700 });
		else {
			fs.copyFileSync(path.join(source, entry.path), target, fs.constants.COPYFILE_EXCL);
			fs.chmodSync(target, 0o600);
			const descriptor = fs.openSync(target, "r");
			try { fs.fsyncSync(descriptor); }
			finally { fs.closeSync(descriptor); }
		}
	}
	for (const entry of [...entries].reverse()) if (entry.type === "directory") syncDirectory(path.join(destination, entry.path));
}

function checkSpace(destination, entries) {
	const information = fs.statfsSync(destination, { bigint: true });
	const required = entries.reduce((total, entry) => total + BigInt(entry.bytes || 0) + 8192n, 65536n);
	if (information.bavail * information.bsize < required) throw new Error("Insufficient space for a verified profile copy");
}

function exchangeRoots(current, staged) {
	execFileSync("mv", ["--exchange", "--no-copy", "--no-target-directory", "--", current, staged], { stdio: ["ignore", "pipe", "pipe"] });
}

function requireAtomicExchange() {
	const help = execFileSync("mv", ["--help"], { encoding: "utf8", env: { PATH: process.env.PATH, LC_ALL: "C" } });
	if (!help.includes("--exchange") || !help.includes("--no-copy")) throw new Error("Restore requires GNU mv with --exchange and --no-copy; no non-atomic fallback");
}

export const profileIO = Object.freeze({ copyTree, verifyTree, checkSpace, exchangeRoots, requireAtomicExchange, removeTree: root => fs.rmSync(root, { recursive: true }) });

function managed(profile) {
	if (!profile.managed) throw new Error("Profile administration requires one managed LH_PROFILE_DIR, not legacy split paths");
	const resolved = resolveProfile({ env: { LH_PROFILE_DIR: profile.root } });
	if (resolved.dataDir !== profile.dataDir || resolved.authFile !== profile.authFile) throw new Error("Invalid managed profile layout");
	return resolved;
}

function backupRoot(profile) {
	return `${profile.root}.backups`;
}

function profileId(profile) {
	return digest(profile.root);
}

function verifiedInventory(profile, io) {
	const directory = backupRoot(profile);
	inspectPath(directory);
	if (!exists(directory)) return [];
	privateDirectory(directory);
	const inventory = [];
	for (const id of fs.readdirSync(directory).sort()) {
		if (!/^\d{12}-[-a-f0-9]{36}$/.test(id)) throw new Error("Unknown entry in backup inventory");
		const location = path.join(directory, id);
		privateDirectory(location);
		if (JSON.stringify(fs.readdirSync(location).sort()) !== JSON.stringify(["manifest.json", "profile"])) throw new Error("Unexpected backup contents");
		const manifestFile = path.join(location, "manifest.json");
		inspectPath(manifestFile);
		const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
		if (manifest.schemaVersion !== 1 || manifest.profileId !== profileId(profile) || manifest.id !== id ||
			!Number.isSafeInteger(manifest.sequence) || manifest.sequence < 1 || String(manifest.sequence).padStart(12, "0") !== id.slice(0, 12) ||
			!["update", "pre-restore"].includes(manifest.reason) || !Array.isArray(manifest.entries) || manifest.identity !== digest(JSON.stringify(manifest.entries))) {
			throw new Error("Backup identity verification failed");
		}
		io.verifyTree(path.join(location, "profile"), manifest.entries);
		for (const entry of ["manifest.json", ...manifest.entries.map(entry => path.join("profile", entry.path))]) {
			const information = fs.lstatSync(path.join(location, entry));
			if (information.uid !== process.getuid() || (information.mode & 0o777) !== (information.isDirectory() ? 0o700 : 0o600)) throw new Error("Backup contents must remain private");
		}
		inventory.push(manifest);
	}
	return inventory.sort((left, right) => left.sequence - right.sequence);
}

function withOwner(profile, operation) {
	const resolved = managed(profile);
	const owner = acquireProfile(resolved, { additionalDirectories: [backupRoot(resolved)] });
	try { owner.assertOwner(); return operation(resolved, owner); }
	finally { owner.release(); }
}

function rotateBackups(profile, inventory) {
	for (const expired of inventory.slice(0, -10)) fs.rmSync(path.join(backupRoot(profile), expired.id), { recursive: true });
	syncDirectory(backupRoot(profile));
}

function createBackup(profile, owner, reason, io, rotate = true) {
	if (!["update", "pre-restore"].includes(reason)) throw new Error("Unknown backup reason");
	owner.assertOwner();
	privateDirectory(profile.root);
	const inventory = verifiedInventory(profile, io);
	const entries = treeIdentity(profile.root);
	const parent = path.dirname(profile.root);
	io.checkSpace(parent, entries);
	const sequence = (inventory.at(-1)?.sequence || 0) + 1;
	if (sequence > 999999999999) throw new Error("Backup sequence exhausted");
	const id = `${String(sequence).padStart(12, "0")}-${randomUUID()}`;
	const manifest = { schemaVersion: 1, id, sequence, profileId: profileId(profile), reason, createdAt: new Date().toISOString(), entries, identity: digest(JSON.stringify(entries)) };
	const pending = `${backupRoot(profile)}.pending-${randomUUID()}`;
	const destination = path.join(backupRoot(profile), id);
	let committed = false;
	let pruning = false;
	privateDirectory(pending);
	try {
		io.copyTree(profile.root, path.join(pending, "profile"));
		io.verifyTree(path.join(pending, "profile"), entries);
		io.verifyTree(profile.root, entries);
		writePrivate(path.join(pending, "manifest.json"), JSON.stringify(manifest));
		syncDirectory(pending);
		owner.assertOwner();
		privateDirectory(backupRoot(profile));
		fs.renameSync(pending, destination);
		committed = true;
		syncDirectory(backupRoot(profile));
		const complete = verifiedInventory(profile, io);
		if (rotate) {
			pruning = true;
			rotateBackups(profile, complete);
		}
		return manifest;
	} catch (error) {
		if (committed && !pruning) fs.rmSync(destination, { recursive: true });
		throw error;
	} finally { if (exists(pending)) fs.rmSync(pending, { recursive: true }); }
}

export function backupProfile(profile, { reason = "update", io = profileIO } = {}) {
	return withOwner(profile, (resolved, owner) => createBackup(resolved, owner, reason, io));
}

export function listBackups(profile, { io = profileIO } = {}) {
	return withOwner(profile, resolved => verifiedInventory(resolved, io));
}

export function restoreProfile(profile, id, { approved = false, io = profileIO } = {}) {
	if (approved !== true) throw new Error("Restore requires explicit local approval (--approve-local-restore)");
	return withOwner(profile, (resolved, owner) => {
		io.requireAtomicExchange();
		privateDirectory(resolved.root);
		const inventory = verifiedInventory(resolved, io);
		const chosen = inventory.find(backup => backup.id === id);
		if (!chosen) throw new Error("Unknown restore copy");
		const parent = path.dirname(resolved.root);
		io.checkSpace(parent, chosen.entries);
		const staged = `${resolved.root}.restore-${randomUUID()}`;
		let exchanged = false;
		let exchangeAttempted = false;
		let preserve = false;
		let before;
		let pruning = false;
		let result;
		try {
			io.copyTree(path.join(backupRoot(resolved), id, "profile"), staged);
			io.verifyTree(staged, chosen.entries);
			before = createBackup(resolved, owner, "pre-restore", io, false);
			owner.assertOwner();
			io.verifyTree(resolved.root, before.entries);
			io.verifyTree(staged, chosen.entries);
			exchangeAttempted = true;
			io.exchangeRoots(resolved.root, staged);
			exchanged = true;
			io.verifyTree(resolved.root, chosen.entries);
			syncDirectory(parent);
			const complete = verifiedInventory(resolved, io);
			pruning = true;
			rotateBackups(resolved, complete);
			result = { restored: id, preserved: before.id };
		} catch (error) {
			if (exchangeAttempted && !exchanged) {
				try {
					const currentIdentity = JSON.stringify(treeIdentity(resolved.root));
					const stagedIdentity = JSON.stringify(treeIdentity(staged));
					const previousIdentity = JSON.stringify(before.entries);
					const selectedIdentity = JSON.stringify(chosen.entries);
					if (currentIdentity === selectedIdentity && stagedIdentity === previousIdentity) exchanged = true;
					else if (currentIdentity !== previousIdentity || stagedIdentity !== selectedIdentity) throw new Error("Ambiguous atomic exchange outcome");
				} catch {
					preserve = true;
					throw new Error(`Atomic exchange outcome is ambiguous; both roots and the current-profile backup are preserved: ${resolved.root}, ${staged}`, { cause: error });
				}
			}
			if (exchanged) {
				try { io.exchangeRoots(resolved.root, staged); syncDirectory(parent); }
				catch { preserve = true; throw new Error(`Restore rollback could not complete; both roots preserved at ${resolved.root} and ${staged}`, { cause: error }); }
			}
			if (before && !pruning) {
				fs.rmSync(path.join(backupRoot(resolved), before.id), { recursive: true });
				syncDirectory(backupRoot(resolved));
			}
			throw error;
		} finally { if (!result && !preserve && exists(staged)) fs.rmSync(staged, { recursive: true }); }
		try { io.removeTree(staged); }
		catch (error) { return { ...result, retainedRoot: staged, cleanupError: error.code || "cleanup-failed" }; }
		return result;
	});
}

export function migrateRepository(source, profile, { io = profileIO } = {}) {
	const repository = inspectPath(source);
	const marker = path.join(repository, ".git");
	inspectPath(marker);
	if (!exists(marker)) throw new Error("Migration requires an explicitly selected repository, not a desktop profile");
	const dataDir = inspectPath(path.join(repository, "data"));
	const authFile = inspectPath(path.join(repository, "auth.json"));
	if (!fs.lstatSync(dataDir).isDirectory() || !fs.lstatSync(authFile).isFile()) throw new Error("Repository migration requires data/ and auth.json");
	const sourceOwner = acquireProfile({ managed: false, dataDir, authFile });
	try {
		return withOwner(profile, (resolved, owner) => {
			if (containsPath(repository, resolved.root) || containsPath(resolved.root, repository)) throw new Error("Migration source and destination must be separate");
			if (exists(resolved.root)) throw new Error("Migration target already exists; refusing to merge");
			const dataIdentity = treeIdentity(dataDir);
			const authIdentity = treeIdentity(authFile);
			inspectPath(path.dirname(resolved.root));
			fs.mkdirSync(path.dirname(resolved.root), { recursive: true, mode: 0o700 });
			io.checkSpace(path.dirname(resolved.root), [...dataIdentity, ...authIdentity]);
			const staged = `${resolved.root}.migration-${randomUUID()}`;
			privateDirectory(staged);
			try {
				io.copyTree(dataDir, path.join(staged, "data"));
				writePrivate(path.join(staged, "auth.json"), fs.readFileSync(authFile));
				io.verifyTree(path.join(staged, "data"), dataIdentity);
				io.verifyTree(path.join(staged, "auth.json"), authIdentity);
				io.verifyTree(dataDir, dataIdentity);
				io.verifyTree(authFile, authIdentity);
				sourceOwner.assertOwner();
				owner.assertOwner();
				if (exists(resolved.root)) throw new Error("Migration target appeared; refusing to replace");
				syncDirectory(staged);
				fs.renameSync(staged, resolved.root);
				syncDirectory(path.dirname(resolved.root));
				return { migrated: true, profile: resolved.root };
			} finally { if (exists(staged)) fs.rmSync(staged, { recursive: true }); }
		});
	} finally { sourceOwner.release(); }
}
