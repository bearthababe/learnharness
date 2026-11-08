import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { once } from "node:events";
import test from "node:test";
import { desktopArguments, desktopConfiguration, desktopEnvironment, stopPreviewDesktop } from "../../scripts/lib/preview-desktop.mjs";
import { newLaunch } from "../../scripts/lib/preview-supervisor.mjs";
import { ownerOf } from "../../scripts/lib/ticket-state.mjs";

test("native launcher explicitly selects Wayland without weakening the shell argument allowlist", () => {
	const configFile = "/private/lease/preview.json";
	assert.deepEqual(desktopArguments(configFile, { WAYLAND_DISPLAY: "wayland-1" }), [`--preview=${configFile}`, "--ozone-platform=wayland"]);
	assert.deepEqual(desktopArguments(configFile, { WAYLAND_DISPLAY: "wayland-1", DISPLAY: ":0" }), [`--preview=${configFile}`, "--ozone-platform=wayland"]);
	assert.deepEqual(desktopArguments(configFile, { DISPLAY: ":0" }), [`--preview=${configFile}`]);
	assert.deepEqual(desktopArguments(configFile, { ELECTRON_FLAGS: "--no-sandbox", NODE_OPTIONS: "--inspect" }), [`--preview=${configFile}`]);
});

test("desktop launcher pins actual manager/runtime source and unchanged launch deadline", async () => {
	const child = spawn("/usr/bin/sleep", ["60"]);
	await once(child, "spawn");
	try {
		const ticket = { id: "isolated-preview", claim: "unique-lease-0123456789", preview: "running", process: ownerOf(child.pid), sandbox: { sourceHash: "a".repeat(64) }, origin: "https://preview.synthetic.ts.net/", launch: newLaunch() };
		const configuration = desktopConfiguration(ticket, ownerOf(process.pid), "https://normal.synthetic.ts.net:8452", "/tmp/owned-preview/control.json");
		assert.equal(configuration.launch.started, ticket.launch.started);
		assert.equal(configuration.launch.deadline, ticket.launch.deadline);
		assert.equal(configuration.sourceId, ticket.sandbox.sourceHash);
		assert.equal(configuration.server.pid, child.pid);
		assert.equal(configuration.manager.pid, process.pid);
		assert.throws(() => desktopConfiguration(ticket, ownerOf(process.pid), "https://preview.synthetic.ts.net:8452", configuration.controlFile), /trust boundary refused/);
		assert.throws(() => desktopConfiguration({ ...ticket, preview: "building" }, ownerOf(process.pid), configuration.normalOrigin, configuration.controlFile), /Wait for/);
		assert.throws(() => desktopConfiguration({ ...ticket, launch: { ...ticket.launch, deadline: ticket.launch.deadline + 1 } }, ownerOf(process.pid), configuration.normalOrigin, configuration.controlFile), /trust boundary refused/);
	} finally { child.kill(); await once(child, "exit"); }
});

test("native launch environment is allowlisted and stale shell revocation preserves replacement", async () => {
	const directory = fs.mkdtempSync("/tmp/lh-desktop-launch-");
	const original = process.env.LH_AUTH_FILE;
	process.env.LH_AUTH_FILE = "must-not-inherit";
	try {
		const environment = desktopEnvironment(directory);
		assert.equal(environment.LH_AUTH_FILE, undefined);
		assert.equal(environment.ELECTRON_RUN_AS_NODE, undefined);
		assert.equal(environment.NODE_OPTIONS, undefined);
		assert.equal(environment.HOME, path.join(directory, "home"));
		for (const suffix of ["home", "config", "cache", "data"]) assert.equal(fs.statSync(path.join(directory, suffix)).mode & 0o077, 0);
		const controlFile = path.join(directory, "control.json");
		fs.writeFileSync(controlFile, "replacement");
		const desktop = { lease: "replacement", controlFile, process: null };
		await stopPreviewDesktop(desktop, "stale");
		assert.equal(fs.readFileSync(controlFile, "utf8"), "replacement");
		await stopPreviewDesktop(desktop, "replacement");
		assert.equal(fs.existsSync(controlFile), false);
	} finally {
		if (original === undefined) delete process.env.LH_AUTH_FILE; else process.env.LH_AUTH_FILE = original;
		fs.rmSync(directory, { recursive: true, force: true });
	}
});
