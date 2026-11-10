import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { createPreviewEnrollment, ensurePreviewNode } from "../../scripts/lib/preview-enrollment.mjs";
import { git, ownerOf } from "../../scripts/lib/ticket-state.mjs";

const syntheticSecret = "tskey-client-fixture-not-a-real-secret";

function repositoryFixture(directory) {
	const root = path.join(directory, "repository");
	const worktree = path.join(directory, "worktree");
	fs.mkdirSync(root);
	git(root, "init", "--initial-branch=main");
	git(root, "-c", "user.name=Enrollment Fixture", "-c", "user.email=enrollment@example.invalid", "commit", "--allow-empty", "-m", "Disposable enrollment fixture");
	git(root, "worktree", "add", "--detach", worktree, "HEAD");
	return { root, worktree };
}

async function fixture(context) {
	const directory = fs.mkdtempSync(path.join(os.tmpdir(), "lh-enroll-"));
	const registry = path.join(directory, "registry");
	fs.mkdirSync(registry, { mode: 0o700 });
	const input = path.join(directory, "secret");
	fs.writeFileSync(input, syntheticSecret, { mode: 0o600 });
	const controller = { nodes: new Map(), launches: [], commands: [], refuse: false };
	const launch = async record => {
		const server = net.createServer();
		await new Promise(resolve => server.listen(record.socketPath, resolve));
		const owner = { pid: 100000 + controller.launches.length, identity: "synthetic", token: "fixture" };
		const previous = controller.nodes.get(record.source);
		const entry = { server, owner, running: true, node: previous?.node ?? null, record };
		controller.nodes.set(record.source, entry);
		controller.launches.push(record);
		fs.writeFileSync(record.stateFile, "synthetic persistent daemon state", { mode: 0o600 });
		return owner;
	};
	const run = async argumentsList => {
		controller.commands.push(argumentsList);
		const socket = argumentsList[0].slice("--socket=".length);
		const entry = [...controller.nodes.values()].find(node => node.record.socketPath === socket);
		assert.ok(entry?.running);
		if (argumentsList[1] === "status") return entry.node ?? { BackendState: "NeedsLogin" };
		if (argumentsList[1] === "serve") return {};
		assert.equal(argumentsList[1], "up");
		assert.ok(!argumentsList.join(" ").includes(syntheticSecret));
		const keyFile = argumentsList.find(argument => argument.startsWith("--auth-key=file:")).slice("--auth-key=file:".length);
		assert.equal(fs.readFileSync(keyFile, "utf8"), syntheticSecret + "?ephemeral=false&preauthorized=true");
		if (controller.refuse) throw new Error("provider echoed " + syntheticSecret);
		entry.node = { BackendState: "Running", Self: { Online: true, ID: "node-" + entry.record.source, DNSName: entry.record.hostname + ".fixture.ts.net." } };
		return "registered without interactive login";
	};
	const isAlive = owner => [...controller.nodes.values()].some(node => node.running && node.owner.pid === owner?.pid && node.owner.identity === owner?.identity);
	const crash = async source => {
		const entry = controller.nodes.get(source);
		entry.running = false;
		await new Promise(resolve => entry.server.close(resolve));
	};
	const enrollment = createPreviewEnrollment(registry, { runtimeRoot: path.join(directory, "runtime"), run, launch, isAlive });
	context.after(async () => {
		for (const [source, entry] of controller.nodes) if (entry.running) await crash(source);
		fs.rmSync(directory, { recursive: true, force: true });
	});
	return { directory, registry, input, controller, crash, enrollment };
}

