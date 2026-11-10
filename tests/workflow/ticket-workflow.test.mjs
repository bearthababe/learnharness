import assert from "node:assert/strict";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { test } from "node:test";
import { execFileSync, spawn } from "node:child_process";
import { alive, git, readState } from "../../scripts/lib/ticket-state.mjs";
import { fixture } from "./fixture.mjs";

test("1–2: independent fetched bases, main PR targeting and selectable installed skill", async () => {
	const environment = await fixture();
	try {
		const first = await environment.attach("first");
		const second = await environment.attach("second", "full-send");
		assert.equal(first.prepared.base, git(environment.root, "rev-parse", "origin/main"));
		assert.equal(first.prepared.handoff.startFromOrigin, true);
		assert.equal(second.prepared.handoff.baseRef, "origin/main");
		assert.equal(git(environment.root, "branch", "--show-current"), "main");
		assert.notEqual(first.worktree, second.worktree);
		const stop = await environment.cli("delivery", "first");
		const send = await environment.cli("delivery", "second");
		assert.equal(stop.mergeAuthority, "never");
		assert.equal(send.mergeAuthority, "selected-skill-only");
		assert.match(stop.skill, /full-stop\/SKILL.md$/);
		assert.match(send.skill, /full-send\/SKILL.md$/);
		assert.match(fs.readFileSync(stop.skill, "utf8"), /Never merge/);
		assert.match(fs.readFileSync(send.skill, "utf8"), /Merge.*once the merge gate passes/);
		environment.setPR("first", 1, "OPEN", { baseRefName: "wrong-base" });
		await assert.rejects(environment.cli("pr", "first", "--pr", "1"), /target remote main/);
		environment.setPR("first", 1);
		const pr = await environment.cli("pr", "first", "--pr", "1");
		assert.equal(pr.baseRefName, "main");
		assert.equal(pr.headRefOid, git(first.worktree, "rev-parse", "HEAD"));
	} finally { await environment.stop(); }
});

test("3–4,8: concurrent claims, nonblocking fourth request and automatic idempotent merge release", async () => {
	const environment = await fixture();
	try {
		for (const id of ["one", "two", "three", "four"]) await environment.attach(id, id === "four" ? "full-send" : "full-stop");
		await Promise.all(["one", "two", "three"].map(id => environment.cli("preview", id)));
		const allocated = await environment.waitFor(state => state.slots.every(slot => slot.ticket && state.tickets[slot.ticket].preview === "running"), "three running allocations");
		assert.equal(new Set(allocated.slots.map(slot => slot.ticket)).size, 3);
		assert.equal(new Set(allocated.slots.map(slot => slot.claim)).size, 3);
		const owners = allocated.slots.map(slot => ({ ...slot }));
		const processes = Object.fromEntries(["one", "two", "three"].map(id => [id, allocated.tickets[id].process]));
		await environment.cli("preview", "four");
		const queued = await environment.cli("status");
		assert.deepEqual(queued.queue, ["four"]);
		assert.deepEqual(queued.slots, owners);
		for (const id of ["one", "two", "three"]) assert.ok(alive(processes[id]));
		const delivery = await environment.cli("delivery", "four");
		assert.equal(delivery.previewBlocksDelivery, false);
		assert.equal(delivery.mergeAuthority, "selected-skill-only");
		environment.setPR("four", 4);
		await environment.cli("pr", "four", "--pr", "4");
		environment.setPR("one", 1);
		await environment.cli("pr", "one", "--pr", "1");
		fs.writeFileSync(path.join(allocated.tickets.one.profile, "keep.txt"), "retained profile");
		environment.setPR("one", 1, "MERGED");
		const released = await environment.waitFor(state => state.tickets.one.merged && state.tickets.four.preview === "running", "automatic merge release");
		assert.ok(!alive(processes.one));
		assert.ok(alive(processes.two) && alive(processes.three));
		assert.equal(fs.readFileSync(path.join(allocated.tickets.one.profile, "keep.txt"), "utf8"), "retained profile");
		const newClaim = released.tickets.four.claim;
		await environment.cli("observe");
		await environment.cli("observe");
		assert.equal(readState(environment.state).tickets.four.claim, newClaim);
		assert.ok(alive(readState(environment.state).tickets.four.process));
	} finally { await environment.stop(); }
});

