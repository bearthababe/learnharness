import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { observeMain, candidateDecision, DeploymentHistoryError, DeploymentEligibilityError } from "./deployment-eligibility.mjs";
import { backupProfile } from "./deployment-profile.mjs";
import { buildIdentity } from "../../electron/deployment-build.cjs";
import { acquireProfile, resolveProfile, privateDirectory, inspectPath, containsPath, processIdentity } from "../../electron/deployment-profile.cjs";
import { readConfiguration, readPrivateJSON, controlRequest, originValue } from "../../electron/local-service-protocol.cjs";
import { packagedBuild, runPreparation, sameProcess, stopService } from "./deployment-process.mjs";
import { servicePreviewHelperDirectory } from "../../electron/local-service.cjs";

const require = createRequire(import.meta.url);
const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

export function writeUpdaterState(filename, value) {
	inspectPath(filename);
	const temporary = `${filename}.${randomUUID()}.tmp`;
	const descriptor = fs.openSync(temporary, "wx", 0o600);
	try { fs.writeFileSync(descriptor, JSON.stringify(value) + "\n"); fs.fsyncSync(descriptor); }
	finally { fs.closeSync(descriptor); }
	fs.renameSync(temporary, filename);
	const directory = fs.openSync(path.dirname(filename), "r");
	try { fs.fsyncSync(directory); } finally { fs.closeSync(directory); }
}

export class DeploymentUpdater {
	constructor(configuration, { observe = observeMain, prepare, backup = backupProfile, environment = process.env } = {}) {
		if (process.platform !== "linux") throw new Error("Local updating requires Linux");
		this.configuration = configuration;
		this.environment = environment;
		this.profile = resolveProfile({ env: { LH_PROFILE_DIR: configuration.profileRoot } });
		if (!this.profile.managed) throw new Error("Updater requires a managed external profile");
		for (const target of [configuration.runtime, configuration.releases, configuration.sourceRoot]) {
			if (!path.isAbsolute(target || "") || containsPath(this.profile.root, inspectPath(target)) || containsPath(target, this.profile.root)) throw new Error("Updater roots must be outside the managed profile");
		}
		if (containsPath(configuration.sourceRoot, configuration.releases) || containsPath(configuration.releases, configuration.sourceRoot) || containsPath(configuration.runtime, configuration.releases) || containsPath(configuration.releases, configuration.runtime)) throw new Error("Source, runtime and releases must be separate");
		originValue(`http://127.0.0.1:${configuration.port}`);
		for (const origin of configuration.browserOrigins || []) originValue(origin);
		servicePreviewHelperDirectory({ previewHelperDirectory: configuration.previewHelperDirectory ?? undefined, runtime: configuration.runtime, profileRoot: this.profile.root, codeRoot: configuration.sourceRoot });
		privateDirectory(configuration.runtime);
		privateDirectory(configuration.releases);
		this.filename = path.join(configuration.runtime, "updater-state.json");
		this.serviceFile = path.join(configuration.runtime, "service.json");
		this.socket = path.join(configuration.runtime, "updater.sock");
		if (Buffer.byteLength(this.socket) > 100) throw new Error("Updater runtime socket path is too long");
		this.identity = processIdentity();
		this.observe = observe;
		this.backup = backup;
		this.prepare = prepare ?? (async (sha, signal) => {
			const source = path.join(configuration.releases, `${sha}-${randomUUID()}`);
			await runPreparation([process.execPath, path.resolve(import.meta.dirname, "../prepare-local-release.mjs"), configuration.sourceRoot, sha, source], { env: environment, log: path.join(configuration.runtime, "preparation.log"), signal });
			return { executable: path.join(source, "dist", "linux-unpacked", "learnharness"), source };
		});
		this.state = fs.existsSync(this.filename) ? readPrivateJSON(this.filename) : { schemaVersion: 1, profileRoot: this.profile.root, running: packagedBuild(configuration.initialElectron), failed: [], previousSha: null, retrySha: null, state: "observing", reason: "updater-started", candidate: null };
		if (this.state.schemaVersion !== 1 || this.state.profileRoot !== this.profile.root || !Array.isArray(this.state.failed)) throw new Error("Invalid updater state; local inspection required");
		if (!["healthy", "waiting", "observing", "failed", "stopped", "blocked"].includes(this.state.state)) {
			this.state.state = "blocked";
			this.state.reason = "interrupted-lifecycle-requires-local-resolution";
		}
		this.stopping = false;
		this.active = null;
		this.heartbeat = null;
	}

