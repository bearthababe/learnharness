import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { alive, assertPreviewCheckout, checkPR, choosePort, delay, freePort, git, locked, ownerOf, previewEnvironment, prView, readState, stopOwned } from "./ticket-state.mjs";

const tailnet = args => execFileSync("tailscale", ["serve", ...args], { encoding: "utf8", timeout: 15_000, stdio: ["ignore", "pipe", "pipe"] });
const mappingAt = (status, host, port) => status.Web?.[`${host}:${port}`]?.Handlers;
function addMapping(host, port, target) {
	const status = JSON.parse(tailnet(["status", "--json"]));
	assert.ok(!status.TCP?.[port] && !mappingAt(status, host, port) && !status.AllowFunnel?.[`${host}:${port}`], `Tailnet port ${port} already has an owner or Funnel permission; not replacing it`);
	tailnet(["--bg", `--https=${port}`, target]);
	return { host, port, target };
}
function removeMapping(mapping) {
	const status = JSON.parse(tailnet(["status", "--json"]));
	const handlers = mappingAt(status, mapping.host, mapping.port);
	if (!handlers && !status.TCP?.[mapping.port]) return;
	assert.ok(!status.AllowFunnel?.[`${mapping.host}:${mapping.port}`], "Mapping acquired Funnel permission; stop and coordinate with its owner");
	assert.ok(handlers && Object.keys(handlers).length === 1 && handlers["/"]?.Proxy === mapping.target, `Tailnet mapping ${mapping.port} changed owners; leaving it untouched`);
	tailnet([`--https=${mapping.port}`, "off"]);
}
const listen = (server, port) => new Promise((resolve, reject) => {
	server.once("error", reject);
	server.listen(port, "127.0.0.1", () => { server.removeListener("error", reject); resolve(server); });
});
const close = server => new Promise(resolve => {
	if (!server?.listening) return resolve();
	server.close(resolve);
	server.closeAllConnections();
});
const prefixOf = ticket => `lh-preview-${ticket.id}__`;
function proxyFor(ticket, backendPort) {
	const prefix = prefixOf(ticket);
	const origin = new URL(ticket.origin);
	const valid = request => request.headers.host === origin.host && (!request.headers.origin || request.headers.origin === origin.origin);
	const headers = request => ({ ...request.headers,
		cookie: (request.headers.cookie ?? "").split(";").map(value => value.trim()).filter(value => value.startsWith(prefix)).map(value => value.slice(prefix.length)).join("; "),
		"accept-encoding": "identity", host: origin.host,
	});
	const server = http.createServer((request, response) => {
		if (!valid(request)) { response.writeHead(403).end("Wrong preview origin"); return; }
		const upstream = http.request({ host: "127.0.0.1", port: backendPort, path: request.url, method: request.method, headers: headers(request) }, incoming => {
			const outgoing = { ...incoming.headers };
			if (outgoing["set-cookie"]) outgoing["set-cookie"] = outgoing["set-cookie"].map(cookie => prefix + cookie);
			response.writeHead(incoming.statusCode, outgoing);
			incoming.pipe(response);
			incoming.once("error", () => response.destroy());
		});
		upstream.once("error", () => { if (!response.headersSent) response.writeHead(503); response.end("Ticket preview is starting or unavailable"); });
		request.once("aborted", () => upstream.destroy());
		response.once("close", () => upstream.destroy());
		request.pipe(upstream);
	});
	const upgraded = new Set();
	server.on("upgrade", (request, socket, head) => {
		if (!valid(request)) { socket.destroy(); return; }
		const upstream = net.connect(backendPort, "127.0.0.1");
		upgraded.add(socket);
		upgraded.add(upstream);
		const finish = () => { upgraded.delete(socket); upgraded.delete(upstream); socket.destroy(); upstream.destroy(); };
		socket.on("error", finish).on("close", finish);
		upstream.on("error", finish).on("close", finish);
		upstream.once("connect", () => {
			const outgoing = headers(request);
			upstream.write(`${request.method} ${request.url} HTTP/${request.httpVersion}\r\n${Object.entries(outgoing).map(([name, value]) => `${name}: ${value}`).join("\r\n")}\r\n\r\n`);
			if (head.length) upstream.write(head);
			socket.pipe(upstream).pipe(socket);
		});
	});
	server.stopUpgrades = () => { for (const socket of upgraded) socket.destroy(); };
	return server;
}

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

