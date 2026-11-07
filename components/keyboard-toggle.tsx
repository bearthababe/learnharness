"use client";

import { useEffect } from "react";
import { KeyboardIcon, KeyboardOffIcon } from "lucide-react";
import { installKeyboardGuard, setKeyboardOff, useKeyboardOff } from "@/components/device-prefs";

/**
 * Hide keyboard (owner O6): beside dictation on touch screens. Pressed, the
 * on-screen keyboard stays closed while the learner dictates, so the
 * composer doesn't take over the screen; pressed again, typing is back.
 * Typing on a hardware keyboard, dictation and drafts are unaffected.
 */
export function KeyboardToggle() {
	const off = useKeyboardOff();
	useEffect(() => { installKeyboardGuard(); }, []);
	return (
		<button
			type="button"
			className="lh-keyboard-toggle lh-quiet-control"
			data-testid="keyboard-toggle"
			aria-pressed={off}
			title={off ? "The on-screen keyboard stays closed. Tap to type again." : "Keep the on-screen keyboard closed while you dictate"}
			onClick={() => setKeyboardOff(!off)}
		>
			{off ? <KeyboardOffIcon aria-hidden /> : <KeyboardIcon aria-hidden />}
			<span>Hide keyboard</span>
		</button>
	);
}
