import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { git } from "./ticket-state.mjs";

const serverPath = fileURLToPath(new URL("./preview-server.cjs", import.meta.url));
const sourcePath = /^(app|components|src|lib|electron|scripts|public)\/|^docs\/research\/conversational-math-eval\/cases\.mjs$|^(config\.ts|instrumentation\.ts|proxy\.ts|next\.config\.[cm]?[jt]s|next-env\.d\.ts|tsconfig\.json|postcss\.config\.[cm]?[jt]s|package(-lock)?\.json)$/;
const forbidden = /^(\.env(?:\..*)?|\.git|\.npmrc|\.yarnrc.*|auth\.json|credentials(?:\.json)?|\.ssh|\.aws|\.config)$/i;

export function monotonicMilliseconds() {
	return Math.floor(Number(fs.readFileSync("/proc/uptime", "utf8").split(" ")[0]) * 1000);
}

export const bootIdentity = () => fs.readFileSync("/proc/sys/kernel/random/boot_id", "utf8").trim();

export function inspectDependencies(directory) {
	const root = fs.realpathSync(directory);
	function visit(current) {
		for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
			const filename = path.join(current, entry.name);
			assert.ok(!forbidden.test(entry.name) || entry.isDirectory() && entry.name === "credentials", `Dependency mount contains a forbidden file: ${path.relative(root, filename)}`);
			if (entry.isSymbolicLink()) {
				const resolved = fs.realpathSync(filename);
				assert.ok(resolved.startsWith(root + path.sep), `Dependency symlink escapes its explicit mount: ${filename}`);
			} else if (entry.isDirectory()) visit(filename);
			else assert.ok(entry.isFile(), `Dependency mount contains a non-regular file: ${filename}`);
		}
	}
	visit(root);
	return root;
}

export function runtimeLibraries(dependencies) {
	const pending = [process.execPath, "/usr/bin/sh", "/usr/bin/env"];
	const optionalNative = new Set();
	function nativeFiles(directory) {
		for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
			const filename = path.join(directory, entry.name);
			if (entry.isDirectory()) nativeFiles(filename);
			else if (entry.isFile() && /\.(node|so)(\.|$)/.test(entry.name)) {
				pending.push(filename);
				optionalNative.add(filename);
			}
		}
	}
	nativeFiles(dependencies);
	const inspected = new Set();
	const libraries = new Set();
	const interpreters = new Set();
	const trusted = filename => fs.realpathSync(filename).startsWith("/usr/lib/") && fs.statSync(filename).isFile();
	const include = filename => {
		assert.ok(trusted(filename), `Runtime dependency escaped the system library directory: ${filename}`);
		if (libraries.has(filename)) return;
		libraries.add(filename);
		pending.push(filename);
	};
	while (pending.length) {
		const filename = pending.pop();
		if (inspected.has(filename)) continue;
		inspected.add(filename);
		let metadata;
		try { metadata = execFileSync("/usr/bin/readelf", ["--file-header", "--program-headers", "--dynamic", "--wide", filename], { encoding: "utf8", env: { PATH: "/usr/bin", LANG: "C" }, stdio: ["ignore", "pipe", "ignore"], timeout: 5000, maxBuffer: 1024 * 1024 }); }
		catch { continue; }
		if (!/^\s*Class:\s+ELF64\s*$/m.test(metadata) || !/^\s*Machine:\s+Advanced Micro Devices X86-64\s*$/m.test(metadata)) {
			assert.ok(optionalNative.has(filename), `Unsupported Linux runtime architecture: ${filename}`);
			continue;
		}
		for (const match of metadata.matchAll(/Requesting program interpreter:\s*([^\]]+)\]/g)) {
			const interpreter = match[1];
			assert.match(interpreter, /^\/(?:lib(?:64)?|usr\/lib)\/(?:x86_64-linux-gnu\/)?ld-linux-x86-64\.so\.2$/, "Unsupported Linux runtime interpreter");
			include(interpreter);
			interpreters.add(interpreter);
		}
		for (const match of metadata.matchAll(/\(NEEDED\).*Shared library: \[([^\]]+)\]/g)) {
			const name = match[1];
			assert.match(name, /^[a-zA-Z0-9+_.-]+\.so(?:\.[a-zA-Z0-9+_.-]+)?$/, "Native dependency library name is not a basename");
			const candidates = ["/usr/lib/x86_64-linux-gnu", "/lib/x86_64-linux-gnu", "/usr/lib"].map(directory => path.join(directory, name)).filter(candidate => fs.existsSync(candidate));
			const library = candidates.find(candidate => trusted(candidate));
			assert.ok(library || candidates.length === 0, `Runtime dependency escaped the system library directory: ${name}`);
			if (library) include(library);
		}
	}
	assert.ok(interpreters.size > 0, "Runtime dependency discovery requires readelf and a supported ELF interpreter");
	return [...libraries].sort();
}

