import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const cliPath = fileURLToPath(new URL("../ticket.mjs", import.meta.url));
export const git = (root, ...args) => {
	const output = execFileSync("git", ["-C", root, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
	return args.includes("-z") ? output : output.trim();
};
export const delay = duration => new Promise(resolve => setTimeout(resolve, duration));
export const rootOf = directory => path.dirname(git(directory, "rev-parse", "--path-format=absolute", "--git-common-dir"));
export const slug = value => {
	assert.match(value ?? "", /^[a-z0-9][a-z0-9-]{0,63}$/, "Ticket must be a lowercase slug (1–64 characters)");
	assert.ok(!["__proto__", "constructor", "prototype"].includes(value), "Reserved ticket name");
	return value;
};
export const identity = pid => {
	if (!Number.isSafeInteger(pid) || pid <= 1) return null;
	try {
		if (process.platform === "linux") {
			const stat = fs.readFileSync(`/proc/${pid}/stat`, "utf8");
			const fields = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
			return fields[0] === "Z" ? null : `${fields[19]}:${fields[2]}`;
		}
		const result = execFileSync("ps", ["-p", String(pid), "-o", "stat=", "-o", "lstart="], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
		return result.startsWith("Z") ? null : result.replace(/^\S+\s+/, "");
	} catch { return null; }
};
export const alive = owner => Boolean(owner?.identity && identity(owner.pid) === owner.identity);
export function ownedGroup(owner) {
	if (alive(owner)) return true;
	if (!owner?.token || process.platform !== "linux") return false;
	for (const name of fs.readdirSync("/proc")) {
		if (!/^\d+$/.test(name)) continue;
		try {
			const stat = fs.readFileSync(`/proc/${name}/stat`, "utf8");
			const fields = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
			if (fields[0] === "Z" || Number(fields[2]) !== owner.pid) continue;
			if (fs.readFileSync(`/proc/${name}/environ`, "utf8").split("\0").includes(`LH_PREVIEW_PROCESS_TOKEN=${owner.token}`)) return true;
		} catch {}
	}
	return false;
}
export const ownerOf = pid => ({ pid, identity: identity(pid) });
export function worktreeUsers(worktree) {
	assert.equal(process.platform, "linux", "Automatic cleanup needs Linux /proc process ownership checks; retain this worktree on other hosts");
	return fs.readdirSync("/proc").filter(name => {
		if (!/^\d+$/.test(name)) return false;
		try {
			const cwd = fs.realpathSync(`/proc/${name}/cwd`);
			return cwd === worktree || cwd.startsWith(worktree + path.sep);
		} catch { return false; }
	});
}
export function statePath(root, override) {
	return path.resolve(override ?? process.env.LH_TICKET_STATE_DIR ?? path.join(os.homedir(), ".local", "state", "learnharness", "tickets", git(root, "rev-parse", "--show-object-format") + "-" + Buffer.from(fs.realpathSync(root)).toString("base64url")));
}
export function readState(directory) {
	return JSON.parse(fs.readFileSync(path.join(directory, "registry.json"), "utf8"));
}
export function writeState(directory, state) {
	const temporary = path.join(directory, `registry-${randomUUID()}.tmp`);
	fs.writeFileSync(temporary, JSON.stringify(state, null, 2) + "\n", { mode: 0o600 });
	fs.renameSync(temporary, path.join(directory, "registry.json"));
}
export async function locked(directory, operation) {
	fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
	const lock = path.join(directory, "registry.lock");
	const deadline = Date.now() + 30_000;
	for (;;) {
		try { fs.mkdirSync(lock, { mode: 0o700 }); break; }
		catch (error) {
			if (error.code !== "EEXIST") throw error;
			assert.ok(Date.now() < deadline, `Registry lock timeout: ${lock}. Inspect owner.json; recover only after confirming its process has exited.`);
			await delay(25);
		}
	}
	try {
		fs.writeFileSync(path.join(lock, "owner.json"), JSON.stringify(ownerOf(process.pid)));
		const state = fs.existsSync(path.join(directory, "registry.json")) ? readState(directory) : null;
		const result = await operation(state);
		if (state) writeState(directory, state);
		return result;
	} finally { fs.rmSync(lock, { recursive: true }); }
}
export async function freePort(port) {
	const server = net.createServer();
	return new Promise(resolve => {
		server.once("error", () => resolve(false));
		server.listen(port, "127.0.0.1", () => server.close(() => resolve(true)));
	});
}
export async function choosePort(start, excluded = []) {
	for (let port = start; port < 65536; port++) if (!excluded.includes(port) && await freePort(port)) return port;
	throw new Error("No free loopback port");
}
export function repository(root) {
	const url = git(root, "remote", "get-url", "origin");
	const match = url.match(/github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?$/);
	return match ? match[1] : null;
}
export function skillPath(mode, search = process.env.LH_DELIVERY_SKILLS_DIR) {
	assert.ok(["full-stop", "full-send"].includes(mode), "Choose --delivery full-stop or full-send");
	const roots = search ? [path.resolve(search)] : [path.join(os.homedir(), ".agents", "skills"), path.join(os.homedir(), ".claude", "skills"), path.join(os.homedir(), ".codex", "skills")];
	const found = roots.map(root => path.join(root, mode, "SKILL.md")).find(file => fs.existsSync(file));
	assert.ok(found, `Installed ${mode}/SKILL.md not found; install the selected delivery skill`);
	return found;
}
export function ensureManager(directory, state) {
	if (alive(state.manager)) return;
	const log = fs.openSync(path.join(directory, "manager.log"), "a", 0o600);
	const child = spawn(process.execPath, [cliPath, "worker", "--state-dir", directory], { cwd: state.root, detached: true, stdio: ["ignore", log, log], env: process.env });
	child.unref();
	fs.closeSync(log);
	assert.ok(child.pid, "Unable to start preview manager");
	state.manager = ownerOf(child.pid);
	assert.ok(state.manager.identity, "Preview manager exited during startup");
}
export function previewEnvironment(profile, prefix, host = "127.0.0.1") {
	const home = path.join(profile, "home");
	for (const directory of [home, path.join(profile, "auth"), path.join(profile, "data")]) fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
	return {
		PATH: process.env.PATH, LANG: "C.UTF-8", HOME: home, USERPROFILE: home,
		XDG_CONFIG_HOME: path.join(home, ".config"), XDG_DATA_HOME: path.join(home, ".local", "share"), XDG_CACHE_HOME: path.join(home, ".cache"),
		CLAUDE_CONFIG_DIR: path.join(home, ".claude"), CODEX_HOME: path.join(home, ".codex"),
		LH_DATA_DIR: path.join(profile, "data"), LH_AUTH_FILE: path.join(profile, "auth", "auth.json"),
		LH_IGNORE_ENV_KEYS: "1", LH_PREVIEW_PROFILE: "1", LH_PREVIEW_COOKIE_PREFIX: prefix, LH_PREVIEW_HOST: host, NEXT_TELEMETRY_DISABLED: "1",
	};
}
export function assertPreviewCheckout(worktree) {
	for (const file of fs.readdirSync(worktree)) assert.ok(!/^\.env(?:\.|$)/.test(file), `Isolated previews refuse dotenv file ${file}; use a clean ticket checkout, not copied credentials`);
	assert.ok(fs.existsSync(path.join(worktree, "node_modules", "next", "dist", "bin", "next")), "Run npm ci in the ticket worktree first");
}
export async function stopOwned(owner) {
	if (!ownedGroup(owner)) return;
	try { process.kill(-owner.pid, "SIGTERM"); } catch (error) { if (error.code !== "ESRCH") throw error; }
	for (let attempt = 0; attempt < 50 && ownedGroup(owner); attempt++) await delay(100);
	if (ownedGroup(owner)) process.kill(-owner.pid, "SIGKILL");
	for (let attempt = 0; attempt < 50 && ownedGroup(owner); attempt++) await delay(100);
	assert.ok(!ownedGroup(owner), "Owned preview process group did not exit");
}
export function prView(state, number) {
	assert.ok(state.repository, "Configure a GitHub origin (or --repository OWNER/REPO at init)");
	return JSON.parse(execFileSync("gh", ["pr", "view", String(number), "--repo", state.repository, "--json", "number,state,headRefOid,headRefName,baseRefName,url,mergeCommit"], { cwd: state.root, encoding: "utf8", timeout: 15_000, stdio: ["ignore", "pipe", "pipe"] }));
}
export function checkPR(ticket, pr) {
	assert.equal(pr.number, ticket.pr?.number ?? pr.number, "PR number changed");
	assert.equal(pr.baseRefName, "main", "Ticket PR must target remote main");
	assert.equal(pr.headRefName, ticket.branch, "PR belongs to a different branch");
	assert.equal(pr.headRefOid, git(ticket.worktree, "rev-parse", "HEAD"), "PR head differs from ticket worktree HEAD");
}