	persist(state, reason, extra = {}) {
		Object.assign(this.state, extra, { state, reason, updatedAt: new Date().toISOString() });
		writeUpdaterState(this.filename, this.state);
	}

	service() {
		const service = readConfiguration(this.serviceFile);
		if (service.profileRoot !== this.profile.root || service.runtime !== this.configuration.runtime || service.origin !== `http://127.0.0.1:${this.configuration.port}` || JSON.stringify(service.browserOrigins) !== JSON.stringify(this.configuration.browserOrigins || []) || (service.previewHelperDirectory ?? null) !== (this.configuration.previewHelperDirectory ?? null)) throw new Error("Updater/service custody, ingress or preview helper mismatch");
		return service;
	}

	async publish() {
		try {
			await controlRequest(this.service(), { op: "updater-status", updater: { ...this.identity, state: this.state.state, reason: this.state.reason, candidate: this.state.candidate } });
		} catch {}
	}

	async launch(release, handoff) {
		const options = { port: this.configuration.port, runtime: this.configuration.runtime, browserOrigins: this.configuration.browserOrigins || [], previewHelperDirectory: this.configuration.previewHelperDirectory ?? undefined, handoff };
		const descriptor = fs.openSync(path.join(this.configuration.runtime, "service.log"), "a", 0o600);
		const child = spawn(release.executable, [path.join(release.resources, "local-service.cjs"), JSON.stringify(options)], { env: { ...this.environment, LH_PROFILE_DIR: this.profile.root, ELECTRON_RUN_AS_NODE: "1" }, detached: true, stdio: ["ignore", descriptor, descriptor] });
		fs.closeSync(descriptor);
		child.unref();
		let failure;
		child.on("error", error => { failure = error; });
		child.on("exit", (code, signal) => { failure = new Error(`Packaged service exited (${code ?? signal})`); });
		this.child = child;
		const deadline = Date.now() + 60000;
		while (!failure && Date.now() < deadline) {
			try {
				const service = this.service();
				if (service.pid !== child.pid || ["revision", "sourceHash", "buildId"].some(field => service[field] !== release[field])) throw new Error("Candidate serving identity mismatch");
				const { ticket } = await controlRequest(service, { op: "admit", origin: service.origin, health: true });
				const admission = await fetch(`${service.origin}/__local/session`, { method: "POST", headers: { Origin: service.origin, "Content-Type": "application/json" }, body: JSON.stringify({ ticket }), signal: AbortSignal.timeout(3000), redirect: "error" });
				const cookie = admission.headers.get("set-cookie")?.split(";")[0];
				if (admission.status !== 204 || !cookie) throw new Error("Candidate admission failed");
				const response = await fetch(`${service.origin}/api/runtime`, { headers: { Cookie: cookie }, signal: AbortSignal.timeout(3000), cache: "no-store", redirect: "error" });
				const status = await response.json();
				if (!response.ok || status.pid !== child.pid || ["revision", "sourceHash", "buildId", "profileId", "deploymentId"].some(field => status[field] !== service[field])) throw new Error("Candidate serving-entrypoint health failed");
				const home = await fetch(service.origin, { headers: { Cookie: cookie }, signal: AbortSignal.timeout(10000), redirect: "error" });
				if (!home.ok || !(await home.text()).includes("Learning Harness")) throw new Error("Candidate application route is unhealthy");
				if (this.expectedShells) {
					const shells = await controlRequest(service, { op: "shells" });
					if (shells.length < this.expectedShells) throw new Error("Matching packaged shell has not reattached");
				}
				if (handoff) await controlRequest(service, { op: "resume" });
				return service;
			} catch { await delay(100); }
		}
		const identity = child.pid && processIdentity(child.pid);
		if (identity) await stopService(identity);
		throw failure ?? new Error("Candidate startup timed out");
	}

