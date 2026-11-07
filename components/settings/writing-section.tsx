"use client";

import { SettingsRow, Toggle } from "./controls";
import {
	DEVICE_FEATURE_DEFAULTS,
	setCanvasPalette,
	setDeviceFeature,
	setNotebookLayoutPref,
	useCanvasPalette,
	useNotebookLayoutPref,
	useDeviceClass,
	useDeviceFeature,
	type DeviceClass,
	type DeviceFeature,
} from "@/components/device-features";

const DEVICE_NAME: Record<DeviceClass, string> = { phone: "phones", tablet: "tablets", laptop: "laptops and desktops" };

const FEATURES: { id: DeviceFeature; label: string; hint: string }[] = [
	{
		id: "drawing-canvas",
		label: "Drawing canvas",
		hint: "Write and sketch with Apple Pencil on a page beside the lesson, then attach the page to your answer. Fingers scroll the page; drawing with a finger can be turned on from the page's Page menu. Also offers Share from Concepts beside the composer.",
	},
	{
		id: "equation-notebook",
		label: "Equation notebook",
		hint: "Type or dictate your working and see it as lines of maths beside the lesson.",
	},
];

/** Settings → Writing: which working surfaces this device offers. Stored on
 *  this device; switching one off never deletes saved pages or working. */
export function WritingSection() {
	const device = useDeviceClass();
	const palette = useCanvasPalette();
	const canvasOn = useDeviceFeature("drawing-canvas");
	const notebookOn = useDeviceFeature("equation-notebook");
	const notebookLayout = useNotebookLayoutPref();
	return (
		<div className="flex flex-col gap-1">
			{FEATURES.map((feature) => <WritingFeatureRow key={feature.id} {...feature} device={device} />)}
			{/* Rows that only apply where their surface is on (round-10 review:
			    greyed-out rows read as broken). */}
			{device === "phone" && notebookOn && <SettingsRow testid="writing-notebook-layout" label="Equation notebook layout"
				hint="On a phone: beside the lesson, so both stay in view, or full screen, one at a time (the notebook's expand button switches between them).">
				<Choice label="Equation notebook layout" value={notebookLayout} onChange={setNotebookLayoutPref}
					options={[["split", "Beside the lesson", "notebook-layout-split"], ["full", "Full screen", "notebook-layout-full"]]} />
			</SettingsRow>}
			{canvasOn && <SettingsRow testid="writing-canvas-palette" label="Drawing tools"
				hint="How the pen, highlighter and eraser sit on the page: a compact wheel in the upper-right corner, or the taller arc along the right edge.">
				<Choice label="Drawing tools" value={palette} onChange={setCanvasPalette}
					options={[["wheel", "Wheel", "canvas-palette-wheel"], ["arc", "Arc", "canvas-palette-arc"]]} />
			</SettingsRow>}
			<p className="mt-3 text-[13px] leading-snug text-muted-foreground">
				Turning a surface off only hides it. Your saved pages and working stay in each session and come back when you turn it on again.
			</p>
		</div>
	);
}

function WritingFeatureRow({ id, label, hint, device }: { id: DeviceFeature; label: string; hint: string; device: DeviceClass }) {
	const enabled = useDeviceFeature(id);
	const byDefault = DEVICE_FEATURE_DEFAULTS[id][device];
	return (
		<SettingsRow
			testid={`writing-${id}`}
			label={label}
			hint={<>{hint} <span className="text-(--lh-faint)">{byDefault ? "On" : "Off"} by default on {DEVICE_NAME[device]}.</span></>}
		>
			<Toggle label={label} checked={enabled} onChange={(next) => setDeviceFeature(id, next === byDefault ? null : next)} />
		</SettingsRow>
	);
}

/** A two-way choice (radiogroup); touch screens give it 44px targets. */
function Choice<T extends string>({ label, value, onChange, options }: { label: string; value: T; onChange: (value: T) => void; options: readonly (readonly [T, string, string])[] }) {
	return (
		<div role="radiogroup" aria-label={label} className="lh-choice flex rounded-[10px] bg-card p-0.5">
			{options.map(([option, text, testid]) => (
				<button key={option} type="button" role="radio" aria-checked={value === option} data-testid={testid}
					onClick={() => onChange(option)}
					className={`min-h-9 whitespace-nowrap rounded-lg px-3 text-[13.5px] font-medium transition-colors ${value === option ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
					{text}
				</button>
			))}
		</div>
	);
}
