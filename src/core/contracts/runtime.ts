export interface RuntimeStatus {
	schemaVersion: 1;
	mode: "local-service" | "external";
	revision: string;
	sourceHash: string;
	buildId?: string;
	deploymentId?: string;
	profileId?: string;
	pid?: number;
	updateState: "not-configured" | "external" | "observing" | "waiting" | "preparing" | "maintenance" | "backing-up" | "starting" | "healthy" | "rolling-back" | "failed" | "blocked" | "stopped";
	updater: "running" | "updater-not-running" | "not-configured";
	activity: "idle" | "busy" | "unknown";
	activityReasons?: string[];
	candidate?: string | null;
	updateReason?: string | null;
	updaterObservedAt?: number | null;
	maintenance?: boolean;
}
