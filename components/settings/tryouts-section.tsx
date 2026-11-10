"use client";

import { setHeaderLook, setRevealStyle, setTryout, useHeaderLook, useRevealStyle, useTryout } from "@/components/device-prefs";
import { setWheelLook, setWritingPalette, useDeviceClass, useDeviceFeature, useWheelLook, useWritingPalette, type DeviceClass } from "@/components/device-features";

/**
 * Settings → Try-out designs (round 16, owner rule): the alternatives the
 * owner wants to compare, kept apart from the everyday settings. Every
 * variant is complete and working; the first is the default. Each is kept
 * on this device, and says which device it is for.
 */
type Variant = { value: string; label: string; description: string; testid: string };
type TryoutRow = {
	id: string;
	title: string;
	description: string;
	device: string;
	applies: boolean;
	note?: string;
	value: string;
	variants: Variant[];
	onPick: (value: string) => void;
};

function TryoutCard({ row }: { row: TryoutRow }) {
	return (
		<section className="lh-tryout" data-testid={`tryout-${row.id}`} data-applies={row.applies} aria-labelledby={`tryout-${row.id}-title`}>
			<div className="lh-tryout-head">
				<h3 id={`tryout-${row.id}-title`} className="lh-tryout-title">{row.title}</h3>
				<span className="lh-tryout-device">{row.device}</span>
			</div>
			<p className="lh-tryout-desc">{row.description}</p>
			<div className="lh-tryout-options" role="radiogroup" aria-labelledby={`tryout-${row.id}-title`}>
				{row.variants.map((variant, index) => {
					const checked = row.value === variant.value;
					return (
						<button
							key={variant.value}
							type="button"
							role="radio"
							aria-checked={checked}
							data-active={checked}
							disabled={!row.applies}
							data-testid={variant.testid}
							className="lh-tryout-option"
							onClick={() => row.onPick(variant.value)}
						>
							<span className="lh-tryout-radio" aria-hidden="true" />
							<span className="lh-tryout-option-text">
								<span className="lh-tryout-option-label">
									{variant.label}
									{index === 0 && <span className="lh-tryout-default">Default</span>}
								</span>
								<span className="lh-tryout-option-desc">{variant.description}</span>
							</span>
						</button>
					);
				})}
			</div>
			{!row.applies && row.note && <p className="lh-tryout-note" data-testid={`tryout-${row.id}-note`}>{row.note}</p>}
		</section>
	);
}

const ON: Record<DeviceClass, string> = { phone: "phone", tablet: "tablet", laptop: "computer" };
/** Which device each try-out belongs to (L2: only this device's are listed). */
export const TRYOUT_DEVICE = { "header-look": "phone", "reveal-style": "phone", "card-layout": "phone", "sessions-page": "phone", "writing-palette": "tablet", "wheel-look": "tablet" } as const satisfies Record<string, DeviceClass>;
export function tryoutIdsFor(device: DeviceClass): (keyof typeof TRYOUT_DEVICE)[] {
	return (Object.keys(TRYOUT_DEVICE) as (keyof typeof TRYOUT_DEVICE)[]).filter((id) => TRYOUT_DEVICE[id] === device);
}

/**
 * Round 17 (L2): only this device's options are listed — a phone shows
 * the phone's, a tablet the tablet's; a computer has none to try and says
 * so. An option this device has but cannot use yet (the handwriting
 * notebook switched off, say) stays listed, greyed, with how to turn it on.
 */
