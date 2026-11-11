/**
 * Round 19 (§0): a 🐞 report's durable draft, after 3d-printers' ReportDraft.
 * The report has its own id before the first request, and the draft (page
 * context, note, kind) is kept on this device until the server has every
 * edit. A lost response, a reload or an offline moment never loses the note:
 * the next flush replays the create (idempotent by id) and the newest edit.
 */
export type BugKind = "bug" | "change";
export type BugDraftValue = {
	id: string;
	kind: BugKind;
	note: string;
	/** Bumped by every edit; `savedSequence` is the last one the server has. */
	sequence: number;
	savedSequence: number;
	created: boolean;
	/** The page context, sent with the create (dropped once created). */
	report?: Record<string, unknown>;
	/** Discard was pressed: delete on the server, then forget. */
	discardPending?: boolean;
	/** The dialog was left: forget the draft once the server has it all. */
	closed?: boolean;
};
export type BugTransport = {
	create(id: string, report: Record<string, unknown>): Promise<"saved" | "discarded">;
	edit(id: string, edit: { note: string; kind: BugKind; seq: number }): Promise<void>;
	remove(id: string): Promise<void>;
};

export class BugDraft {
	private flight: Promise<void> | null = null;
	constructor(public value: BugDraftValue, private send: BugTransport, private persist: (value: BugDraftValue, forget: boolean) => void) {}
	update(patch: Partial<Pick<BugDraftValue, "note" | "kind" | "closed" | "discardPending">>) {
		Object.assign(this.value, patch);
		if (patch.note !== undefined || patch.kind !== undefined) this.value.sequence += 1;
		this.persist(this.value, false);
	}
	get saved() { return this.value.created && this.value.savedSequence === this.value.sequence; }
	/** Send whatever the server does not have yet; resolves once it has it all. */
	async flush(): Promise<void> {
		if (this.flight) { await this.flight.catch(() => {}); return this.flush(); }
		this.flight = (async () => {
			const v = this.value;
			if (v.discardPending) {
				await this.send.remove(v.id);
				this.persist(v, true);
				return;
			}
			if (!v.created) {
				const sequence = v.sequence;
				const outcome = await this.send.create(v.id, { ...(v.report ?? {}), note: v.note, kind: v.kind });
				if (outcome === "discarded") { this.persist(v, true); return; }
				v.created = true; delete v.report;
				// The create carried the note and kind as they were then.
				if (v.savedSequence < sequence) v.savedSequence = sequence;
				this.persist(v, false);
			}
			while (v.savedSequence !== v.sequence && !v.discardPending) {
				const seq = v.sequence;
				await this.send.edit(v.id, { note: v.note, kind: v.kind, seq });
				v.savedSequence = Math.max(v.savedSequence, seq);
				this.persist(v, false);
			}
			if (v.discardPending) { await this.send.remove(v.id); this.persist(v, true); return; }
			if (v.closed) this.persist(v, true);
		})();
		try { await this.flight; } finally { this.flight = null; }
	}
}

/** This device's outbox of report drafts not yet fully on the server. */
const OUTBOX = "lh:bug-outbox";
export function readOutbox(): Record<string, BugDraftValue> {
	try {
		const value = JSON.parse(localStorage.getItem(OUTBOX) ?? "{}");
		return value && typeof value === "object" && !Array.isArray(value) ? value : {};
	} catch { return {}; }
}
export function persistDraft(value: BugDraftValue, forget: boolean) {
	try {
		const outbox = readOutbox();
		if (forget) delete outbox[value.id]; else outbox[value.id] = value;
		if (Object.keys(outbox).length) localStorage.setItem(OUTBOX, JSON.stringify(outbox)); else localStorage.removeItem(OUTBOX);
	} catch { /* storage blocked: this view keeps it */ }
}
export function newReportId() {
	const random = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID().replace(/-/g, "").slice(0, 10) : Math.random().toString(36).slice(2, 12);
	return `r-${Date.now().toString(36)}-${random}`;
}
