import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { containsPath, inspectPath, privateDirectory } from "../../electron/deployment-profile.cjs";
import { alive, delay, git, locked, ownerOf, slug, writeState } from "./ticket-state.mjs";

const execute = promisify(execFile);
const boot = () => fs.readFileSync("/proc/sys/kernel/random/boot_id", "utf8").trim();
const digest = value => createHash("sha256").update(value).digest("hex").slice(0, 24);

function readPrivate(filename) {
	inspectPath(filename);
	const descriptor = fs.openSync(filename, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
	try {
		const metadata = fs.fstatSync(descriptor);
		assert.ok(metadata.isFile() && metadata.uid === process.getuid() && metadata.nlink === 1 && (metadata.mode & 0o077) === 0, "Enrollment credentials and records require a private owned file");
		return fs.readFileSync(descriptor, "utf8");
	} finally { fs.closeSync(descriptor); }
}

function writePrivate(filename, contents) {
	inspectPath(filename);
	if (fs.existsSync(filename)) readPrivate(filename);
	const temporary = `${filename}.${randomUUID()}.tmp`;
	try {
		const descriptor = fs.openSync(temporary, "wx", 0o600);
		try { fs.writeFileSync(descriptor, contents); fs.fsyncSync(descriptor); }
		finally { fs.closeSync(descriptor); }
		fs.renameSync(temporary, filename);
	} finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
}

async function runTailscale(argumentsList) {
	const socketPath = argumentsList[0].slice("--socket=".length);
	const { stdout } = await execute("/usr/bin/tailscale", argumentsList, {
		timeout: 45_000, maxBuffer: 1024 * 1024, encoding: "utf8",
		env: { PATH: "/usr/bin:/bin", LANG: "C.UTF-8", HOME: path.dirname(socketPath) },
	});
	return argumentsList.includes("--json") ? JSON.parse(stdout) : stdout;
}

async function launchDaemon(record) {
	const logfile = path.join(record.stateDirectory, "daemon.log");
	inspectPath(logfile);
	if (fs.existsSync(logfile)) readPrivate(logfile);
	const descriptor = fs.openSync(logfile, fs.constants.O_WRONLY | fs.constants.O_APPEND | fs.constants.O_CREAT | fs.constants.O_NOFOLLOW, 0o600);
	const token = randomUUID();
	try {
		const child = spawn("/usr/bin/tailscaled", ["--tun=userspace-networking", `--state=${record.stateFile}`, `--statedir=${record.stateDirectory}`, `--socket=${record.socketPath}`, "--port=0", "--syspolicy-file=", "--encrypt-state=false", "--no-logs-no-support"], {
			detached: true, stdio: ["ignore", descriptor, descriptor],
			env: { PATH: "/usr/bin:/bin", LANG: "C.UTF-8", HOME: record.stateDirectory, LH_PREVIEW_PROCESS_TOKEN: token },
		});
		await new Promise((resolve, reject) => { child.once("spawn", resolve); child.once("error", reject); });
		child.unref();
		const owner = { ...ownerOf(child.pid), token, boot: boot() };
		assert.ok(owner.identity, "Dedicated enrollment daemon exited during startup");
		return owner;
	} finally { fs.closeSync(descriptor); }
}

async function removeStaleSocket(record) {
	if (!fs.existsSync(record.socketPath)) return;
	const metadata = fs.lstatSync(record.socketPath);
	assert.ok(record.owner && metadata.isSocket() && metadata.uid === process.getuid(), "Unowned enrollment socket must not be replaced");
	const connected = await new Promise((resolve, reject) => {
		const client = net.connect(record.socketPath);
		client.setTimeout(2000, () => { client.destroy(); reject(new Error("Unknown enrollment socket is unresponsive; preserved")); });
		client.once("connect", () => { client.destroy(); resolve(true); });
		client.once("error", error => { client.destroy(); if (["ECONNREFUSED", "ENOENT"].includes(error.code)) resolve(false); else reject(error); });
	});
	assert.equal(connected, false, "An unowned listener occupies the enrollment socket; preserved");
	assert.equal(fs.lstatSync(record.socketPath).ino, metadata.ino, "Enrollment socket changed during recovery");
	fs.unlinkSync(record.socketPath);
}

export function createPreviewEnrollment(directory, { run = runTailscale, launch = launchDaemon, isAlive = owner => owner?.boot === boot() && alive(owner), runtimeRoot = path.join(os.homedir(), ".local/state/lh-pv"), protectedRoots = [] } = {}) {
	const registry = inspectPath(directory);
	const storage = path.join(registry, "preview-enrollment");
	const configurationFile = path.join(storage, "configuration.json");
	const credentialFile = path.join(storage, "credential");
	const runtime = path.join(inspectPath(runtimeRoot), digest(registry));
	for (const root of protectedRoots) {
		assert.ok(!containsPath(root, storage) && !containsPath(storage, root), "Enrollment credentials must stay outside preview profiles and source trees");
		assert.ok(!containsPath(root, runtime) && !containsPath(runtime, root), "Enrollment sockets must stay outside preview profiles and source trees");
	}
	const configuration = () => {
		assert.ok(fs.existsSync(configurationFile), "Configure unattended preview enrollment with ticket configure-enrollment first");
		privateDirectory(storage);
		const value = JSON.parse(readPrivate(configurationFile));
		assert.equal(value.schemaVersion, 1, "Unknown enrollment configuration");
		assert.equal(value.registry, registry, "Enrollment configuration belongs to another registry");
		assert.match(value.tag ?? "", /^tag:[a-z][a-z0-9-]{0,62}$/, "Configure one dedicated preview tag");
		return value;
	};
	return {
		configure(secretFile, tag) {
			assert.match(tag ?? "", /^tag:[a-z][a-z0-9-]{0,62}$/, "Configure one dedicated preview tag");
			const input = inspectPath(path.resolve(secretFile));
			assert.ok(protectedRoots.every(root => !containsPath(root, input)), "Enrollment input must stay outside preview source and profile trees; original file preserved");
			const secret = readPrivate(input).trim();
			assert.ok(/^tskey-client-[A-Za-z0-9_-]{12,500}$/.test(secret), "Expected a Tailscale OAuth client secret; value withheld");
			privateDirectory(storage);
			if (fs.existsSync(configurationFile)) assert.equal(configuration().tag, tag, "Cannot silently change the established preview tag");
			else assert.equal(fs.readdirSync(storage).length, 0, "Unrecognized or partial enrollment configuration; preserving its contents");
			writePrivate(credentialFile, `${secret}?ephemeral=false&preauthorized=true`);
			const value = { schemaVersion: 1, registry, tag };
			writePrivate(configurationFile, JSON.stringify(value) + "\n");
			return { configured: true, tag, unattended: true };
		},
		async ensure(source, { normalHostname, existingHostnames = [], binding = null } = {}) {
			slug(source);
			assert.match(normalHostname ?? "", /^[a-z0-9-]+\.[a-z0-9-]+\.ts\.net$/, "Configure the private review host before enrollment");
			const configured = configuration();
			const stateDirectory = path.join(storage, "nodes", source);
			privateDirectory(stateDirectory);
			const recordFile = path.join(stateDirectory, "registry.json");
			inspectPath(recordFile);
			if (fs.existsSync(recordFile)) readPrivate(recordFile);
			const runtimeDirectory = path.join(runtime, digest(source));
			const socketPath = path.join(runtimeDirectory, "ts.sock");
			assert.ok(Buffer.byteLength(socketPath) < 104, "Enrollment socket path is too long");
			const hostname = `lh-pv-${digest(registry + "\0" + source)}`;
			const stateFile = path.join(stateDirectory, "tailscaled.state");
			return locked(stateDirectory, async existing => {
				let record = existing;
				if (!record) {
					assert.ok(!binding, "Pinned enrollment record is missing; refusing identity replacement");
					assert.deepEqual(fs.readdirSync(stateDirectory), ["registry.lock"], "Unrecognized enrollment directory; preserving its contents");
					privateDirectory(runtimeDirectory);
					assert.equal(fs.readdirSync(runtimeDirectory).length, 0, "Unrecognized enrollment runtime directory; preserving its contents");
					record = { schemaVersion: 1, registry, source, hostname, stateDirectory, stateFile, socketPath, owner: null, pinned: null };
					writeState(stateDirectory, record);
				}
				assert.deepEqual([record.schemaVersion, record.registry, record.source, record.hostname, record.stateDirectory, record.stateFile, record.socketPath], [1, registry, source, hostname, stateDirectory, stateFile, socketPath], "Enrollment record identity changed; refusing adoption");
				privateDirectory(runtimeDirectory);
				if (binding) {
					assert.equal(binding.managedEnrollment, true, "Manual preview nodes cannot be adopted by enrollment");
					assert.equal(binding.socketPath, socketPath, "Pinned enrollment socket changed");
					assert.deepEqual(record.pinned, { hostname: binding.hostname, nodeId: binding.nodeId }, "Pinned enrollment identity changed");
				}
				if (record.pinned) {
					assert.ok(fs.existsSync(stateFile), "Pinned persistent node state is missing; refusing identity replacement");
					readPrivate(stateFile);
				}
				if (!isAlive(record.owner)) {
					await removeStaleSocket(record);
					record.owner = await launch(record);
					writeState(stateDirectory, record);
				}
				const deadline = Date.now() + 15_000;
				while (!fs.existsSync(socketPath)) {
					assert.ok(isAlive(record.owner) && Date.now() < deadline, "Dedicated preview daemon did not create its socket");
					await delay(100);
				}
				assert.ok(fs.lstatSync(socketPath).isSocket() && fs.lstatSync(socketPath).uid === process.getuid(), "Enrollment daemon socket must be private and owned");
				const call = (...argumentsList) => run([`--socket=${socketPath}`, ...argumentsList]);
				let node = await call("status", "--json");
				if (record.pinned) {
					const onlineDeadline = Date.now() + 30_000;
					while ((node.BackendState !== "Running" || node.Self?.Online !== true) && !["NeedsLogin", "NeedsMachineAuth"].includes(node.BackendState)) {
						assert.ok(isAlive(record.owner) && Date.now() < onlineDeadline, "Pinned preview node did not reconnect; no re-enrollment attempted");
						await delay(100);
						node = await call("status", "--json");
					}
				}
				if (node.BackendState !== "Running" || node.Self?.Online !== true) {
					assert.ok(!record.pinned, "Pinned preview node is not authorized/online; refusing silent re-enrollment");
					readPrivate(credentialFile);
					try {
						await call("up", `--hostname=${hostname}`, "--accept-dns=false", "--accept-routes=false", "--ssh=false", `--advertise-tags=${configured.tag}`, `--auth-key=file:${credentialFile}`, "--timeout=30s");
						node = await call("status", "--json");
					} catch { throw new Error("Unattended preview enrollment failed; inspect the credential, tag and device-approval policy locally. No interactive login was started."); }
				}
				assert.ok(node.BackendState === "Running" && node.Self?.Online === true, "Automatic preview registration did not become online");
				const observed = { hostname: node.Self.DNSName?.replace(/\.$/, ""), nodeId: node.Self.ID };
				assert.equal(observed.hostname, `${hostname}.${normalHostname.split(".").slice(1).join(".")}`, "Automatic preview hostname does not match its source and private tailnet");
				assert.ok(typeof observed.nodeId === "string" && observed.nodeId.length, "Automatic preview node has no stable identity");
				assert.notEqual(observed.hostname, normalHostname, "Normal and preview hostnames must be separate");
				assert.ok(!existingHostnames.includes(observed.hostname), "Another source already owns this hostname");
				if (record.pinned) assert.deepEqual(observed, record.pinned, "Dedicated preview node identity changed; refusing replacement");
				else {
					assert.deepEqual(await call("serve", "status", "--json"), {}, "New preview node already serves unrelated mappings; preserved");
					record.pinned = observed;
					writeState(stateDirectory, record);
				}
				return { kind: "tailscale-serve", socketPath, ...observed, origin: `https://${observed.hostname}/`, managedEnrollment: true };
			});
		},
	};
}

export function enrollmentProtectedRoots(state) {
	const worktrees = git(state.root, "worktree", "list", "--porcelain", "-z").split("\0").filter(field => field.startsWith("worktree ")).map(field => field.slice(9));
	return [state.root, ...worktrees, ...Object.values(state.tickets).flatMap(source => [source.profile, source.worktree].filter(Boolean))];
}

export async function ensurePreviewNode(directory, state, ticket) {
	if (!state.previewEnrollment && !ticket.previewHost?.managedEnrollment) return;
	if (ticket.previewHost && !ticket.previewHost.managedEnrollment) return;
	const enrollment = createPreviewEnrollment(directory, { protectedRoots: enrollmentProtectedRoots(state) });
	ticket.previewHost = await enrollment.ensure(ticket.id, {
		normalHostname: state.tailnetHost,
		existingHostnames: Object.values(state.tickets).filter(source => source.id !== ticket.id).map(source => source.previewHost?.hostname).filter(Boolean),
		binding: ticket.previewHost,
	});
	ticket.origin = ticket.previewHost.origin;
}