	async initialize() {
		if (!this.initializing) this.initializing = this.initializeOwned();
		return this.initializing;
	}

	async initializeOwned() {
		this.owner = acquireProfile(resolveProfile({ env: { LH_PROFILE_DIR: path.join(this.configuration.runtime, "updater-owner") } }));
		if (fs.existsSync(this.socket)) {
			const information = fs.lstatSync(this.socket);
			if (!information.isSocket() || information.uid !== process.getuid() || information.mode & 0o077) throw new Error("Unsafe updater socket");
			fs.unlinkSync(this.socket);
		}
		this.controls = net.createServer({ allowHalfOpen: true }, socket => {
			let contents = "";
			socket.setTimeout(5000, () => socket.destroy()); socket.on("error", () => {});
			socket.on("data", chunk => { contents += chunk; if (contents.length > 4096) socket.destroy(); });
			socket.on("end", () => {
				try {
					this.owner.assertOwner();
					const command = JSON.parse(contents);
					if (command.profileRoot !== this.profile.root) throw new Error("Wrong updater profile");
					if (command.op === "retry" && this.state.failed.includes(command.sha) && command.sha === this.state.candidate && !this.active && this.state.state !== "blocked") this.persist("waiting", "explicit-local-retry", { retrySha: command.sha });
					else if (command.op !== "status") throw new Error("Retry must match the suppressed candidate; blocked lifecycle requires local inspection");
					socket.end(JSON.stringify(this.state));
				} catch { socket.end(JSON.stringify({ error: "Local updater command refused" })); }
			});
		});
		await new Promise((resolve, reject) => { this.controls.once("error", reject); this.controls.listen(this.socket, resolve); });
		fs.chmodSync(this.socket, 0o600);
		if (this.state.state !== "blocked") {
			let live = false;
			if (fs.existsSync(this.serviceFile)) {
				const previous = readPrivateJSON(this.serviceFile);
				if (previous.profileRoot !== this.profile.root || previous.runtime !== this.configuration.runtime) throw new Error("Stale service configuration belongs to another deployment");
				live = sameProcess(previous);
			}
			if (!live) await this.launch(packagedBuild(this.state.running.executable));
		}
		if (this.state.state !== "blocked") {
			const service = this.service();
			if (["revision", "sourceHash", "buildId"].some(field => service[field] !== this.state.running[field])) throw new Error("Running service differs from persisted release");
		}
		await this.publish();
		this.heartbeat = setInterval(() => { void this.publish(); }, 1000);
	}

	async observation(retrySha = this.state.retrySha) {
		const observation = await this.observe({ root: this.configuration.sourceRoot, repository: this.configuration.repository, previousSha: this.state.previousSha, runningSha: this.state.running.revision });
		this.persist(this.state.state, this.state.reason, { previousSha: observation.sha, candidate: observation.sha });
		return candidateDecision(observation, { runningSha: this.state.running.revision, failedSha: this.state.failed.includes(observation.sha) ? observation.sha : null, retrySha });
	}

	async tick() {
		if (this.active || this.stopping || this.state.state === "blocked") return;
		this.active = this.cycle();
		try { await this.active; } finally { this.active = null; await this.publish(); }
	}

