import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import net from "node:net";
import { randomUUID } from "node:crypto";
import { bootIdentity, monotonicMilliseconds } from "./preview-sandbox.mjs";

const identity = pid => {
	try {
		const contents = fs.readFileSync(`/proc/${pid}/stat`, "utf8");
		const fields = contents.slice(contents.lastIndexOf(")") + 2).split(" ");
		return fields[0] === "Z" ? null : fields[19];
	} catch { return null; }
};
const token = value => typeof value === "string" && /^[a-zA-Z0-9_-]{1,120}$/.test(value);
const limit = 32 * 1024 * 1024;
async function body(request) {
	const chunks = []; let size = 0;
	for await (const chunk of request) {
		size += chunk.length;
		if (size > limit) throw new Error("Unavailable");
		chunks.push(chunk);
	}
	return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
const listen = (server, socketPath) => new Promise((resolve, reject) => { server.once("error", reject); server.listen(socketPath, () => { server.removeListener("error", reject); fs.chmodSync(socketPath, 0o600); resolve(); }); });

export async function startPreviewSubscriptionHelper({ directory, backend, enterRequest = () => () => {} }) {
	assert.equal(process.platform, "linux", "Preview helper requires Linux process identities");
	assert.ok(path.isAbsolute(directory), "Helper directory must be absolute");
	fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
	assert.equal(fs.realpathSync(directory), path.resolve(directory), "Helper directory must not be a symlink");
	const info = fs.statSync(directory);
	assert.equal(info.uid, process.getuid());
	assert.equal(info.mode & 0o077, 0, "Helper directory must be private");
	const sessions = new Map();
	const spent = new Set();
	const pendingIssues = new Set();
	let closed = false;
	let closing;
	function live(session) {
		return !closed && !session.revoked && session.launch.boot === bootIdentity() && monotonicMilliseconds() < session.launch.deadline && identity(session.manager.pid) === session.manager.start;
	}
	function allowed(session) { return live(session) && session.granted; }
	async function revoke({ ticketId, lease }) {
		const session = sessions.get(lease);
		if (!session || session.ticketId !== ticketId) return;
		session.revoked = true;
		session.granted = false;
		if (!session.stopping) session.stopping = (async () => {
			clearTimeout(session.deadline);
			for (const controller of session.requests) controller.abort();
			for (const socket of session.connections) socket.destroy();
			await new Promise(resolve => session.server.close(resolve));
			await Promise.all([...session.pending]);
			sessions.delete(lease);
		})();
		await session.stopping;
	}
	function issue(value) {
		const pending = issueSession(value);
		pendingIssues.add(pending);
		return pending.finally(() => pendingIssues.delete(pending));
	}
	async function issueSession({ ticketId, lease, launch, managerPid = process.pid }) {
		assert.ok(!closed, "Helper is closed");
		assert.ok(token(ticketId) && token(lease), "Invalid preview identity");
		assert.ok(!spent.has(lease), "Lease is already issued");
		assert.ok(Number.isFinite(launch?.started) && Number.isFinite(launch?.deadline) && launch.deadline - launch.started === 600000 && launch.started <= monotonicMilliseconds(), "Invalid ten-minute launch");
		const start = identity(managerPid);
		assert.ok(Number.isSafeInteger(managerPid) && managerPid > 0 && start, "Manager identity is unavailable");
		const session = { ticketId, lease, launch: { ...launch }, manager: { pid: managerPid, start }, granted: false, revoked: false, requests: new Set(), pending: new Set(), connections: new Set(), backend: backend.open() };
		assert.ok(live(session), "Lease has expired");
		const server = http.createServer(async (request, response) => {
			const controller = new AbortController();
			let finishRequest;
			let settle;
			const pending = new Promise(resolve => { settle = resolve; });
			session.pending.add(pending);
			session.requests.add(controller);
			response.once("close", () => controller.abort());
			try {
				if (!allowed(session) || request.method !== "POST" || request.headers.upgrade || request.headers["x-preview-lease"] !== lease || !["/read", "/dispatch"].includes(request.url)) throw new Error("Unavailable");
				finishRequest = enterRequest();
				const command = await body(request);
				if (!allowed(session)) throw new Error("Unavailable");
				if (request.url === "/read") {
					const value = await session.backend.read(command.channel, command.op, command.fields ?? {});
					if (!allowed(session)) throw new Error("Unavailable");
					response.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
					response.end(JSON.stringify(value));
				} else {
					const upstream = await session.backend.dispatch(command.channel, command.fields ?? {}, command.request ?? {}, controller.signal);
					if (!allowed(session)) { await upstream.body?.cancel(); throw new Error("Unavailable"); }
					if (!upstream.ok) { await upstream.body?.cancel(); throw new Error("Unavailable"); }
					response.writeHead(upstream.status, { "content-type": upstream.headers.get("content-type")?.startsWith("text/event-stream") ? "text/event-stream" : "application/json", "cache-control": "no-store" });
					if (upstream.body) for await (const chunk of upstream.body) {
						if (!allowed(session) || controller.signal.aborted) break;
						if (!response.write(chunk)) await new Promise(resolve => { response.once("drain", resolve); response.once("close", resolve); });
					}
					response.end();
				}
			} catch {
				if (!response.headersSent && !response.destroyed) { response.writeHead(403, { "content-type": "application/json", "cache-control": "no-store" }); response.end('{"error":"Preview subscription unavailable. Local approval for this active lease is required."}'); }
				else response.destroy();
			} finally { controller.abort(); session.requests.delete(controller); finishRequest?.(); session.pending.delete(pending); settle(); }
		});
		server.on("connection", socket => { session.connections.add(socket); socket.once("close", () => session.connections.delete(socket)); });
		server.on("upgrade", (request, socket) => socket.destroy());
		server.requestTimeout = 30000;
		session.server = server;
		const socketPath = path.join(directory, `${randomUUID()}.sock`);
		spent.add(lease);
		await listen(server, socketPath);
		if (closed) { await new Promise(resolve => server.close(resolve)); throw new Error("Helper is closed"); }
		sessions.set(lease, session);
		session.deadline = setTimeout(() => { void revoke({ ticketId, lease }); }, Math.max(0, launch.deadline - monotonicMilliseconds()));
		return { socketPath };
	}
	async function command(value) {
		assert.ok(!closed, "Helper is closed");
		if (value.op === "issue") return issue(value);
		if (value.op === "revoke") { await revoke(value); return { revoked: true }; }
		if (value.op === "grant") {
			const session = sessions.get(value.lease);
			assert.ok(session && session.ticketId === value.ticketId && live(session), "No matching live lease");
			session.granted = true;
			return { ticketId: session.ticketId, lease: session.lease, granted: true, deadline: session.launch.deadline };
		}
		throw new Error("Invalid local command");
	}
	const controlPath = path.join(directory, "control.sock");
	const adminConnections = new Set();
	const admin = net.createServer(socket => {
		adminConnections.add(socket);
		socket.once("close", () => adminConnections.delete(socket));
		let pending = "", handled = false;
		socket.setTimeout(5000, () => socket.destroy());
		socket.on("error", () => {});
		socket.on("data", async chunk => {
			pending += chunk.toString("utf8");
			if (Buffer.byteLength(pending) > 16384) return socket.destroy();
			if (handled || !pending.includes("\n")) return;
			handled = true;
			try { socket.end(`${JSON.stringify({ ok: true, value: await command(JSON.parse(pending.slice(0, pending.indexOf("\n")))) })}\n`); }
			catch { socket.end('{"ok":false,"error":"Local helper command refused."}\n'); }
		});
	});
	await listen(admin, controlPath);
	const watcher = setInterval(() => { for (const session of sessions.values()) if (!live(session)) void revoke(session); }, 100);
	return {
		issue, revoke, command, controlPath,
		close() {
			if (!closing) closing = (async () => {
				closed = true; clearInterval(watcher);
				for (const socket of adminConnections) socket.destroy();
				const stopped = new Promise(resolve => admin.close(resolve));
				await Promise.allSettled([...pendingIssues]);
				await Promise.all([...sessions.values()].map(session => revoke(session)));
				await stopped;
			})();
			return closing;
		},
	};
}

export function previewHelperCommand(directory, command) {
	return new Promise((resolve, reject) => {
		const socket = net.createConnection(path.join(directory, "control.sock"));
		let pending = "";
		socket.setTimeout(5000, () => socket.destroy(new Error("Local helper unavailable")));
		socket.on("error", reject);
		socket.on("connect", () => socket.write(`${JSON.stringify(command)}\n`));
		socket.on("data", chunk => { pending += chunk.toString("utf8"); if (pending.length > 16384) socket.destroy(new Error("Invalid helper reply")); });
		socket.on("end", () => { try { const reply = JSON.parse(pending); if (!reply.ok) throw new Error("Local helper command refused"); resolve(reply.value); } catch (error) { reject(error); } });
	});
}

export function previewHelperHooks(directory) {
	return { issue: fields => previewHelperCommand(directory, { ...fields, managerPid: process.pid, op: "issue" }), revoke: fields => previewHelperCommand(directory, { ...fields, op: "revoke" }) };
}
