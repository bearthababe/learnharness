import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { test } from "node:test";
import { createContext, runInContext } from "node:vm";

const mainFile = path.resolve("electron/main.cjs");
const mainRequire = createRequire(mainFile);

test("attached Linux mode never loads upstream updater and every check/install/menu path is inert", () => {
	const effects: string[] = [];
	let menu: { submenu?: { label?: string }[] }[] = [];
	const context = createContext({
		require: (name: string) => {
			if (name === "electron") return {
				app: { setName() {}, setPath() {}, getPath: () => "/synthetic/shell", requestSingleInstanceLock: () => false, quit() {}, isPackaged: true },
				BrowserWindow: { getAllWindows: () => [] },
				Menu: { buildFromTemplate: (template: typeof menu) => template, setApplicationMenu: (template: typeof menu) => { menu = template; } },
			};
			if (name === "electron-updater") { effects.push("updater-loaded"); throw new Error("Upstream updater must not load"); }
			return mainRequire(name);
		},
		process: { argv: [], env: { LH_DEV_URL: "http://127.0.0.1:3810" }, platform: "linux", on() {} },
		__dirname: path.dirname(mainFile), URL, setTimeout: () => effects.push("timer"),
	});
	runInContext(readFileSync(mainFile, "utf8"), context);
	runInContext('localServiceConfiguration = { origin: "http://127.0.0.1:3810" }; setupAutoUpdater(); installMenu();', context);
	assert.equal(runInContext("updateState.status", context), "disabled");
	assert.equal(menu[0]?.submenu?.some(item => item.label === "Check for Updates…"), false);
	context.testUpdater = { checkForUpdates: () => effects.push("checked"), quitAndInstall: () => effects.push("installed") };
	context.testServer = { kill: () => effects.push("server-killed") };
	runInContext("autoUpdater = testUpdater; serverProcess = testServer; checkForUpdates(); checkForUpdates({manual:true}); installUpdateNow();", context);
	assert.deepEqual(effects, []);
});

test("local-service preload cannot invoke upstream check/install even on a stale renderer request", async () => {
	const calls: string[] = [];
	let bridge: { localService: boolean; installUpdate(): void; checkForUpdates(): Promise<void> } | undefined;
	const context = createContext({ require: () => ({ contextBridge: { exposeInMainWorld: (_name: string, value: typeof bridge) => { bridge = value; } }, ipcRenderer: { on() {}, send: (channel: string) => calls.push(channel), invoke: (channel: string) => { calls.push(channel); return Promise.resolve(); } } }), process: { platform: "linux", argv: ["--lh-local-service", "--lh-web-subscriptions"] } });
	runInContext(readFileSync("electron/preload.cjs", "utf8"), context);
	assert.equal(bridge?.localService, true);
	bridge?.installUpdate();
	await bridge?.checkForUpdates();
	assert.deepEqual(calls, []);
});
