import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fixture, source } from "../tests/workflow/fixture.mjs";
import { git, readState } from "./lib/ticket-state.mjs";

const script = fileURLToPath(import.meta.url);
const [command, ...args] = process.argv.slice(2);
const hash = file => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const quote = value => "'" + value.replaceAll("'", "'\\''") + "'";
if (command === "setup") {
	const environment = await fixture({ installedSkills: true });
	const run = path.join(source, ".prove-it", "runs", new Date().toISOString().replaceAll(":", "-") + "-zz-prove-it-delivery");
	fs.mkdirSync(run, { recursive: true });
	const context = { run, directory: environment.directory, root: environment.root, remote: environment.remote, state: environment.state, tickets: {}, originalMain: git(environment.root, "rev-parse", "HEAD") };
	for (const [id, mode] of [["boundary", "full-stop"], ["autonomous", "full-send"]]) {
		const attached = await environment.attach(id, mode);
		const delivery = await environment.cli("delivery", id);
		context.tickets[id] = { worktree: attached.worktree, delivery, skillHash: hash(delivery.skill) };
		fs.writeFileSync(path.join(attached.worktree, "answer.mjs"), "export const answer = 41;\n");
		fs.writeFileSync(path.join(attached.worktree, "check.mjs"), "import assert from 'node:assert/strict'; import {answer} from './answer.mjs'; assert.equal(answer,42); console.log('PASS: synthetic answer 42');\n");
	}
	fs.writeFileSync(path.join(run, "context.json"), JSON.stringify(context, null, 2));
	for (const [name, action] of [["gh", "service"], ["ticket", "ticket"]]) {
		fs.writeFileSync(path.join(environment.directory, "bin", name), `#!/bin/sh\nexport ZZ_PROVE_DELIVERY=${quote(run)}\nexec ${quote(process.execPath)} ${quote(script)} ${action} "$@"\n`, { mode: 0o700 });
	}
	fs.writeFileSync(path.join(run, "use-env.sh"), `export PATH=${quote(path.join(environment.directory, "bin"))}:"$PATH"\nexport ZZ_PROVE_DELIVERY=${quote(run)}\n`);
	console.log(JSON.stringify(context, null, 2));
} else {
	const run = command === "verify" || command === "stop" ? args[0] : process.env.ZZ_PROVE_DELIVERY;
	assert.ok(run, "Use setup, then source RUN/use-env.sh");
	const context = JSON.parse(fs.readFileSync(path.join(run, "context.json"), "utf8"));
	assert.match(context.directory, /\/zz-prove-it-ticket-[^/]+$/);
	assert.equal(fs.realpathSync(context.remote), path.join(context.directory, "remote.git"));
	const recordsFile = path.join(context.directory, "github.json");
	const records = JSON.parse(fs.readFileSync(recordsFile, "utf8"));
	function saveRecords() {
		const temporary = recordsFile + "." + process.pid;
		fs.writeFileSync(temporary, JSON.stringify(records));
		fs.renameSync(temporary, recordsFile);
	}
	const env = { ...process.env, PATH: path.join(context.directory, "bin") + path.delimiter + process.env.PATH, ZZ_PROVE_GITHUB: recordsFile };
	delete env.LH_DELIVERY_SKILLS_DIR;
	const cli = inputs => execFileSync(process.execPath, [path.join(source, "scripts/ticket.mjs"), ...inputs, "--root", context.root, "--state-dir", context.state], { env, encoding: "utf8" });
	function event(operation, data) { fs.appendFileSync(path.join(run, "events.jsonl"), JSON.stringify({ operation, ...data }) + "\n"); }
	if (command === "ticket") console.log(cli(args));
	else if (command === "stop") console.log(cli(["stop"]));
	else if (command === "verify") {
		const events = fs.readFileSync(path.join(run, "events.jsonl"), "utf8").trim().split("\n").map(line => JSON.parse(line));
		const boundary = Object.values(records).find(pr => pr.headRefName === "ticket/boundary");
		const autonomous = Object.values(records).find(pr => pr.headRefName === "ticket/autonomous");
		assert.equal(boundary.state, "OPEN");
		assert.equal(autonomous.state, "MERGED");
		assert.equal(boundary.baseRefName, "main");
		assert.equal(autonomous.baseRefName, "main");
		assert.ok(!events.some(entry => entry.operation === "merge" && entry.number === boundary.number));
		for (const pr of [boundary, autonomous]) {
			assert.ok(events.some(entry => entry.operation === "checks" && entry.number === pr.number && entry.status === "FAILURE"));
			assert.ok(events.some(entry => entry.operation === "checks" && entry.number === pr.number && entry.status === "SUCCESS"));
			const ticket = context.tickets[pr.headRefName.slice("ticket/".length)];
			assert.equal(hash(ticket.delivery.skill), ticket.skillHash);
			assert.equal(git(ticket.worktree, "rev-parse", "HEAD"), pr.headRefOid);
		}
		assert.equal(git(context.root, "branch", "--show-current"), "main");
		assert.equal(git(context.root, "rev-parse", "HEAD"), context.originalMain);
		assert.equal(git(context.root, "--git-dir=" + context.remote, "rev-parse", "main"), autonomous.headRefOid);
		console.log(cli(["observe"]));
		console.log(cli(["stop"]));
		assert.equal(readState(context.state).manager, null);
		const result = { status: "passed", boundary, autonomous, events, installedSkills: context.tickets, limits: "Actual installed instructions executed by checker; CI/GitHub are local test services, not live GitHub. No real PR or merge." };
		fs.writeFileSync(path.join(run, "result.json"), JSON.stringify(result, null, 2));
		console.log(JSON.stringify(result, null, 2));
	} else {
		assert.equal(command, "service");
		assert.equal(args[0], "pr", "Only sandbox PR commands allowed");
		assert.equal(args[args.indexOf("--repo") + 1], "zz-prove-it/project", "Only sandbox repository allowed");
		const action = args[1];
		if (action === "list") console.log(JSON.stringify(Object.values(records).filter(pr => pr.headRefName === git(process.cwd(), "branch", "--show-current"))));
		else if (action === "create") {
			assert.equal(args[args.indexOf("--base") + 1], "main");
			const branch = git(process.cwd(), "branch", "--show-current");
			assert.ok(["ticket/boundary", "ticket/autonomous"].includes(branch));
			const number = Object.keys(records).length + 1;
			records[number] = { number, state: "OPEN", headRefName: branch, headRefOid: git(process.cwd(), "rev-parse", "HEAD"), baseRefName: "main", url: `https://zz-prove-it.invalid/pull/${number}`, mergeCommit: null, isDraft: false, autoMergeRequest: null, mergeable: "MERGEABLE", reviewDecision: "APPROVED" };
			saveRecords();
			event("create", records[number]);
			console.log(records[number].url);
		} else {
			const pr = records[args[2]];
			assert.ok(pr, "Unknown sandbox PR");
			const worktree = context.tickets[pr.headRefName.slice("ticket/".length)].worktree;
			pr.headRefOid = git(context.root, "--git-dir=" + context.remote, "rev-parse", pr.headRefName);
			if (action === "view") console.log(JSON.stringify(pr));
			else if (action === "checks") {
				assert.equal(git(worktree, "status", "--porcelain"), "", "Commit and push before CI");
				assert.equal(git(worktree, "rev-parse", "HEAD"), pr.headRefOid);
				let status = "SUCCESS";
				try { execFileSync(process.execPath, [path.join(worktree, "check.mjs")], { stdio: "pipe" }); } catch { status = "FAILURE"; }
				pr.ci = status;
				event("checks", { number: pr.number, status, head: pr.headRefOid });
				console.log(JSON.stringify({ status, proof: "node check.mjs", review: "Fixture service APPROVED; local test only" }));
				if (status !== "SUCCESS") process.exitCode = 1;
			} else {
				assert.equal(action, "merge");
				assert.equal(pr.headRefName, "ticket/autonomous", "full-stop must never request merge");
				assert.equal(pr.ci, "SUCCESS");
				assert.equal(pr.reviewDecision, "APPROVED");
				assert.equal(git(worktree, "status", "--porcelain"), "");
				assert.equal(git(worktree, "rev-parse", "HEAD"), pr.headRefOid);
				execFileSync(process.execPath, [path.join(worktree, "check.mjs")], { stdio: "pipe" });
				git(worktree, "push", "origin", "HEAD:refs/heads/main");
				pr.state = "MERGED";
				pr.mergeCommit = { oid: pr.headRefOid };
				event("merge", { number: pr.number, head: pr.headRefOid, approvalPrompts: 0 });
				console.log("Merged disposable local test PR; no network GitHub action");
			}
			if (action !== "view") saveRecords();
		}
	}
}
