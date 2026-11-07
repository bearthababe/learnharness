const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const net = require("node:net");
const { createRequire } = require("node:module");
const { randomUUID } = require("node:crypto");
const { resolveProfile, ownServerProfile, inspectPath, containsPath, privateDirectory, processIdentity } = require("./deployment-profile.cjs");
const { profileIdentity, originValue, readPrivateJSON, validateConfiguration } = require("./local-service-protocol.cjs");
const { createAdmission } = require("./local-service-ingress.cjs");

async function startService(options) {
	if (process.platform !== "linux" || !process.versions.electron) throw new Error("Local service requires packaged Linux Electron-Node");
	if (process.env.LH_DESKTOP_SERVER || process.env.LH_DESKTOP_API_SECRET || process.env.LH_DEV_URL || process.env.LH_LOCAL_SERVICE_CONFIG) throw new Error("Conflicting private desktop/service configuration");
	const serverDirectory = path.join(__dirname, "server", "standalone");
	const build = JSON.parse(fs.readFileSync(path.join(serverDirectory, "deployment-build.json"), "utf8"));
	if (!/^[a-f0-9]{40}$/.test(build.revision) || !/^[a-f0-9]{64}$/.test(build.sourceHash) || !build.buildId) throw new Error("Packaged service build identity is missing");
	const port = Number(options.port);
	if (!Number.isSafeInteger(port) || port < 1024 || port > 65535 || [3000, 3001, 3002, 3800, 3801, 3802, 8448].includes(port)) throw new Error("Invalid or reserved service port");
	const profile = resolveProfile({ codeRoot: serverDirectory });
	if (!profile.managed) throw new Error("Local service requires a managed LH_PROFILE_DIR without legacy overrides");
	const runtime = inspectPath(options.runtime || `${profile.root}-runtime`);
	if (containsPath(profile.root, runtime) || containsPath(runtime, profile.root) || containsPath(path.dirname(serverDirectory), runtime)) throw new Error("Runtime must be outside profile and application code");
	resolveProfile({ env: { LH_PROFILE_DIR: runtime }, codeRoot: serverDirectory });
	for (const cache of [`${profile.root}-shell`, `${profile.root}-helper`]) if (containsPath(cache, runtime) || containsPath(runtime, cache)) throw new Error("Runtime must be separate from browser state");
	const origin = `http://127.0.0.1:${port}`;
	const browserOrigins = (options.browserOrigins || []).map(originValue);
	const admission = createAdmission([origin, ...browserOrigins]);
	const owner = ownServerProfile(profile);
	privateDirectory(runtime);
	const socketPath = path.join(runtime, "control.sock");
	if (Buffer.byteLength(socketPath) > 100) throw new Error("Local-service runtime path is too long for a Unix socket");
	const configurationFile = path.join(runtime, "service.json");
	if (fs.existsSync(configurationFile)) {
		const previous = validateConfiguration(readPrivateJSON(configurationFile), { requireLive: false });
		if (previous.runtime !== runtime || previous.profileId !== profileIdentity(profile.root)) throw new Error("Stale runtime belongs to a different profile");
		const live = processIdentity(previous.pid);
		if (live && live.start === previous.start && live.boot === previous.boot) throw new Error("Runtime already belongs to a live service");
	}
	if (fs.existsSync(socketPath)) {
		const information = fs.lstatSync(socketPath);
		if (!information.isSocket() || information.uid !== process.getuid() || information.mode & 0o077) throw new Error("Unsafe stale control socket");
		fs.unlinkSync(socketPath);
	}
	const configuration = { schemaVersion: 1, kind: "learnharness-local-service", deploymentId: randomUUID(), ...build, ...processIdentity(), profileId: profileIdentity(profile.root), profileRoot: profile.root, runtime, socket: socketPath, origin, browserOrigins };
	const status = Object.freeze({ schemaVersion: 1, mode: "local-service", deploymentId: configuration.deploymentId, profileId: configuration.profileId, revision: build.revision, sourceHash: build.sourceHash, buildId: build.buildId, pid: process.pid, updateState: "not-configured", updater: "updater-not-running", activity: "unknown" });
	globalThis[Symbol.for("learnharness.local-service.v1")] = status;
	let handler;
	const server = http.createServer((request, response) => {
		Promise.resolve(admission.handle(request, response, (incoming, outgoing) => handler ? handler(incoming, outgoing) : (outgoing.writeHead(503), outgoing.end("Starting")))).catch(() => {
			if (!response.headersSent) response.writeHead(500);
			response.end();
		});
	});
	server.on("upgrade", (_request, socket) => socket.destroy());
	server.requestTimeout = 30000;
	const controls = net.createServer({ allowHalfOpen: true }, socket => {
		let contents = "";
		socket.setTimeout(5000, () => socket.destroy());
		socket.on("error", () => {});
		socket.on("data", chunk => {
			contents += chunk;
			if (contents.length > 4096) socket.destroy();
		});
		socket.on("end", () => {
			try {
				owner.assertOwner();
				const command = JSON.parse(contents);
				for (const field of ["deploymentId", "profileId", "revision", "sourceHash", "buildId"]) if (command[field] !== configuration[field]) throw new Error("Local-service identity mismatch");
				if (command.op === "status") socket.end(JSON.stringify(status));
				else if (command.op === "admit") socket.end(JSON.stringify({ ticket: admission.issue(command.origin) }));
				else throw new Error("Unsupported local-service command");
			} catch { socket.end(JSON.stringify({ error: "Local-service request refused" })); }
		});
	});
	let stopping = false;
	async function stop() {
		if (stopping) return;
		stopping = true;
		server.closeAllConnections();
		await Promise.all([new Promise(resolve => server.close(resolve)), new Promise(resolve => controls.close(resolve))]);
		process.exit(0);
	}
	process.once("SIGTERM", stop);
	process.once("SIGINT", stop);
	process.once("exit", () => {
		try {
			if (fs.existsSync(configurationFile) && readPrivateJSON(configurationFile).deploymentId === configuration.deploymentId) fs.unlinkSync(configurationFile);
			if (controls.listening || stopping) fs.rmSync(socketPath, { force: true });
		} catch { process.stderr.write("Local-service runtime cleanup requires inspection.\n"); }
	});
	await new Promise((resolve, reject) => { server.once("error", reject); server.listen(port, "127.0.0.1", resolve); });
	const serverRequire = createRequire(path.join(serverDirectory, "server.js"));
	process.chdir(serverDirectory);
	process.env.NODE_ENV = "production";
	process.env.LH_BROWSER_SERVICE_DATA_DIR = `${profile.root}-helper`;
	const nextConfiguration = JSON.parse(fs.readFileSync(path.join(serverDirectory, ".next", "required-server-files.json"), "utf8")).config;
	process.env.__NEXT_PRIVATE_STANDALONE_CONFIG = JSON.stringify(nextConfiguration);
	serverRequire("next");
	const { getRequestHandlers } = serverRequire("next/dist/server/lib/start-server");
	const initialized = await getRequestHandlers({ dir: serverDirectory, port, isDev: false, hostname: "127.0.0.1", server });
	handler = initialized.requestHandler;
	owner.assertOwner();
	await new Promise((resolve, reject) => { controls.once("error", reject); controls.listen(socketPath, resolve); });
	fs.chmodSync(socketPath, 0o600);
	fs.writeFileSync(configurationFile, JSON.stringify(configuration, null, 2) + "\n", { mode: 0o600 });
	console.log(JSON.stringify({ ready: true, configuration: configurationFile, ...status }));
}

if (require.main === module) {
	startService(JSON.parse(process.argv[2] || "{}")).catch(() => {
		process.stderr.write("Local-service startup failed; verify build, profile custody, runtime and port configuration.\n");
		process.exit(1);
	});
}

module.exports = { startService };
