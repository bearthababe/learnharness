import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

const execute = promisify(execFile);
const hostnamePattern = /^[a-z0-9-]+\.[a-z0-9-]+\.ts\.net$/;
const same = (left, right) => assert.deepEqual(left, right, "Dedicated preview mapping ownership changed; preserving it");

export function createPreviewTransport({ run = async (argumentsList, { text = false } = {}) => {
	const { stdout } = await execute("/usr/bin/tailscale", argumentsList, { timeout: 30_000, maxBuffer: 1024 * 1024, encoding: "utf8" });
	return text ? stdout : JSON.parse(stdout || "null");
} } = {}) {
	const socket = filename => {
		assert.ok(path.isAbsolute(filename), "Dedicated Tailscale socket path must be absolute");
		assert.equal(fs.realpathSync(filename), filename, "Dedicated Tailscale socket path must not contain symlinks");
		const metadata = fs.lstatSync(filename);
		assert.ok(metadata.isSocket() && metadata.uid === process.getuid(), "Dedicated Tailscale socket must be owned by this user");
		const parent = fs.statSync(path.dirname(filename));
		assert.ok(parent.uid === process.getuid() && (parent.mode & 0o077) === 0, "Dedicated daemon needs a private user-owned socket directory");
		return filename;
	};
	const call = (binding, ...argumentsList) => run([`--socket=${socket(binding.socketPath)}`, ...argumentsList], { text: !argumentsList.includes("--json") });
	const status = async binding => {
		const node = await call(binding, "status", "--json");
		assert.ok(node.BackendState === "Running" && node.Self?.Online === true, "Dedicated preview node must be authorized and online");
		const hostname = node.Self.DNSName?.replace(/\.$/, "");
		assert.match(hostname ?? "", hostnamePattern, "Preview requires a private tailnet DNS hostname");
		assert.ok(typeof node.Self.ID === "string" && node.Self.ID.length > 0, "Dedicated preview node has no stable node identity");
		return { hostname, nodeId: node.Self.ID };
	};
	const routes = binding => call(binding, "serve", "status", "--json");
	const verify = async binding => {
		const observed = await status(binding);
		assert.equal(observed.hostname, binding.hostname, "Preview hostname changed; refusing to change source identity");
		assert.equal(observed.nodeId, binding.nodeId, "Dedicated preview node identity changed; refusing to adopt it");
		assert.equal(binding.origin, `https://${binding.hostname}/`, "Preview origin must use its dedicated HTTPS hostname");
	};
	const ownerFile = binding => `${socket(binding.socketPath)}.learnharness-preview-route.json`;
	const writeOwner = (binding, owner) => fs.writeFileSync(ownerFile(binding), JSON.stringify(owner), { flag: "wx", mode: 0o600 });
	const readOwner = binding => {
		const filename = ownerFile(binding);
		assert.ok(fs.lstatSync(filename).isFile() && !fs.lstatSync(filename).isSymbolicLink(), "Preview route owner must be a regular file");
		return JSON.parse(fs.readFileSync(filename, "utf8"));
	};
	const stop = async (binding, owner) => {
		if (!owner) return;
		await verify(binding);
		same(readOwner(binding), owner);
		const existing = await routes(binding);
		if (Object.keys(existing).length) {
			same(existing, owner.configuration);
			await call(binding, "serve", "--https=443", "off");
			assert.deepEqual(await routes(binding), {}, "Dedicated preview route did not stop");
		}
		same(readOwner(binding), owner);
		fs.unlinkSync(ownerFile(binding));
	};
	return {
		verify,
		async bind(socketPath, { normalHostname, existingHostnames = [] }) {
			assert.match(normalHostname ?? "", hostnamePattern, "Configure the existing normal/review tailnet host before binding a preview hostname");
			const observed = await status({ socketPath });
			assert.notEqual(observed.hostname, normalHostname, "Normal and preview services must have different hostnames; different ports do not isolate cookies");
			assert.equal(observed.hostname.split(".").slice(1).join("."), normalHostname.split(".").slice(1).join("."), "Preview and review nodes must belong to the same private tailnet");
			assert.ok(!existingHostnames.includes(observed.hostname), "Another source already owns this preview hostname");
			const binding = { kind: "tailscale-serve", socketPath, ...observed, origin: `https://${observed.hostname}/` };
			assert.deepEqual(await routes(binding), {}, "Dedicated preview node already serves other mappings; never adopting or replacing them");
			assert.ok(!fs.existsSync(ownerFile(binding)), "Dedicated preview node has an existing route owner; recover that lease first");
			return binding;
		},
		async start(binding, { lease, port }) {
			assert.match(lease, /^[a-zA-Z0-9-]+$/);
			assert.ok(Number.isInteger(port) && port > 1024 && port < 65536, "Invalid preview loopback transport port");
			await verify(binding);
			assert.deepEqual(await routes(binding), {}, "Dedicated preview node is no longer empty; refusing route replacement");
			const owner = { lease, nodeId: binding.nodeId, configuration: { TCP: { 443: { HTTPS: true } }, Web: { [`${binding.hostname}:443`]: { Handlers: { "/": { Proxy: `http://127.0.0.1:${port}` } } } } } };
			writeOwner(binding, owner);
			try {
				assert.deepEqual(await routes(binding), {}, "Dedicated preview routes changed before activation; refusing to replace them");
				await run([`--socket=${socket(binding.socketPath)}`, "serve", "--bg", "--https=443", `http://127.0.0.1:${port}`], { text: true });
				same(await routes(binding), owner.configuration);
				return owner;
			} catch (error) {
				try { await stop(binding, owner); }
				catch (cleanupError) { error.message += `; preview route cleanup requires inspection: ${cleanupError.message}`; }
				throw error;
			}
		},
		stop,
	};
}

export async function verifyReviewRoutes(hostname, slots, { run = async argumentsList => JSON.parse((await execute("/usr/bin/tailscale", argumentsList, { timeout: 15_000, encoding: "utf8" })).stdout) } = {}) {
	assert.match(hostname ?? "", hostnamePattern, "Only a tailnet .ts.net review host is allowed");
	assert.equal(slots.length, 3, "Exactly three existing review slots are required");
	const node = await run(["status", "--json"]);
	assert.ok(node.BackendState === "Running" && node.Self?.Online === true, "Review tailnet node must be online");
	assert.equal(node.Self.DNSName?.replace(/\.$/, ""), hostname, "Review host must be this machine's normal tailnet hostname");
	const configuration = await run(["serve", "status", "--json"]);
	for (const slot of slots) {
		assert.ok(Number.isInteger(slot.httpsPort) && slot.httpsPort > 1024 && slot.httpsPort < 65536, "Review slots require explicit unprivileged HTTPS ports");
		const address = `${hostname}:${slot.httpsPort}`;
		assert.deepEqual(configuration.TCP?.[slot.httpsPort], { HTTPS: true }, "Review slot must already have an authorized HTTPS mapping");
		assert.deepEqual(configuration.Web?.[address]?.Handlers, { "/": { Proxy: `http://127.0.0.1:${slot.port}` } }, "Existing review route does not match its exact loopback slot; it is never replaced");
		assert.ok(!configuration.AllowFunnel?.[address], "Public Funnel review routes are forbidden");
	}
	assert.equal(new Set(slots.map(slot => slot.httpsPort)).size, 3, "Review HTTPS ports must be distinct");
}
