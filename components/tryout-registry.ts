"use client";

import { setHeaderLook, setRevealStyle, setTryout, useHeaderLook, useRevealStyle, useTryout } from "@/components/device-prefs";
import { setWheelLook, setWritingPalette, useDeviceFeature, useWheelLook, useWritingPalette, type DeviceClass } from "@/components/device-features";

/**
 * The try-out designs (round 16 onwards), declared once (B18, round 18).
 * Settings → Try-out designs lists them, and Prototype view puts a switch
 * next to each one where it shows (PrototypeSwitch). A new try-out is one
 * entry here plus a <PrototypeSwitch tryout="…" anchor="…"> where it appears.
 * The first variant is the default.
 */
/** `switchLabel`: a shorter name for Prototype view's switch, where the
 *  label is long (the switch must fit the small spots beside a design). */
export type TryoutVariant = { value: string; label: string; description: string; switchLabel?: string };
export type TryoutDef = {
	id: TryoutId;
	title: string;
	/** The switch's short name for the design ("Layout", "Bar"). */
	short: string;
	description: string;
	/** The device it is for (L2: only this device's are listed). */
	on: DeviceClass;
	variants: readonly TryoutVariant[];
	/** Hooks: each def's are called in a fixed order wherever it is read. */
	useValue: () => string;
	useApplies?: () => { applies: boolean; note?: string };
	set: (value: string) => void;
};

/** Which device each try-out belongs to. */
export const TRYOUT_DEVICE = { "header-look": "phone", "reveal-style": "phone", "card-layout": "phone", "sessions-page": "phone", "focus-place": "phone", "ask-tutor": "phone", "writing-palette": "tablet", "wheel-look": "tablet", "focus-place-tablet": "tablet" } as const satisfies Record<string, DeviceClass>;
export type TryoutId = keyof typeof TRYOUT_DEVICE;

export const TRYOUT_DEFS: readonly TryoutDef[] = [
	{
		id: "header-look", title: "Page bar", short: "Bar", on: "phone",
		description: "The bar at the top of a session.",
		variants: [
			{ value: "solid", label: "Solid", description: "An opaque bar above the lesson." },
			{ value: "glass", label: "Glass", description: "See-through: the lesson scrolls beneath it." },
		],
		useValue: useHeaderLook,
		set: (value) => setHeaderLook(value as "solid" | "glass"),
	},
	{
		id: "reveal-style", title: "Show question button", short: "Button", on: "phone",
		description: "The button that opens a check after you have read.",
		variants: [
			{ value: "quiet", label: "Quiet", description: "An outlined button." },
			{ value: "prominent", label: "Prominent", description: "A filled button that stands out." },
		],
		useValue: useRevealStyle,
		set: (value) => setRevealStyle(value as "quiet" | "prominent"),
	},
	{
		id: "card-layout", title: "Full-screen layout", short: "Layout", on: "phone",
		description: "What takes over the screen: Thinking while reading, the notebook, an open question, a practice problem.",
		variants: [
			{ value: "plain", label: "Plain", description: "The whole screen, with the actions in the bottom bar." },
			{ value: "card", label: "Card", description: "One rounded card with a label and title, big answer choices, and a filled main button at the bottom." },
		],
		useValue: () => useTryout("cardLayout"),
		set: (value) => setTryout("cardLayout", value as "plain" | "card"),
	},
	{
		id: "sessions-page", title: "Sessions", short: "Sessions", on: "phone",
		description: "The list of your sessions, opened from Sessions in the bar.",
		variants: [
			{ value: "toolbar", label: "Page under the bar", switchLabel: "Under bar", description: "A page below the usual bar, with Sessions shown as the current page." },
			{ value: "header", label: "Page with Back", switchLabel: "With Back", description: "A page with its own header: ‹ Back where Sessions was, and the title." },
		],
		useValue: () => useTryout("sessionsPage"),
		set: (value) => setTryout("sessionsPage", value as "toolbar" | "header"),
	},
	{
		id: "focus-place", title: "Where Focus lives", short: "Focus", on: "phone",
		description: "The Focus control (hides the page bar; the way back is in the same spot).",
		variants: [
				{ value: "toolbar", label: "Toolbar", description: "Directly left of ⋯ in the page bar (as before)." },
				{ value: "bottom", label: "Bottom row", switchLabel: "Bottom", description: "By the chat box, in thumb reach." },
				{ value: "tabs", label: "Right-edge tabs", switchLabel: "Tabs", description: "Small tabs on the right edge, like page markers in a book: Focus near the top; Notebook and Keys at the bottom." },
			],
		useValue: () => useTryout("focusPlace"),
		set: (value) => setTryout("focusPlace", value as "toolbar" | "bottom" | "tabs"),
	},
	{
		id: "ask-tutor", title: "Ask tutor in the notebook", short: "Ask tutor", on: "phone",
		description: "A quiet Ask tutor in the notebook pane: back to the lesson's chat box with your working attached.",
		variants: [
			{ value: "on", label: "On", description: "Ask tutor shows in the notebook pane." },
			{ value: "off", label: "Off", description: "Only Back to lesson (the working comes along either way)." },
		],
		useValue: () => useTryout("askTutor"),
		set: (value) => setTryout("askTutor", value as "on" | "off"),
	},
	{
		id: "writing-palette", title: "Writing tools", short: "Tools", on: "tablet",
		description: "The pen, eraser and colours in the handwriting notebook.",
		variants: [
			{ value: "wheel", label: "Wheel", description: "A small puck you can move to any corner or edge; it opens into a wheel." },
			{ value: "arc", label: "Arc", description: "A taller arc of tools along the edge." },
		],
		useValue: useWritingPalette,
		useApplies: () => { const writing = useDeviceFeature("writing"); return { applies: writing, note: "Turn on the handwriting notebook in General to use this." }; },
		set: (value) => setWritingPalette(value as "wheel" | "arc"),
	},
	{
		id: "wheel-look", title: "Wheel look", short: "Wheel", on: "tablet",
		description: "How the opened wheel sits over the page.",
		variants: [
			{ value: "solid", label: "Solid", description: "An opaque wheel." },
			{ value: "glass", label: "Glass", description: "Lets the page show through." },
		],
		useValue: useWheelLook,
		useApplies: () => {
			const writing = useDeviceFeature("writing"), palette = useWritingPalette();
			return { applies: writing && palette === "wheel", note: writing ? "Used with the Wheel above." : "Turn on the handwriting notebook in General to use this." };
		},
		set: (value) => setWheelLook(value as "solid" | "glass"),
	},
];

// The tablet's Focus placement: the same choice, on the tablet.
(TRYOUT_DEFS as TryoutDef[]).push({ ...TRYOUT_DEFS.find(def => def.id === "focus-place")!, id: "focus-place-tablet", on: "tablet" });

export function tryoutDef(id: TryoutId): TryoutDef {
	return TRYOUT_DEFS.find((def) => def.id === id)!;
}
export function tryoutIdsFor(device: DeviceClass): TryoutId[] {
	return (Object.keys(TRYOUT_DEVICE) as TryoutId[]).filter((id) => TRYOUT_DEVICE[id] === device);
}