export function prepareSandbox({ worktree, profile, lease }) {
	assert.equal(process.platform, "linux", "Preview sandbox requires Linux bubblewrap; no unsandboxed fallback");
	assert.equal(process.arch, "x64", "This preview runtime dependency manifest currently supports Linux x64 only");
	assert.match(lease, /^[a-zA-Z0-9-]+$/);
	const cache = path.join(os.homedir(), ".cache", "learnharness", "preview-sandboxes");
	fs.mkdirSync(cache, { recursive: true, mode: 0o700 });
	const directory = fs.mkdtempSync(path.join(cache, "lease-"));
	const source = path.join(directory, "source");
	fs.mkdirSync(source, { mode: 0o700 });
	const filenames = [...new Set(git(worktree, "ls-files", "--cached", "--others", "--exclude-standard", "-z").split("\0").filter(filename => sourcePath.test(filename)))].sort();
	const hash = createHash("sha256");
	for (const filename of filenames) {
		assert.ok(!filename.split("/").some(segment => forbidden.test(segment) || segment === ".."), `Forbidden source path: ${filename}`);
		const original = path.join(worktree, filename);
		if (!fs.existsSync(original)) continue;
		const relative = path.relative(worktree, fs.realpathSync(original));
		assert.ok(relative === filename && fs.lstatSync(original).isFile(), `Source must be a regular non-symlink file: ${filename}`);
		const destination = path.join(source, filename);
		fs.mkdirSync(path.dirname(destination), { recursive: true, mode: 0o700 });
		fs.copyFileSync(original, destination, fs.constants.COPYFILE_FICLONE);
		hash.update(filename).update("\0").update(fs.readFileSync(destination)).update("\0");
	}
	for (const name of ["home", "data", "auth"]) {
		const target = path.join(profile, name);
		fs.mkdirSync(target, { recursive: true, mode: 0o700 });
		assert.equal(fs.realpathSync(target), target, "Synthetic profile mounts must not be symlinks");
	}
	const transport = fs.mkdtempSync("/tmp/lhp-");
	const passwd = path.join(directory, "passwd");
	fs.writeFileSync(passwd, `preview:x:${process.getuid()}:${process.getgid()}:Preview:/state/home:/bin/sh\n`, { mode: 0o600 });
	const dependencies = inspectDependencies(path.join(worktree, "node_modules"));
	return { directory, source, passwd, dependencies, libraries: runtimeLibraries(dependencies), profile, transport, socketPath: path.join(transport, "app.sock"), revision: git(worktree, "rev-parse", "HEAD"), sourceHash: hash.digest("hex") };
}

export function sandboxArguments(sandbox, command, { lease, helperSocket = null } = {}) {
	const args = ["--unshare-all", "--unshare-net", "--die-with-parent", "--new-session", "--cap-drop", "ALL", "--clearenv", "--proc", "/proc", "--dev", "/dev", "--tmpfs", "/tmp", "--tmpfs", "/run", "--dir", "/etc", "--dir", "/runtime", "--dir", "/control", "--dir", "/state", "--dir", "/capability", "--dir", "/usr/lib",
		"--symlink", "usr/lib", "/lib", "--symlink", "usr/lib", "/lib64", "--symlink", "lib", "/usr/lib64", "--ro-bind", process.execPath, "/runtime/node",
		"--symlink", "/runtime/node", "/usr/bin/node", "--ro-bind", "/usr/bin/sh", "/usr/bin/sh", "--ro-bind", "/usr/bin/env", "/usr/bin/env", "--symlink", "usr/bin", "/bin",
		"--bind", sandbox.source, "/app", "--ro-bind", sandbox.dependencies, "/app/node_modules", "--ro-bind", serverPath, "/control/server.cjs"];
	args.push("--ro-bind", sandbox.passwd, "/etc/passwd");
	for (const library of sandbox.libraries) args.push("--ro-bind", library, library);
	for (const name of ["home", "data", "auth"]) args.push("--bind", path.join(sandbox.profile, name), `/state/${name}`);
	args.push("--bind", sandbox.transport, "/transport");
	const variables = { PATH: "/runtime:/usr/bin:/app/node_modules/.bin", LANG: "C.UTF-8", HOME: "/state/home", USERPROFILE: "/state/home", XDG_CONFIG_HOME: "/state/home/.config", XDG_CACHE_HOME: "/state/home/.cache", XDG_DATA_HOME: "/state/home/.local/share", LH_DATA_DIR: "/state/data", LH_AUTH_FILE: "/state/auth/auth.json", LH_IGNORE_ENV_KEYS: "1", LH_PREVIEW_PROFILE: "1", NEXT_TELEMETRY_DISABLED: "1", LH_PREVIEW_LEASE: lease };
	variables.LH_COMMIT = sandbox.revision;
	variables.LH_SOURCE_SHA256 = sandbox.sourceHash;
	if (helperSocket) {
		assert.ok(fs.lstatSync(helperSocket).isSocket(), "Helper capability must be a Unix socket");
		args.push("--ro-bind", helperSocket, "/capability/helper.sock");
		variables.LH_PREVIEW_HELPER_SOCKET = "/capability/helper.sock";
	}
	for (const [name, value] of Object.entries(variables)) if (value !== undefined) args.push("--setenv", name, String(value));
	return [...args, "--chdir", "/app", "--", "/runtime/node", ...command];
}

export function assertSandboxAvailable(sandbox) {
	execFileSync("/usr/bin/bwrap", sandboxArguments(sandbox, ["-e", "if(require('node:fs').existsSync('/home'))process.exit(99)"]), { env: {}, stdio: ["ignore", "pipe", "pipe"], timeout: 15_000 });
}

export function spawnSandbox(sandbox, command, options = {}) {
	return spawn("/usr/bin/bwrap", sandboxArguments(sandbox, command, options), { env: {}, stdio: options.stdio ?? "inherit" });
}
