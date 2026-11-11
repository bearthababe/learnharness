const { randomUUID } = require("node:crypto");

function createActivity({ now = Date.now, staleAfter = 5000, work = () => [] } = {}) {
	const clients = new Map();
	let freeze = null;
	let requests = 0;
	let generation = 0;
	const listeners = new Set();
	function changed() { generation++; for (const listener of listeners) listener(); }
	function snapshot() {
		const reasons = [];
		let unknown = false;
		for (const client of clients.values()) {
			if (!client.reported || now() - client.seen > staleAfter) unknown = true;
			for (const reason of client.reasons) reasons.push(reason);
			if (client.reasons.some(reason => ["unknown-client-state", "unreachable-client-input"].includes(reason))) unknown = true;
		}
		try { reasons.push(...work()); } catch { unknown = true; }
		if (requests) reasons.push("server-request");
		return { state: unknown ? "unknown" : reasons.length ? "busy" : "idle", reasons: [...new Set(reasons)], generation, clients: clients.size, freeze };
	}
	function open(session) {
		const id = randomUUID();
		clients.set(id, { session, seen: now(), reported: false, sequence: -1, reasons: [], acknowledgement: null });
		changed();
		return id;
	}
	function report(session, value) {
		const client = clients.get(value.id);
		if (!client || client.session !== session || !Number.isSafeInteger(value.sequence) || value.sequence <= client.sequence || !Array.isArray(value.reasons) || value.reasons.length > 40 || value.reasons.some(reason => typeof reason !== "string" || !/^[a-z-]{1,48}$/.test(reason))) throw new Error("Invalid client activity");
		if (value.leave && value.reasons.length === 0 && !freeze) clients.delete(value.id);
		else Object.assign(client, { reported: true, seen: now(), reasons: value.reasons, sequence: value.sequence, acknowledgement: value.freeze === freeze ? freeze : null });
		changed();
		return { freeze, state: snapshot().state };
	}
	function beginFreeze() {
		if (freeze || snapshot().state !== "idle") throw new Error("Application is not idle");
		freeze = randomUUID();
		changed();
		return freeze;
	}
	function assertFrozen(token) {
		if (!token || token !== freeze || snapshot().state !== "idle" || [...clients.values()].some(client => client.acknowledgement !== token)) throw new Error("Idle client freeze is not established");
	}
	function thaw() { freeze = null; changed(); }
	function enterRequest() {
		if (freeze) throw new Error("Maintenance pause");
		requests++; changed();
		let finished = false;
		return () => { if (!finished) { finished = true; requests--; changed(); } };
	}
	return { open, report, snapshot, isFrozen() { return freeze !== null; }, beginFreeze, assertFrozen, thaw, enterRequest, subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); } };
}

module.exports = { createActivity };
