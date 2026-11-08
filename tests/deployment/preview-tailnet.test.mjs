import assert from "node:assert/strict";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { test } from "node:test";
import { createPreviewTransport, verifyReviewRoutes } from "../../scripts/lib/preview-tailnet.mjs";

async function fixture(context) {
	const directory = fs.mkdtempSync("/tmp/lh-tailnet-contract-");
	const socketPath = path.join(directory, "tailscaled.sock");
	const server = net.createServer();
	await new Promise(resolve => server.listen(socketPath, resolve));
	context.after(async () => { await new Promise(resolve => server.close(resolve)); fs.rmSync(directory, { recursive: true }); });
	const node = { BackendState: "Running", Self: { ID: "fixture-node-id", Online: true, DNSName: "preview-one.fixture.ts.net." } };
	const controller = { node, routes: {}, commands: [], failure: null };
	const run = async argumentsList => {
		assert.equal(argumentsList[0], `--socket=${socketPath}`);
		controller.commands.push(argumentsList.slice(1));
		if (argumentsList[1] === "status") return structuredClone(controller.node);
		if (argumentsList.includes("--json")) return structuredClone(controller.routes);
		if (argumentsList.includes("off")) { controller.routes = {}; return ""; }
		if (controller.failure === "before") throw new Error("synthetic Serve failure before write");
		const target = argumentsList.at(-1);
		controller.routes = { TCP: { 443: { HTTPS: true } }, Web: { "preview-one.fixture.ts.net:443": { Handlers: { "/": { Proxy: target } } } } };
		if (controller.failure === "after") throw new Error("synthetic Serve failure after write");
		return "private HTTPS enabled";
	};
	const transport = createPreviewTransport({ run });
	const options = { normalHostname: "normal.fixture.ts.net" };
	return { directory, socketPath, controller, transport, options };
}

test("dedicated host binding refuses normal/sibling identities, existing routes and non-private sockets", async context => {
	const { socketPath, directory, controller, transport, options } = await fixture(context);
	await assert.rejects(transport.bind(socketPath, { normalHostname: "preview-one.fixture.ts.net" }), /different hostnames/);
	await assert.rejects(transport.bind(socketPath, { ...options, existingHostnames: ["preview-one.fixture.ts.net"] }), /already owns/);
	await assert.rejects(transport.bind(socketPath, { normalHostname: "normal.other.ts.net" }), /same private tailnet/);
	controller.routes = { TCP: { 8443: { HTTPS: true } } };
	await assert.rejects(transport.bind(socketPath, options), /never adopting/);
	controller.routes = {};
	fs.chmodSync(directory, 0o755);
	await assert.rejects(transport.bind(socketPath, options), /private user-owned/);
	fs.chmodSync(directory, 0o700);
	const alias = path.join(directory, "alias.sock");
	fs.symlinkSync(socketPath, alias);
	await assert.rejects(transport.bind(alias, options), /symlinks/);
	const binding = await transport.bind(socketPath, options);
	assert.equal(binding.origin, "https://preview-one.fixture.ts.net/");
	assert.equal(controller.commands.filter(command => command.includes("--bg")).length, 0);
});

test("route owner binds exactly one lease and preserves replacement mappings on stale cleanup", async context => {
	const { socketPath, controller, transport, options } = await fixture(context);
	const binding = await transport.bind(socketPath, options);
	const first = await transport.start(binding, { lease: "first-lease", port: 18100 });
	await assert.rejects(transport.start(binding, { lease: "other-lease", port: 18101 }), /no longer empty/);
	await assert.rejects(transport.stop(binding, { ...first, lease: "stale-lease" }), /ownership changed/);
	assert.equal(controller.routes.Web["preview-one.fixture.ts.net:443"].Handlers["/"].Proxy, "http://127.0.0.1:18100");
	await transport.stop(binding, first);
	assert.deepEqual(controller.routes, {});
	assert.equal(fs.existsSync(`${socketPath}.learnharness-preview-route.json`), false);
	const replacement = await transport.start(binding, { lease: "replacement-lease", port: 18100 });
	await assert.rejects(transport.stop(binding, first), /ownership changed/);
	assert.equal(JSON.parse(fs.readFileSync(`${socketPath}.learnharness-preview-route.json`)).lease, replacement.lease);
	await transport.stop(binding, replacement);
});

