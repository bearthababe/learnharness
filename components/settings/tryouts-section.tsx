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

export function TryoutsSection() {
	const device = useDeviceClass();
	const headerLook = useHeaderLook();
	const revealStyle = useRevealStyle();
	const paneControls = useTryout("paneControls");
	const panePeek = useTryout("panePeek");
	const tabletPane = useTryout("tabletPane");
	const notebookInput = useTryout("notebookInput");
	const writing = useDeviceFeature("writing");
	const notebook = useDeviceFeature("notebook");
	const palette = useWritingPalette();
	const wheelLook = useWheelLook();
	// Before the device is known (server render) every card shows as usable.
	const phone = device === null || device === "phone";
	const tablet = device === null || device === "tablet";
	const paneHere = phone || (tablet && tabletPane === "pane");
	const here = device ? ON[device] : "device";
	const rows: TryoutRow[] = [
		{
			id: "header-look", title: "Page bar", device: "Phone", applies: phone,
			description: "The bar at the top of a session.",
			note: `Used on phones; this ${here} keeps its own bar.`,
			value: headerLook,
			variants: [
				{ value: "solid", label: "Solid", description: "An opaque bar above the lesson.", testid: "header-look-solid" },
				{ value: "glass", label: "Glass", description: "See-through: the lesson scrolls beneath it.", testid: "header-look-glass" },
			],
			onPick: (value) => setHeaderLook(value as "solid" | "glass"),
		},
		{
			id: "reveal-style", title: "Show question button", device: "Phone", applies: phone,
			description: "The button that opens a check after you have read.",
			note: `Used on phones; this ${here} shows the question beside the lesson.`,
			value: revealStyle,
			variants: [
				{ value: "quiet", label: "Quiet", description: "An outlined button.", testid: "reveal-style-quiet" },
				{ value: "prominent", label: "Prominent", description: "A filled button that stands out.", testid: "reveal-style-prominent" },
			],
			onPick: (value) => setRevealStyle(value as "quiet" | "prominent"),
		},
		{
			id: "tablet-pane", title: "Thinking while reading on a tablet", device: "Tablet", applies: tablet,
			description: "Where you write your thoughts while reading a lesson.",
			note: `Used on tablets; phones always use the pane.`,
			value: tabletPane,
			variants: [
				{ value: "inline", label: "Beside the lesson", description: "A field under the lesson, as now.", testid: "tablet-pane-inline" },
				{ value: "pane", label: "Slide-in pane", description: "Opens full screen from the right, as on a phone.", testid: "tablet-pane-pane" },
			],
			onPick: (value) => setTryout("tabletPane", value as "inline" | "pane"),
		},
		{
			id: "pane-controls", title: "Writing pane controls", device: tablet && !phone ? "Tablet with the pane" : "Phone", applies: paneHere,
			description: "The mic and keyboard in the Thinking while reading pane.",
			note: device === "tablet" ? "Turn on the slide-in pane above to use this on the tablet." : `Used in the phone's pane.`,
			value: paneControls,
			variants: [
				{ value: "field-mic", label: "Mic in the field", description: "The mic sits inside the field; ⋯ in the bottom bar has the keyboard switch.", testid: "pane-controls-field-mic" },
				{ value: "big-mic", label: "Big mic bar", description: "A large mic in the bottom bar, with a keyboard on/off button.", testid: "pane-controls-big-mic" },
			],
			onPick: (value) => setTryout("paneControls", value as "field-mic" | "big-mic"),
		},
		{
			id: "pane-peek", title: "Seeing the lesson while writing", device: tablet && !phone ? "Tablet with the pane" : "Phone", applies: paneHere,
			description: "How you look back at the lesson from the pane.",
			note: device === "tablet" ? "Turn on the slide-in pane above to use this on the tablet." : `Used in the phone's pane.`,
			value: panePeek,
			variants: [
				{ value: "pill", label: "Continue writing pill", description: "‹ Lesson shows the lesson; a pill brings you back to your note.", testid: "pane-peek-pill" },
				{ value: "strip", label: "From the lesson strip", description: "The paragraph you were reading, at the top of the pane.", testid: "pane-peek-strip" },
				{ value: "peek", label: "Peek button", description: "A Peek at lesson button in the bottom bar.", testid: "pane-peek-peek" },
			],
			onPick: (value) => setTryout("panePeek", value as "pill" | "strip" | "peek"),
		},
		{
			id: "notebook-input", title: "Notebook chat box", device: "Phone", applies: phone && notebook,
			description: "The one box for talking to the tutor or instructing the equation notebook.",
			note: device === "phone" ? "Turn on the equation notebook in General to use this." : "Used with the phone's equation notebook.",
			value: notebookInput,
			variants: [
				{ value: "docked", label: "Docked, with a switch", description: "At the bottom of the screen, with a Tutor | Notebook switch.", testid: "notebook-input-docked" },
				{ value: "follow", label: "Follows your work", description: "Belongs to the area you are working in: the lesson or the notebook.", testid: "notebook-input-follow" },
			],
			onPick: (value) => setTryout("notebookInput", value as "docked" | "follow"),
		},
		{
			id: "writing-palette", title: "Writing tools", device: "Tablet", applies: writing,
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
			id: "wheel-look", title: "Wheel look", device: "Tablet", applies: writing && palette === "wheel",
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
	// The ones this device uses come first; the others stay listed, greyed.
	const ordered = [...rows.filter((row) => row.applies), ...rows.filter((row) => !row.applies)];
	return (
		<div className="lh-tryouts" data-testid="tryouts">
			<p className="lh-tryouts-intro">Alternative designs to compare. Each one works fully; switch any time. Kept on this {here}.</p>
			{ordered.map((row) => <TryoutCard key={row.id} row={row} />)}
		</div>
	);
}
