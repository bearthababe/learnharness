"use client";

import { useCallback, useState } from "react";

/** Keep a phone card's real content and backdrop mounted through its exit.
 * Logical close and successful settings writes still happen immediately. */
export function usePhoneMenuPresence<T>(open: T | null, phone: boolean) {
	const [retained, setRetained] = useState(open);
	if ((open !== null || !phone) && retained !== open) setRetained(open);
	const onClosed = useCallback(() => setRetained(null), []);
	return {
		value: phone ? open ?? retained : open,
		closing: phone && open === null && retained !== null,
		onClosed,
	};
}
