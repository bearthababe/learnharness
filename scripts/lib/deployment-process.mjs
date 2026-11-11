import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { processIdentity } from "../../electron/deployment-profile.cjs";

export function sameProcess(identity) {
	const live = processIdentity(identity.pid);
	return !!live && live.start === identity.start && live.boot === identity.boot;
}

export async function stopService(identity, { timeout = 30000 } = {}) {
	if (!sameProcess(identity)) throw new Error("Service stop identity changed");
	process.kill(identity.pid, "SIGTERM");
	const deadline = Date.now() + timeout;
	while (sameProcess(identity)) {
		if (Date.now() >= deadline) throw new Error("Service did not drain; no forced credential-writer termination is permitted");
		await new Promise(resolve => setTimeout(resolve, 50));
	}
}

function groupMembers(group) {
	const members = [];
	for (const name of fs.readdirSync("/proc")) {
		if (!/^\d+$/.test(name)) continue;
		try {
			const contents = fs.readFileSync(`/proc/${name}/stat`, "utf8");
			const fields = contents.slice(contents.lastIndexOf(")") + 2).split(" ");
			if (Number(fields[2]) === group && fields[0] !== "Z") members.push(processIdentity(Number(name)));
		} catch {}
	}
	return members.filter(Boolean);
}

export async function runPreparation(command, { cwd, env, log, signal } = {}) {
	if (!Array.isArray(command) || !command.length) throw new Error("Explicit preparation command is required");
	signal?.throwIfAborted();
	const descriptor = fs.openSync(log, "a", 0o600);
	const child = spawn(command[0], command.slice(1), { cwd, env, detached: true, stdio: ["ignore", descriptor, descriptor] });
	fs.closeSync(descriptor);
	let aborted = false;
	let forceTimer;
	const signalGroup = name => {
		if (groupMembers(child.pid).length) {
			try { process.kill(-child.pid, name); } catch (error) { if (error.code !== "ESRCH") throw error; }
		}
	};
	const abort = () => {
		aborted = true;
		signalGroup("SIGTERM");
		forceTimer ??= setTimeout(() => signalGroup("SIGKILL"), 500);
	};
	signal?.addEventListener("abort", abort, { once: true });
	if (signal?.aborted) abort();
	try {
		const result = await new Promise((resolve, reject) => {
			child.once("error", reject);
			child.once("exit", (code, exitSignal) => resolve({ code, signal: exitSignal }));
		});
		if (aborted || groupMembers(child.pid).length) {
			signalGroup("SIGTERM");
			await new Promise(resolve => setTimeout(resolve, 550));
			signalGroup("SIGKILL");
			const deadline = Date.now() + 3000;
			while (groupMembers(child.pid).length) {
				if (Date.now() >= deadline) throw new Error("Preparation descendants remain alive");
				await new Promise(resolve => setTimeout(resolve, 25));
			}
			if (!aborted) throw new Error("Preparation exited with orphan descendants");
		}
		if (aborted) throw signal.reason ?? new Error("Preparation cancelled");
		if (result.code !== 0) throw new Error(`Preparation failed (${result.code ?? result.signal}); inspect private preparation log`);
		return result;
	} finally { clearTimeout(forceTimer); signal?.removeEventListener("abort", abort); }
}

export function packagedBuild(executable) {
	const binary = fs.realpathSync(executable);
	const resources = path.join(path.dirname(binary), "resources");
	const directory = path.join(resources, "server", "standalone");
	const build = JSON.parse(fs.readFileSync(path.join(directory, "deployment-build.json"), "utf8"));
	if (!/^[a-f0-9]{40}$/.test(build.revision) || !/^[a-f0-9]{64}$/.test(build.sourceHash) || build.buildId !== `${build.revision}-${build.sourceHash}` || !fs.statSync(path.join(resources, "local-service.cjs")).isFile()) throw new Error("Invalid packaged release identity");
	return { executable: binary, resources, directory, ...build };
}
