export async function register() {
	if (process.env.NEXT_RUNTIME === "nodejs" && process.env.NEXT_PHASE !== "phase-production-build") {
		const { PROFILE } = await import("./config.ts");
		const { ownServerProfile } = await import("./electron/deployment-profile.cjs");
		ownServerProfile(PROFILE);
		const { installDeploymentWork } = await import("./src/server/deployment-work.ts");
		installDeploymentWork();
		const { initializeNotebookRecovery } = await import("./src/server/notebook.ts");
		initializeNotebookRecovery();
	}
}
