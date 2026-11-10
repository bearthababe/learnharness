import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { processIdentity, controlFor, validateConfiguration } from "../../electron/preview-shell.cjs";
import { readConfiguration, controlRequest } from "../../electron/local-service-protocol.cjs";
import { alive, ownerOf, stopOwned } from "./ticket-state.mjs";

export function desktopConfiguration(ticket, manager, normalOrigin, controlFile) {
	assert.equal(ticket.preview, "running", "Wait for the preview runtime before opening its desktop");
	assert.ok(alive(ticket.process) && alive(manager), "Preview runtime or manager is no longer live");
	const { started, deadline, boot } = ticket.launch;
	return validateConfiguration({ version: 1, ticketId: ticket.id, sourceId: ticket.sandbox.sourceHash, lease: ticket.claim, origin: new URL(ticket.origin).origin, normalOrigin,
		launch: { started, deadline, boot }, manager: processIdentity(manager.pid), server: processIdentity(ticket.process.pid), controlFile });
}

export function desktopEnvironment(directory) {
	const environment = {};
	for (const name of ["PATH", "LANG", "LC_ALL", "DISPLAY", "WAYLAND_DISPLAY", "XDG_RUNTIME_DIR", "DBUS_SESSION_BUS_ADDRESS", "XAUTHORITY", "XDG_SESSION_TYPE"]) if (process.env[name]) environment[name] = process.env[name];
	for (const [name, suffix] of Object.entries({ HOME: "home", XDG_CONFIG_HOME: "config", XDG_CACHE_HOME: "cache", XDG_DATA_HOME: "data" })) {
		environment[name] = path.join(directory, suffix);
		fs.mkdirSync(environment[name], { mode: 0o700 });
	}
	return environment;
}

export function desktopArguments(configFile, environment) {
	return [`--preview=${configFile}`, ...(environment.WAYLAND_DISPLAY ? ["--ozone-platform=wayland"] : [])];
}

export async function launchPreviewDesktop(directory, state, ticket, { serviceConfig, normalOrigin }) {
	assert.ok(!alive(ticket.desktop?.process), "This preview already has a desktop window");
	const normal = readConfiguration(serviceConfig);
	assert.ok(normal.browserOrigins.includes(normalOrigin) && new URL(normalOrigin).hostname === state.tailnetHost, "Choose this normal service's configured private HTTPS origin");
	const status = await controlRequest(normal, { op: "status" });
	for (const field of ["deploymentId", "revision", "sourceHash", "buildId", "pid"]) assert.equal(status[field], normal[field], "Normal service identity changed");
	const executable = fs.realpathSync(normal.executable);
	assert.equal(fs.realpathSync(`/proc/${normal.pid}/exe`), executable, "Accepted shell executable differs from normal service");
	const shellDirectory = fs.mkdtempSync(path.join(directory, "leases", ticket.claim, "desktop-"));
	const configFile = path.join(shellDirectory, "preview.json");
	const configuration = desktopConfiguration(ticket, state.manager, normalOrigin, path.join(shellDirectory, "control.json"));
	fs.writeFileSync(configFile, JSON.stringify(configuration), { mode: 0o600 });
	fs.writeFileSync(configuration.controlFile, JSON.stringify(controlFor(configuration)), { mode: 0o600 });
	const logPath = path.join(shellDirectory, "shell.log");
	const log = fs.openSync(logPath, "wx", 0o600);
	const environment = desktopEnvironment(shellDirectory);
	const child = spawn(executable, desktopArguments(configFile, environment), { cwd: shellDirectory, env: environment, detached: true, stdio: ["ignore", log, log] });
	fs.closeSync(log);
	try {
		await new Promise((resolve, reject) => { child.once("spawn", resolve); child.once("error", reject); });
		const owner = ownerOf(child.pid);
		assert.ok(alive(owner), "Preview shell exited during startup; inspect shell.log");
		child.unref();
		return { lease: ticket.claim, process: owner, controlFile: configuration.controlFile, configFile, logPath, status: "starting" };
	} catch (error) {
		fs.rmSync(configuration.controlFile, { force: true });
		if (child.pid) await stopOwned(ownerOf(child.pid));
		throw error;
	}
}

export async function stopPreviewDesktop(desktop, lease) {
	if (!desktop || desktop.lease !== lease) return;
	fs.rmSync(desktop.controlFile, { force: true });
	await stopOwned(desktop.process);
}