test("3: an unowned listener survives allocation and stop unchanged", async () => {
	const environment = await fixture();
	const owner = net.createServer(socket => socket.end("external owner"));
	await new Promise(resolve => owner.listen(environment.ports[0], "127.0.0.1", resolve));
	try {
		for (const id of ["one", "two", "three"]) await environment.attach(id);
		await Promise.all(["one", "two", "three"].map(id => environment.cli("preview", id)));
		const state = await environment.waitFor(current => current.slots.filter(slot => slot.ticket).length === 2, "two unoccupied slots");
		assert.equal(state.slots[0].ticket, null);
		assert.match(state.slots[0].error, /unowned/);
		assert.equal(state.queue.length, 1);
		assert.ok(owner.listening);
	} finally { await environment.stop(); assert.ok(owner.listening); await new Promise(resolve => owner.close(resolve)); }
});

test("5,7: startup refuses dotenv, sanitizes ambient environment and retains profile on release", async () => {
	const environment = await fixture();
	try {
		const attached = await environment.attach("isolated");
		fs.writeFileSync(path.join(attached.worktree, ".env.local"), "ZZ_PROVE_SHOULD_NOT_LOAD=synthetic\n");
		await environment.cli("preview", "isolated");
		await environment.waitFor(state => state.tickets.isolated.preview === "error", "dotenv refusal");
		assert.match(readState(environment.state).tickets.isolated.error, /dotenv/);
		fs.unlinkSync(path.join(attached.worktree, ".env.local"));
		await environment.cli("preview", "isolated");
		const state = await environment.waitFor(current => fs.existsSync(path.join(current.tickets.isolated.profile, "data", "launch.json")), "fake app launch");
		const launched = JSON.parse(fs.readFileSync(path.join(state.tickets.isolated.profile, "data", "launch.json"), "utf8"));
		assert.deepEqual({ ambient: launched.ambient, desktop: launched.desktop }, { ambient: false, desktop: false });
		assert.equal(launched.home, "/state/home");
		await environment.cli("release", "isolated");
		await environment.waitFor(current => current.tickets.isolated.preview === "none", "release");
		assert.ok(fs.existsSync(path.join(state.tickets.isolated.profile, "data", "launch.json")));
	} finally { await environment.stop(); }
});

test("3: tailnet previews refuse missing dedicated identities without changing existing mappings", async () => {
	const host = "zz-prove-it.tailproof.ts.net";
	const environment = await fixture({ tailnetHost: host, httpsPorts: [24500, 24501, 24502], fakeTailnet: true });
	const authorized = JSON.parse(fs.readFileSync(environment.tailnetFile, "utf8"));
	const external = { TCP: { 24500: { HTTPS: true } }, Web: { [`${host}:24500`]: { Handlers: { "/": { Proxy: "http://127.0.0.1:29999" } } } }, AllowFunnel: { [`${host}:24502`]: true } };
	fs.writeFileSync(environment.tailnetFile, JSON.stringify(external));
	try {
		await assert.rejects(environment.cli("configure-tailnet", "--tailnet-host", host, "--https-ports", "24500,24501,24502"), /Existing review route does not match/);
		fs.writeFileSync(environment.tailnetFile, JSON.stringify({ ...authorized, AllowFunnel: { [`${host}:24502`]: true } }));
		await assert.rejects(environment.cli("configure-tailnet", "--tailnet-host", host, "--https-ports", "24500,24501,24502"), /Public Funnel review routes are forbidden/);
		fs.writeFileSync(environment.tailnetFile, JSON.stringify(external));
		await environment.attach("one");
		await environment.cli("preview", "one");
		const state = await environment.waitFor(current => current.tickets.one.preview === "error", "missing dedicated identity refusal");
		assert.match(state.tickets.one.error, /dedicated per-preview hostname/);
		assert.ok(state.slots.every(slot => slot.ticket === null));
		assert.equal(state.tickets.one.process, undefined);
	} finally {
		await environment.stop();
		assert.deepEqual(JSON.parse(fs.readFileSync(environment.tailnetFile, "utf8")), external);
	}
});

