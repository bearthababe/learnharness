/** Shared disposable directories, logs and owned process groups for browser checks. */
import { appendFileSync } from "node:fs";
import { mkdir, mkdtemp } from "node:fs/promises";
import { spawn } from "node:child_process";
import { homedir } from "node:os";
import path from "node:path";

export async function createRunDirectory() {
	const cache = process.platform === "win32"
		? process.env.LOCALAPPDATA ?? path.join(homedir(), "AppData", "Local")
		: process.platform === "darwin" ? path.join(homedir(), "Library", "Caches")
			: process.env.XDG_CACHE_HOME ?? path.join(homedir(), ".cache");
	const base = path.resolve(process.env.LH_MOBILE_TEST_DIR ?? process.env.TMPDIR ?? path.join(cache, "learnharness", "mobile-browser"));
	await mkdir(base, { recursive: true });
	return mkdtemp(path.join(base, "mobile-input-browser-"));
}

export function processScope({ onSignal = () => {} } = {}) {
	const children = new Set();
	let closing;
	const own = child => { children.add(child); return child; };
	const stop = async child => {
		if (!child.pid) return;
		const signal = value => {
			try {
				if (process.platform === "win32") child.kill(value);
				else process.kill(-child.pid, value);
			} catch (error) { if (error.code !== "ESRCH") throw error; }
		};
		const exited = new Promise(resolve => {
			if (child.exitCode !== null || child.signalCode !== null) resolve();
			else child.once("exit", resolve);
		});
		signal("SIGTERM");
		let timer;
		await Promise.race([exited, new Promise(resolve => { timer = setTimeout(resolve, 5000); })]);
		clearTimeout(timer);
		// Also stop grandchildren if their launcher exited before them.
		signal("SIGKILL");
		await exited;
	};
	const close = () => closing ??= Promise.all([...children].map(stop));
	const handlers = new Map([["SIGINT", 130], ["SIGTERM", 143], ["SIGHUP", 129]].map(([signal, code]) => {
		const handler = () => {
			try { onSignal(signal); }
			finally { void close().finally(() => process.exit(code)); }
		};
		process.on(signal, handler);
		return [signal, handler];
	}));
	return {
		own,
		spawn(command, args, options) {
			return own(spawn(command, args, { ...options, detached: process.platform !== "win32" }));
		},
		async close() {
			try { await close(); }
			finally { for (const [signal, handler] of handlers) process.off(signal, handler); }
		},
	};
}

export function captureOutput(child, file, echo = true) {
	for (const [stream, destination] of [[child.stdout, process.stdout], [child.stderr, process.stderr]]) {
		stream.on("data", data => {
			appendFileSync(file, data);
			if (echo) destination.write(data);
		});
	}
}

export function completed(child) {
	return new Promise((resolve, reject) => {
		child.once("error", reject);
		child.once("close", (code, signal) => code === 0 ? resolve() : reject(new Error(`Process ${child.spawnargs.join(" ")} failed (${signal ?? code})`)));
	});
}
