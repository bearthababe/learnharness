export interface RuntimeStatus {
	schemaVersion: 1;
	mode: "local-service" | "external";
	revision: string;
	sourceHash: string;
	buildId?: string;
	deploymentId?: string;
	profileId?: string;
	pid?: number;
	updateState: "not-configured" | "external";
	updater: "updater-not-running" | "not-configured";
	activity: "unknown";
}
