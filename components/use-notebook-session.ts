"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import { createNotebookSession } from "./notebook-session";
import { useNotifyHub } from "./server-events";

export function useNotebookSession(chatId: string) {
	const session = useMemo(() => createNotebookSession(chatId), [chatId]);
	const state = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
	const hub = useNotifyHub();
	useEffect(() => {
		void session.refresh();
		const off = hub?.subscribe("notebook-changed", (event) => { if (event.chatId === chatId) void session.refresh(); });
		const resync = hub?.onResync(() => { void session.refresh(); });
		return () => { off?.(); resync?.(); session.dispose(); };
	}, [session, hub, chatId]);
	return { session, ...state };
}
