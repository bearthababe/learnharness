/** Shared disposable directories, logs and owned process groups for browser checks. */
import { existsSync, appendFileSync } from "node:fs";
import { mkdir, mkdtemp } from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";

export async function createRunDirectory() {
	const base = path.resolve(process.env.LH_MOBILE_TEST_DIR ?? process.env.TMPDIR ?? (existsSync("/tmp/opencode") ? "/tmp/opencode" : tmpdir()));
	await mkdir(base, { recursive: true });
	return mkdtemp(path.join(base, "mobile-input-browser-"));
}

export function processScope() {
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
	const handlers = new Map(["SIGINT", "SIGTERM"].map((signal, index) => {
		const handler = () => { void close().finally(() => process.exit(index === 0 ? 130 : 143)); };
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
