import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";
import { choosePort, delay, freePort, locked, readState } from "../../scripts/lib/ticket-state.mjs";

test("CLI uses an external disposable registry, rejects stale release, preserves unowned listeners and blocks tailnet allocation", async () => {
	const root = path.resolve(import.meta.dirname, "../..");
	const directory = fs.mkdtempSync("/tmp/lh-cli-preview-");
	const execute = promisify(execFile);
	const cli = async (...args) => JSON.parse((await execute(process.execPath, [path.join(root, "scripts", "ticket.mjs"), ...args, "--root", root, "--state-dir", directory])).stdout);
	const ports = [];
	const listeners = [];
	for (let index = 0; index < 3; index++) {
		const port = await choosePort(28800 + index, ports);
		ports.push(port);
		const listener = net.createServer(socket => socket.end("unowned-by-manager"));
		await new Promise(resolve => listener.listen(port, "127.0.0.1", resolve));
		listeners.push(listener);
	}
	try {
		await cli("init", "--ports", ports.join(","), "--origin-port", "28900");
		await cli("preview", "cli-check", "--worktree", root);
		const queued = await cli("status");
		assert.deepEqual(queued.queue, ["cli-check"]);
		assert.match(queued.deploymentAcceptance, /BLOCKED/);
		assert.equal(queued.tickets["cli-check"].worktree, root);
		assert.equal(queued.tickets["cli-check"].servingRevision, null);
		assert.equal(queued.tickets["cli-check"].servingSourceHash, null);
		await assert.rejects(cli("release", "cli-check", "--lease", "stale-notification"), /Stale preview lease/);
		assert.deepEqual(readState(directory).queue, ["cli-check"]);
		const marker = path.join(queued.tickets["cli-check"].profile, "retained-synthetic");
		fs.writeFileSync(marker, "retained");
		await cli("release", "cli-check");
		assert.equal(fs.readFileSync(marker, "utf8"), "retained");
		await locked(directory, state => { state.tailnetHost = "synthetic.invalid.ts.net"; });
		await new Promise(resolve => listeners[0].close(resolve));
		await cli("preview", "cli-check");
		const deadline = Date.now() + 10_000;
		while (readState(directory).tickets["cli-check"].preview !== "error") { assert.ok(Date.now() < deadline); await delay(50); }
		const refused = await cli("status");
		assert.match(refused.tickets["cli-check"].error, /BLOCKED.*dedicated per-preview hostname/);
		assert.equal(refused.tickets["cli-check"].origin, queued.tickets["cli-check"].origin);
		assert.ok(refused.slots.every(slot => !slot.ticket));
		await cli("stop");
		assert.equal(await freePort(ports[1]), false);
		assert.equal(await freePort(ports[2]), false);
		fs.writeFileSync(path.join(directory, "proof.json"), JSON.stringify({ queued, refused, unownedListenersPreserved: ports.slice(1) }, null, 2));
		console.log(`CLI fixture evidence: ${directory}/proof.json`);
	} finally {
		await cli("stop");
		await Promise.all(listeners.filter(listener => listener.listening).map(listener => new Promise(resolve => listener.close(resolve))));
	}
});
