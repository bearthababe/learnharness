/** Explicit Linux/Chromium regression; excluded from the browser-free npm test glob. */
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { createRunDirectory } from "../../scripts/mobile-browser-runner.mjs";

async function running(pid) {
	try {
		const stat = await readFile(`/proc/${pid}/stat`, "utf8");
		// A killed orphan may await reaping; a zombie cannot execute or hold ports.
		return !["Z", "X"].includes(stat.slice(stat.lastIndexOf(")") + 2).split(" ")[0]);
	} catch (error) { if (error.code === "ENOENT") return false; throw error; }
}

test("preview failure forcibly stops the browser's owned group when CDP close leaves its launcher waiting", { timeout: 40_000 }, async () => {
	assert.equal(process.platform, "linux", "Run this explicit process-group regression on Linux with Chromium installed");
	const dir = await createRunDirectory();
	console.log(`Preview cleanup regression evidence: ${dir}`);
	const marker = path.join(dir, "browser-processes.json");
	const closed = path.join(dir, "chrome-closed.txt");
	const wrapper = path.join(dir, "chromium-wrapper.mjs");
	await writeFile(wrapper, `#!${process.execPath}
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
const chrome = spawn(${JSON.stringify(process.env.CHROMIUM_PATH ?? "/usr/bin/chromium")}, process.argv.slice(2), { stdio: "inherit" });
const sleeper = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
const stat = readFileSync("/proc/self/stat", "utf8");
const group = Number(stat.slice(stat.lastIndexOf(")") + 2).split(" ")[2]);
writeFileSync(${JSON.stringify(marker)}, JSON.stringify({ launcher: process.pid, group, sleeper: sleeper.pid }));
chrome.on("exit", () => writeFileSync(${JSON.stringify(closed)}, "Chrome exited after Browser.close; launcher still waits for sleeper.\\n"));
`, { mode: 0o700 });
	// A deliberately wrong app reaches public-command failure cleanup immediately.
	// It uses no Next fixture, learner data, public preview or provider connection.
	const server = createServer((_request, response) => {
		response.writeHead(200, { "Content-Type": "text/html" });
		response.end('<!doctype html><title>Cleanup failure fixture</title><link rel="manifest" href="/manifest.webmanifest">');
	});
	await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
	try {
		const env = { ...process.env, CHROMIUM_PATH: wrapper, LH_SMOKE_URL: `http://127.0.0.1:${server.address().port}/` };
		delete env.LH_SMOKE_CHAT_ID;
		const result = await new Promise(resolve => {
			execFile(process.execPath, ["scripts/smoke-mobile-preview.mjs"], { env, timeout: 30_000 }, (error, stdout, stderr) => {
				resolve({ code: error?.code ?? 0, killed: error?.killed ?? false, output: stdout + stderr });
			});
		});
		await writeFile(path.join(dir, "command.log"), result.output);
		assert.equal(result.killed, false, "Public command must terminate within its own cleanup deadline");
		assert.equal(result.code, 1, result.output);
		assert.match(result.output, /Browser cleanup exceeded 5000ms/);
		assert.match(await readFile(closed, "utf8"), /Chrome exited after Browser.close/);
		const processes = JSON.parse(await readFile(marker, "utf8"));
		assert.equal(processes.group, processes.launcher, "Puppeteer must own a detached browser process group");
		for (let attempt = 0; attempt < 20 && await running(processes.sleeper); attempt++) await delay(50);
		assert.equal(await running(processes.sleeper), false, "Browser cleanup left its owned sleeper descendant running");
		assert.equal(await running(processes.launcher), false, "Browser cleanup left its launcher running");
	} finally {
		// Also contain the pre-fix red run: only the group recorded by our wrapper.
		try {
			const processes = JSON.parse(await readFile(marker, "utf8"));
			assert.ok(processes.group > 0 && processes.group === processes.launcher);
			try { process.kill(-processes.group, "SIGKILL"); }
			catch (error) { if (error.code !== "ESRCH") throw error; }
		} catch (error) { if (error.code !== "ENOENT") throw error; }
		server.closeAllConnections();
		await new Promise(resolve => server.close(resolve));
	}
});
