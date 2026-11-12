"use client";

import { useEffect } from "react";
import { redactSecrets } from "@/src/core";

/**
 * Round 19 (§0): the rolling client log a 🐞 report carries — the last
 * console errors and warnings, failed requests and where the learner went
 * (ported from lego-notebook's bug-recorder). Credentials are cut from each
 * line as it is kept; request bodies are never recorded.
 */
export type BugLogEntry = { at: string; kind: "error" | "warn" | "fetch" | "nav"; text: string };
declare global { interface Window { __lhBugLog?: BugLogEntry[] } }

// The same definition the server applies to everything it stores (src/core/redact.ts).
const redact = redactSecrets;

export function BugRecorder() {
	useEffect(() => {
		if (window.__lhBugLog) return;
		const log: BugLogEntry[] = (window.__lhBugLog = []);
		const add = (kind: BugLogEntry["kind"], text: string) => {
			log.push({ at: new Date().toISOString(), kind, text: redact(text).slice(0, 1000) });
			if (log.length > 80) log.shift();
		};
		const str = (a: unknown) => (a instanceof Error ? `${a.message}\n${a.stack ?? ""}` : typeof a === "string" ? a : (() => { try { return JSON.stringify(a); } catch { return String(a); } })());
		const origError = console.error, origWarn = console.warn;
		console.error = (...a: unknown[]) => { add("error", a.map(str).join(" ")); origError(...a); };
		console.warn = (...a: unknown[]) => { add("warn", a.map(str).join(" ")); origWarn(...a); };
		const onError = (e: ErrorEvent) => add("error", `${e.message} @ ${e.filename}:${e.lineno}`);
		const onRejection = (e: PromiseRejectionEvent) => add("error", `Unhandled: ${str(e.reason)}`);
		window.addEventListener("error", onError);
		window.addEventListener("unhandledrejection", onRejection);
		const origFetch = window.fetch;
		window.fetch = async (...args: Parameters<typeof fetch>) => {
			const input = args[0];
			const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
			const method = args[1]?.method ?? (input instanceof Request ? input.method : "GET");
			try {
				const res = await origFetch(...args);
				// The activity channel answers 404 outside main's local service: not a problem.
				if (!res.ok && !url.includes("/__local/activity")) add("fetch", `${method} ${url} → ${res.status}`);
				return res;
			} catch (err) {
				if (!(err instanceof DOMException && err.name === "AbortError")) add("fetch", `${method} ${url} failed: ${str(err)}`);
				throw err;
			}
		};
		let last = "";
		const nav = () => { const here = location.pathname + location.search; if (here !== last) { last = here; add("nav", here); } };
		nav();
		const timer = window.setInterval(nav, 1000);
		return () => window.clearInterval(timer);
	}, []);
	return null;
}