test("changed node or mappings never authorize route takeover or destructive cleanup", async context => {
	const { socketPath, controller, transport, options } = await fixture(context);
	const binding = await transport.bind(socketPath, options);
	const owner = await transport.start(binding, { lease: "owned-lease", port: 18100 });
	controller.routes.Web["preview-one.fixture.ts.net:443"].Handlers["/"].Proxy = "http://127.0.0.1:39999";
	const changed = structuredClone(controller.routes);
	await assert.rejects(transport.stop(binding, owner), /ownership changed/);
	assert.deepEqual(controller.routes, changed);
	controller.routes = structuredClone(owner.configuration);
	controller.node.Self.ID = "replacement-node-id";
	await assert.rejects(transport.stop(binding, owner), /node identity changed/);
	assert.deepEqual(controller.routes, owner.configuration);
	controller.node.Self.ID = binding.nodeId;
	await transport.stop(binding, owner);
});

test("failed Serve commands revoke only an exact partial write and remove their own owner record", async context => {
	const { socketPath, controller, transport, options } = await fixture(context);
	const binding = await transport.bind(socketPath, options);
	for (const failure of ["before", "after"]) {
		controller.failure = failure;
		await assert.rejects(transport.start(binding, { lease: `failure-${failure}`, port: 18100 }), /synthetic Serve failure/);
		assert.deepEqual(controller.routes, {});
		assert.equal(fs.existsSync(`${socketPath}.learnharness-preview-route.json`), false);
	}
});

test("concurrent claimers cannot share the same dedicated hostname", async context => {
	const { socketPath, controller, transport, options } = await fixture(context);
	const binding = await transport.bind(socketPath, options);
	const attempts = await Promise.allSettled([transport.start(binding, { lease: "one", port: 18100 }), transport.start(binding, { lease: "two", port: 18101 })]);
	assert.equal(attempts.filter(attempt => attempt.status === "fulfilled").length, 1);
	assert.equal(controller.commands.filter(command => command.includes("--bg")).length, 1);
	await transport.stop(binding, attempts.find(attempt => attempt.status === "fulfilled").value);
});

test("review route configuration only verifies three existing exact private HTTPS mappings", async () => {
	const hostname = "normal.fixture.ts.net";
	const slots = [3800, 3801, 3802].map((port, index) => ({ port, httpsPort: 8453 + index }));
	const configuration = { TCP: {}, Web: {} };
	for (const slot of slots) {
		configuration.TCP[slot.httpsPort] = { HTTPS: true };
		configuration.Web[`${hostname}:${slot.httpsPort}`] = { Handlers: { "/": { Proxy: `http://127.0.0.1:${slot.port}` } } };
	}
	const commands = [];
	const run = async argumentsList => {
		commands.push(argumentsList);
		return argumentsList[0] === "status" ? { BackendState: "Running", Self: { Online: true, DNSName: `${hostname}.` } } : configuration;
	};
	await verifyReviewRoutes(hostname, slots, { run });
	configuration.AllowFunnel = { [`${hostname}:8453`]: true };
	await assert.rejects(verifyReviewRoutes(hostname, slots, { run }), /Public Funnel/);
	delete configuration.AllowFunnel;
	configuration.Web[`${hostname}:8453`].Handlers["/"].Proxy = "http://127.0.0.1:3001";
	await assert.rejects(verifyReviewRoutes(hostname, slots, { run }), /never replaced/);
	assert.ok(commands.every(command => command.includes("--json")));
});
