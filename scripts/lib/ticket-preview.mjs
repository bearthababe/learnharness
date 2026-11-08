import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { alive, assertPreviewCheckout, checkPR, delay, freePort, locked, ownerOf, prView, readState, stopOwned } from "./ticket-state.mjs";
import { proxyFor } from "./preview-proxy.mjs";
import { leaseExpired, newLaunch, supervisorPath } from "./preview-supervisor.mjs";
import { createPreviewTransport, verifyReviewRoutes } from "./preview-tailnet.mjs";
import { stopPreviewDesktop } from "./preview-desktop.mjs";

const listen = (server, port) => new Promise((resolve, reject) => {
	server.once("error", reject);
	server.listen(port, "127.0.0.1", () => { server.removeListener("error", reject); resolve(server); });
});
const close = server => new Promise(resolve => {
	if (!server?.listening) return resolve();
	server.close(resolve);
	server.closeAllConnections();
});

export async function observe(directory) {
	const snapshot = readState(directory);
	const observed = [];
	for (const ticket of Object.values(snapshot.tickets)) {
		if (!ticket.pr || ticket.merged || !ticket.worktree) continue;
		try {
			const pr = prView(snapshot, ticket.pr.number);
			checkPR(ticket, pr);
			await locked(directory, state => {
				const current = state.tickets[ticket.id];
				if (current.pr.number !== pr.number || current.merged) return;
				current.observerError = null;
				current.pr = pr;
				if (pr.state === "MERGED") {
					current.merged = pr;
					state.queue = state.queue.filter(id => id !== ticket.id);
					current.preview = current.claim ? "releasing" : "none";
				}
			});
			observed.push({ ticket: ticket.id, state: pr.state });
		} catch (error) {
			await locked(directory, state => { state.tickets[ticket.id].observerError = error.message; });
			observed.push({ ticket: ticket.id, error: error.message });
		}
	}
	return { observed };
}

export function clearLease(state, id, lease) {
	const ticket = state.tickets[id];
	if (!ticket || ticket.claim !== lease) return false;
	const slot = state.slots.find(candidate => candidate.ticket === id && candidate.claim === lease);
	if (slot) Object.assign(slot, { ticket: null, claim: null });
	Object.assign(ticket, { claim: null, process: null, backendPort: null, mappings: [], route: null, desktop: null, preview: "none", slot: null, reviewUrl: null, stoppedAt: new Date().toISOString() });
	return true;
}