test("one private credential enrolls distinct sources without logins and reuses saved node identity after restart", async context => {
	const { input, controller, crash, enrollment } = await fixture(context);
	const configured = enrollment.configure(input, "tag:learnharness-preview");
	assert.ok(!JSON.stringify(configured).includes(syntheticSecret));
	const options = { normalHostname: "normal.fixture.ts.net", existingHostnames: [] };
	const first = await enrollment.ensure("first", options);
	const again = await enrollment.ensure("first", { ...options, binding: first });
	assert.deepEqual(again, first);
	assert.equal(controller.commands.filter(command => command[1] === "up").length, 1);
	const second = await enrollment.ensure("second", { ...options, existingHostnames: [first.hostname] });
	assert.notEqual(second.hostname, first.hostname);
	assert.notEqual(second.nodeId, first.nodeId);
	await crash("first");
	const restarted = await enrollment.ensure("first", { ...options, binding: first });
	assert.deepEqual(restarted, first);
	assert.equal(controller.launches.length, 3);
	assert.equal(controller.commands.filter(command => command[1] === "up").length, 2);
	for (const command of controller.commands.filter(command => command[1] === "up")) {
		assert.ok(command.includes("--accept-dns=false"));
		assert.ok(command.includes("--accept-routes=false"));
		assert.ok(command.includes("--ssh=false"));
		assert.ok(command.includes("--advertise-tags=tag:learnharness-preview"));
	}
});

test("missing configuration and unsafe credential custody fail before launching a daemon", async context => {
	const { input, directory, controller, enrollment } = await fixture(context);
	await assert.rejects(enrollment.ensure("first", { normalHostname: "normal.fixture.ts.net" }), /Configure unattended preview enrollment/);
	fs.chmodSync(input, 0o644);
	assert.throws(() => enrollment.configure(input, "tag:learnharness-preview"), /private.*file/);
	fs.chmodSync(input, 0o600);
	const alias = path.join(directory, "alias");
	fs.symlinkSync(input, alias);
	assert.throws(() => enrollment.configure(alias, "tag:learnharness-preview"), /Unsafe profile path/);
	assert.throws(() => enrollment.configure(input, "*"), /dedicated preview tag/);
	assert.equal(controller.launches.length, 0);
});

test("configuration refuses credential input inside protected source and profile trees without copying or deleting it", async context => {
	const { directory, registry } = await fixture(context);
	const source = path.join(directory, "source");
	const profile = path.join(directory, "profile");
	for (const input of [path.join(source, "scripts/oauth.txt"), path.join(profile, "home/oauth.txt")]) {
		fs.mkdirSync(path.dirname(input), { recursive: true, mode: 0o700 });
		fs.writeFileSync(input, syntheticSecret, { mode: 0o600 });
		const enrollment = createPreviewEnrollment(registry, { protectedRoots: [source, profile] });
		assert.throws(() => enrollment.configure(input, "tag:learnharness-preview"), /input.*outside preview/);
		assert.equal(fs.readFileSync(input, "utf8"), syntheticSecret);
		assert.equal(fs.existsSync(path.join(registry, "preview-enrollment/credential")), false);
	}
});

test("actual configuration CLI refuses credentials in an unregistered project worktree", async context => {
	const { directory, registry } = await fixture(context);
	const { root, worktree } = repositoryFixture(directory);
	const input = path.join(worktree, "scripts/oauth.txt");
	fs.mkdirSync(path.dirname(input));
	fs.writeFileSync(input, syntheticSecret, { mode: 0o600 });
	fs.writeFileSync(path.join(registry, "registry.json"), JSON.stringify({ root, tailnetHost: "normal.fixture.ts.net", tickets: {}, slots: [], queue: [], manager: null }), { mode: 0o600 });
	assert.throws(() => execFileSync(process.execPath, ["scripts/ticket.mjs", "configure-enrollment", "--secret-file", input, "--root", root, "--state-dir", registry], {
		cwd: process.cwd(), env: { PATH: process.env.PATH, HOME: directory }, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
	}), error => {
		assert.match(String(error.stderr), /input.*outside preview/);
		assert.ok(!String(error.stderr).includes(syntheticSecret));
		return true;
	});
	assert.equal(fs.readFileSync(input, "utf8"), syntheticSecret);
	assert.equal(fs.existsSync(path.join(registry, "preview-enrollment/credential")), false);
});

