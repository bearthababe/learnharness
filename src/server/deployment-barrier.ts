export function deploymentWorkPaused() {
	const key = Symbol.for("learnharness.deployment-frozen.v1");
	const global = globalThis as typeof globalThis & { [key]?: () => boolean };
	return global[key]?.() === true;
}