export async function runManager(directory, { helper = null, transport = createPreviewTransport() } = {}) {
	const runtime = new Map();
	let stopping = false;
	let lastObservation = 0;
	const signalStop = () => { stopping = true; };
	for (const signal of ["SIGTERM", "SIGINT", "SIGHUP"]) process.on(signal, signalStop);
	const state = await locked(directory, current => {
		assert.equal(current.manager?.pid, process.pid, "Another manager owns this registry");
		current.manager.ready = true;
		return structuredClone(current);
	});
	async function release(id, entry, reason = "stopped") {
		entry.proxy?.stopUpgrades();
		await Promise.all([close(entry.proxy), close(entry.gateway)]);
		try { await helper?.revoke({ ticketId: id, lease: entry.claim, reason }); }
		finally { await stopOwned(entry.process); }
		await locked(directory, async current => {
			if (current.tickets[id]?.claim !== entry.claim) return;
			await stopPreviewDesktop(current.tickets[id].desktop, entry.claim);
			if (entry.route) await transport.stop(current.tickets[id].previewHost, entry.route);
			if (clearLease(current, id, entry.claim)) current.tickets[id].stopReason = reason;
		});
		if (runtime.get(id)?.claim === entry.claim) runtime.delete(id);
	}
	try {
		for (const ticket of Object.values(state.tickets)) {
			if (!ticket.claim) continue;
			await release(ticket.id, { claim: ticket.claim, process: ticket.process, route: ticket.route }, "manager-recovery");
		}
		while (!stopping) {
			for (const [id, entry] of runtime) {
				const ticket = readState(directory).tickets[id];
				let event;
				try { event = JSON.parse(fs.readFileSync(entry.eventPath, "utf8")); } catch {}
				if (event?.lease !== entry.claim) event = null;
				const expired = leaseExpired(entry.launch);
				if (ticket.claim !== entry.claim || ticket.preview === "releasing" || expired || !alive(entry.process) || ["failed", "expired", "stopped", "exited"].includes(event?.status)) {
					const reason = expired ? "expired" : ticket.preview === "releasing" ? "stopped" : event?.status ?? "failed";
					await release(id, entry, reason);
					if (reason === "failed") await locked(directory, current => { if (!current.tickets[id].claim) Object.assign(current.tickets[id], { preview: "error", error: event?.error ?? "Sandbox supervisor failed; inspect server.log" }); });
				} else if (event?.sandbox) {
					entry.socketPath = event.sandbox.socketPath;
					entry.ready = event.status === "starting";
					await locked(directory, current => {
						if (current.tickets[id].claim !== entry.claim) return;
						const running = entry.ready && fs.existsSync(entry.socketPath) && fs.lstatSync(entry.socketPath).isSocket();
						Object.assign(current.tickets[id], { preview: running ? "running" : event.status, sandbox: event.sandbox });
					});
				}
			}
			await locked(directory, async current => {
				for (const slot of current.slots) {
					if (slot.ticket || !current.queue.length) continue;
					if (!await freePort(slot.port)) { slot.error = "Occupied by an unowned listener; preserved"; continue; }
					const id = current.queue[0];
					const ticket = current.tickets[id];
					const claim = randomUUID();
					const entry = { claim, launch: newLaunch() };
					try {
						if (current.tailnetHost) {
							assert.ok(ticket.previewHost, "BLOCKED: a dedicated per-preview hostname is required; bind its private daemon using preview --tailnet-socket PATH; same-host ports do not isolate browser sessions");
							assert.equal(ticket.origin, ticket.previewHost.origin, "Preview origin no longer matches its dedicated hostname");
							await verifyReviewRoutes(current.tailnetHost, current.slots);
						}
						assertPreviewCheckout(ticket.worktree);
						assert.ok(await freePort(ticket.originPort), "Persistent ticket origin is occupied; not changing identity or stopping its owner");
						entry.proxy = await listen(proxyFor(ticket, () => entry.socketPath, { ready: () => entry.ready === true && !leaseExpired(entry.launch) }), ticket.originPort);
						entry.gateway = await listen(http.createServer((request, response) => {
							const target = new URL(ticket.origin);
							let requested;
							try { requested = new URL(request.url, "http://localhost"); }
							catch { response.writeHead(400).end("Invalid preview path"); return; }
							target.pathname = requested.pathname;
							target.search = requested.search;
							response.writeHead(302, { Location: target.href, "Cache-Control": "no-store" }).end();
						}), slot.port);
						const control = path.join(directory, "leases", claim);
						fs.mkdirSync(control, { recursive: true, mode: 0o700 });
						entry.eventPath = path.join(control, "event.json");
						const capability = await helper?.issue({ ticketId: id, lease: claim, launch: entry.launch });
						const configPath = path.join(control, "config.json");
						fs.writeFileSync(configPath, JSON.stringify({ ticketId: id, lease: claim, launch: entry.launch, eventPath: entry.eventPath, worktree: ticket.worktree, profile: ticket.profile, helperSocket: capability?.socketPath ?? null }), { mode: 0o600 });
						const log = fs.openSync(path.join(ticket.profile, "server.log"), "a", 0o600);
						const processToken = randomUUID();
						const child = spawn(process.execPath, [supervisorPath, configPath], {
							cwd: directory, detached: true, stdio: ["ignore", log, log], env: { PATH: "/usr/bin", HOME: process.env.HOME, LH_PREVIEW_PROCESS_TOKEN: processToken },
						});
						fs.closeSync(log);
						assert.ok(child.pid, "Next process failed to spawn");
						child.unref();
						entry.process = { ...ownerOf(child.pid), token: processToken };
						assert.ok(entry.process.identity, "Next process exited during startup");
						if (current.tailnetHost) entry.route = await transport.start(ticket.previewHost, { lease: claim, port: ticket.originPort });
						runtime.set(id, entry);
						Object.assign(ticket, { preview: "starting", claim, slot: slot.id, process: entry.process, backendPort: null, mappings: [], route: entry.route ?? null, launch: entry.launch, eventPath: entry.eventPath,
							deploymentAcceptance: "BLOCKED: independent final ten-flow check and helper/native parity outstanding",
							reviewUrl: current.tailnetHost ? `https://${current.tailnetHost}:${slot.httpsPort}/` : `http://127.0.0.1:${slot.port}/`, error: null });
						Object.assign(slot, { ticket: id, claim, error: null });
					} catch (error) {
						entry.proxy?.stopUpgrades();
						await Promise.all([close(entry.proxy), close(entry.gateway), stopOwned(entry.process)]);
						await helper?.revoke({ ticketId: id, lease: claim, reason: "failed" });
						if (entry.route) await transport.stop(ticket.previewHost, entry.route);
						ticket.preview = "error";
						ticket.error = error.message;
					}
					current.queue.shift();
				}
			});
			if (Date.now() - lastObservation > state.observationIntervalMs) { await observe(directory); lastObservation = Date.now(); }
			await delay(250);
		}
	} finally {
		for (const [id, entry] of runtime) {
			try { await release(id, entry); }
			catch (error) { console.error(`Cleanup blocked for ${id}: ${error.message}`); }
		}
		await locked(directory, current => { if (current.manager?.pid === process.pid) current.manager = null; });
		for (const signal of ["SIGTERM", "SIGINT", "SIGHUP"]) process.removeListener(signal, signalStop);
	}
}