	async cycle() {
		let frozen = false;
		let stopped = false;
		let backupComplete = false;
		let sha;
		let original;
		let monitor;
		const controller = new AbortController();
		this.preparation = controller;
		try {
			this.persist("observing", "fetching-newest-main-and-exact-ci");
			const eligible = await this.observation();
			if (!eligible.eligible) { this.persist("waiting", eligible.reason); return; }
			sha = eligible.sha;
			original = this.service();
			if ((await controlRequest(original, { op: "activity" })).state !== "idle") { this.persist("waiting", "application-busy-or-unknown"); return; }
			this.persist("preparing", "building-eligible-newest-main", { retrySha: null });
			await this.publish();
			let checking = false;
			monitor = setInterval(async () => {
				if (checking) return;
				checking = true;
				try { if ((await controlRequest(original, { op: "activity" })).state !== "idle") controller.abort(new Error("activity-resumed")); }
				catch { controller.abort(new Error("activity-channel-unreachable")); }
				finally { checking = false; }
			}, 100);
			const prepared = await this.prepare(sha, controller.signal);
			controller.signal.throwIfAborted();
			this.preparation = null;
			clearInterval(monitor); monitor = null;
			const release = packagedBuild(prepared.executable);
			const source = buildIdentity(prepared.source);
			if (release.revision !== sha || source.revision !== sha || source.sourceHash !== release.sourceHash) throw new Error("Prepared package does not match actual candidate sources");
			let rechecked = await this.observation(sha);
			if (rechecked.sha !== sha || !rechecked.eligible) { this.persist("waiting", "candidate-no-longer-newest-and-eligible"); return; }
			if ((await controlRequest(original, { op: "activity" })).state !== "idle") { this.persist("waiting", "activity-resumed"); return; }
			if (this.stopping) { this.persist("waiting", "updater-stopping"); return; }
			this.persist("maintenance", "freezing-idle-clients-and-draining-writers");
			const { token } = await controlRequest(original, { op: "freeze" });
			frozen = true;
			rechecked = await this.observation(sha);
			if (rechecked.sha !== sha || !rechecked.eligible) { this.persist("waiting", "candidate-changed-during-handshake"); return; }
			if (this.stopping) { this.persist("waiting", "updater-stopping"); return; }
			const handoff = await controlRequest(original, { op: "handoff", token });
			this.expectedShells = (await controlRequest(original, { op: "shells" })).length;
			const handoffFile = path.join(this.configuration.runtime, "admission-handoff.json");
			writeUpdaterState(handoffFile, handoff);
			await stopService(original);
			stopped = true;
			this.persist("backing-up", "creating-and-verifying-exclusive-profile-backup");
			this.backup(this.profile, { reason: "update" });
			backupComplete = true;
			this.persist("starting", "starting-packaged-candidate", { failed: [...new Set([...this.state.failed, sha])] });
			try {
				const service = await this.launch(release, handoffFile);
				this.persist("healthy", "serving-entrypoint-identity-verified", { running: release, failed: this.state.failed.filter(candidate => candidate !== sha), previousRelease: this.state.running, serviceIdentity: { pid: service.pid, start: service.start, boot: service.boot } });
			} catch (error) {
				const prior = packagedBuild(this.state.running.executable);
				this.persist("rolling-back", "candidate-startup-failed-probing-current-data");
				const lease = acquireProfile(this.profile);
				try {
					lease.assertOwner();
					const manifest = JSON.parse(fs.readFileSync(path.join(prior.directory, "deployment-compatibility.json"), "utf8"));
					const probe = require(path.join(prior.resources, "deployment-compatibility.cjs"));
					const result = probe.probeProfile(this.profile.root, manifest);
					if (result.compatible !== true) throw new Error("Previous reader refused current profile");
					this.persist("rolling-back", "current-data-compatible-code-only-rollback", { compatibility: result });
				} catch {
					this.persist("blocked", "current-data-incompatible-or-unknown-no-history-restored");
					return;
				} finally { lease.release(); }
				await this.launch(prior, handoffFile);
				this.persist("failed", "candidate-startup-failed-code-rolled-back-data-preserved");
			}
		} catch (error) {
			if (error instanceof DeploymentHistoryError || error instanceof DeploymentEligibilityError) this.persist("blocked", error.message);
			else if (controller.signal.aborted && !stopped) this.persist("waiting", controller.signal.reason?.message || "preparation-cancelled");
			else if (stopped) {
				if (!backupComplete) {
					try { await this.launch(packagedBuild(this.state.running.executable), path.join(this.configuration.runtime, "admission-handoff.json")); this.persist("failed", "backup-failed-prior-release-resumed", { failed: [...this.state.failed, sha] }); }
					catch { this.persist("blocked", "prior-release-could-not-resume-after-backup-failure"); }
				} else this.persist("blocked", "lifecycle-failed-local-inspection-required");
			} else if (sha && this.state.state === "preparing") this.persist("failed", error.message, { failed: [...new Set([...this.state.failed, sha])] });
			else this.persist("waiting", error.message);
		} finally {
			clearInterval(monitor); this.preparation = null;
			if (frozen && !stopped) { try { await controlRequest(original, { op: "thaw" }); } catch { this.persist("blocked", "could-not-release-maintenance-pause"); } }
		}
	}

