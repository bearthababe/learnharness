"use client";

import { useEffect } from "react";
import { KeyboardIcon, KeyboardOffIcon } from "lucide-react";
import { installKeyboardGuard, setKeyboardOff, useKeyboardOff } from "@/components/device-prefs";

/**
 * The on-screen keyboard switch (owner O6, placed in round 13 by P3): an
 * icon inside the chat box, beside the mic, on touch screens. Off, the
 * keyboard stays closed while the learner dictates, so the composer
 * doesn't take over the screen; on, typing is back. The state is in the
 * name ("Keyboard on" / "Keyboard off") and in sight (icon and tint).
 * Hardware typing, dictation and drafts are unaffected.
 */
export function KeyboardToggle() {
	const off = useKeyboardOff();
	useEffect(() => { installKeyboardGuard(); }, []);
	const name = off ? "Keyboard off" : "Keyboard on";
	return (
		<button
			type="button"
			className="lh-keyboard-toggle"
			data-testid="keyboard-toggle"
			data-off={off || undefined}
			aria-label={name}
			title={off ? "Keyboard off: dictate, or tap to type again" : "Keyboard on: tap to keep it closed while you dictate"}
			// Keep the field's focus (and selection) when switching.
			onPointerDown={(event) => event.preventDefault()}
			onClick={() => setKeyboardOff(!off)}
		>
			{off ? <KeyboardOffIcon aria-hidden /> : <KeyboardIcon aria-hidden />}
		</button>
	);
}
