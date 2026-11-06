"use client";

import { SettingsRow, Toggle } from "./controls";
import {
	DEVICE_FEATURE_DEFAULTS,
	setDeviceFeature,
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
		hint: "Write and sketch with Pencil or a finger on a page beside the lesson, then attach the page to your answer.",
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
	return (
		<div className="flex flex-col gap-1">
			{FEATURES.map((feature) => <WritingFeatureRow key={feature.id} {...feature} device={device} />)}
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
