"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { isIP } = require("node:net");
const net = require("node:net");

const LIFETIME_MS = 600_000;
const hash = value => createHash("sha256").update(value).digest("hex");
const bootIdentity = () => fs.readFileSync("/proc/sys/kernel/random/boot_id", "utf8").trim();
const monotonicMilliseconds = () => Math.floor(Number(fs.readFileSync("/proc/uptime", "utf8").split(" ")[0]) * 1000);

function insist(condition) {
	if (!condition) throw new Error("Preview shell trust boundary refused");
}

function keys(value, expected) {
	insist(value && typeof value === "object" && !Array.isArray(value));
	insist(Object.keys(value).sort().join(",") === [...expected].sort().join(","));
}

function privatePath(filename, directory = false) {
	insist(path.isAbsolute(filename) && fs.realpathSync(filename) === filename);
	const information = fs.lstatSync(filename);
	insist(information.uid === process.getuid() && (information.mode & 0o077) === 0);
	insist(directory ? information.isDirectory() : information.isFile() && information.nlink === 1 && information.size <= 16_384);
	return information;
}

function readPrivateJSON(filename) {
	privatePath(path.dirname(filename), true);
	const descriptor = fs.openSync(filename, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
	try {
		const information = fs.fstatSync(descriptor);
		insist(information.isFile() && information.uid === process.getuid() && (information.mode & 0o077) === 0 && information.nlink === 1 && information.size <= 16_384);
		insist(fs.realpathSync(filename) === filename && fs.statSync(filename).ino === information.ino);
		return JSON.parse(fs.readFileSync(descriptor, "utf8"));
	} finally { fs.closeSync(descriptor); }
}

function processIdentity(pid = process.pid) {
	const contents = fs.readFileSync(`/proc/${pid}/stat`, "utf8");
	const fields = contents.slice(contents.lastIndexOf(")") + 2).split(" ");
	insist(fields[0] !== "Z" && fields[0] !== "X" && fs.statSync(`/proc/${pid}`).uid === process.getuid());
	return { pid, start: fields[19], boot: bootIdentity() };
}

function validateIdentity(identity, boot) {
	keys(identity, ["pid", "start", "boot"]);
	insist(Number.isSafeInteger(identity.pid) && identity.pid > 1 && typeof identity.start === "string" && /^\d+$/.test(identity.start) && identity.boot === boot);
	insist(JSON.stringify(processIdentity(identity.pid)) === JSON.stringify({ pid: identity.pid, start: identity.start, boot: identity.boot }));
}

function originURL(value) {
	insist(typeof value === "string");
	const url = new URL(value);
	insist(url.origin === value && !url.username && !url.password && url.pathname === "/" && !url.search && !url.hash);
	return url;
}

function validateConfiguration(configuration, { diagnostic = false, now = monotonicMilliseconds(), boot = bootIdentity() } = {}) {
	keys(configuration, ["version", "ticketId", "sourceId", "lease", "origin", "normalOrigin", "launch", "manager", "server", "controlFile"]);
	insist(configuration.version === 1 && typeof configuration.ticketId === "string" && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(configuration.ticketId));
	insist(typeof configuration.sourceId === "string" && /^[a-f0-9]{64}$/.test(configuration.sourceId));
	insist(typeof configuration.lease === "string" && /^[a-zA-Z0-9_-]{16,128}$/.test(configuration.lease));
	const preview = originURL(configuration.origin);
	const normal = originURL(configuration.normalOrigin);
	if (diagnostic) insist(preview.protocol === "http:" && preview.hostname === "127.0.0.1" && normal.protocol === "https:" && normal.hostname !== preview.hostname);
	else insist(preview.protocol === "https:" && normal.protocol === "https:" && preview.hostname !== normal.hostname && !isIP(preview.hostname.replace(/^\[|\]$/g, "")) && preview.hostname !== "localhost" && !preview.hostname.endsWith(".localhost"));
	keys(configuration.launch, ["started", "deadline", "boot"]);
	const { started, deadline } = configuration.launch;
	insist(Number.isSafeInteger(started) && started >= 0 && Number.isSafeInteger(deadline) && deadline - started === LIFETIME_MS && started <= now && now < deadline && configuration.launch.boot === boot);
	validateIdentity(configuration.manager, boot);
	validateIdentity(configuration.server, boot);
	insist(configuration.manager.pid !== configuration.server.pid);
	insist(typeof configuration.controlFile === "string" && path.isAbsolute(configuration.controlFile));
	return configuration;
}

function controlFor(configuration, status = "running") {
	const { version, ticketId, sourceId, lease, origin, launch, manager, server } = configuration;
	return { version, ticketId, sourceId, lease, origin, launch, manager, server, status };
}

function canonical(value) {
	if (Array.isArray(value)) return value.map(canonical);
	if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
	return value;
}

const equal = (first, second) => JSON.stringify(canonical(first)) === JSON.stringify(canonical(second));

function readConfiguration(filename, options) {
	privatePath(filename);
	const configuration = validateConfiguration(readPrivateJSON(filename), options);
	insist(path.dirname(configuration.controlFile) === path.dirname(filename) && configuration.controlFile !== filename);
	insist(equal(readPrivateJSON(configuration.controlFile), controlFor(configuration)));
	return configuration;
}

function allowsRequest(request, origin) {
	try {
		const url = new URL(request);
		const target = new URL(origin);
		return !url.username && !url.password && (url.protocol === target.protocol && url.origin === origin || url.protocol === (target.protocol === "https:" ? "wss:" : "ws:") && url.host === target.host);
	} catch { return false; }
}

function previewResponseHeaders(origin) {
	return {
		"Content-Security-Policy": `default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; media-src 'self' blob:; connect-src 'self' ${origin.replace(/^http/, "ws")}; worker-src 'none'; child-src 'none'; frame-src 'none'; frame-ancestors 'none'; form-action 'self'; base-uri 'none'; object-src 'none'`,
		"Permissions-Policy": "camera=(), microphone=(), geolocation=(), display-capture=(), usb=(), serial=(), hid=(), bluetooth=()",
		"X-DNS-Prefetch-Control": "off",
	};
}

function startPreviewShell() {
	const { app, BrowserWindow, Menu, session } = require("electron");
	let lifecycle;
	let deadlineTimer;
	let window;
	let deniedProxy;
	let ending = false;
	const stop = (reason, code = 0) => {
		if (ending) return;
		ending = true;
		clearInterval(lifecycle);
		clearTimeout(deadlineTimer);
		process.stdout.write(`PREVIEW_SHELL_STOP ${reason}\n`);
		deniedProxy?.close();
		window?.destroy();
		app.exit(code);
	};
	try {
		insist(process.platform === "linux");
		insist(Number(process.versions.chrome?.split(".")[0]) >= 152);
		const argumentsList = process.argv.slice(app.isPackaged ? 1 : 2);
		const previewArguments = argumentsList.filter(argument => argument.startsWith("--preview="));
		const diagnostic = !app.isPackaged && argumentsList.includes("--preview-diagnostic");
		insist(app.isPackaged || diagnostic);
		insist(previewArguments.length === 1 && argumentsList.every(argument => argument === previewArguments[0] || diagnostic && argument === "--preview-diagnostic" || /^--ozone-platform=(wayland|x11)$/.test(argument)));
		insist(!process.env.ELECTRON_DISABLE_SANDBOX && !process.env.NODE_OPTIONS && !process.env.ELECTRON_RUN_AS_NODE);
		const filename = previewArguments[0].slice("--preview=".length);
		const configuration = readConfiguration(filename, { diagnostic });
		const root = path.dirname(filename);
		const environmentPaths = { HOME: "home", XDG_CONFIG_HOME: "config", XDG_CACHE_HOME: "cache", XDG_DATA_HOME: "data" };
		for (const [name, suffix] of Object.entries(environmentPaths)) {
			insist(process.env[name] === path.join(root, suffix));
			privatePath(process.env[name], true);
		}
		const allowedEnvironment = new Set([...Object.keys(environmentPaths), "PATH", "LANG", "LC_ALL", "DISPLAY", "WAYLAND_DISPLAY", "XDG_RUNTIME_DIR", "DBUS_SESSION_BUS_ADDRESS", "XAUTHORITY", "XDG_SESSION_TYPE"]);
		for (const name of Object.keys(process.env)) if (!allowedEnvironment.has(name)) delete process.env[name];
		const identity = hash(`${configuration.ticketId}\0${configuration.sourceId}\0${configuration.lease}`);
		const userData = path.join(root, `shell-${identity}`);
		try { fs.mkdirSync(userData, { mode: 0o700 }); } catch (error) { if (error.code !== "EEXIST") throw error; }
		privatePath(userData, true);
		app.setName(`LearnHarness-preview-${identity}`);
		app.setPath("userData", userData);
		app.setPath("sessionData", userData);
		app.setPath("logs", path.join(userData, "logs"));
		app.setPath("crashDumps", path.join(userData, "crashes"));
		app.enableSandbox();
		insist(app.requestSingleInstanceLock({ preview: identity }));
		app.on("second-instance", () => window?.focus());
		const configurationDigest = hash(JSON.stringify(canonical(configuration)));
		const checkLifetime = () => {
			try {
				insist(hash(JSON.stringify(canonical(readConfiguration(filename, { diagnostic })))) === configurationDigest);
			} catch { stop("lease-or-runtime-ended"); }
		};
		lifecycle = setInterval(checkLifetime, 100);
		deadlineTimer = setTimeout(() => stop("deadline"), Math.max(0, configuration.launch.deadline - monotonicMilliseconds()));
		process.once("SIGTERM", () => stop("signal"));
		process.once("SIGINT", () => stop("signal"));
		process.once("SIGHUP", () => stop("signal"));
		process.once("uncaughtException", () => stop("uncaught-exception", 1));
		process.once("unhandledRejection", () => stop("unhandled-rejection", 1));
		app.on("window-all-closed", () => stop("window-closed"));
		app.whenReady().then(async () => {
			if (ending) return;
			checkLifetime();
			if (ending) return;
			Menu.setApplicationMenu(null);
			const isolatedSession = session.fromPartition(`preview-${identity}`, { cache: false });
			deniedProxy = net.createServer(socket => socket.destroy());
			await new Promise((resolve, reject) => { deniedProxy.once("error", reject); deniedProxy.listen(0, "127.0.0.1", resolve); });
			const target = new URL(configuration.origin);
			await isolatedSession.setProxy({ mode: "fixed_servers", proxyRules: `http://127.0.0.1:${deniedProxy.address().port}`, proxyBypassRules: `<-loopback>;${target.hostname}:${target.port || (target.protocol === "https:" ? "443" : "80")}` });
			if (ending) return;
			isolatedSession.setPermissionCheckHandler(() => false);
			isolatedSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
			isolatedSession.setDevicePermissionHandler(() => false);
			isolatedSession.setDisplayMediaRequestHandler((_request, callback) => callback({}));
			isolatedSession.on("will-download", (event, item) => { event.preventDefault(); item.cancel(); });
			isolatedSession.webRequest.onBeforeRequest({ urls: ["<all_urls>"] }, (details, callback) => callback({ cancel: !allowsRequest(details.url, configuration.origin) }));
			if (!/^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$/.test(process.versions.chrome ?? "")) throw new Error("Native preview requires its actual Chromium version");
			isolatedSession.webRequest.onBeforeSendHeaders({ urls: ["<all_urls>"] }, (details, callback) => {
				if (!allowsRequest(details.url, configuration.origin)) { callback({ cancel: true }); return; }
				const requestHeaders = { ...details.requestHeaders };
				for (const name of Object.keys(requestHeaders)) if (name.toLowerCase() === "sec-ch-ua") delete requestHeaders[name];
				requestHeaders["Sec-CH-UA"] = `"Chromium";v="${process.versions.chrome.split(".")[0]}"`;
				callback({ requestHeaders });
			});
			isolatedSession.webRequest.onHeadersReceived((details, callback) => {
				const responseHeaders = { ...details.responseHeaders };
				const forbidden = ["content-security-policy-report-only", "connection-allowlist", "connection-allowlist-report-only", "report-to", "reporting-endpoints", "nel"];
				const policy = previewResponseHeaders(configuration.origin);
				for (const name of Object.keys(responseHeaders)) if (forbidden.includes(name.toLowerCase()) || Object.keys(policy).some(candidate => candidate.toLowerCase() === name.toLowerCase())) delete responseHeaders[name];
				for (const [name, value] of Object.entries(policy)) responseHeaders[name] = [value];
				callback({ responseHeaders });
			});
			window = new BrowserWindow({
				width: 1100, height: 800, title: `Preview: ${configuration.ticketId}`,
				webPreferences: { session: isolatedSession, nodeIntegration: false, nodeIntegrationInWorker: false, nodeIntegrationInSubFrames: false, contextIsolation: true, sandbox: true, webSecurity: true, webviewTag: false, devTools: false, navigateOnDragDrop: false, safeDialogs: true, disableDialogs: true, spellcheck: false },
			});
			const contents = window.webContents;
			contents.setWebRTCIPHandlingPolicy("disable_non_proxied_udp");
			contents.setWindowOpenHandler(() => ({ action: "deny" }));
			for (const name of ["will-navigate", "will-frame-navigate", "will-redirect"]) contents.on(name, (event, target) => {
				const url = typeof target === "string" ? target : event.url;
				if (!url || !url.startsWith(`${configuration.origin}/`) || !allowsRequest(url, configuration.origin)) event.preventDefault();
			});
			contents.on("will-attach-webview", event => event.preventDefault());
			for (const name of ["select-bluetooth-device", "select-hid-device", "select-serial-port", "select-usb-device"]) contents.on(name, event => event.preventDefault());
			contents.on("render-process-gone", () => stop("renderer-ended", 1));
			await window.loadURL(configuration.origin);
			process.stdout.write(`PREVIEW_SHELL_READY ${JSON.stringify({ ticketId: configuration.ticketId, sourceId: configuration.sourceId, lease: configuration.lease, origin: configuration.origin, identity, userData, diagnostic, arguments: argumentsList })}\n`);
		}).catch(() => stop("startup-refused", 1));
	} catch { stop("configuration-refused", 1); }
}

module.exports = { LIFETIME_MS, processIdentity, monotonicMilliseconds, bootIdentity, validateConfiguration, readConfiguration, controlFor, allowsRequest, previewResponseHeaders, startPreviewShell };