test("9: in-use/dirty/ignored worktrees are preserved; safe completion archives data and preserves dirty root", async () => {
	const environment = await fixture();
	try {
		const attached = await environment.attach("complete");
		fs.writeFileSync(path.join(attached.worktree, "ticket.txt"), "accepted source\n");
		git(attached.worktree, "add", "ticket.txt");
		git(attached.worktree, "commit", "-m", "Disposable ticket");
		git(environment.root, "push", "origin", "ticket/complete");
		const integration = path.join(environment.directory, "integration");
		execFileSync("git", ["clone", "--branch", "main", environment.remote, integration], { stdio: "ignore" });
		git(integration, "config", "user.name", "Workflow Proof");
		git(integration, "config", "user.email", "workflow-proof@example.invalid");
		git(integration, "merge", "--no-ff", "--no-edit", "origin/ticket/complete");
		git(integration, "push", "origin", "main");
		environment.setPR("complete", 9, "MERGED");
		await environment.cli("pr", "complete", "--pr", "9");
		await environment.cli("observe");
		await assert.rejects(environment.cli("finish", "complete"), /still uses/);
		await environment.cli("idle", "complete", "--thread", "zz-prove-it-t3-complete");
		const active = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { cwd: attached.worktree, stdio: "ignore" });
		try { await assert.rejects(environment.cli("finish", "complete"), /process still uses/); }
		finally { active.kill("SIGTERM"); await new Promise(resolve => active.once("exit", resolve)); }
		fs.writeFileSync(path.join(attached.worktree, "ticket.txt"), "unrelated work\n");
		await assert.rejects(environment.cli("finish", "complete"), /dirty\/untracked/);
		fs.writeFileSync(path.join(attached.worktree, "ticket.txt"), "accepted source\n");
		await assert.rejects(environment.cli("finish", "complete"), /Ignored artifacts retained/);
		assert.equal(git(environment.root, "rev-parse", "HEAD"), git(environment.root, "rev-parse", "origin/main"));
		fs.writeFileSync(path.join(environment.root, "README.md"), "unrelated root edit\n");
		const completed = await environment.cli("finish", "complete", "--archive", path.join(environment.directory, "archive"));
		assert.equal(completed.rootUpdated, false);
		assert.ok(fs.existsSync(path.join(completed.archive, "node_modules")));
		assert.ok(fs.existsSync(completed.profileRetained));
		assert.ok(!fs.existsSync(attached.worktree));
		assert.equal(fs.readFileSync(path.join(environment.root, "README.md"), "utf8"), "unrelated root edit\n");
		assert.equal(git(environment.root, "branch", "--show-current"), "main");
	} finally { await environment.stop(); }
});

test("9: squash cleanup verifies the exact accepted head/files before removing a branch", async () => {
	const environment = await fixture();
	try {
		const attached = await environment.attach("squashed");
		fs.writeFileSync(path.join(attached.worktree, "squashed.txt"), "accepted squash\n");
		git(attached.worktree, "add", "squashed.txt");
		git(attached.worktree, "commit", "-m", "Disposable squash ticket");
		git(environment.root, "push", "origin", "ticket/squashed");
		const integration = path.join(environment.directory, "integration");
		execFileSync("git", ["clone", "--branch", "main", environment.remote, integration], { stdio: "ignore" });
		git(integration, "config", "user.name", "Workflow Proof");
		git(integration, "config", "user.email", "workflow-proof@example.invalid");
		git(integration, "merge", "--squash", "origin/ticket/squashed");
		git(integration, "commit", "-m", "Accepted disposable squash");
		git(integration, "push", "origin", "main");
		environment.setPR("squashed", 10, "MERGED", { mergeCommit: { oid: git(integration, "rev-parse", "HEAD") } });
		await environment.cli("pr", "squashed", "--pr", "10");
		await environment.cli("observe");
		await environment.cli("idle", "squashed", "--thread", "zz-prove-it-t3-squashed");
		const completed = await environment.cli("finish", "squashed", "--archive", path.join(environment.directory, "archive"));
		assert.equal(completed.rootUpdated, true);
		assert.ok(!fs.existsSync(attached.worktree));
		assert.ok(fs.existsSync(completed.profileRetained));
	} finally { await environment.stop(); }
});

