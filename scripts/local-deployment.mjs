import { resolveProfile } from "../electron/deployment-profile.cjs";
import { backupProfile, listBackups, migrateRepository, restoreProfile } from "./lib/deployment-profile.mjs";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { readConfiguration, controlRequest } from "../electron/local-service-protocol.cjs";

const [command, ...argumentsList] = process.argv.slice(2);

try {
	if (!command || command === "--help") {
		console.log("Local profile administration (LH_PROFILE_DIR; default ~/.config/learnharness)\n  profile\n  migrate --source-repository PATH\n  backup --reason update|pre-restore\n  backups\n  restore COPY_ID --approve-local-restore\n  service-start --electron PATH --port PORT [--runtime DIR] [--browser-origin ORIGIN]\n  service-status --config FILE\n  service-admit --config FILE --origin ORIGIN\nService start is foreground and independent of GUI lifetime. Admission links are one-use, valid for 60 seconds. Writers must be stopped for profile administration. Restore is local-only and requires explicit approval.");
	} else {
		const profile = resolveProfile();
		let result;
		if (command === "service-start") {
			const options = {};
			for (let index = 0; index < argumentsList.length; index += 2) {
				const name = argumentsList[index];
				const value = argumentsList[index + 1];
				if (!["--electron", "--port", "--runtime", "--browser-origin"].includes(name) || !value || options[name]) throw new Error("Invalid service-start arguments");
				options[name] = value;
			}
			if (!options["--electron"] || !options["--port"]) throw new Error("service-start requires --electron and --port");
			const binary = fs.realpathSync(options["--electron"]);
			const entry = path.join(path.dirname(binary), "resources", "local-service.cjs");
			if (!fs.existsSync(entry)) throw new Error("Rebuild the packaged Linux app before starting its local service");
			const child = spawn(binary, [entry, JSON.stringify({ port: options["--port"], runtime: options["--runtime"], browserOrigins: options["--browser-origin"] ? [options["--browser-origin"]] : [] })], { env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" }, stdio: "inherit" });
			for (const signal of ["SIGTERM", "SIGINT"]) process.once(signal, () => child.kill(signal));
			child.on("error", () => { process.exitCode = 1; });
			await new Promise(resolve => child.once("exit", code => { process.exitCode = code ?? 1; resolve(); }));
		} else if (["service-status", "service-admit"].includes(command)) {
			if (argumentsList[0] !== "--config" || !argumentsList[1] || (command === "service-status" ? argumentsList.length !== 2 : argumentsList.length !== 4 || argumentsList[2] !== "--origin")) throw new Error("Invalid local service arguments");
			const configuration = readConfiguration(argumentsList[1]);
			result = await controlRequest(configuration, command === "service-status" ? { op: "status" } : { op: "admit", origin: argumentsList[3] });
			if (command === "service-admit") result = { admissionUrl: `${argumentsList[3]}/__local/admit#${result.ticket}` };
		} else if (command === "profile" && !argumentsList.length) result = profile;
		else if (command === "migrate" && argumentsList.length === 2 && argumentsList[0] === "--source-repository") result = migrateRepository(argumentsList[1], profile);
		else if (command === "backup" && argumentsList.length === 2 && argumentsList[0] === "--reason") result = backupProfile(profile, { reason: argumentsList[1] });
		else if (command === "backups" && !argumentsList.length) result = listBackups(profile);
		else if (command === "restore" && argumentsList.length === 2 && argumentsList[1] === "--approve-local-restore") result = restoreProfile(profile, argumentsList[0], { approved: true });
		else throw new Error("Unknown command or missing explicit arguments; see --help");
		if (result !== undefined) console.log(JSON.stringify(result, (key, value) => key === "entries" ? undefined : value, 2));
	}
} catch (error) {
	console.error(error.message);
	process.exitCode = 1;
}
