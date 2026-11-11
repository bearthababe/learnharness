import assert from "node:assert/strict";
import { execFile, execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { choosePort, delay, git, readState } from "../../scripts/lib/ticket-state.mjs";

export const source = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const cliFile = path.join(source, "scripts/ticket.mjs");
const execute = promisify(execFile);
export async function fixture({ real = false, tailnetHost = null, httpsPorts = null, fakeTailnet = false, installedSkills = false } = {}) {
	const parent = real ? path.join(os.homedir(), ".cache", "learnharness", "workflow-proof") : os.tmpdir();
	fs.mkdirSync(parent, { recursive: true });
	const directory = fs.mkdtempSync(path.join(parent, "zz-prove-it-ticket-"));
	const root = path.join(directory, "root");
	const remote = path.join(directory, "remote.git");
	const state = path.join(directory, "state");
	const bin = path.join(directory, "bin");
	const github = path.join(directory, "github.json");
	const tailnetFile = path.join(directory, "tailnet.json");
	const skills = path.join(directory, "skills");
	fs.mkdirSync(root);
	fs.mkdirSync(bin);
	for (const [mode, text] of [["full-stop", "Never merge; leave the PR open."], ["full-send", "Merge once the merge gate passes."]]) {
		fs.mkdirSync(path.join(skills, mode), { recursive: true });
		fs.writeFileSync(path.join(skills, mode, "SKILL.md"), `---\nname: ${mode}\ndescription: Disposable delivery fixture, never a live delivery grant\n---\n${text}\n`);
	}
	execFileSync("git", ["init", "--bare", remote], { stdio: "ignore" });
	execFileSync("git", ["init", "-b", "main", root], { stdio: "ignore" });
	git(root, "config", "user.name", "Workflow Proof");
	git(root, "config", "user.email", "workflow-proof@example.invalid");
	if (real) {
		for (const name of fs.readdirSync(source)) {
			if ([".git", "node_modules", ".next", "data", "auth.json", ".env", ".env.local", ".env.development", ".env.development.local", ".scratch", ".prove-it", "dist"].includes(name)) continue;
			fs.cpSync(path.join(source, name), path.join(root, name), { recursive: true });
		}
		fs.mkdirSync(path.join(root, "app", "zz-prove-it"), { recursive: true });
		fs.writeFileSync(path.join(root, "app", "zz-prove-it", "page.tsx"), 'export default function ProofPage(){return <main data-proof="source">zz-prove-it-original</main>}\n');
	} else {
		fs.writeFileSync(path.join(root, "README.md"), "Disposable workflow fixture\n");
		fs.writeFileSync(path.join(root, ".gitignore"), "node_modules/\n.next/\nretained/\n.env.local\n");
	}
	git(root, "add", ".");
	git(root, "commit", "-m", "Initial disposable app");
	git(root, "remote", "add", "origin", remote);
	git(root, "push", "-u", "origin", "main");
	fs.writeFileSync(github, "{}\n");
	if (fakeTailnet) {
		fs.writeFileSync(tailnetFile, JSON.stringify({ TCP: {}, Web: {}, AllowFunnel: {} }));
		fs.writeFileSync(path.join(bin, "tailscale"), `#!${process.execPath}\nimport fs from 'node:fs';const args=process.argv.slice(2);if(args[0]==='status'){console.log(JSON.stringify({BackendState:'Running',Self:{ID:'synthetic-normal-node',Online:true,DNSName:${JSON.stringify(tailnetHost + ".")}}}));}else{if(args[0]!=='serve'||args[1]!=='status')throw Error('Fixture forbids route writes');console.log(fs.readFileSync(process.env.ZZ_PROVE_TAILNET,'utf8'));}\n`, { mode: 0o700 });
	}
	fs.writeFileSync(path.join(bin, "gh"), `#!${process.execPath}\nimport fs from 'node:fs';const args=process.argv.slice(2);if(args[0]!=='pr'||args[1]!=='view')throw Error('Only disposable PR observation is allowed');const number=args[2];const record=JSON.parse(fs.readFileSync(process.env.ZZ_PROVE_GITHUB,'utf8'))[number];if(!record)throw Error('Unknown fixture PR');if(!args.includes('--repo'))throw Error('Explicit repository required');console.log(JSON.stringify(record));\n`, { mode: 0o700 });
	const env = { ...process.env, PATH: bin + path.delimiter + process.env.PATH, LH_DELIVERY_SKILLS_DIR: skills, ZZ_PROVE_GITHUB: github, ZZ_PROVE_TAILNET: tailnetFile, OPENAI_API_KEY: "zz-prove-it-synthetic-ambient", ANTHROPIC_API_KEY: "zz-prove-it-synthetic-ambient", LH_DESKTOP_SERVER: "1", LH_DESKTOP_API_SECRET: "zz-prove-it-not-a-real-credential" };
	if (fakeTailnet) {
		env.ZZ_PROVE_TAILNET_EXECUTABLE = path.join(bin, "tailscale");
		env.NODE_OPTIONS = `${env.NODE_OPTIONS ?? ""} --import=${JSON.stringify(path.join(source, "tests/workflow/mock-tailnet.mjs"))}`;
	}
	if (installedSkills) delete env.LH_DELIVERY_SKILLS_DIR;
	const cli = async (...args) => {
		const result = await execute(process.execPath, [cliFile, ...args, "--root", root, "--state-dir", state], { env, maxBuffer: 4 * 1024 * 1024 });
		return JSON.parse(result.stdout);
	};
	const ports = [];
	let start = real ? 3900 : 24000;
	for (let index = 0; index < 3; index++) { const port = await choosePort(start, ports); ports.push(port); start = port + 1; }
	if (fakeTailnet) fs.writeFileSync(tailnetFile, JSON.stringify({ TCP: Object.fromEntries(httpsPorts.map(port => [port, { HTTPS: true }])), Web: Object.fromEntries(httpsPorts.map((port, index) => [`${tailnetHost}:${port}`, { Handlers: { "/": { Proxy: `http://127.0.0.1:${ports[index]}` } } }])), AllowFunnel: {} }));
	const init = ["init", "--ports", ports.join(","), "--origin-port", real ? "18500" : "26000", "--observe-ms", "500", "--repository", "zz-prove-it/project"];
	if (tailnetHost) init.push("--tailnet-host", tailnetHost, "--https-ports", httpsPorts.join(","));
	await cli(...init);
	async function attach(id, delivery = "full-stop") {
		const prepared = await cli("prepare", id, "--delivery", delivery);
		const worktree = path.join(directory, id);
		git(root, "worktree", "add", "-b", prepared.branch, worktree, prepared.handoff.baseRef);
		await cli("attach", id, "--worktree", worktree, "--thread", `zz-prove-it-t3-${id}`);
		install(worktree);
		return { prepared, worktree };
	}
	function install(worktree) {
		if (real) execFileSync("cp", ["-a", "--reflink=auto", path.join(source, "node_modules"), path.join(worktree, "node_modules")]);
		else {
			const next = path.join(worktree, "node_modules", "next", "dist", "bin");
			fs.mkdirSync(next, { recursive: true });
			fs.writeFileSync(path.join(next, "next"), "process.exit(0)");
			fs.writeFileSync(path.join(worktree, "node_modules", "next", "index.js"), "module.exports=()=>({prepare:async()=>{require('node:fs').writeFileSync(process.env.LH_DATA_DIR+'/launch.json',JSON.stringify({ambient:!!process.env.OPENAI_API_KEY,desktop:!!process.env.LH_DESKTOP_SERVER,home:process.env.HOME}))},getRequestHandler:()=>((_request,response)=>response.end('zz-prove-it-fake-app')),getUpgradeHandler:()=>((_request,socket)=>socket.destroy())})");
		}
	}
	function exploration(id) {
		const worktree = path.join(directory, id);
		git(root, "worktree", "add", "--detach", worktree, "main");
		install(worktree);
		return worktree;
	}
	function setPR(id, number, status = "OPEN", overrides = {}) {
		const ticket = readState(state).tickets[id];
		const records = JSON.parse(fs.readFileSync(github, "utf8"));
		records[number] = { number, state: status, headRefName: ticket.branch, headRefOid: git(ticket.worktree, "rev-parse", "HEAD"), baseRefName: "main", url: `https://github.com/zz-prove-it/project/pull/${number}`, mergeCommit: null, ...overrides };
		const temporary = github + ".tmp";
		fs.writeFileSync(temporary, JSON.stringify(records));
		fs.renameSync(temporary, github);
	}
	async function waitFor(predicate, label, timeout = 20_000) {
		const deadline = Date.now() + timeout;
		while (Date.now() < deadline) {
			const snapshot = readState(state);
			if (await predicate(snapshot)) return snapshot;
			await delay(100);
		}
		throw new Error(`${label} timed out. State: ${JSON.stringify(readState(state))}; manager: ${fs.existsSync(path.join(state, "manager.log")) ? fs.readFileSync(path.join(state, "manager.log"), "utf8") : "absent"}`);
	}
	async function stop() {
		await cli("stop");
		await waitFor(snapshot => !snapshot.manager, "manager cleanup");
		assert.ok(!readState(state).slots.some(slot => slot.ticket), "Owned slots remain after cleanup");
	}
	return { directory, root, remote, state, ports, env, cli, attach, exploration, setPR, waitFor, stop, tailnetFile };
}
