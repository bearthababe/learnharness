"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import { createNotebookSession } from "./notebook-session";
import { useNotifyHub } from "./server-events";
import { useDeploymentActivity } from "./deployment-activity";

export function useNotebookSession(chatId: string) {
	const session = useMemo(() => createNotebookSession(chatId), [chatId]);
	const state = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
	useDeploymentActivity("notebook", () => !state.view || state.saving || state.editing || state.inputLocked || !!state.draftText.trim());
	const hub = useNotifyHub();
	useEffect(() => {
		let timer: ReturnType<typeof setTimeout> | undefined;
		const refresh = () => { clearTimeout(timer); timer = undefined; void session.refresh(); };
		refresh();
		const off = hub?.subscribe("notebook-changed", event => {
			if (event.chatId !== chatId) return;
			clearTimeout(timer); timer = setTimeout(refresh, 250);
		});
		const resync = hub?.onResync(refresh);
		return () => { clearTimeout(timer); off?.(); resync?.(); session.dispose(); };
	}, [session, hub, chatId]);
	return { session, ...state };
}
