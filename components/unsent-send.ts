/**
 * A message the learner sent that the server has not confirmed (whole-app
 * redesign, round 10: an offline Send cleared the composer, showed a bubble
 * the server never saved, and lost the text on reload).
 *
 * The text stays on this device until the server confirms it. When a send
 * fails, the page checks the saved record: a message the server did keep is
 * adopted (never offered twice); one it did not keep goes back into the
 * composer, which keeps it across a reload. Nothing is ever sent for the
 * learner — sending again is their explicit choice.
 */

import type { LhMessage } from "@/src/core";

const key = (chatId: string) => `lh:unsent:${chatId}`;

/** The held send: its text, and how many confirmed learner messages the
 *  session had when it was sent (so an earlier identical "yes" is never
 *  mistaken for this one). */
export interface HeldSend { text: string; before: number }

export function rememberUnsent(chatId: string, held: HeldSend): void {
	try { window.localStorage.setItem(key(chatId), JSON.stringify(held)); } catch { /* storage blocked: the draft still holds it this visit */ }
}

export function readUnsent(chatId: string): HeldSend | null {
	try {
		const value = JSON.parse(window.localStorage.getItem(key(chatId)) ?? "null") as HeldSend | null;
		return value && typeof value.text === "string" && typeof value.before === "number" ? value : null;
	} catch { return null; }
}

/** Learner messages the server has stamped (local optimistic ids start
 *  "c_"). Pure. */
export function confirmedUserCount(messages: readonly LhMessage[]): number {
	return messages.filter((message) => message.role === "user" && !String(message.id).startsWith("c_")).length;
}

export function forgetUnsent(chatId: string): void {
	try { window.localStorage.removeItem(key(chatId)); } catch { /* storage blocked */ }
}

/** The text of the record's latest learner message, if any. Pure. */
export function lastUserText(messages: readonly LhMessage[]): string | null {
	for (let i = messages.length - 1; i >= 0; i--) {
		const message = messages[i]!;
		if (message.role !== "user") continue;
		const content = (message as { content?: unknown }).content;
		if (typeof content === "string") return content;
		if (Array.isArray(content)) return content.map((part) => (part && typeof part === "object" && "text" in part && typeof part.text === "string" ? part.text : "")).join("");
		return null;
	}
	return null;
}

/** Did the saved record keep this send? A learner message beyond those
 *  confirmed at send time must carry this text. Pure. */
export function recordKept(messages: readonly LhMessage[], held: HeldSend): boolean {
	const confirmed = messages.filter((message) => message.role === "user" && !String(message.id).startsWith("c_"));
	return confirmed.slice(held.before).some((message) => lastUserText([message])?.trim() === held.text.trim());
}

/** The messages without this send's unconfirmed bubble (a local id the
 *  server never stamped, at the very end). Pure. */
export function withoutUnconfirmedSend(messages: readonly LhMessage[], text: string): LhMessage[] {
	const last = messages.at(-1);
	if (!last || last.role !== "user" || !String(last.id).startsWith("c_")) return [...messages];
	return lastUserText([last])?.trim() === text.trim() ? messages.slice(0, -1) : [...messages];
}

/** A send failure in plain words: the browser's own network messages
 *  ("Failed to fetch", "Load failed", "NetworkError…") mean the server was
 *  not reached. Pure. */
export function plainSendError(message: string): string {
	if (/failed to fetch|load failed|networkerror|network request failed|network error/i.test(message)) return "Couldn't reach the server. Check your connection, then try again.";
	// A provider's JSON envelope ("401: {"message":"…","code":401}") reads as
	// its own message.
	const envelope = /^(\d{3}):\s*(\{.*\})\s*$/s.exec(message);
	if (envelope) {
		try {
			const inner = (JSON.parse(envelope[2]!) as { message?: unknown; error?: { message?: unknown } | unknown });
			const text = typeof inner.message === "string" ? inner.message : typeof (inner.error as { message?: unknown })?.message === "string" ? (inner.error as { message: string }).message : null;
			if (text) return `The model provider refused the request (${envelope[1]}: ${text}).`;
		} catch { /* not JSON: keep the original */ }
	}
	return message;
}
