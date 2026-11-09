"use client";

import type { LhMessage } from "@/src/core";

/**
 * The learner's messages while they are being sent, kept on this device
 * until the server acknowledges each one. A send that fails (offline,
 * aborted, refused) or a reload in between never loses words: a failed
 * message is either back in the composer or shown as "not sent" with its
 * own Send again / Edit / Discard. Each message is its own entry, so a
 * newer draft typed while an older one was in flight is never mistaken for
 * it. Nothing is ever re-sent automatically.
 */
export type UnsentEntry = {
	id: string;
	text: string;
	at: number;
	/** How many learner messages with exactly these words the conversation
	 *  already held when this attempt began (round 13 C1). Delivery is
	 *  judged against it, never by matching words alone: resending the same
	 *  words as an earlier message must not read as "already delivered". */
	seen?: number;
};

const key = (chatId: string) => `lh:unsent:${chatId}`;

function write(chatId: string, entries: UnsentEntry[]): void {
	try {
		if (entries.length) localStorage.setItem(key(chatId), JSON.stringify(entries));
		else localStorage.removeItem(key(chatId));
	} catch { /* storage blocked: this view only */ }
}

export function listUnsent(chatId: string): UnsentEntry[] {
	try {
		const value = JSON.parse(localStorage.getItem(key(chatId)) ?? "null") as unknown;
		// Round-9 single-entry copies read as a one-item list.
		const items = Array.isArray(value) ? value : value && typeof value === "object" ? [{ id: "u_legacy", ...(value as object) }] : [];
		return items.filter((item): item is UnsentEntry => !!item && typeof item.id === "string" && typeof item.text === "string" && !!item.text.trim() && typeof item.at === "number" && (item.seen === undefined || typeof item.seen === "number"));
	} catch { return []; }
}

/** Add or update one message's copy. */
export function putUnsent(chatId: string, entry: UnsentEntry): void {
	const entries = listUnsent(chatId).filter((item) => item.id !== entry.id);
	write(chatId, [...entries, entry]);
}

export function removeUnsent(chatId: string, id: string): void {
	write(chatId, listUnsent(chatId).filter((item) => item.id !== id));
}

export function newUnsentId(): string {
	return `u_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function learnerText(message: LhMessage): string | null {
	if (message.role !== "user") return null;
	const content = (message as { content?: unknown }).content;
	return (typeof content === "string" ? content : Array.isArray(content) ? content.map((part) => (part as { text?: unknown })?.text ?? "").join("") : "").trim();
}
const isLocal = (message: LhMessage) => typeof message.id === "string" && message.id.startsWith("c_");

/** How many learner messages with exactly these words the conversation
 *  holds right now — the page's own accepted-but-not-yet-adopted bubbles
 *  included — taken as an attempt's `seen` when it begins. */
export function learnerTextCount(messages: readonly LhMessage[], text: string): number {
	const words = text.trim();
	return messages.filter((message) => learnerText(message) === words).length;
}

/** Legacy copies (no `seen`): the record holds a learner message with the
 *  same text, sent at or after the try. */
export function deliveredIn(messages: readonly LhMessage[], unsent: Pick<UnsentEntry, "text" | "at">): boolean {
	return messages.some((message) => {
		// Only the server's record counts: the page's own optimistic bubble
		// (a local "c_" id) carries the same words but proves nothing.
		if (isLocal(message) || learnerText(message) !== unsent.text.trim()) return false;
		const at = (message as { timestamp?: unknown }).timestamp;
		return typeof at !== "number" || at >= unsent.at - 60_000;
	});
}

/** The kept attempts the server's record now holds (a lost acknowledgement
 *  that did land). An attempt counts as delivered only when the record has
 *  more learner messages with its words than existed when it began; extra
 *  copies are matched to the attempts in the order they were made, so two
 *  identical failed attempts are never both retired by one delivery. */
export function deliveredEntries(messages: readonly LhMessage[], entries: readonly UnsentEntry[]): Set<string> {
	const delivered = new Set<string>();
	const groups = new Map<string, UnsentEntry[]>();
	for (const entry of entries) {
		if (entry.seen === undefined) { if (deliveredIn(messages, entry)) delivered.add(entry.id); continue; }
		const words = entry.text.trim();
		groups.set(words, [...groups.get(words) ?? [], entry]);
	}
	for (const [words, group] of groups) {
		const count = messages.filter((message) => !isLocal(message) && learnerText(message) === words).length;
		const ordered = [...group].sort((a, b) => a.at - b.at);
		let next = 0;
		for (let copy = 0; copy < count && next < ordered.length; copy++) {
			if (ordered[next]!.seen! <= copy) delivered.add(ordered[next++]!.id);
		}
	}
	return delivered;
}

/** Plain words for a failed request ("Failed to fetch" and friends). */
export function friendlyNetworkError(message: string): string | null {
	return /failed to fetch|networkerror|network error|load failed|err_|fetch failed|offline|aborted/i.test(message)
		? "LearnHarness couldn't be reached. Check your connection."
		: null;
}
