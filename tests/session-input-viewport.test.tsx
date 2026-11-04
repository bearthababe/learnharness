import React, { act, useRef } from "react";
import assert from "node:assert/strict";
import { test } from "node:test";
import { parseHTML } from "linkedom";
import { useSessionInputViewport } from "../components/session-input-viewport.ts";

const dom = parseHTML("<!doctype html><html><body></body></html>");
Object.assign(globalThis, { React, window: dom.window, document: dom.document, HTMLElement: dom.window.HTMLElement, Element: dom.window.Element, MutationObserver: dom.window.MutationObserver, IS_REACT_ACT_ENVIRONMENT: true });
Object.defineProperty(document, "oninput", { value: null, configurable: true });
const { createRoot } = await import("react-dom/client");

test("mounted focused-input lock contains edges, keeps native interiors/pinch, and releases only its own lock", async () => {
	let active: Element | null = null;
	Object.defineProperty(document, "activeElement", { configurable: true, get: () => active });
	Object.defineProperty(window, "innerWidth", { configurable: true, value: 390, writable: true });
	Object.defineProperty(window, "innerHeight", { configurable: true, value: 800 });
	const viewport = new dom.window.EventTarget();
	Object.assign(viewport, { height: 480, offsetTop: 0 });
	Object.defineProperty(window, "visualViewport", { configurable: true, value: viewport });
	window.scrollTo = () => {};
	globalThis.getComputedStyle = ((el: HTMLElement) => ({ overflowY: el.dataset.scroller !== undefined ? "auto" : "visible", overflowX: "visible" })) as typeof getComputedStyle;
	function Surface() {
		const ref = useRef<HTMLDivElement>(null);
		useSessionInputViewport(ref);
		return <div ref={ref} data-session-workspace=""><header>Header</header><div data-input-owner="tutor"><div data-scroller="">History</div><textarea /></div><section data-input-owner="notebook"><textarea /></section></div>;
	}
	const host = document.createElement("div"); document.body.append(host);
	const root = createRoot(host);
	try {
		await act(async () => root.render(<Surface />));
		const surface = host.firstElementChild as HTMLElement;
		const field = host.querySelector("textarea")!;
		const scroller = host.querySelector<HTMLElement>("[data-scroller]")!;
		Object.defineProperties(scroller, { scrollHeight: { value: 1000 }, clientHeight: { value: 200 } });
		scroller.scrollTop = 300;
		active = field;
		await act(async () => field.dispatchEvent(new window.Event("focusin", { bubbles: true })));
		assert.equal(surface.dataset.inputFocused, "tutor");
		assert.equal(surface.style.getPropertyValue("--session-viewport-height"), "480px");
		assert.equal(document.documentElement.hasAttribute("data-session-input-locked"), true);
		function gesture(target: Element, dy: number, fingers = 1) {
			const start = new window.Event("touchstart", { bubbles: true, cancelable: true });
			Object.assign(start, { touches: Array.from({ length: fingers }, () => ({ clientX: 10, clientY: 100 })) });
			target.dispatchEvent(start);
			const move = new window.Event("touchmove", { bubbles: true, cancelable: true });
			Object.assign(move, { touches: Array.from({ length: fingers }, () => ({ clientX: 10, clientY: 100 + dy })) });
			target.dispatchEvent(move);
			return move.defaultPrevented;
		}
		assert.equal(gesture(scroller, 30), false, "native interior scrolling");
		scroller.scrollTop = 0;
		assert.equal(gesture(scroller, 30), true, "top edge cannot bounce page");
		scroller.scrollTop = 800;
		assert.equal(gesture(scroller, -30), true, "bottom edge cannot bounce page");
		assert.equal(gesture(host.querySelector("header")!, 30), true);
		Object.defineProperties(field, { scrollHeight: { value: 400 }, clientHeight: { value: 80 } });
		field.scrollTop = 100;
		assert.equal(gesture(field, 20), false, "multiline input scrolls natively inside");
		field.scrollTop = 0;
		assert.equal(gesture(field, 20), true, "multiline input edge is contained");
		assert.equal(gesture(field, 30, 2), false, "pinch remains native");
		document.body.style.overflow = "hidden"; // an independently owned modal lock
		active = null;
		await act(async () => field.dispatchEvent(new window.Event("focusout", { bubbles: true })));
		assert.equal(document.documentElement.hasAttribute("data-session-input-locked"), false);
		Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
		const notebookField = host.querySelector<HTMLElement>('[data-input-owner="notebook"] textarea')!;
		active = notebookField;
		await act(async () => notebookField.dispatchEvent(new window.Event("focusin", { bubbles: true })));
		assert.equal(surface.dataset.inputFocused, "notebook");
		assert.equal(surface.dataset.keyboardOpen, "true");
		Object.defineProperty(window, "innerWidth", { configurable: true, value: 834 });
		window.matchMedia = query => ({ matches: window.innerWidth < 980, media: query, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => true });
		await act(async () => window.dispatchEvent(new window.Event("resize")));
		assert.equal(document.documentElement.hasAttribute("data-session-input-locked"), true, "touch tablet focus retains the mobile lock above 768px");
		await act(async () => notebookField.parentElement!.remove());
		assert.equal(document.documentElement.hasAttribute("data-session-input-locked"), false, "closing the focused pane releases focus ownership");
		assert.equal(document.body.style.overflow, "hidden", "blur cannot release a modal lock");
		assert.equal(scroller.scrollTop, 800);
		assert.equal(gesture(host.querySelector("header")!, 30), false);
		active = field;
		await act(async () => field.dispatchEvent(new window.Event("focusin", { bubbles: true })));
		Object.defineProperty(window, "innerWidth", { configurable: true, value: 1000 });
		await act(async () => window.dispatchEvent(new window.Event("resize")));
		assert.equal(document.documentElement.hasAttribute("data-session-input-locked"), false);
	} finally { await act(async () => root.unmount()); host.remove(); document.body.style.overflow = ""; }
});
