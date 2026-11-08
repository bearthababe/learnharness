"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { app, ipcMain } = require("electron");
const filename = process.argv.find(argument => argument.startsWith("--preview=")).slice("--preview=".length);
const root = path.dirname(filename);
let windows = 0;
app.on("browser-window-created", (_event, window) => {
	windows++;
	const downloads = [];
	window.webContents.session.on("will-download", event => downloads.push({ prevented: event.defaultPrevented }));
	window.webContents.once("did-finish-load", () => {
		setTimeout(async () => {
			try {
				window.webContents.openDevTools();
				await new Promise(resolve => setTimeout(resolve, 50));
				const preferences = window.webContents.getLastWebPreferences();
				const snapshot = {
					windows, downloads, electron: process.versions.electron, chrome: process.versions.chrome,
					userData: app.getPath("userData"), name: app.getName(),
					nodeIntegration: preferences.nodeIntegration, sandbox: preferences.sandbox, contextIsolation: preferences.contextIsolation,
					preload: preferences.preload ?? null, devToolsAttemptOpened: window.webContents.isDevToolsOpened(), webviewTag: preferences.webviewTag,
					nativeHandlers: [...ipcMain._invokeHandlers.keys()].filter(name => name.startsWith("lh:")),
					url: window.webContents.getURL(),
				};
				fs.writeFileSync(path.join(root, "native.json"), JSON.stringify(snapshot, null, 2), { mode: 0o600 });
				fs.writeFileSync(path.join(root, "preview.png"), (await window.webContents.capturePage()).toPNG(), { mode: 0o600 });
			} catch (error) { process.stderr.write(`Diagnostic capture failed: ${error.message}\n`); }
		}, 1800);
	});
});
require("../../../electron/main.cjs");
