#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { execFileSync } from "node:child_process";
import { alive, choosePort, cliPath, ensureManager, git, locked, prView, checkPR, readState, repository, rootOf, skillPath, slug, statePath, writeState, delay, worktreeUsers } from "./lib/ticket-state.mjs";

const { values, positionals } = parseArgs({ allowPositionals: true, options: Object.fromEntries([
	["root", "string"], ["state-dir", "string"], ["delivery", "string"], ["worktree", "string"], ["thread", "string"], ["ports", "string"],
	["origin-port", "string"], ["observe-ms", "string"], ["repository", "string"], ["pr", "string"], ["archive", "string"], ["tailnet-host", "string"], ["https-ports", "string"], ["help", "boolean"],
].map(([name, type]) => [name, { type }])) });
const [command, identifier] = positionals;
const help = `Ticket workflow (POSIX, Git, Node, gh; T3 for worktree binding)
  init [--ports 3800,3801,3802] [--origin-port 18100]
       [--tailnet-host HOST.ts.net --https-ports 8450,8451,8452]
       [--observe-ms 30000]
  prepare TICKET --delivery full-stop|full-send
  attach TICKET --worktree PATH --thread T3_THREAD_ID
  delivery TICKET                 resolve selected skill, independent of preview queue
  pr TICKET --pr NUMBER           verify and observe direct-main PR
  preview TICKET                  claim or queue; starts manager automatically
  release TICKET                  stop only this ticket's preview; retain its profile
  observe                        observe associated PRs without merging
  status                         owners, revisions, URLs, queue, errors (JSON)
  idle TICKET --thread ID         end matching thread lease before cleanup
  finish TICKET [--archive PATH]  safely update main, preserve artifacts, remove unused worktree
  stop                           stop this registry's owned previews/manager
All commands accept --root PATH and --state-dir PATH. No command grants merge authority.
`;