	async run() {
		await this.initialize();
		if (this.stopping) return;
		this.pollTimer = setInterval(() => {
			if (this.active) {
				if (!this.pollObservation) this.pollObservation = this.observePreparation().finally(() => { this.pollObservation = null; });
			} else void this.tick();
		}, 60000);
		await this.tick();
		if (!this.stopping) await new Promise(resolve => { this.wake = resolve; });
	}

	async observePreparation() {
		const controller = this.preparation;
		if (!controller || this.state.state !== "preparing") return;
		const candidate = this.state.candidate;
		try {
			const next = await this.observe({ root: this.configuration.sourceRoot, repository: this.configuration.repository, previousSha: this.state.previousSha, runningSha: this.state.running.revision });
			if (this.preparation !== controller || this.stopping) return;
			this.persist(this.state.state, this.state.reason, { previousSha: next.sha, candidate: next.sha });
			if (next.sha !== candidate || !next.eligible) controller.abort(new Error("candidate-superseded-or-no-longer-eligible"));
		} catch (error) {
			if (this.preparation === controller) controller.abort(error instanceof DeploymentHistoryError || error instanceof DeploymentEligibilityError ? error : new Error("main-observation-unavailable"));
		}
	}

	async close() {
		if (!this.closing) this.closing = this.finishClose();
		return this.closing;
	}

	async finishClose() {
		this.stopping = true;
		clearInterval(this.pollTimer); this.wake?.();
		this.preparation?.abort(new Error("updater-stopping"));
		await Promise.allSettled([this.initializing, this.active, this.pollObservation].filter(Boolean));
		clearInterval(this.heartbeat);
		try {
			if (this.state.state !== "blocked") this.persist("stopped", "updater-stopped-current-service-retained");
			await this.publish();
		} finally {
			try { if (this.controls?.listening) await new Promise(resolve => this.controls.close(resolve)); }
			finally { if (this.owner) { fs.rmSync(this.socket, { force: true }); this.owner.release(); } }
		}
	}
}

export function updaterRequest(configuration, command) {
	const filename = path.join(configuration.runtime, "updater.sock");
	inspectPath(path.dirname(filename));
	const information = fs.lstatSync(filename);
	if (!information.isSocket() || information.uid !== process.getuid() || information.mode & 0o077) throw new Error("Unsafe updater socket");
	return new Promise((resolve, reject) => {
		const socket = net.createConnection(filename);
		let contents = "";
		socket.setTimeout(5000, () => socket.destroy(new Error("Updater control timed out")));
		socket.on("error", reject);
		socket.on("connect", () => socket.end(JSON.stringify({ ...command, profileRoot: configuration.profileRoot })));
		socket.on("data", chunk => { contents += chunk; if (contents.length > 65536) socket.destroy(new Error("Invalid updater response")); });
		socket.on("end", () => { try { const result = JSON.parse(contents); if (result.error) throw new Error(result.error); resolve(result); } catch (error) { reject(error); } });
	});
}