test("failed first CLI enrollment preserves source ownership and retained state for a repaired retry", async context => {
	const { directory, registry } = await fixture(context);
	const { root, worktree } = repositoryFixture(directory);
	const filename = path.join(registry, "registry.json");
	fs.writeFileSync(filename, JSON.stringify({ root, tailnetHost: "normal.fixture.ts.net", previewEnrollment: true, tickets: {}, slots: [], queue: [], manager: null, nextPort: 18100 }), { mode: 0o600 });
	const cli = (...argumentsList) => execFileSync(process.execPath, ["scripts/ticket.mjs", ...argumentsList, "--root", root, "--state-dir", registry], {
		cwd: process.cwd(), env: { PATH: process.env.PATH, HOME: directory }, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
	});
	try {
		assert.throws(() => cli("preview", "retry-fixture", "--worktree", worktree), /Configure unattended preview enrollment/);
		const failed = JSON.parse(fs.readFileSync(filename));
		assert.equal(failed.tickets["retry-fixture"]?.worktree, worktree);
		const marker = path.join(failed.tickets["retry-fixture"].profile, "retained");
		fs.writeFileSync(marker, "keep my synthetic progress");
		assert.throws(() => cli("preview", "retry-fixture", "--worktree", worktree), /Configure unattended preview enrollment/);
		failed.previewEnrollment = false;
		failed.tailnetHost = null;
		fs.writeFileSync(filename, JSON.stringify(failed));
		const retried = JSON.parse(cli("preview", "retry-fixture", "--worktree", worktree));
		assert.equal(retried.ticket, "retry-fixture");
		assert.equal(fs.readFileSync(marker, "utf8"), "keep my synthetic progress");
	} finally {
		cli("stop");
	}
});

test("provider refusal is redacted and cannot commit a binding or silently use manual login", async context => {
	const { input, controller, enrollment } = await fixture(context);
	enrollment.configure(input, "tag:learnharness-preview");
	controller.refuse = true;
	await assert.rejects(enrollment.ensure("first", { normalHostname: "normal.fixture.ts.net" }), error => {
		assert.match(error.message, /Unattended preview enrollment failed/);
		assert.ok(!error.message.includes(syntheticSecret));
		return true;
	});
	assert.equal(controller.commands.filter(command => command[1] === "up").length, 1);
});

test("pinned node changes and lost persistent state refuse identity replacement", async context => {
	const { input, controller, crash, enrollment } = await fixture(context);
	enrollment.configure(input, "tag:learnharness-preview");
	const options = { normalHostname: "normal.fixture.ts.net" };
	const binding = await enrollment.ensure("first", options);
	controller.nodes.get("first").node.Self.ID = "outsider";
	await assert.rejects(enrollment.ensure("first", { ...options, binding }), /node identity changed/);
	controller.nodes.get("first").node.Self.ID = binding.nodeId;
	await crash("first");
	fs.unlinkSync(controller.nodes.get("first").record.stateFile);
	await assert.rejects(enrollment.ensure("first", { ...options, binding }), /persistent node state is missing/);
	assert.equal(controller.launches.length, 1);
});

test("credential rotation keeps established identities and rejected changes preserve private bytes", async context => {
	const { input, registry, enrollment } = await fixture(context);
	enrollment.configure(input, "tag:learnharness-preview");
	const credential = path.join(registry, "preview-enrollment/credential");
	assert.equal(fs.statSync(credential).mode & 0o777, 0o600);
	const before = fs.readFileSync(credential);
	assert.throws(() => enrollment.configure(input, "tag:other"), /Cannot silently change/);
	assert.deepEqual(fs.readFileSync(credential), before);
	fs.writeFileSync(input, "DO_NOT_PRINT_THIS_INVALID_SECRET");
	assert.throws(() => enrollment.configure(input, "tag:learnharness-preview"), error => {
		assert.ok(!error.message.includes("DO_NOT_PRINT"));
		return true;
	});
	assert.deepEqual(fs.readFileSync(credential), before);
	fs.writeFileSync(input, syntheticSecret + "-rotated");
	enrollment.configure(input, "tag:learnharness-preview");
	assert.equal(fs.readFileSync(credential, "utf8"), syntheticSecret + "-rotated?ephemeral=false&preauthorized=true");
});