test("8: manager recovery preserves release and concurrently observed merge cancellation", async () => {
	const environment = await fixture();
	try {
		for (const id of ["cancelled", "merged", "next"]) await environment.attach(id);
		await environment.cli("preview", "cancelled");
		await environment.cli("preview", "merged");
		const running = await environment.waitFor(state => ["cancelled", "merged"].every(id => state.tickets[id].preview === "running"), "two running previews");
		environment.setPR("merged", 21);
		await environment.cli("pr", "merged", "--pr", "21");
		process.kill(running.manager.pid, "SIGSTOP");
		process.kill(-running.tickets.cancelled.process.pid, "SIGSTOP");
		await environment.cli("release", "cancelled");
		process.kill(running.manager.pid, "SIGKILL");
		await environment.waitFor(state => !alive(state.manager), "crashed manager");
		await environment.cli("preview", "next");
		await environment.waitFor(state => state.manager?.ready, "recovery manager");
		environment.setPR("merged", 21, "MERGED");
		await environment.cli("observe");
		const recovered = await environment.waitFor(state => !state.tickets.cancelled.claim && !state.tickets.merged.claim && state.tickets.next.preview === "running", "cancelled recovery");
		assert.equal(recovered.tickets.cancelled.preview, "none");
		assert.equal(recovered.tickets.merged.preview, "none");
		assert.deepEqual(recovered.queue, []);
		assert.ok(!alive(running.tickets.cancelled.process));
		assert.ok(!alive(running.tickets.merged.process));
	} finally { await environment.stop(); }
});

test("9: squash cleanup rejects a rename whose deleted source remains in main", async () => {
	const environment = await fixture();
	try {
		const attached = await environment.attach("renamed");
		git(attached.worktree, "mv", "README.md", "renamed.md");
		git(attached.worktree, "commit", "-m", "Rename disposable source");
		git(environment.root, "push", "origin", "ticket/renamed");
		const integration = path.join(environment.directory, "integration");
		execFileSync("git", ["clone", "--branch", "main", environment.remote, integration], { stdio: "ignore" });
		git(integration, "config", "user.name", "Workflow Proof");
		git(integration, "config", "user.email", "workflow-proof@example.invalid");
		fs.copyFileSync(path.join(integration, "README.md"), path.join(integration, "renamed.md"));
		git(integration, "add", "renamed.md");
		git(integration, "commit", "-m", "Incorrect squash retains rename source");
		git(integration, "push", "origin", "main");
		environment.setPR("renamed", 22, "MERGED", { mergeCommit: { oid: git(integration, "rev-parse", "HEAD") } });
		await environment.cli("pr", "renamed", "--pr", "22");
		await environment.cli("observe");
		await environment.cli("idle", "renamed", "--thread", "zz-prove-it-t3-renamed");
		await assert.rejects(environment.cli("finish", "renamed", "--archive", path.join(environment.directory, "archive")), /Accepted squash result differs at README.md/);
		assert.ok(fs.existsSync(attached.worktree));
		assert.equal(git(environment.root, "rev-parse", "ticket/renamed"), git(attached.worktree, "rev-parse", "HEAD"));
	} finally { await environment.stop(); }
});