export function TryoutsSection() {
	const device = useDeviceClass();
	const headerLook = useHeaderLook();
	const revealStyle = useRevealStyle();
	const cardLayout = useTryout("cardLayout");
	const sessionsPage = useTryout("sessionsPage");
	const writing = useDeviceFeature("writing");
	const palette = useWritingPalette();
	const wheelLook = useWheelLook();
	const rows: (TryoutRow & { on: DeviceClass })[] = [
		{
			on: "phone", id: "header-look", title: "Page bar", device: "Phone", applies: true,
			description: "The bar at the top of a session.",
			value: headerLook,
			variants: [
				{ value: "solid", label: "Solid", description: "An opaque bar above the lesson.", testid: "header-look-solid" },
				{ value: "glass", label: "Glass", description: "See-through: the lesson scrolls beneath it.", testid: "header-look-glass" },
			],
			onPick: (value) => setHeaderLook(value as "solid" | "glass"),
		},
		{
			on: "phone", id: "reveal-style", title: "Show question button", device: "Phone", applies: true,
			description: "The button that opens a check after you have read.",
			value: revealStyle,
			variants: [
				{ value: "quiet", label: "Quiet", description: "An outlined button.", testid: "reveal-style-quiet" },
				{ value: "prominent", label: "Prominent", description: "A filled button that stands out.", testid: "reveal-style-prominent" },
			],
			onPick: (value) => setRevealStyle(value as "quiet" | "prominent"),
		},
		{
			on: "phone", id: "card-layout", title: "Full-screen layout", device: "Phone", applies: true,
			description: "What takes over the screen: Thinking while reading, the notebook, an open question, a practice problem.",
			value: cardLayout,
			variants: [
				{ value: "plain", label: "Plain", description: "The whole screen, with the actions in the bottom bar.", testid: "card-layout-plain" },
				{ value: "card", label: "Card", description: "One rounded card with a label and title, big answer choices, and a filled main button at the bottom.", testid: "card-layout-card" },
			],
			onPick: (value) => setTryout("cardLayout", value as "plain" | "card"),
		},
		{
			on: "phone", id: "sessions-page", title: "Sessions", device: "Phone", applies: true,
			description: "The list of your sessions, opened from Sessions in the bar.",
			value: sessionsPage,
			variants: [
				{ value: "toolbar", label: "Page under the bar", description: "A page below the usual bar, with Sessions shown as the current page.", testid: "sessions-page-toolbar" },
				{ value: "header", label: "Page with Back", description: "A page with its own header: ‹ Back where Sessions was, and the title.", testid: "sessions-page-header" },
			],
			onPick: (value) => setTryout("sessionsPage", value as "toolbar" | "header"),
		},
		{
			on: "tablet", id: "writing-palette", title: "Writing tools", device: "Tablet", applies: writing,
			description: "The pen, eraser and colours in the handwriting notebook.",
			note: "Turn on the handwriting notebook in General to use this.",
			value: palette,
			variants: [
				{ value: "wheel", label: "Wheel", description: "A small puck you can move to any corner or edge; it opens into a wheel.", testid: "writing-palette-wheel" },
				{ value: "arc", label: "Arc", description: "A taller arc of tools along the edge.", testid: "writing-palette-arc" },
			],
			onPick: (value) => setWritingPalette(value as "wheel" | "arc"),
		},
		{
			on: "tablet", id: "wheel-look", title: "Wheel look", device: "Tablet", applies: writing && palette === "wheel",
			description: "How the opened wheel sits over the page.",
			note: writing ? "Used with the Wheel above." : "Turn on the handwriting notebook in General to use this.",
			value: wheelLook,
			variants: [
				{ value: "solid", label: "Solid", description: "An opaque wheel.", testid: "wheel-look-solid" },
				{ value: "glass", label: "Glass", description: "Lets the page show through.", testid: "wheel-look-glass" },
			],
			onPick: (value) => setWheelLook(value as "solid" | "glass"),
		},
	];
	if (!device) return <div className="lh-tryouts" data-testid="tryouts" />;
	const ids: string[] = tryoutIdsFor(device);
	const here = rows.filter((row) => ids.includes(row.id));
	// Usable ones first; one this device cannot use yet stays, greyed.
	const ordered = [...here.filter((row) => row.applies), ...here.filter((row) => !row.applies)];
	return (
		<div className="lh-tryouts" data-testid="tryouts" data-device={device}>
			{ordered.length
				? <p className="lh-tryouts-intro">Alternative designs to compare on this {ON[device]}. Each one works fully; switch any time. Kept on this {ON[device]}.</p>
				: <p className="lh-tryouts-intro" data-testid="tryouts-none">There is nothing to try on a {ON[device]} right now. The try-out designs are for phones and tablets; open Settings there to compare them.</p>}
			{ordered.map((row) => <TryoutCard key={row.id} row={row} />)}
		</div>
	);
}