test("unrecognized setup/node directories and live unowned sockets are never adopted or deleted", async context => {
	const { input, registry, enrollment, controller, crash } = await fixture(context);
	const storage = path.join(registry, "preview-enrollment");
	fs.mkdirSync(storage, { mode: 0o700 });
	const sentinel = path.join(storage, "unrelated-profile");
	fs.writeFileSync(sentinel, "preserve");
	assert.throws(() => enrollment.configure(input, "tag:learnharness-preview"), /Unrecognized/);
	assert.equal(fs.readFileSync(sentinel, "utf8"), "preserve");
	fs.unlinkSync(sentinel);
	enrollment.configure(input, "tag:learnharness-preview");
	const nodeDirectory = path.join(storage, "nodes/unknown");
	fs.mkdirSync(nodeDirectory, { recursive: true, mode: 0o700 });
	fs.writeFileSync(path.join(nodeDirectory, "history"), "preserve history");
	await assert.rejects(enrollment.ensure("unknown", { normalHostname: "normal.fixture.ts.net" }), /Unrecognized/);
	assert.equal(fs.readFileSync(path.join(nodeDirectory, "history"), "utf8"), "preserve history");
	const binding = await enrollment.ensure("first", { normalHostname: "normal.fixture.ts.net" });
	await crash("first");
	const outsider = net.createServer();
	await new Promise(resolve => outsider.listen(binding.socketPath, resolve));
	context.after(() => new Promise(resolve => outsider.close(resolve)));
	await assert.rejects(enrollment.ensure("first", { normalHostname: "normal.fixture.ts.net", binding }), /unowned listener/);
	assert.equal(outsider.listening, true);
	assert.equal(controller.launches.length, 1);
});

test("manual bindings and unconfigured registries never acquire enrollment authority", async () => {
	const manual = { id: "manual", previewHost: { hostname: "manual.fixture.ts.net", origin: "https://manual.fixture.ts.net/" } };
	await ensurePreviewNode("/not-a-real-enrollment-registry", { previewEnrollment: true }, manual);
	assert.equal(manual.previewHost.hostname, "manual.fixture.ts.net");
	const unconfigured = { id: "unconfigured" };
	await ensurePreviewNode("/not-a-real-enrollment-registry", {}, unconfigured);
	assert.equal(unconfigured.previewHost, undefined);
});

test("actual local configuration CLI stores no secret in status and refuses a running manager", async context => {
	const { directory, input, registry } = await fixture(context);
	const root = path.dirname(execFileSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { encoding: "utf8" }).trim());
	const state = { root, tailnetHost: "normal.fixture.ts.net", tickets: {}, slots: [], queue: [], manager: null };
	const filename = path.join(registry, "registry.json");
	fs.writeFileSync(filename, JSON.stringify(state), { mode: 0o600 });
	const cli = (...argumentsList) => execFileSync(process.execPath, ["scripts/ticket.mjs", ...argumentsList, "--root", root, "--state-dir", registry], {
		cwd: process.cwd(), env: { PATH: process.env.PATH, HOME: directory }, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
	});
	const output = cli("configure-enrollment", "--secret-file", input);
	assert.equal(JSON.parse(output).unattended, true);
	assert.ok(!output.includes(syntheticSecret));
	const status = cli("status");
	assert.equal(JSON.parse(status).previewEnrollment, true);
	assert.ok(!status.includes(syntheticSecret));
	state.manager = ownerOf(process.pid);
	fs.writeFileSync(filename, JSON.stringify(state));
	assert.throws(() => cli("configure-enrollment", "--secret-file", input), /Stop this registry/);
});
