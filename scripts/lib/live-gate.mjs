import fs from "node:fs";

// The shared admission gate for tutor model calls in the live exercise. The harness sets the allowance
// (requests left under the run's guard) and the deadline; the tutor's chat route calls admitTutorCall
// before every dispatch, so nothing is sent past either limit.
export function openGate(file, { allowed, deadline }) {
	fs.writeFileSync(file, JSON.stringify({ allowed: Math.max(0, allowed), used: 0, deadline }));
}

export function readGate(file) {
	return JSON.parse(fs.readFileSync(file, "utf8"));
}

export function admitTutorCall(file, now = Date.now()) {
	if (!file) throw new Error("Live gate missing: tutor dispatch refused");
	const gate = readGate(file);
	if (now >= gate.deadline || gate.used >= gate.allowed) throw new Error("Run cap reached: tutor dispatch refused");
	gate.used++;
	fs.writeFileSync(file, JSON.stringify(gate));
}
