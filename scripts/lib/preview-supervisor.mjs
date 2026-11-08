import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { assertSandboxAvailable, bootIdentity, monotonicMilliseconds, prepareSandbox, spawnSandbox } from "./preview-sandbox.mjs";

export const PREVIEW_LIFETIME_MS = 600_000;
export const supervisorPath = fileURLToPath(import.meta.url);
export const leaseExpired = (launch, now = monotonicMilliseconds(), boot = bootIdentity()) => launch.boot !== boot || now >= launch.deadline;
export const newLaunch = () => {
	const started = monotonicMilliseconds();
	return { started, deadline: started + PREVIEW_LIFETIME_MS, boot: bootIdentity(), launchedAt: new Date().toISOString() };
};

export async function supervise(config, { revokeHelper = async () => {} } = {}) {
	let child;
	let timer;
	let stopping;
	let failure;
	const publish = event => {
		const temporary = `${config.eventPath}.${randomUUID()}.tmp`;
		fs.writeFileSync(temporary, JSON.stringify({ lease: config.lease, ...event }), { mode: 0o600 });
		fs.renameSync(temporary, config.eventPath);
	};
	const stop = reason => {
		stopping ??= reason;
		if (child && child.exitCode === null) child.kill("SIGKILL");
	};
	const signals = ["SIGTERM", "SIGINT", "SIGHUP"];
	const signalStop = () => stop("stopped");
	for (const signal of signals) process.on(signal, signalStop);
	const run = command => new Promise((resolve, reject) => {
		if (stopping || leaseExpired(config.launch)) return reject(new Error("Preview lifetime elapsed"));
		child = spawnSandbox(config.sandbox, command, { lease: config.lease, helperSocket: config.helperSocket });
		child.once("error", reject);
		child.once("exit", (code, signal) => code === 0 && !stopping ? resolve() : reject(new Error(`Sandbox exited (${code ?? signal})`)));
	});
	try {
		assert.equal(config.launch.deadline - config.launch.started, PREVIEW_LIFETIME_MS, "Preview lifetime must be exactly ten minutes");
		if (leaseExpired(config.launch)) throw new Error("Preview lifetime elapsed before preparation");
		timer = setTimeout(() => stop("expired"), Math.max(0, config.launch.deadline - monotonicMilliseconds()));
		config.sandbox ??= prepareSandbox(config);
		assertSandboxAvailable(config.sandbox);
		publish({ status: "building", sandbox: config.sandbox, launch: config.launch });
		await run(["/app/node_modules/next/dist/bin/next", "build"]);
		publish({ status: "starting", sandbox: config.sandbox, launch: config.launch });
		await run(["/control/server.cjs"]);
		stopping ??= "exited";
	} catch (error) {
		failure = error.message;
		stopping ??= leaseExpired(config.launch) ? "expired" : "failed";
		publish({ status: stopping, error: error.message, launch: config.launch });
	} finally {
		stop(stopping ?? "stopped");
		clearTimeout(timer);
		try { await revokeHelper({ ticketId: config.ticketId, lease: config.lease, reason: stopping }); }
		finally {
			publish({ status: stopping, error: failure, launch: config.launch });
			for (const signal of signals) process.removeListener(signal, signalStop);
		}
	}
}

if (process.argv[1] === supervisorPath) {
	await supervise(JSON.parse(fs.readFileSync(process.argv[2], "utf8")));
}
