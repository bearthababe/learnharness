const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const net = require("node:net");
const { createRequire } = require("node:module");
const { randomUUID } = require("node:crypto");
const { pathToFileURL } = require("node:url");
const { resolveProfile, ownServerProfile, inspectPath, containsPath, privateDirectory, processIdentity } = require("./deployment-profile.cjs");
const { profileIdentity, originValue, readPrivateJSON, validateConfiguration } = require("./local-service-protocol.cjs");
const { createAdmission } = require("./local-service-ingress.cjs");
const { createActivity } = require("./deployment-activity.cjs");

function servicePreviewHelperDirectory({ previewHelperDirectory, runtime, profileRoot, codeRoot }) {
	if (previewHelperDirectory === undefined) return null;
	if (typeof previewHelperDirectory !== "string" || previewHelperDirectory !== path.join(runtime, "preview-subscriptions")) throw new Error("Preview helper must use the service runtime preview-subscriptions directory");
	const directory = inspectPath(previewHelperDirectory);
	for (const protectedRoot of [profileRoot, `${profileRoot}-shell`, `${profileRoot}-helper`, codeRoot]) {
		if (containsPath(protectedRoot, directory) || containsPath(directory, protectedRoot)) throw new Error("Preview helper must be separate from profile and application code");
	}
	if (Buffer.byteLength(path.join(directory, `${randomUUID()}.sock`)) > 100) throw new Error("Preview helper directory is too long for a Unix socket");
	return directory;
}