export async function runManager(directory) {
	const runtime = new Map();
	let stopping = false;
	let lastObservation = 0;
	let mappingStatus;
	let lastMappingCheck = 0;
	for (const signal of ["SIGTERM", "SIGINT", "SIGHUP"]) process.on(signal, () => { stopping = true; });
	const state = await locked(directory, current => {
		assert.equal(current.manager?.pid, process.pid, "Another manager owns this registry");
		current.manager.ready = true;
		return structuredClone(current);
	});
	async function release(id, entry, recover = false) {
		entry.proxy?.stopUpgrades();
		await Promise.all([close(entry.proxy), close(entry.gateway)]);
		await stopOwned(entry.process);
		for (const mapping of [...(entry.mappings ?? [])].reverse()) removeMapping(mapping);
		await locked(directory, current => {
			const ticket = current.tickets[id];
			const slot = current.slots.find(candidate => candidate.ticket === id && candidate.claim === entry.claim);
			if (slot) Object.assign(slot, { ticket: null, claim: null });
			if (ticket.claim === entry.claim) {
				const requeue = recover && !ticket.merged && ["starting", "running"].includes(ticket.preview);
				Object.assign(ticket, { claim: null, process: null, backendPort: null, mappings: [], preview: requeue ? "queued" : "none", slot: null, reviewUrl: null });
				if (requeue && !current.queue.includes(id)) current.queue.push(id);
			}
		});
		runtime.delete(id);
	}
	try {
		for (const ticket of Object.values(state.tickets)) {
			if (!ticket.claim) continue;
			await release(ticket.id, { claim: ticket.claim, process: ticket.process, mappings: ticket.mappings }, true);
		}
		while (!stopping) {
			for (const [id, entry] of runtime) {
				const ticket = readState(directory).tickets[id];
				if (ticket.preview === "releasing" || !alive(entry.process)) {
					const crashed = ticket.preview !== "releasing";
					await release(id, entry);
					if (crashed) await locked(directory, current => Object.assign(current.tickets[id], { preview: "error", error: "Owned app exited; inspect its profile/server.log before requesting another preview" }));
				} else if (ticket.preview === "starting" && !await freePort(ticket.backendPort)) {
					await locked(directory, current => { if (current.tickets[id].claim === entry.claim) current.tickets[id].preview = "running"; });
				}
			}
			await locked(directory, async current => {
				if (current.tailnetHost && current.queue.length && Date.now() - lastMappingCheck > 3000) {
					mappingStatus = JSON.parse(tailnet(["status", "--json"]));
					lastMappingCheck = Date.now();
				}
				for (const slot of current.slots) {
					if (slot.ticket || !current.queue.length) continue;
					if (!await freePort(slot.port)) { slot.error = "Occupied by an unowned listener; preserved"; continue; }
					if (current.tailnetHost && (mappingStatus?.TCP?.[slot.httpsPort] || mappingAt(mappingStatus ?? {}, current.tailnetHost, slot.httpsPort) || mappingStatus?.AllowFunnel?.[`${current.tailnetHost}:${slot.httpsPort}`])) {
						slot.error = "Occupied by an unowned tailnet mapping or Funnel permission; preserved";
						continue;
					}
					const id = current.queue[0];
					const ticket = current.tickets[id];
					const claim = randomUUID();
					const entry = { claim, mappings: [] };
					try {
						assertPreviewCheckout(ticket.worktree);
						assert.ok(await freePort(ticket.originPort), "Persistent ticket origin is occupied; not changing identity or stopping its owner");
						const excluded = [...current.slots.map(candidate => candidate.port), ...current.slots.map(candidate => candidate.httpsPort), ...Object.values(current.tickets).flatMap(candidate => [candidate.originPort, candidate.backendPort])];
						const backendPort = await choosePort(20000, excluded);
						entry.proxy = await listen(proxyFor(ticket, backendPort), ticket.originPort);
						entry.gateway = await listen(http.createServer((request, response) => {
							const target = new URL(ticket.origin);
							const requested = new URL(request.url, "http://localhost");
							target.pathname = requested.pathname;
							target.search = requested.search;
							response.writeHead(302, { Location: target.href, "Cache-Control": "no-store" }).end();
						}), slot.port);
						if (current.tailnetHost) {
							entry.mappings.push(addMapping(current.tailnetHost, ticket.originPort, `http://127.0.0.1:${ticket.originPort}`));
							entry.mappings.push(addMapping(current.tailnetHost, slot.httpsPort, `http://127.0.0.1:${slot.port}`));
						}
						const log = fs.openSync(path.join(ticket.profile, "server.log"), "a", 0o600);
						const processToken = randomUUID();
						const child = spawn(process.execPath, [path.join(ticket.worktree, "node_modules/next/dist/bin/next"), "dev", "--hostname", "127.0.0.1", "--port", String(backendPort)], {
							cwd: ticket.worktree, detached: true, stdio: ["ignore", log, log], env: { ...previewEnvironment(ticket.profile, prefixOf(ticket), current.tailnetHost ?? "127.0.0.1"), LH_PREVIEW_PROCESS_TOKEN: processToken },
						});
						fs.closeSync(log);
						assert.ok(child.pid, "Next process failed to spawn");
						child.unref();
						entry.process = { ...ownerOf(child.pid), token: processToken };
						assert.ok(entry.process.identity, "Next process exited during startup");
						runtime.set(id, entry);
						Object.assign(ticket, { preview: "starting", claim, slot: slot.id, process: entry.process, backendPort, mappings: entry.mappings,
							reviewUrl: current.tailnetHost ? `https://${current.tailnetHost}:${slot.httpsPort}/` : `http://127.0.0.1:${slot.port}/`, error: null });
						Object.assign(slot, { ticket: id, claim, error: null });
					} catch (error) {
						entry.proxy?.stopUpgrades();
						await Promise.all([close(entry.proxy), close(entry.gateway), stopOwned(entry.process)]);
						for (const mapping of entry.mappings.reverse()) removeMapping(mapping);
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
	}
}
