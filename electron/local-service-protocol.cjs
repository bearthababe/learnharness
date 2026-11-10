const fs = require("node:fs");
const path = require("node:path");
const net = require("node:net");
const { createHash } = require("node:crypto");
const { inspectPath, containsPath, processIdentity } = require("./deployment-profile.cjs");

function profileIdentity(root) {
	return createHash("sha256").update(inspectPath(root)).digest("hex");
}

function originValue(value) {
	const parsed = new URL(value);
	if (parsed.origin !== value || parsed.username || parsed.password || !["http:", "https:"].includes(parsed.protocol)) throw new Error("Expected an exact HTTP origin");
	if (parsed.protocol === "http:" && parsed.hostname !== "127.0.0.1") throw new Error("Non-loopback browser origins require HTTPS");
	return parsed.origin;
}

function readPrivateJSON(filename) {
	inspectPath(filename);
	for (const target of [path.dirname(filename), filename]) {
		const information = fs.lstatSync(target);
		if (information.uid !== process.getuid() || information.mode & 0o077 || !information.isDirectory() && (!information.isFile() || information.nlink !== 1)) throw new Error("Unsafe local-service configuration");
	}
	return JSON.parse(fs.readFileSync(filename, "utf8"));
}

function validateConfiguration(configuration, { requireLive = true } = {}) {
	if (configuration.schemaVersion !== 1 || configuration.kind !== "learnharness-local-service" || !/^[a-f0-9-]{36}$/.test(configuration.deploymentId) || !/^[a-f0-9]{40}$/.test(configuration.revision) || !/^[a-f0-9]{64}$/.test(configuration.sourceHash) || typeof configuration.buildId !== "string" || !configuration.buildId || !/^[a-f0-9]{64}$/.test(configuration.profileId)) throw new Error("Invalid local-service identity");
	if (!Number.isSafeInteger(configuration.pid) || configuration.pid <= 0 || !/^\d+$/.test(configuration.start) || !/^[a-f0-9-]{36}$/.test(configuration.boot) || !path.isAbsolute(configuration.profileRoot) || !path.isAbsolute(configuration.runtime)) throw new Error("Invalid local-service process/profile identity");
	const origin = originValue(configuration.origin);
	if (new URL(origin).hostname !== "127.0.0.1" || !new URL(origin).port || !origin.startsWith("http:")) throw new Error("Shell attachment requires loopback HTTP");
	if (!Array.isArray(configuration.browserOrigins) || configuration.browserOrigins.some(value => originValue(value) !== value)) throw new Error("Invalid browser origins");
	const runtime = inspectPath(configuration.runtime);
	if (configuration.socket !== path.join(runtime, "control.sock") || configuration.profileId !== profileIdentity(configuration.profileRoot) || containsPath(configuration.profileRoot, runtime) || containsPath(runtime, configuration.profileRoot)) throw new Error("Conflicting local-service profile/runtime");
	const live = processIdentity(configuration.pid);
	if (requireLive && (!live || live.start !== configuration.start || live.boot !== configuration.boot)) throw new Error("Local-service process is not running");
	return configuration;
}

function readConfiguration(filename) {
	const configuration = validateConfiguration(readPrivateJSON(filename));
	if (path.resolve(filename) !== path.join(configuration.runtime, "service.json")) throw new Error("Configuration location does not match runtime");
	return configuration;
}

function controlRequest(configuration, command) {
	return new Promise((resolve, reject) => {
		inspectPath(path.dirname(configuration.socket));
		const information = fs.lstatSync(configuration.socket);
		if (!information.isSocket() || information.uid !== process.getuid() || information.mode & 0o077) throw new Error("Unsafe local-service socket");
		const socket = net.createConnection(configuration.socket);
		let contents = "";
		socket.setTimeout(command.op === "freeze" ? 60000 : 5000, () => socket.destroy(new Error("Local-service control timed out")));
		socket.on("error", reject);
		socket.on("connect", () => socket.end(JSON.stringify({ ...command, deploymentId: configuration.deploymentId, profileId: configuration.profileId, revision: configuration.revision, sourceHash: configuration.sourceHash, buildId: configuration.buildId }) + "\n"));
		socket.on("data", chunk => {
			contents += chunk;
			if (contents.length > 16384) socket.destroy(new Error("Invalid local-service response"));
		});
		socket.on("end", () => {
			try {
				const response = JSON.parse(contents);
				if (response.error) throw new Error(response.error);
				resolve(response);
			} catch (error) { reject(error); }
		});
	});
}

async function attachService(filename, build, profileRoot) {
	const configuration = readConfiguration(filename);
	if (profileRoot && profileIdentity(profileRoot) !== configuration.profileId) throw new Error("Shell profile does not match local service");
	for (const field of ["revision", "sourceHash", "buildId"]) if (configuration[field] !== build[field]) throw new Error("Shell build does not match local service");
	const status = await controlRequest(configuration, { op: "status" });
	if (status.deploymentId !== configuration.deploymentId || status.profileId !== configuration.profileId || status.revision !== build.revision || status.sourceHash !== build.sourceHash || status.buildId !== build.buildId || status.pid !== configuration.pid) throw new Error("Local-service identity changed");
	return configuration;
}

module.exports = { profileIdentity, originValue, readPrivateJSON, readConfiguration, validateConfiguration, controlRequest, attachService };
