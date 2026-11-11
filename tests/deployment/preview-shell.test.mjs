import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { spawn } from "node:child_process";
import { once } from "node:events";
import test from "node:test";
import { createRequire } from "node:module";
import { LIFETIME_MS, processIdentity, monotonicMilliseconds, bootIdentity, validateConfiguration, readConfiguration, controlFor, allowsRequest } from "../../electron/preview-shell.cjs";

const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, "../..");

test("trusted preview configuration pins source, origin, lifetime and live process identities", async () => {
	const directory = fs.mkdtempSync(path.join(os.tmpdir(), "zz-prove-it-shell-schema-"));
	const server = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { env: {}, stdio: "ignore" });
	await once(server, "spawn");
	const now = monotonicMilliseconds();
	const configuration = {
		version: 1, ticketId: "zz-prove-it-preview", sourceId: "a".repeat(64), lease: "synthetic-lease-0001",
		origin: "https://preview.example.test", normalOrigin: "https://normal.example.test",
		launch: { started: now, deadline: now + LIFETIME_MS, boot: bootIdentity() },
		manager: processIdentity(), server: processIdentity(server.pid), controlFile: path.join(directory, "control.json"),
	};
	const filename = path.join(directory, "shell.json");
	const write = (target, value) => fs.writeFileSync(target, JSON.stringify(value), { mode: 0o600 });
	try {
		write(filename, configuration); write(configuration.controlFile, controlFor(configuration));
		assert.deepEqual(readConfiguration(filename), configuration);
		for (const change of [
			value => { value.unexpected = true; },
			value => { value.origin = "https://normal.example.test:9443"; },
			value => { value.origin = "http://preview.example.test"; },
			value => { value.origin = "https://127.0.0.2"; },
			value => { value.origin = "https://preview.localhost"; },
			value => { value.origin += "/path"; },
			value => { value.sourceId = "../../profile"; },
			value => { value.launch.boot = "previous-boot"; },
			value => { value.launch.deadline++; },
			value => { value.manager.start = "1"; },
			value => { value.server.pid = process.pid; },
			value => { value.launch.extra = true; },
		]) {
			const changed = structuredClone(configuration); change(changed);
			assert.throws(() => validateConfiguration(changed));
		}
		assert.throws(() => validateConfiguration(configuration, { now: configuration.launch.deadline }));
		assert.throws(() => validateConfiguration(configuration, { now: now - 1 }));
		write(configuration.controlFile, controlFor(configuration, "revoked"));
		assert.throws(() => readConfiguration(filename));
		write(configuration.controlFile, { ...controlFor(configuration), lease: "replacement-lease" });
		assert.throws(() => readConfiguration(filename));
		write(configuration.controlFile, controlFor(configuration));
		fs.chmodSync(filename, 0o644); assert.throws(() => readConfiguration(filename)); fs.chmodSync(filename, 0o600);
		const symlink = path.join(directory, "link.json"); fs.symlinkSync(filename, symlink); assert.throws(() => readConfiguration(symlink));
		server.kill(); await once(server, "exit");
		assert.throws(() => readConfiguration(filename));
	} finally {
		if (server.exitCode === null && server.signalCode === null) { server.kill(); await once(server, "exit"); }
		fs.rmSync(directory, { recursive: true, force: true });
	}
});

test("network policy allows only selected origin and its websocket, never files or external origins", () => {
	const origin = "https://preview.example.test";
	for (const url of [origin, `${origin}/api/chat`, "wss://preview.example.test/socket"]) assert.equal(allowsRequest(url, origin), true, url);
	for (const url of ["https://normal.example.test", `${origin}:9443`, "file:///etc/passwd", "data:text/html,attack", `blob:${origin}/identifier`, "https://preview.example.test.evil.test", "https://name:secret@preview.example.test", "http://preview.example.test", "ws://preview.example.test", "garbage"]) assert.equal(allowsRequest(url, origin), false, url);
});

test("preview dispatch never loads normal modules, claims normal ownership, or initializes main", () => {
	const source = fs.readFileSync(path.join(root, "electron/main.cjs"), "utf8");
	for (const preview of ["--preview=/private/trusted.json", "--preview=", "--preview", "--preview-diagnostic"]) {
		const calls = [];
		vm.runInNewContext(source, {
			process: { argv: ["electron", preview] },
			require: name => { calls.push(name); assert.equal(name, "./preview-shell.cjs"); return { startPreviewShell: () => calls.push("preview-start") }; },
		});
		assert.deepEqual(calls, ["./preview-shell.cjs", "preview-start"]);
	}
});

test("normal development startup preserves name, separate dev profile and ownership gate", () => {
	const calls = [];
	const app = {
		isPackaged: false,
		setName: name => calls.push(["name", name]),
		getPath: name => { assert.equal(name, "userData"); return "/synthetic/LearnHarness"; },
		setPath: (name, value) => calls.push(["path", name, value]),
		requestSingleInstanceLock: () => { calls.push(["normal-lock"]); return false; },
		quit: () => calls.push(["quit"]),
	};
	vm.runInNewContext(fs.readFileSync(path.join(root, "electron/main.cjs"), "utf8"), {
		__dirname: path.join(root, "electron"), console,
		process: { argv: ["electron", "."], platform: "linux", env: { LH_DEV_URL: "http://127.0.0.1:4000" }, on: event => calls.push(["process-handler", event]) },
		require: name => {
			assert.notEqual(name, "./preview-shell.cjs");
			if (name === "electron") return { app };
			if (name.startsWith("node:")) return require(name);
			return {};
		},
	});
	assert.deepEqual(calls.slice(0, 4), [["name", "LearnHarness"], ["path", "userData", "/synthetic/LearnHarness-dev"], ["normal-lock"], ["quit"]]);
});
