"use client";

import { DEVICE_FEATURE_LABEL, setFeatureEnabled, useDeviceClass, useDeviceFeature, type DeviceFeature } from "@/components/device-features";
import { SettingsGroup, SettingsRow, Toggle } from "./controls.tsx";

const HINT: Record<DeviceFeature, string> = {
	writing: "Write by hand on a page beside the lesson. Made for tablets with a pen.",
	notebook: "Typed or dictated working as lines of maths beside the lesson. Made for phones.",
};

const DEVICE_NAME = { phone: "phone", tablet: "tablet", laptop: "computer" } as const;

/** Settings → General → On this device: which working tools this device
 *  offers. Turning one off hides it; nothing saved is removed. */
export function DeviceToolsSettings() {
	const device = useDeviceClass();
	const writing = useDeviceFeature("writing");
	const notebook = useDeviceFeature("notebook");
	const value: Record<DeviceFeature, boolean> = { writing, notebook };
	return (
		<SettingsGroup label="On this device" testid="group-device-tools">
			{(["writing", "notebook"] as const).map((feature) => (
				<SettingsRow key={feature} label={DEVICE_FEATURE_LABEL[feature]} hint={HINT[feature]} testid={`row-device-${feature}`}>
					<Toggle
						checked={value[feature]}
						label={DEVICE_FEATURE_LABEL[feature]}
						onChange={(on) => setFeatureEnabled(feature, on)}
					/>
				</SettingsRow>
			))}
			<p className="text-xs text-muted-foreground" data-testid="device-tools-note">
				Stored on this {device ? DEVICE_NAME[device] : "device"}. Turning a tool off only hides it; your saved writing and working stay in each session.
			</p>
		</SettingsGroup>
	);
}
