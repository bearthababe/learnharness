import React, { act } from "react";
import assert from "node:assert/strict";
import { test } from "node:test";
import { createRoot } from "react-dom/client";
import { parseHTML } from "linkedom";
import { RuntimeSettings } from "../components/settings/runtime-settings.tsx";

test("common General status is read-only, shows actual commit and never invents updater success", async () => {
	const dom = parseHTML("<html><body><div id='root'></div></body></html>");
	Object.assign(globalThis, { React, IS_REACT_ACT_ENVIRONMENT: true, window: dom.window, document: dom.document });
	const originalFetch = globalThis.fetch;
	const calls: string[] = [];
	globalThis.fetch = async target => {
		calls.push(String(target));
		return Response.json({ schemaVersion: 1, mode: "local-service", revision: "a".repeat(40), sourceHash: "b".repeat(64), updateState: "not-configured", updater: "updater-not-running", activity: "unknown" });
	};
	const host = document.getElementById("root")!;
	const root = createRoot(host);
	try {
		await act(async () => root.render(<RuntimeSettings />));
		assert.ok(host.textContent?.includes("a".repeat(40)));
		assert.ok(host.textContent?.includes("Updates not configured · Updater not running"));
		assert.equal(host.querySelector("button,input"), null);
		assert.deepEqual(calls, ["/api/runtime"]);
		assert.equal(host.textContent?.includes("up to date"), false);
	} finally {
		await act(async () => root.unmount());
		globalThis.fetch = originalFetch;
	}
});
