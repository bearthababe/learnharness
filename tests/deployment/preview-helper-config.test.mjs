import assert from "node:assert/strict";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import test from "node:test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { validatePreviewHelper } from "../../scripts/lib/preview-helper-config.mjs";

test("local CLI configures only private helper administration outside preview mounts", async () => {
	const directory = fs.mkdtempSync("/tmp/lh-helper-config-");
	const helperDirectory = path.join(directory, "helper");
	fs.mkdirSync(helperDirectory, { mode: 0o700 });
	const server = net.createServer(socket => socket.destroy());
	const control = path.join(helperDirectory, "control.sock");
	await new Promise(resolve => server.listen(control, resolve));
	fs.chmodSync(control, 0o600);
	const root = path.resolve(import.meta.dirname, "../..");
	const state = { root, tickets: {} };
	const execute = promisify(execFile);
	const cli = (...args) => execute(process.execPath, [path.join(root, "scripts/ticket.mjs"), ...args, "--root", root, "--state-dir", path.join(directory, "registry")]);
	try {
		assert.equal(validatePreviewHelper(helperDirectory, state), helperDirectory);
		fs.symlinkSync(helperDirectory, path.join(directory, "alias"));
		assert.throws(() => validatePreviewHelper(path.join(directory, "alias"), state), /symlinks/);
		assert.throws(() => validatePreviewHelper(helperDirectory, { root, tickets: { synthetic: { profile: helperDirectory } } }), /separate/);
		fs.chmodSync(control, 0o666);
		assert.throws(() => validatePreviewHelper(helperDirectory, state), /owner-only Unix socket/);
		fs.chmodSync(control, 0o600);
		fs.chmodSync(helperDirectory, 0o755);
		await assert.rejects(cli("configure-helper", "--helper-directory", helperDirectory));
		fs.chmodSync(helperDirectory, 0o700);
		await cli("init", "--ports", "29100,29101,29102");
		const configured = JSON.parse((await cli("configure-helper", "--helper-directory", helperDirectory)).stdout);
		assert.equal(configured.helperDirectory, helperDirectory);
		assert.match(configured.access, /default-deny/);
		const registry = JSON.parse(fs.readFileSync(path.join(directory, "registry/registry.json"), "utf8"));
		assert.equal(registry.helperDirectory, helperDirectory);
		assert.equal(registry.manager, null);
		assert.deepEqual(registry.queue, []);
	} finally {
		await new Promise(resolve => server.close(resolve));
		fs.rmSync(directory, { recursive: true, force: true });
	}
});