async function main() {
	if (values.help || !command) return console.log(help);
	if (command === "worker") {
		const { runManager } = await import("./lib/ticket-preview.mjs");
		return runManager(path.resolve(values["state-dir"]));
	}
	const root = fs.realpathSync(rootOf(path.resolve(values.root ?? process.cwd())));
	const directory = statePath(root, values["state-dir"]);
	if (command === "init") {
		return locked(directory, state => {
			assert.ok(!state, "Registry already initialized; inspect status instead of replacing owners");
			assert.equal(git(root, "branch", "--show-current"), "main", "Project root must stay on main");
			const actualDirectory = fs.realpathSync(directory);
			const checkouts = git(root, "worktree", "list", "--porcelain", "-z").split("\0").filter(field => field.startsWith("worktree ")).map(field => field.slice(9));
			assert.ok(checkouts.every(checkout => actualDirectory !== checkout && !actualDirectory.startsWith(checkout + path.sep)), "Persistent registry/profiles must be outside every project worktree");
			const ports = (values.ports ?? "3800,3801,3802").split(",").map(Number);
			assert.ok(ports.length === 3 && new Set(ports).size === 3 && ports.every(port => Number.isInteger(port) && port > 1024 && port < 65536), "Exactly three distinct unprivileged slot ports required");
			const https = values["https-ports"]?.split(",").map(Number);
			const host = values["tailnet-host"];
			assert.ok(!host || /^[a-z0-9-]+\.[a-z0-9-]+\.ts\.net$/.test(host), "Only a tailnet .ts.net host is allowed");
			if (host) {
				const node = JSON.parse(execFileSync("tailscale", ["status", "--json"], { encoding: "utf8", timeout: 15_000, stdio: ["ignore", "pipe", "pipe"] }));
				assert.equal(node.Self?.DNSName?.replace(/\.$/, ""), host, "Configured review host must be this machine's tailnet DNS name");
			}
			assert.ok(!host || https?.length === 3 && new Set(https).size === 3 && https.every(port => Number.isInteger(port) && port > 1024 && port < 65536), "Tailnet mode needs three distinct --https-ports");
			const nextPort = Number(values["origin-port"] ?? 18100);
			assert.ok(Number.isInteger(nextPort) && nextPort > 1024 && nextPort < 65000, "Invalid origin port start");
			const observationIntervalMs = Number(values["observe-ms"] ?? 30_000);
			assert.ok(Number.isInteger(observationIntervalMs) && observationIntervalMs >= 250, "Observation interval must be at least 250ms");
			const created = { schemaVersion: 1, root, repository: values.repository ?? repository(root), nextPort, observationIntervalMs, tailnetHost: host ?? null,
				slots: ports.map((port, index) => ({ id: index + 1, port, httpsPort: https?.[index] ?? null, ticket: null, claim: null })), tickets: {}, queue: [], manager: null };
			writeState(directory, created);
			return { stateDirectory: directory, slots: created.slots, preserved: "No existing process or mapping was changed" };
		});
	}
	if (command === "status") {
		const state = readState(directory);
		return { ...state, managerRunning: alive(state.manager), tickets: Object.fromEntries(Object.entries(state.tickets).map(([name, ticket]) => [name, { ...ticket, revision: ticket.worktree && fs.existsSync(ticket.worktree) ? git(ticket.worktree, "rev-parse", "HEAD") : null }])) };
	}
	if (command === "stop") {
		let state = readState(directory);
		if (!alive(state.manager) && state.slots.some(slot => slot.ticket)) {
			await locked(directory, current => ensureManager(directory, current));
			state = readState(directory);
		}
		if (alive(state.manager)) {
			for (let attempt = 0; attempt < 100 && !readState(directory).manager?.ready && alive(state.manager); attempt++) await delay(100);
			assert.ok(readState(directory).manager?.ready || !alive(state.manager), "Manager startup incomplete; inspect manager.log");
		}
		if (alive(state.manager)) {
			process.kill(state.manager.pid, "SIGTERM");
			for (let attempt = 0; attempt < 200 && alive(state.manager); attempt++) await delay(100);
			assert.ok(!alive(state.manager), "Manager has not stopped; inspect manager.log (no unsafe force-kill)");
		}
		await locked(directory, current => {
			assert.ok(!current.slots.some(slot => slot.ticket), "Unreleased claims remain; restart manager to reconcile");
			if (!alive(current.manager)) current.manager = null;
		});
		return { stopped: true, profilesRetained: true };
	}
	if (command === "observe") {
		const { observe } = await import("./lib/ticket-preview.mjs");
		return observe(directory);
	}
	if (command === "finish") return finish(directory, slug(identifier));
	return locked(directory, async state => {
		assert.ok(state, "Run ticket init first");
		assert.equal(state.root, root, "Registry belongs to another repository root");
		const id = slug(identifier);
		if (command === "prepare") {
			assert.ok(!Object.hasOwn(state.tickets, id), "Ticket already exists; use status, attach or delivery");
			assert.equal(git(root, "branch", "--show-current"), "main", "Shared root must remain on main");
			const skill = skillPath(values.delivery);
			git(root, "fetch", "origin", "main");
			const base = git(root, "rev-parse", "origin/main");
			const profile = path.join(directory, "profiles", id);
			fs.mkdirSync(path.dirname(profile), { recursive: true, mode: 0o700 });
			fs.mkdirSync(profile, { recursive: false, mode: 0o700 });
			state.tickets[id] = { id, branch: `ticket/${id}`, base, delivery: values.delivery, skill, profile, worktree: null, thread: null, inUse: false, preview: "none", pr: null, merged: null };
			return { ...state.tickets[id], handoff: { branch: `ticket/${id}`, baseRef: "origin/main", startFromOrigin: true,
				continuationPrompt: `Read .agents/skills/ticket-to-main/SKILL.md. Attach ticket ${id} using node ${cliPath} attach ${id} --state-dir ${JSON.stringify(directory)} --worktree "$PWD" --thread YOUR_T3_THREAD_ID, then implement the approved ticket and use its selected ${values.delivery} skill. Root stays main.` } };
		}
		const ticket = state.tickets[id];
		assert.ok(ticket, "Unknown ticket");
		if (command === "attach") {
			assert.ok(!ticket.worktree && values.thread && values.worktree, "Attach once with --worktree and --thread");
			const worktree = fs.realpathSync(values.worktree);
			assert.notEqual(worktree, root, "Implementation cannot use project root");
			assert.equal(rootOf(worktree), root, "Worktree belongs to another repository");
			assert.equal(git(worktree, "branch", "--show-current"), ticket.branch, "Wrong ticket branch");
			git(worktree, "merge-base", "--is-ancestor", ticket.base, "HEAD");
			assert.ok(!Object.values(state.tickets).some(other => other.worktree === worktree), "Worktree already belongs to another ticket");
			assert.ok(!ticket.profile.startsWith(worktree + path.sep), "Profile must survive worktree deletion");
			Object.assign(ticket, { worktree, thread: values.thread, inUse: true });
			return ticket;
		}
		assert.ok(ticket.worktree, "Attach the T3-managed worktree first");
		if (command === "delivery") {
			assert.ok(fs.existsSync(ticket.skill), "Selected delivery skill is no longer installed");
			return { ticket: id, skill: ticket.skill, mode: ticket.delivery, base: "main", repository: state.repository,
				preview: ticket.preview, previewBlocksDelivery: false, mergeAuthority: ticket.delivery === "full-send" ? "selected-skill-only" : "never", next: `Read and follow ${ticket.skill}; apply prove-learnharness for proof; associate the direct-main PR with ticket pr. No additional approval gate.` };
		}
		if (command === "pr") {
			const number = Number(values.pr);
			assert.ok(Number.isSafeInteger(number) && number > 0, "Provide --pr NUMBER");
			assert.ok(!ticket.pr || ticket.pr.number === number, "Cannot replace a ticket's PR association");
			const pr = prView(state, number);
			assert.equal(pr.number, number, "GitHub returned a different PR");
			checkPR(ticket, pr);
			ticket.pr = pr;
			ensureManager(directory, state);
			return pr;
		}
		if (command === "preview") {
			assert.ok(!ticket.merged, "Merged tickets cannot reclaim previews");
			if (!ticket.originPort) {
				ticket.originPort = await choosePort(state.nextPort, [...state.slots.map(slot => slot.port), ...state.slots.map(slot => slot.httpsPort), ...Object.values(state.tickets).map(other => other.originPort)]);
				state.nextPort = ticket.originPort + 1;
				ticket.origin = state.tailnetHost ? `https://${state.tailnetHost}:${ticket.originPort}/` : `http://127.0.0.1:${ticket.originPort}/`;
			}
			if (["none", "error"].includes(ticket.preview)) {
				ticket.preview = "queued";
				ticket.error = null;
				if (!state.queue.includes(id)) state.queue.push(id);
			}
			ensureManager(directory, state);
			return { ticket: id, preview: ticket.preview, origin: ticket.origin, queued: state.queue.indexOf(id) + 1, deliveryMayContinue: true };
		}
		if (command === "release") {
			state.queue = state.queue.filter(name => name !== id);
			ticket.preview = ticket.claim ? "releasing" : "none";
			ensureManager(directory, state);
			return { ticket: id, preview: ticket.preview, profilesRetained: true };
		}
		if (command === "idle") {
			assert.equal(values.thread, ticket.thread, "Only the attached thread may release its lease");
			ticket.inUse = false;
			return { ticket: id, inUse: false };
		}
		throw new Error(`Unknown command ${command}; use --help`);
	});
}

