const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");

function compatibilityManifest(root) {
	const definitions = {
		chat: ["src/core/contracts/chat.ts", "CURRENT_CHAT_VERSION", 2],
		graph: ["src/core/contracts/graph.ts", "CURRENT_GRAPH_FORMAT_VERSION", 1],
		settings: ["src/core/settings.ts", "CURRENT_SETTINGS_VERSION", 1],
		notebookModelPicker: ["src/core/notebook-models.ts", "NOTEBOOK_MODEL_PICKER_VERSION", 2],
	};
	const versions = {};
	for (const [kind, [filename, constant, supported]] of Object.entries(definitions)) {
		const contents = fs.readFileSync(path.join(root, filename), "utf8");
		const version = Number(contents.match(new RegExp(`export const ${constant} = (\\d+)`))?.[1]);
		if (version !== supported) throw new Error(`Compatibility reader must be updated for ${kind}`);
		versions[kind] = version;
	}
	const contracts = ["src/core/contracts/notebook.ts", "src/core/notebook-models.ts", "src/core/contracts/jobs.ts", "src/core/source-organization.ts", "src/core/render-settings.ts", "src/core/handwriting.ts", "src/core/handwriting-pages.ts", "src/core/shared-writing.ts", "src/store/shared-writing.ts", "electron/chatgpt.cjs", "electron/subscription-store.cjs"];
	if (!fs.readFileSync(path.join(root, "src/core/source-organization.ts"), "utf8").includes("version: 1;")) throw new Error("Compatibility reader must be updated for source organization");
	const hash = createHash("sha256");
	for (const filename of contracts) hash.update(filename).update(fs.readFileSync(path.join(root, filename)));
	return { schemaVersion: 1, readerVersion: 1, versions, contractHash: hash.digest("hex"), handwriting: [1, 2], handwritingPage: 1, writingIndex: 1, writingSource: 1, writingManifest: 1, nativeCredentials: 1, notebookModelPicker: versions.notebookModelPicker };
}

function probeProfile(root, manifest) {
	if (manifest?.schemaVersion !== 1 || manifest.readerVersion !== 1 || manifest.versions?.chat !== 2 || manifest.versions?.graph !== 1 || manifest.versions?.settings !== 1 || manifest.notebookModelPicker !== 2 || !/^[a-f0-9]{64}$/.test(manifest.contractHash)) throw new Error("Unknown previous data compatibility contract");
	const checked = [];
	function version(value, maximum, absent = false) {
		if (value === undefined && absent) return;
		if (!Number.isInteger(value) || value < 1 || value > maximum) throw new Error("Unknown or newer data format");
	}
	function nested(value, location, allowed) {
		if (!value || typeof value !== "object") return;
		for (const [key, child] of Object.entries(value)) {
			const target = `${location}.${key}`;
			if (["version", "schemaVersion", "modelPickerVersion"].includes(key)) {
				if (!Object.hasOwn(allowed, target)) throw new Error("Unknown nested data format");
				version(child, allowed[target]);
			} else nested(child, target, allowed);
		}
	}
	function inspect(relative, contents) {
		const json = () => JSON.parse(contents);
		let value;
		let allowed = {};
		if (relative === "auth.json") {
			value = json();
			if (!value || typeof value !== "object" || Array.isArray(value) || Object.values(value).some(entry => typeof entry !== "string")) throw new Error("Unknown API key store format");
		} else if (/^(chatgpt|github-copilot|xai)-credentials\.json$/.test(relative)) {
			value = json(); version(value.version, 1); allowed = { ".version": 1 };
		} else if (/^data\/chats\/[A-Za-z0-9_-]+\.json$/.test(relative)) {
			value = json(); version(value.version, manifest.versions.chat, true);
			if (typeof value.id !== "string" || !Array.isArray(value.messages)) throw new Error("Unknown chat record");
			allowed = { ".version": 2, ".notebook.modelPickerVersion": manifest.notebookModelPicker };
			for (const [messageIndex, message] of value.messages.entries()) {
				for (const [writingIndex] of (Array.isArray(message?.sharedWriting) ? message.sharedWriting : []).entries()) {
					allowed[`.messages.${messageIndex}.sharedWriting.${writingIndex}.editableSource.version`] = 1;
				}
			}
		} else if (relative === "data/settings.json") {
			value = json(); version(value.version, 1, true); allowed = { ".version": 1 };
		} else if (relative === "data/graph/format.json") {
			value = json(); version(value.version, 1); allowed = { ".version": 1 };
		} else if (/^data\/graph\/(nodes|chains|sessions|coverage)\.jsonl$/.test(relative)) {
			for (const line of contents.toString().split("\n").filter(line => line.trim())) nested(JSON.parse(line), "", {});
			return;
		} else if (relative === "data/graph/source-organization.json") {
			value = json(); version(value.version, 1); allowed = { ".version": 1 };
		} else if (/^data\/graph\/(sources|positions|render-settings)\.json$/.test(relative) || /^data\/jobs\/[A-Za-z0-9_-]+\.json$/.test(relative)) value = json();
		else if (/^data\/handwriting\/[A-Za-z0-9_-]+\.json$/.test(relative)) {
			value = json(); version(value.version, 2); allowed = { ".version": 2 };
		} else if (/^data\/handwriting\/[A-Za-z0-9_-]+\/page_[a-f0-9-]+\.json$/.test(relative)) {
			value = json(); version(value.version, 1); version(value.journal?.version, 2); allowed = { ".version": 1, ".journal.version": 2 };
		} else if (/^data\/shared-writing\/[A-Za-z0-9_-]+\/pending\.json$/.test(relative)) {
			value = json(); version(value.version, 1); allowed = { ".version": 1 };
		} else if (/^data\/shared-writing\/[A-Za-z0-9_-]+\/writing_[A-Za-z0-9_-]+\/(manifest|source)\.json$/.test(relative)) {
			value = json(); version(value.version, 1);
			allowed = { ".version": 1, ".editableSource.version": 1, ".journal.version": 2 };
		} else if (/^data\/shared-writing\/[A-Za-z0-9_-]+\/(writing_[A-Za-z0-9_-]+\.png|writing_[A-Za-z0-9_-]+\/image\.png)$/.test(relative)) {
			if (!contents.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw new Error("Unknown writing image format");
			return;
		} else if (/^data\/prompts\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_.-]+\.md$/.test(relative)) return;
		else throw new Error("Unknown owned profile format");
		if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Unknown persisted record");
		nested(value, "", allowed);
	}
	function visit(directory, prefix = "") {
		for (const name of fs.readdirSync(directory).sort()) {
			const relative = prefix ? `${prefix}/${name}` : name;
			const target = path.join(directory, name);
			const information = fs.lstatSync(target);
			if (information.isSymbolicLink() || !information.isDirectory() && (!information.isFile() || information.nlink !== 1)) throw new Error("Unsafe profile entry");
			if (information.isDirectory()) visit(target, relative);
			else {
				try { inspect(relative, fs.readFileSync(target)); }
				catch (error) { throw new Error(`${relative}: ${error.message}`); }
				checked.push(relative);
			}
		}
	}
	visit(root);
	return { compatible: true, files: checked.length, readerVersion: manifest.readerVersion, contractHash: manifest.contractHash };
}

module.exports = { compatibilityManifest, probeProfile };
