import { stores } from "./stores.ts";
import { runningWorkBlocker } from "./chats.ts";
import { extractionStatuses } from "../agent/subagents/extraction.ts";
import { deploymentCredentialActivity, quiesceDeploymentCredentials, resumeDeploymentCredentials } from "./web-subscriptions.ts";
import { deploymentJobsBusy, resumeDeploymentJobs } from "./jobs.ts";
import { notebookService } from "./notebook.ts";

export function installDeploymentWork() {
	const key = Symbol.for("learnharness.deployment-work.v1");
	const global = globalThis as typeof globalThis & { [key]?: { reasons(): string[]; quiesce(): Promise<void>; resume(): void } };
	global[key] = {
		reasons() {
			const reasons: string[] = [];
			for (const chat of stores.chatStore.listChats()) {
				const blocker = runningWorkBlocker(chat.id);
				if (blocker) reasons.push(blocker.code.replaceAll("_", "-"));
			}
			if (extractionStatuses().length) reasons.push("extraction");
			if (deploymentJobsBusy()) reasons.push("job-or-tutor-pipeline");
			if (deploymentCredentialActivity()) reasons.push("credential-operation");
			return reasons;
		},
		quiesce: quiesceDeploymentCredentials,
		resume() { resumeDeploymentCredentials(); notebookService().initialize(); resumeDeploymentJobs(); },
	};
}
