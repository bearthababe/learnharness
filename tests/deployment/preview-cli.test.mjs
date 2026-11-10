import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";
import { choosePort, delay, freePort, git, locked, readState } from "../../scripts/lib/ticket-state.mjs";

test("CLI uses an external disposable registry, rejects stale release, preserves unowned listeners and blocks tailnet allocation", async () => {
	const source = path.resolve(import.meta.dirname, "../..");
	const parent = fs.mkdtempSync("/tmp/lh-cli-preview-");
	const root = path.join(parent, "repository");
	const worktree = path.join(parent, "worktree");
	const directory = path.join(parent, "state");
	fs.mkdirSync(root);
	git(root, "init", "--initial-branch=main");
	git(root, "-c", "user.name=CLI Proof", "-c", "user.email=cli-proof@example.invalid", "commit", "--allow-empty", "-m", "Disposable CLI fixture");
	git(root, "worktree", "add", "--detach", worktree, "HEAD");
	const execute = promisify(execFile);
	const cli = async (...args) => JSON.parse((await execute(process.execPath, [path.join(source, "scripts", "ticket.mjs"), ...args, "--root", root, "--state-dir", directory])).stdout);
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
		git(root, "checkout", "--detach", "HEAD");
		await assert.rejects(cli("init", "--ports", ports.join(","), "--origin-port", "28900", "--repository", "zz-prove-it/project"), /Project root must stay on main/);
		assert.equal(fs.existsSync(path.join(directory, "registry.json")), false);
		git(root, "checkout", "main");
		await cli("init", "--ports", ports.join(","), "--origin-port", "28900", "--repository", "zz-prove-it/project");
		await cli("preview", "cli-check", "--worktree", worktree);
		const queued = await cli("status");
		assert.deepEqual(queued.queue, ["cli-check"]);
		assert.match(queued.deploymentAcceptance, /BLOCKED/);
		assert.equal(queued.tickets["cli-check"].worktree, worktree);
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
		assert.equal(git(root, "branch", "--show-current"), "main");
		fs.writeFileSync(path.join(directory, "proof.json"), JSON.stringify({ queued, refused, unownedListenersPreserved: ports.slice(1) }, null, 2));
		console.log(`CLI fixture evidence: ${directory}/proof.json`);
	} finally {
		try {
			if (fs.existsSync(path.join(directory, "registry.json"))) await cli("stop");
		} finally {
			await Promise.all(listeners.filter(listener => listener.listening).map(listener => new Promise(resolve => listener.close(resolve))));
		}
	}
});
