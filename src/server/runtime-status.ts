import type { RuntimeStatus } from "../core/contracts/runtime.ts";

export function runtimeStatus(): RuntimeStatus {
	const key = Symbol.for("learnharness.local-service.v1");
	const global = globalThis as typeof globalThis & { [key]?: RuntimeStatus };
	return global[key] ?? { schemaVersion: 1, mode: "external", revision: process.env.LH_COMMIT ?? "unknown", sourceHash: process.env.LH_SOURCE_SHA256 ?? "unknown", updateState: "external", updater: "not-configured", activity: "unknown" };
}
