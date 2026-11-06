"use client";

import { useEffect, useState } from "react";

/**
 * Session titles by id, for places that only hold an id (tool traces that
 * name a session). One list fetch per page load, shared by every caller;
 * a failed fetch simply leaves the id unnamed.
 */
let titles: Promise<Map<string, string>> | null = null;

function loadTitles(): Promise<Map<string, string>> {
	titles ??= fetch("/api/chats")
		.then((res) => (res.ok ? res.json() : []))
		.then((body: unknown) => {
			const list = (body as { chats?: unknown })?.chats ?? body;
			const map = new Map<string, string>();
			if (Array.isArray(list)) {
				for (const item of list as { id?: unknown; title?: unknown }[]) {
					if (typeof item.id === "string" && typeof item.title === "string") map.set(item.id, item.title);
				}
			}
			return map;
		})
		.catch(() => new Map<string, string>());
	return titles;
}

/** The title of session `id`, once known (null until then or if unknown). */
export function useSessionTitle(id: string | undefined): string | null {
	const [title, setTitle] = useState<string | null>(null);
	useEffect(() => {
		if (!id) return;
		let alive = true;
		void loadTitles().then((map) => { if (alive) setTitle(map.get(id) ?? null); });
		return () => { alive = false; };
	}, [id]);
	return title;
}
