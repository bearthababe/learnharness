"use client";

import { useEffect, useLayoutEffect, useRef } from "react";

const sources = new Map<object, { reason: string; read: () => boolean }>();
const notifications = new Set<() => void>();

export function useDeploymentActivity(reason: string, read: () => boolean) {
	const current = useRef(read);
	current.current = read;
	useLayoutEffect(() => {
		const key = {};
		sources.set(key, { reason, read: () => current.current() });
		for (const notify of notifications) notify();
		return () => {
			let unfinished = true;
			try { unfinished = current.current(); } catch {}
			if (unfinished) sources.set(key, { reason: "unreachable-client-input", read: () => true });
			else sources.delete(key);
			for (const notify of notifications) notify();
		};
	}, [reason]);
}

export function DeploymentActivity({ documentId }: { documentId: string | null }) {
	useEffect(() => {
		if (!documentId) return;
		let sequence = 0;
		let freeze: string | null = null;
		let stopped = false;
		let pending = false;
		let again = false;
		let recentInput = 0;
		const initialInert = document.body.inert;
		function reasons() {
			const values = new Set<string>();
			for (const source of sources.values()) {
				try { if (source.read()) values.add(source.reason); } catch { values.add("unknown-client-state"); }
			}
			for (const field of document.querySelectorAll<HTMLElement>('textarea:not([readonly]):not([disabled]), [contenteditable="true"]')) {
				if ((field instanceof HTMLTextAreaElement ? field.value : field.textContent)?.trim()) values.add("unsent-text");
			}
			if (Date.now() - recentInput < 1000) values.add("input-in-progress");
			return [...values];
		}
		async function report() {
			if (stopped) return;
			if (pending) { again = true; return; }
			pending = true;
			try {
				const response = await fetch("/__local/activity", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: documentId, sequence: ++sequence, reasons: reasons(), freeze }), signal: AbortSignal.timeout(3000) });
				if (!response.ok) throw new Error("Activity channel unavailable");
				const next = await response.json();
				if (stopped) return;
				if (next.freeze !== freeze) {
					if (next.freeze && reasons().length) { again = true; }
					else { freeze = next.freeze; document.body.inert = !!freeze || initialInert; again = true; }
				}
			} catch {
				if (freeze && !stopped) {
					try {
						const response = await fetch("/api/runtime", { cache: "no-store", signal: AbortSignal.timeout(2000) });
						if (response.ok && !(await response.json()).maintenance) location.reload();
					} catch {}
				}
			} finally { pending = false; if (again && !stopped) { again = false; void report(); } }
		}
		function input(event: Event) {
			if (freeze) { event.preventDefault(); event.stopImmediatePropagation(); return; }
			recentInput = Date.now();
			void report();
		}
		function leave(event: PageTransitionEvent) {
			const unfinished = reasons().filter(reason => reason !== "input-in-progress");
			void fetch("/__local/activity", { method: "POST", keepalive: true, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: documentId, sequence: ++sequence, reasons: unfinished, freeze, leave: !event.persisted }) }).catch(() => {});
		}
		function returned() { void report(); }
		const events = ["beforeinput", "input", "pointerdown", "keydown", "change"];
		for (const name of events) document.addEventListener(name, input, true);
		window.addEventListener("pagehide", leave);
		window.addEventListener("pageshow", returned);
		const notify = () => { void report(); };
		notifications.add(notify);
		const timer = setInterval(notify, 500);
		notify();
		return () => {
			stopped = true; clearInterval(timer); notifications.delete(notify);
			for (const name of events) document.removeEventListener(name, input, true);
			window.removeEventListener("pagehide", leave);
			window.removeEventListener("pageshow", returned);
			document.body.inert = initialInert;
		};
	}, [documentId]);
	return null;
}
