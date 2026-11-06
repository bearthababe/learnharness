"use client";

import { useSyncExternalStore } from "react";

/**
 * Working tools offered per device (owner decision, 2026-11-06): the
 * drawing canvas ("Write") is a tablet tool and the equation notebook a
 * phone tool. Each has a switch in Settings → General, stored on this
 * device; the defaults follow the device class. Turning a tool off only
 * hides its entry points and panes — saved writing and working stay in the
 * session and return when it is switched back on.
 */
export type DeviceFeature = "writing" | "notebook";
export type DeviceClass = "phone" | "tablet" | "laptop";

const STORAGE_PREFIX = "lh:device-tool:";
const PHONE_MEDIA = "(max-width: 767px)";
const TABLET_MEDIA = "(min-width: 768px) and (pointer: coarse)";

const DEFAULTS: Record<DeviceFeature, Record<DeviceClass, boolean>> = {
	writing: { phone: false, tablet: true, laptop: false },
	notebook: { phone: true, tablet: false, laptop: false },
};

export const DEVICE_FEATURE_LABEL: Record<DeviceFeature, string> = {
	writing: "Drawing canvas",
	notebook: "Equation notebook",
};

/** The device class this screen behaves as (null outside the browser). */
export function deviceClass(): DeviceClass | null {
	if (typeof window === "undefined" || typeof window.matchMedia !== "function") return null;
	if (window.matchMedia(PHONE_MEDIA).matches) return "phone";
	if (window.matchMedia(TABLET_MEDIA).matches) return "tablet";
	return "laptop";
}

export function defaultFor(feature: DeviceFeature, device: DeviceClass): boolean {
	return DEFAULTS[feature][device];
}

function stored(feature: DeviceFeature): boolean | null {
	try {
		const value = window.localStorage.getItem(STORAGE_PREFIX + feature);
		return value === "on" ? true : value === "off" ? false : null;
	} catch {
		return null;
	}
}

/** Whether `feature` is offered here: the device's own choice, else its default.
 *  Outside a browser (server render, tests without media queries) every
 *  tool is offered, so nothing is hidden before the device is known. */
export function featureEnabled(feature: DeviceFeature): boolean {
	const device = deviceClass();
	if (device === null) return true;
	return stored(feature) ?? defaultFor(feature, device);
}

const listeners = new Set<() => void>();
let version = 0;
function notify() {
	version++;
	for (const listener of listeners) listener();
}

export function setFeatureEnabled(feature: DeviceFeature, on: boolean) {
	try { window.localStorage.setItem(STORAGE_PREFIX + feature, on ? "on" : "off"); } catch { /* storage blocked: this view only */ }
	notify();
}

function subscribe(listener: () => void) {
	listeners.add(listener);
	const media = typeof window !== "undefined" && typeof window.matchMedia === "function"
		? [window.matchMedia(PHONE_MEDIA), window.matchMedia(TABLET_MEDIA)]
		: [];
	const onChange = () => notify();
	for (const m of media) m.addEventListener?.("change", onChange);
	const onStorage = (e: StorageEvent) => { if (e.key?.startsWith(STORAGE_PREFIX)) notify(); };
	if (typeof window !== "undefined") window.addEventListener("storage", onStorage);
	return () => {
		listeners.delete(listener);
		for (const m of media) m.removeEventListener?.("change", onChange);
		if (typeof window !== "undefined") window.removeEventListener("storage", onStorage);
	};
}

/** Live: re-renders on the switch, another tab's switch, or a device-class change. */
export function useDeviceFeature(feature: DeviceFeature): boolean {
	return useSyncExternalStore(
		subscribe,
		() => (void version, featureEnabled(feature)),
		() => true,
	);
}

/** The device class, live (null during the server render). */
export function useDeviceClass(): DeviceClass | null {
	return useSyncExternalStore(subscribe, () => (void version, deviceClass()), () => null);
}