async function startServicePreviewHelper({ directory, getOwner, activity, unavailable = () => false, fetch }) {
	const scriptRoot = process.versions.electron ? __dirname : path.dirname(__dirname);
	const { startPreviewSubscriptionHelper } = await import(pathToFileURL(path.join(scriptRoot, "scripts/lib/preview-subscription-helper.mjs")).href);
	const { createPreviewSubscriptionBackend } = require("./preview-subscription-owner.cjs");
	const owner = getOwner();
	return startPreviewSubscriptionHelper({
		directory, backend: createPreviewSubscriptionBackend({ chatgpt: owner.chatgpt, native: owner.native, fetch }),
		enterRequest() {
			if (unavailable()) throw new Error("Local maintenance pause");
			return activity.enterRequest();
		},
	});
}

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
	const helperDirectory = servicePreviewHelperDirectory({ previewHelperDirectory: options.previewHelperDirectory, runtime, profileRoot: profile.root, codeRoot: path.dirname(__dirname) });
	const origin = `http://127.0.0.1:${port}`;
	const browserOrigins = (options.browserOrigins || []).map(originValue);
	const retained = options.handoff ? readPrivateJSON(options.handoff) : null;
	if (retained && (retained.profileId !== profileIdentity(profile.root) || retained.origin !== origin || JSON.stringify(retained.browserOrigins) !== JSON.stringify(browserOrigins))) throw new Error("Admission handoff identity mismatch");
	const admission = createAdmission([origin, ...browserOrigins], retained?.sessions);
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
	const configuration = { schemaVersion: 1, kind: "learnharness-local-service", deploymentId: randomUUID(), ...build, ...processIdentity(), profileId: profileIdentity(profile.root), profileRoot: profile.root, runtime, socket: socketPath, origin, browserOrigins, executable: fs.realpathSync(process.execPath), previewHelperDirectory: helperDirectory };
	const work = () => globalThis[Symbol.for("learnharness.deployment-work.v1")];
	const activity = createActivity({ work: () => work()?.reasons() ?? (() => { throw new Error("Server activity is unavailable"); })() });
	let updater = null;
	let quiesced = false;
	let bootMaintenance = !!retained;
	let previewHelper;
	let stopping = false;
	globalThis[Symbol.for("learnharness.deployment-frozen.v1")] = () => bootMaintenance || activity.isFrozen();
	const shells = new Map();
	function updaterLive() {
		if (!updater || updater.state === "stopped" || Date.now() - updater.observedAt > 10000) return false;
		const live = processIdentity(updater.pid);
		return live?.start === updater.start && live?.boot === updater.boot;
	}
	const status = Object.freeze({ schemaVersion: 1, mode: "local-service", deploymentId: configuration.deploymentId, profileId: configuration.profileId, revision: build.revision, sourceHash: build.sourceHash, buildId: build.buildId, pid: process.pid,
		get updateState() { return updaterLive() ? updater.state : updater ? "stopped" : "not-configured"; },
		get updater() { return updaterLive() ? "running" : "updater-not-running"; },
		get activity() { return activity.snapshot().state; },
		get activityReasons() { return activity.snapshot().reasons; },
		get candidate() { return updater?.candidate ?? null; },
		get updateReason() { return updater?.reason ?? null; },
		get updaterObservedAt() { return updater?.observedAt ?? null; },
		get maintenance() { return bootMaintenance || activity.isFrozen(); },
	});
	globalThis[Symbol.for("learnharness.local-service.v1")] = status;
	let handler;
	const server = http.createServer((request, response) => {
		Promise.resolve(admission.handle(request, response, async (incoming, outgoing, session) => {
			const pathname = new URL(incoming.url, origin).pathname;
			delete incoming.headers["x-lh-document"];
			if (bootMaintenance && pathname !== "/api/runtime" && !admission.isHealth(session)) { outgoing.writeHead(503, { "Cache-Control": "no-store", "Retry-After": "1" }); outgoing.end("Local maintenance pause"); return; }
			if (pathname === "/__local/activity" && incoming.method === "POST") {
				let contents = "";
				for await (const chunk of incoming) { contents += chunk; if (contents.length > 4096) throw new Error("Invalid activity report"); }
				const result = activity.report(session, JSON.parse(contents));
				outgoing.writeHead(200, { "Cache-Control": "no-store", "Content-Type": "application/json" });
				outgoing.end(JSON.stringify(result));
				return;
			}
			if (pathname !== "/api/runtime" && !pathname.startsWith("/_next/") && !["/api/events"].includes(pathname)) {
				if (activity.snapshot().freeze) { outgoing.writeHead(503, { "Retry-After": "1", "Cache-Control": "no-store" }); outgoing.end("Local maintenance pause"); return; }
				if (!["GET", "HEAD"].includes(incoming.method)) {
					const finish = activity.enterRequest();
					outgoing.once("finish", finish);
					outgoing.once("close", finish);
				}
			}
			if (!pathname.startsWith("/api/") && !admission.isHealth(session) && (incoming.headers["sec-fetch-dest"] === "document" || incoming.headers.accept?.includes("text/html"))) incoming.headers["x-lh-document"] = activity.open(session);
			return handler ? handler(incoming, outgoing) : (outgoing.writeHead(503), outgoing.end("Starting"));
		})).catch(() => {
			if (!response.headersSent) response.writeHead(500);
			response.end();
		});
	});
	server.on("upgrade", (_request, socket) => socket.destroy());
	server.requestTimeout = 30000;
	const controls = net.createServer({ allowHalfOpen: true }, socket => {
		let contents = "";
		socket.setTimeout(60000, () => socket.destroy());
		socket.on("error", () => {});
		socket.on("data", chunk => {
			contents += chunk;
			if (contents.length > 4096) socket.destroy();
		});
		socket.on("end", async () => {
			try {
				owner.assertOwner();
				const command = JSON.parse(contents);
				for (const field of ["deploymentId", "profileId", "revision", "sourceHash", "buildId"]) if (command[field] !== configuration[field]) throw new Error("Local-service identity mismatch");
				if (command.op === "status") socket.end(JSON.stringify(status));
				else if (command.op === "admit") socket.end(JSON.stringify({ ticket: admission.issue(command.origin, command.health === true) }));
				else if (command.op === "resume") {
					if (!bootMaintenance) throw new Error("Not a boot handoff");
					bootMaintenance = false; admission.revokeHealth(); work()?.resume(); socket.end(JSON.stringify({ ok: true }));
				}
				else if (command.op === "activity") socket.end(JSON.stringify(activity.snapshot()));
				else if (command.op === "updater-status") {
					const live = processIdentity(command.updater?.pid);
					if (!live || live.start !== command.updater.start || live.boot !== command.updater.boot || typeof command.updater.state !== "string" || typeof command.updater.reason !== "string") throw new Error("Invalid updater identity");
					if (updaterLive() && updater.pid !== live.pid) throw new Error("Another updater owns this service");
					updater = { ...command.updater, observedAt: Date.now() };
					socket.end(JSON.stringify({ ok: true }));
				} else if (command.op === "freeze") {
					const token = activity.beginFreeze();
					try {
						const deadline = Date.now() + 3000;
						for (;;) {
							try { activity.assertFrozen(token); break; } catch (error) {
								if (activity.snapshot().state !== "idle" || Date.now() >= deadline) throw error;
								await new Promise(resolve => setTimeout(resolve, 50));
							}
						}
						await work().quiesce();
						activity.assertFrozen(token);
						quiesced = true;
						socket.end(JSON.stringify({ token }));
					} catch (error) { activity.thaw(); work()?.resume(); throw error; }
				} else if (command.op === "thaw") {
					quiesced = false; activity.thaw(); work()?.resume(); socket.end(JSON.stringify({ ok: true }));
				} else if (command.op === "handoff") {
					activity.assertFrozen(command.token);
					if (!quiesced) throw new Error("Writers have not quiesced");
					socket.end(JSON.stringify({ profileId: configuration.profileId, origin, browserOrigins, sessions: admission.retain() }));
				} else if (command.op === "shell") {
					const live = processIdentity(command.shell?.pid);
					if (!live || live.start !== command.shell.start || live.boot !== command.shell.boot) throw new Error("Shell process is not live");
					shells.set(live.pid, live);
					socket.end(JSON.stringify({ ok: true }));
				} else if (command.op === "shells") socket.end(JSON.stringify([...shells.values()].filter(shell => { const live = processIdentity(shell.pid); return live?.start === shell.start && live?.boot === shell.boot; })));
				else throw new Error("Unsupported local-service command");
			} catch { socket.end(JSON.stringify({ error: "Local-service request refused" })); }
		});
	});
	async function stop() {
		if (stopping) return;
		stopping = true;
		try { await previewHelper?.close(); if (!quiesced) await work()?.quiesce(); }
		catch { stopping = false; process.stderr.write("Local-service stop is waiting for credential custody; finish the active operation.\n"); return; }
		server.closeAllConnections();
		await Promise.all([new Promise(resolve => server.close(resolve)), new Promise(resolve => controls.close(resolve))]);
		process.exit(0);
	}
	process.on("SIGTERM", stop);
	process.on("SIGINT", stop);
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
	const ownerBridgeKey = Symbol.for("learnharness.web-subscription-owner.v1");
	if (helperDirectory) globalThis[ownerBridgeKey] = {};
	serverRequire("next");
	const { getRequestHandlers } = serverRequire("next/dist/server/lib/start-server");
	const initialized = await getRequestHandlers({ dir: serverDirectory, port, isDev: false, hostname: "127.0.0.1", server });
	handler = initialized.requestHandler;
	try {
		const admitted = await fetch(`${origin}/__local/session`, {
			method: "POST", headers: { Origin: origin, "Content-Type": "application/json" },
			body: JSON.stringify({ ticket: admission.issue(origin, true) }), redirect: "error", signal: AbortSignal.timeout(30000),
		});
		if (admitted.status !== 204) throw new Error("Local-service initialization admission failed");
		const cookie = admitted.headers.get("set-cookie")?.split(";")[0];
		if (!cookie) throw new Error("Local-service initialization session is missing");
		const ready = await fetch(`${origin}/api/runtime`, { headers: { Cookie: cookie }, redirect: "error", signal: AbortSignal.timeout(30000) });
		if (ready.status !== 200) throw new Error("Local-service application initialization failed");
		await ready.json();
	} finally { admission.revokeHealth(); }
	if (helperDirectory) {
		const getOwner = globalThis[ownerBridgeKey]?.getOwner;
		if (typeof getOwner !== "function") throw new Error("Web subscription owner bridge is unavailable");
		previewHelper = await startServicePreviewHelper({ directory: helperDirectory, getOwner, activity, unavailable: () => stopping || bootMaintenance });
	}
	try {
		owner.assertOwner();
		await new Promise((resolve, reject) => { controls.once("error", reject); controls.listen(socketPath, resolve); });
		fs.chmodSync(socketPath, 0o600);
		fs.writeFileSync(configurationFile, JSON.stringify(configuration, null, 2) + "\n", { mode: 0o600 });
		console.log(JSON.stringify({ ready: true, configuration: configurationFile, ...status }));
	} catch (error) {
		await previewHelper?.close();
		throw error;
	}
}

if (require.main === module) {
	startService(JSON.parse(process.argv[2] || "{}")).catch(() => {
		process.stderr.write("Local-service startup failed; verify build, profile custody, runtime and port configuration.\n");
		process.exit(1);
	});
}

module.exports = { startService, servicePreviewHelperDirectory, startServicePreviewHelper };
