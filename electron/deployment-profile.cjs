const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { createHash, randomUUID } = require("node:crypto");

function inspectPath(filename) {
	const absolute = path.resolve(filename);
	let current = path.parse(absolute).root;
	for (const component of absolute.slice(current.length).split(path.sep).filter(Boolean)) {
		current = path.join(current, component);
		let information;
		try { information = fs.lstatSync(current); }
		catch (error) { if (error.code === "ENOENT") continue; throw error; }
		if (information.isSymbolicLink() || (!information.isDirectory() && !information.isFile()) || information.isFile() && information.nlink !== 1) {
			throw new Error(`Unsafe profile path: ${current}`);
		}
	}
	return absolute;
}

function containsPath(parent, child) {
	const relative = path.relative(parent, child);
	return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

function registryPath() {
	return path.join(os.userInfo().homedir, ".local", "state", "learnharness-profile-writers");
}

function separateFromRegistry(resource) {
	const registry = registryPath();
	if (containsPath(registry, resource.path) || resource.directory && containsPath(resource.path, registry)) {
		throw new Error("Profile write roots must be separate from the persistent ownership registry");
	}
}

function managedRoot(filename, codeRoot) {
	const root = inspectPath(filename);
	separateFromRegistry({ path: root, directory: true });
	const code = inspectPath(codeRoot);
	if (containsPath(code, root) || containsPath(root, code)) throw new Error("Managed profile must be outside application code");
	for (let ancestor = root; ; ancestor = path.dirname(ancestor)) {
		if (ancestor.endsWith(".asar") || fs.existsSync(path.join(ancestor, ".git")) || fs.existsSync(path.join(ancestor, "package.json"))) {
			throw new Error("Managed profile must not be inside a checkout, package or release");
		}
		if (path.dirname(ancestor) === ancestor) break;
	}
	return root;
}

const PROFILE_VARIABLES = ["LH_PROFILE_DIR", "LH_DATA_DIR", "LH_AUTH_FILE"];

// A test process that names no profile must never fall through to the owner's
// real one (~/.config/learnharness, formerly the checkout's ./data): test
// fixtures leaked there as visible sessions. Give it a private throwaway
// profile instead, exported so child processes and later resolves agree.
// Callers passing an explicit `env` (default-path tests) are unaffected.
function isolateTestProcess() {
	const environment = process.env;
	if (environment.NODE_ENV !== "test" && !environment.NODE_TEST_CONTEXT) return;
	if (PROFILE_VARIABLES.some(name => environment[name] !== undefined)) return;
	const throwaway = fs.mkdtempSync(path.join(os.tmpdir(), "lh-test-profile-"));
	environment.LH_PROFILE_DIR = throwaway;
	process.once("exit", () => {
		try { fs.rmSync(throwaway, { recursive: true, force: true }); } catch { /* best-effort temp cleanup */ }
	});
}

function resolveProfile(options = {}) {
	if (!options.env) isolateTestProcess();
	const environment = options.env || process.env;
	const codeRoot = options.codeRoot || path.resolve(__dirname, "..");
	const home = options.home || os.homedir();
	const linux = (options.platform || process.platform) === "linux";
	for (const name of ["LH_PROFILE_DIR", "LH_DATA_DIR", "LH_AUTH_FILE"]) {
		if (environment[name] !== undefined && !environment[name].trim()) throw new Error(`${name} must not be empty`);
	}
	const managed = environment.LH_PROFILE_DIR !== undefined || (linux && !environment.LH_DATA_DIR && !environment.LH_AUTH_FILE);
	const requested = environment.LH_PROFILE_DIR || path.join(home, ".config", "learnharness");
	const root = managed ? managedRoot(requested, codeRoot) : path.resolve(requested);
	const resolveLocation = managed ? inspectPath : filename => path.resolve(filename);
	const dataDir = resolveLocation(environment.LH_DATA_DIR || path.join(managed || linux ? root : codeRoot, "data"));
	const authFile = resolveLocation(environment.LH_AUTH_FILE || path.join(managed || linux ? root : codeRoot, "auth.json"));
	if (environment.LH_PROFILE_DIR !== undefined && (dataDir !== path.join(root, "data") || authFile !== path.join(root, "auth.json"))) {
		throw new Error("LH_PROFILE_DIR conflicts with LH_DATA_DIR or LH_AUTH_FILE");
	}
	return Object.freeze({ root, dataDir, authFile, managed });
}

function resourcesFor(profile) {
	return profile.managed
		? [{ path: inspectPath(profile.root), directory: true }]
		: [{ path: inspectPath(profile.dataDir), directory: true }, { path: inspectPath(profile.authFile), directory: false }];
}

function processIdentity(pid = process.pid) {
	if (process.platform !== "linux") throw new Error("Profile ownership requires Linux process-start identity");
	let status;
	try { status = fs.readFileSync(`/proc/${pid}/stat`, "utf8"); }
	catch (error) { if (error.code === "ENOENT" || error.code === "ESRCH") return null; throw error; }
	const fields = status.slice(status.lastIndexOf(")") + 2).split(" ");
	const start = fields[19];
	if (!start || !/^\d+$/.test(start)) throw new Error("Ambiguous process start identity");
	return { pid, start, boot: fs.readFileSync("/proc/sys/kernel/random/boot_id", "utf8").trim() };
}

function privateDirectory(directory) {
	inspectPath(directory);
	fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
	const information = fs.lstatSync(directory);
	if (!information.isDirectory() || information.uid !== process.getuid() || (information.mode & 0o777) !== 0o700) {
		throw new Error(`Directory must be private and owned by this user: ${directory}`);
	}
}

function validateProfileTree(filename) {
	inspectPath(filename);
	const information = fs.lstatSync(filename);
	if (information.uid !== process.getuid() || information.isFile() && information.nlink !== 1) {
		throw new Error(`Managed profile entries must be owned, unlinked files or directories: ${filename}`);
	}
	if (information.isDirectory()) for (const name of fs.readdirSync(filename)) validateProfileTree(path.join(filename, name));
}

function registryRoot() {
	if (process.platform !== "linux") throw new Error("Profile ownership requires Linux");
	const directory = registryPath();
	privateDirectory(directory);
	return directory;
}

function withRegistry(operation) {
	const directory = registryRoot();
	const guard = path.join(directory, ".guard");
	try { fs.mkdirSync(guard, { mode: 0o700 }); }
	catch (error) {
		if (error.code === "EEXIST") throw new Error("Profile ownership registry is busy or incomplete; refusing ambiguous ownership");
		throw error;
	}
	try { return operation(directory); }
	finally { fs.rmdirSync(guard); }
}

function readOwner(filename) {
	const information = fs.lstatSync(filename);
	if (!information.isFile() || information.uid !== process.getuid() || (information.mode & 0o777) !== 0o600 || information.nlink !== 1) {
		throw new Error("Unsafe profile ownership record");
	}
	let owner;
	try { owner = JSON.parse(fs.readFileSync(filename, "utf8")); }
	catch { throw new Error("Incomplete profile ownership record; refusing to reclaim"); }
	if (owner.schemaVersion !== 1 || !Number.isSafeInteger(owner.pid) || owner.pid <= 0 || !/^\d+$/.test(owner.start) ||
		!/^[-a-f0-9]{36}$/.test(owner.boot) || !/^[-a-f0-9]{36}$/.test(owner.lease) || !Array.isArray(owner.resources) || !owner.resources.length ||
		owner.resources.some(resource => typeof resource.directory !== "boolean" || typeof resource.path !== "string" || !path.isAbsolute(resource.path) || path.resolve(resource.path) !== resource.path)) {
		throw new Error("Incomplete profile ownership identity; refusing to reclaim");
	}
	return owner;
}

function sameOwner(left, right) {
	return left.lease === right.lease && left.pid === right.pid && left.start === right.start && left.boot === right.boot &&
		JSON.stringify(left.resources) === JSON.stringify(right.resources);
}

function overlaps(left, right) {
	return left.path === right.path || (left.directory && containsPath(left.path, right.path)) || (right.directory && containsPath(right.path, left.path));
}

function acquireResources(profile, resources) {
	for (const resource of resources) separateFromRegistry(resource);
	const identity = processIdentity();
	if (!identity) throw new Error("Cannot establish owner process identity");
	const record = { schemaVersion: 1, ...identity, lease: randomUUID(), resources };
	const filename = withRegistry(directory => {
		for (const entry of fs.readdirSync(directory).filter(entry => entry !== ".guard")) {
			if (!/^[a-f0-9]{64}\.json$/.test(entry)) throw new Error("Ambiguous profile registry entry");
			const candidate = path.join(directory, entry);
			const owner = readOwner(candidate);
			const live = processIdentity(owner.pid);
			if (live && live.start === owner.start && live.boot === owner.boot) {
				if (resources.some(resource => owner.resources.some(other => overlaps(resource, other)))) {
					const error = new Error("Profile already has a live writer");
					error.code = "LH_PROFILE_WRITER_CONFLICT";
					error.resources = owner.resources;
					throw error;
				}
			} else {
				fs.unlinkSync(candidate);
			}
		}
		const destination = path.join(directory, `${createHash("sha256").update(JSON.stringify(resources)).digest("hex")}.json`);
		fs.writeFileSync(destination, JSON.stringify(record), { flag: "wx", mode: 0o600 });
		return destination;
	});
	return Object.freeze({
		profile, filename, record,
		assertOwner() {
			const current = processIdentity();
			if (!current || current.pid !== record.pid || current.start !== record.start || current.boot !== record.boot || !sameOwner(readOwner(filename), record)) {
				throw new Error("Profile writer lease no longer matches");
			}
		},
		release() {
			return withRegistry(() => {
				if (!fs.existsSync(filename)) return false;
				if (!sameOwner(readOwner(filename), record)) return false;
				fs.unlinkSync(filename);
				return true;
			});
		},
	});
}

function credentialFiles(directory) {
	return ["chatgpt", "github-copilot", "xai"].map(provider => path.join(directory, `${provider}-credentials.json`));
}

function acquireProfile(profile, { additionalDirectories = [], additionalFiles = [] } = {}) {
	return acquireResources(profile, [...resourcesFor(profile), ...additionalDirectories.map(directory => ({ path: inspectPath(directory), directory: true })), ...additionalFiles.map(filename => ({ path: inspectPath(filename), directory: false }))]);
}

function acquireCredentialFiles(directory) {
	const root = inspectPath(directory);
	return acquireResources({ root, nativeOnly: true }, credentialFiles(root).map(filename => ({ path: inspectPath(filename), directory: false })));
}

function isCredentialConflict(error, directory) {
	const resources = credentialFiles(inspectPath(directory)).map(filename => ({ path: inspectPath(filename), directory: false }));
	return error?.code === "LH_PROFILE_WRITER_CONFLICT" && JSON.stringify(error.resources) === JSON.stringify(resources);
}

function ownServerProfile(profile) {
	if (process.platform !== "linux") {
		if (profile.managed) throw new Error("Managed local deployment currently requires Linux");
		return null;
	}
	const key = Symbol.for("learnharness.profile-owner.v1");
	const existing = globalThis[key];
	if (existing) {
		existing.assertOwner();
		if (JSON.stringify(resourcesFor(existing.profile)) !== JSON.stringify(resourcesFor(profile))) throw new Error("Server profile changed after startup");
		return existing;
	}
	const privateDesktop = process.env.LH_DESKTOP_SERVER === "1" || Boolean(process.env.LH_DESKTOP_API_SECRET);
	const owner = acquireProfile(profile, { additionalFiles: !profile.managed && !privateDesktop ? credentialFiles(path.dirname(profile.authFile)) : [] });
	try {
		if (profile.managed) {
			process.umask(0o077);
			privateDirectory(profile.root);
			privateDirectory(profile.dataDir);
			validateProfileTree(profile.root);
		}
	} catch (error) { owner.release(); throw error; }
	globalThis[key] = owner;
	process.once("exit", () => {
		try { owner.release(); }
		catch { process.stderr.write("Profile ownership release failed; next startup must inspect ownership.\n"); }
	});
	return owner;
}

module.exports = { resolveProfile, acquireProfile, acquireCredentialFiles, credentialFiles, isCredentialConflict, ownServerProfile, processIdentity, inspectPath, containsPath, privateDirectory };