test("exploratory previews need no ticket, PR or delivery skill and share the ticket queue", async () => {
	const environment = await fixture();
	try {
		for (const id of ["one", "two", "three"]) await environment.attach(id);
		await Promise.all(["one", "two", "three"].map(id => environment.cli("preview", id)));
		const full = await environment.waitFor(state => state.slots.every(slot => slot.ticket && state.tickets[slot.ticket].preview === "running"), "full running ticket pool");
		const worktree = environment.exploration("spike");
		const head = git(worktree, "rev-parse", "HEAD");
		fs.writeFileSync(path.join(worktree, "README.md"), "uncommitted exploration\n");
		environment.env.LH_DELIVERY_SKILLS_DIR = path.join(environment.directory, "no-installed-skills");
		await assert.rejects(environment.cli("preview", "one", "--worktree", worktree), /different worktree/);
		await environment.cli("preview", "spike", "--worktree", worktree);
		const queued = await environment.cli("status");
		assert.deepEqual(queued.queue, ["spike"]);
		assert.deepEqual(queued.slots, full.slots);
		assert.equal(queued.tickets.spike.kind, "exploration");
		assert.equal(queued.tickets.spike.delivery, null);
		assert.equal(queued.tickets.spike.pr, null);
		assert.equal(queued.tickets.spike.thread, null);
		assert.equal(git(worktree, "branch", "--show-current"), "");
		await environment.cli("release", "one");
		const running = await environment.waitFor(state => state.tickets.spike.preview === "running", "exploratory slot");
		const ticket = running.tickets.spike;
		fs.writeFileSync(path.join(ticket.profile, "retained.txt"), "exploratory state");
		await environment.cli("release", "spike");
		await environment.waitFor(state => state.tickets.spike.preview === "none", "exploratory release");
		for (const command of ["delivery", "attach", "idle", "finish"]) await assert.rejects(environment.cli(command, "spike"), /Exploratory previews do not use ticket/);
		await environment.cli("preview", "spike", "--worktree", worktree);
		const reopened = await environment.waitFor(state => state.tickets.spike.preview === "running", "exploratory reopen");
		assert.equal(reopened.tickets.spike.origin, ticket.origin);
		assert.equal(fs.readFileSync(path.join(ticket.profile, "retained.txt"), "utf8"), "exploratory state");
		assert.equal(git(worktree, "rev-parse", "HEAD"), head);
		assert.equal(fs.readFileSync(path.join(worktree, "README.md"), "utf8"), "uncommitted exploration\n");
		assert.equal(git(environment.root, "branch", "--show-current"), "main");
		assert.equal(git(environment.root, "rev-parse", "HEAD"), head);
		git(worktree, "switch", "-c", "exploratory-pr");
		environment.setPR("spike", 31, "OPEN", { headRefName: "exploratory-pr" });
		await environment.cli("pr", "spike", "--pr", "31");
		environment.setPR("spike", 31, "MERGED");
		await environment.waitFor(state => state.tickets.spike.merged && state.tickets.spike.preview === "none", "optional exploratory PR release");
		await assert.rejects(environment.cli("finish", "spike"), /Exploratory previews do not use ticket cleanup/);
		assert.ok(fs.existsSync(worktree));
		assert.equal(fs.readFileSync(path.join(ticket.profile, "retained.txt"), "utf8"), "exploratory state");
	} finally { await environment.stop(); }
});

test("exploratory source registration rejects root, nested sources and owner takeover", async () => {
	const environment = await fixture();
	try {
		const first = environment.exploration("first");
		const second = environment.exploration("second");
		const foreign = path.join(environment.directory, "foreign");
		fs.mkdirSync(foreign);
		git(foreign, "init", "-b", "main");
		await assert.rejects(environment.cli("preview", "foreign", "--worktree", foreign), /another repository/);
		await assert.rejects(environment.cli("preview", "root", "--worktree", environment.root), /project root/);
		fs.mkdirSync(path.join(first, "nested"));
		await assert.rejects(environment.cli("preview", "nested", "--worktree", path.join(first, "nested")), /worktree root/);
		await environment.cli("preview", "spike", "--worktree", first);
		await assert.rejects(environment.cli("preview", "spike", "--worktree", second), /different worktree/);
		await assert.rejects(environment.cli("preview", "duplicate", "--worktree", first), /already belongs/);
		assert.equal(readState(environment.state).tickets.spike.worktree, first);
		assert.ok(!readState(environment.state).tickets.duplicate);
	} finally { await environment.stop(); }
});