async function finish(directory, id) {
	return locked(directory, state => {
		const ticket = state?.tickets[id];
		assert.ok(ticket?.merged, "Observe the merged PR before completion");
		assert.ok(!ticket.inUse && !ticket.claim && ticket.preview === "none", "Ticket thread or preview still uses the worktree");
		assert.deepEqual(worktreeUsers(ticket.worktree), [], "A process still uses the worktree; preserve it until all owners finish");
		assert.equal(git(ticket.worktree, "rev-parse", "HEAD"), ticket.merged.headRefOid, "Ticket has unmerged work");
		assert.equal(git(ticket.worktree, "status", "--porcelain"), "", "Preserve dirty/untracked worktree files; cleanup refused");
		git(state.root, "fetch", "origin", "main");
		let rootUpdated = false;
		if (git(state.root, "branch", "--show-current") === "main" && git(state.root, "status", "--porcelain") === "") {
			const changes = git(state.root, "diff", "--name-only", "-z", "HEAD", "origin/main").split("\0").filter(Boolean);
			const ignored = git(state.root, "ls-files", "--others", "--ignored", "--exclude-standard", "-z").split("\0").filter(Boolean);
			const conflict = ignored.some(file => changes.some(changed => changed === file || file.startsWith(changed + "/") || changed.startsWith(file + "/")));
			if (!conflict) { git(state.root, "merge", "--ff-only", "origin/main"); rootUpdated = true; }
		}
		let contained = false;
		try { git(state.root, "merge-base", "--is-ancestor", ticket.merged.headRefOid, "origin/main"); contained = true; } catch {}
		if (!contained) {
			const merge = ticket.merged.mergeCommit?.oid;
			assert.ok(merge, "Squash cleanup needs the observed PR's exact merge commit");
			git(state.root, "merge-base", "--is-ancestor", merge, "origin/main");
			const changed = git(state.root, "diff", "--no-renames", "--name-only", "-z", ticket.base, ticket.merged.headRefOid).split("\0").filter(Boolean);
			for (const file of changed) assert.equal(git(state.root, "ls-tree", "-z", ticket.merged.headRefOid, "--", file), git(state.root, "ls-tree", "-z", merge, "--", file), `Accepted squash result differs at ${file}; retain the branch`);
		}
		const ignored = git(ticket.worktree, "ls-files", "--others", "--ignored", "--directory", "--exclude-standard", "-z").split("\0").filter(Boolean);
		assert.ok(!ignored.length || values.archive, "Ignored artifacts retained: provide --archive OUTSIDE_PATH or leave the worktree intact");
		if (ignored.length) {
			const archive = path.resolve(values.archive, id);
			assert.ok(!archive.startsWith(ticket.worktree + path.sep) && archive !== ticket.worktree && !fs.existsSync(archive), "Archive must be a new location outside the worktree");
			fs.mkdirSync(archive, { recursive: true, mode: 0o700 });
			for (const file of ignored) {
				const destination = path.join(archive, file.replace(/\/$/, ""));
				fs.mkdirSync(path.dirname(destination), { recursive: true });
				fs.renameSync(path.join(ticket.worktree, file), destination);
			}
			ticket.archive = archive;
		}
		git(state.root, "worktree", "remove", ticket.worktree);
		git(state.root, "update-ref", "-d", `refs/heads/${ticket.branch}`, ticket.merged.headRefOid);
		ticket.completedWorktree = ticket.worktree;
		ticket.worktree = null;
		return { ticket: id, rootUpdated, profileRetained: ticket.profile, archive: ticket.archive ?? null, branchRemoved: true };
	});
}

try {
	const result = await main();
	if (result !== undefined) console.log(JSON.stringify(result, null, 2));
} catch (error) {
	console.error(JSON.stringify({ error: error.message }));
	process.exitCode = 1;
}
