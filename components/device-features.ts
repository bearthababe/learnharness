"use client";

/**
 * Device features (owner decision, 2026-11-06): the two working surfaces
 * belong to the device they suit.
 *
 * - The drawing canvas (Pencil or finger on paper, opened with "Write") is a
 *   tablet feature: on by default on tablets, off on phones and laptops.
 * - The equation notebook (typed or dictated lines of maths) is a phone
 *   feature: on by default on phones, off on tablets and laptops.
 *
 * Both are switchable in Settings → Writing, stored on this device only.
 * Switching a surface off only stops offering it: saved pages, working and
 * drafts are untouched, and switching it back on brings everything back.
 */

import { useSyncExternalStore } from "react";

export type DeviceClass = "phone" | "tablet" | "laptop";
export type DeviceFeature = "drawing-canvas" | "equation-notebook";

export const DEVICE_FEATURE_DEFAULTS: Record<DeviceFeature, Record<DeviceClass, boolean>> = {
	"drawing-canvas": { phone: false, tablet: true, laptop: false },
	"equation-notebook": { phone: true, tablet: false, laptop: false },
};

export const deviceFeatureKey = (feature: DeviceFeature) => `lh:feature:${feature}`;
const CHANGE_EVENT = "lh:device-feature";
const PHONE_QUERY = "(max-width: 767px)";
// A touch-first screen wider than a phone. iPadOS reports a coarse primary
// pointer even with a keyboard attached; a trackpad-only laptop never does.
const TABLET_QUERY = "(min-width: 768px) and (pointer: coarse)";

/** Which kind of device this is, from the same breakpoints the layout uses. */
export function deviceClass(): DeviceClass {
	if (typeof window === "undefined" || typeof window.matchMedia !== "function") return "laptop";
	if (window.matchMedia(PHONE_QUERY).matches) return "phone";
	if (window.matchMedia(TABLET_QUERY).matches) return "tablet";
	return "laptop";
}

/** The learner's explicit choice on this device, or null for the default. */
export function storedDeviceFeature(feature: DeviceFeature): boolean | null {
	try {
		const value = window.localStorage.getItem(deviceFeatureKey(feature));
		return value === "on" ? true : value === "off" ? false : null;
	} catch {
		return null; // storage blocked: the device default applies
	}
}

export function deviceFeatureEnabled(feature: DeviceFeature): boolean {
	if (typeof window === "undefined") return false;
	return storedDeviceFeature(feature) ?? DEVICE_FEATURE_DEFAULTS[feature][deviceClass()];
}

/** Switch a surface on or off on this device (null = back to the default). */
export function setDeviceFeature(feature: DeviceFeature, enabled: boolean | null): void {
	try {
		if (enabled === null) window.localStorage.removeItem(deviceFeatureKey(feature));
		else window.localStorage.setItem(deviceFeatureKey(feature), enabled ? "on" : "off");
	} catch { /* storage blocked: nothing to remember */ }
	window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: feature }));
}

function subscribe(update: () => void) {
	const queries = typeof window.matchMedia === "function" ? [window.matchMedia(PHONE_QUERY), window.matchMedia(TABLET_QUERY)] : [];
	for (const query of queries) query.addEventListener?.("change", update);
	window.addEventListener(CHANGE_EVENT, update);
	window.addEventListener("storage", update);
	return () => {
		for (const query of queries) query.removeEventListener?.("change", update);
		window.removeEventListener(CHANGE_EVENT, update);
		window.removeEventListener("storage", update);
	};
}

/** Whether this device offers the surface; re-renders on every change. */
export function useDeviceFeature(feature: DeviceFeature): boolean {
	return useSyncExternalStore(subscribe, () => deviceFeatureEnabled(feature), () => false);
}

/** The current device class, live (for showing the default in Settings). */
export function useDeviceClass(): DeviceClass {
	return useSyncExternalStore(subscribe, deviceClass, () => "laptop");
}
