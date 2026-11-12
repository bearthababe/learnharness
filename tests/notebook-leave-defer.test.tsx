/**
 * Round 20: a request to show or hide the handwriting notebook (Chat, Close)
 * is never dropped. Under load the notebook can be briefly busy (a stroke
 * ending, a page operation, a capture finishing); the tap used to be ignored,
 * leaving the learner in the notebook. It now waits and then happens, and a
 * later request replaces an earlier one.
 */
import React, { act, type MutableRefObject } from "react";
import assert from "node:assert/strict";
import { test } from "node:test";
import { parseHTML } from "linkedom";

const dom = parseHTML("<!doctype html><html><body></body></html>");
const storage = new Map<string, string>();
const localStorage = { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => void storage.set(k, v), removeItem: (k: string) => void storage.delete(k) };
Object.assign(dom.window, { localStorage, setTimeout, clearTimeout });
Object.assign(globalThis, { React, window: dom.window, document: dom.document, Element: dom.window.Element, HTMLElement: dom.window.HTMLElement, localStorage, IS_REACT_ACT_ENVIRONMENT: true });
const { createRoot } = await import("react-dom/client");
const { useHandwritingSession } = await import("../components/handwriting/session.tsx");

type Session = ReturnType<typeof useHandwritingSession>;
function Probe({ api }: { api: MutableRefObject<Session | null> }) {
	api.current = useHandwritingSession("chat_defer");
	return null;
}
const wait = (ms: number) => act(async () => { await new Promise((resolve) => setTimeout(resolve, ms)); });

test("a Chat/Close request made while the notebook is busy happens once it is free", async () => {
	const api: MutableRefObject<Session | null> = { current: null };
	const host = document.createElement("div"); document.body.append(host);
	const root = createRoot(host);
	let free = true;
	try {
		await act(async () => { root.render(<Probe api={api} />); });
		await act(async () => { api.current!.show(true); });
		assert.equal(api.current!.open, true);
		// The notebook handle reports whether it can change view right now.
		(api.current!.ref as MutableRefObject<{ canResize: () => boolean } | null>).current = { canResize: () => free };
		free = false;
		await act(async () => { api.current!.show(false); });
		await wait(250);
		assert.equal(api.current!.open, true, "still busy: the request waits (it is not applied mid-stroke)");
		free = true;
		await wait(250);
		assert.equal(api.current!.open, false, "free again: the waiting Chat/Close happens without a second tap");
	} finally { await act(async () => root.unmount()); host.remove(); }
});

test("a later request replaces an earlier waiting one", async () => {
	const api: MutableRefObject<Session | null> = { current: null };
	const host = document.createElement("div"); document.body.append(host);
	const root = createRoot(host);
	let free = true;
	try {
		await act(async () => { root.render(<Probe api={api} />); });
		await act(async () => { api.current!.show(true); });
		(api.current!.ref as MutableRefObject<{ canResize: () => boolean } | null>).current = { canResize: () => free };
		free = false;
		await act(async () => { api.current!.show(false); });
		await act(async () => { api.current!.show(true); });
		free = true;
		await wait(300);
		assert.equal(api.current!.open, true, "the latest request (stay open) wins");
	} finally { await act(async () => root.unmount()); host.remove(); }
});
