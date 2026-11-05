import assert from "node:assert/strict";

/** Native abort/repair at the controller boundary, using the server's causal policy. */
export async function checkHandwritingAdoption(page) {
	for (const mode of ["put", "creation", "cold", "existing"]) {
		const result = await page.evaluate(async mode => {
			const { IndexedPagesDevice, HandwritingPages, initialHandwritingPage, appendHandwriting, importHandwritingBackground, reconcileHandwritingPage, copyHandwriting, notebookSource } = window;
			const chat = `adoption-abort-repair-${mode}`, device = new IndexedPagesDevice();
			const ink = { tool: "pen", colour: "#171717", penScale: 1, width: 38, points: [{ x: 10, y: 20, pressure: .5 }] };
			const canvas = document.createElement("canvas"); canvas.width = 1400; canvas.height = 1800; canvas.getContext("2d").fillRect(0, 0, 1400, 1800);
			const pixels = { mediaType: "image/png", width: 1400, height: 1800, data: canvas.toDataURL("image/png").split(",")[1] };
			let base = initialHandwritingPage(appendHandwriting({ version: 1, operations: [] }, { id: "base", kind: "stroke", stroke: ink }));
			if (mode === "creation" || mode === "existing") { const id = `page_${crypto.randomUUID()}`; base = { ...base, id, createdAt: "2026-01-01T00:00:00.000Z", journal: copyHandwriting(base.journal, id) }; }
			let remote = { ...base, journal: await importHandwritingBackground(appendHandwriting(base.journal, { id: "clear", kind: "clear" }), pixels, "incoming") };
			const session = await device.open(chat); if (mode === "put" || mode === "existing") await device.commit(chat, session.generation, { pages: [base], expected: { [base.id]: null }, activePageId: base.id });
			let abort = true, aborts = 0, conflicts = 0, offlineRead = false, created = mode !== "creation";
			const put = IDBObjectStore.prototype.put;
			IDBObjectStore.prototype.put = function(...args) { const result = put.apply(this, args); if (abort && this.name === "pages" && args[0]?.chatId === chat && args[0]?.page?.journal?.head === "incoming") { aborts++; this.transaction.abort(); } return result; };
			const deps = { device, storage: () => localStorage, prepare: async () => {}, flatten: async () => { throw Error("unexpected"); }, fetch: async (url, init) => {
				if (String(url).endsWith("/source")) return Response.json(notebookSource(base.journal));
				if (init?.method === "POST") { created = true; return Response.json({ page: remote, existing: true }); }
				if (init?.method === "PUT") { const submitted = JSON.parse(init.body); if (submitted.id !== base.id) return Response.json(submitted); try { remote = reconcileHandwritingPage(remote, submitted); return Response.json(remote); } catch { conflicts++; return Response.json({ code: "conflict" }, { status: 409 }); } }
				if (offlineRead) throw Error("Incoming state must be retained without another GET");
				if (!created) return String(url).endsWith("/pages") ? Response.json({ pages: [] }) : Response.json({ code: "page_not_found" }, { status: 404 });
				return String(url).endsWith("/pages") ? Response.json({ pages: [{ id: remote.id, origin: remote.origin, createdAt: remote.createdAt }] }) : Response.json(remote);
			} };
			const model = new HandwritingPages(chat, deps);
			try {
				await model.open(); if (mode === "creation") await model.openSnapshot({ id: "writing_snapshot" }); await model.retry();
				const blocked = !model.getSnapshot().ready, complete = model.beginStroke(); complete?.(ink);
				const headAfterRefusal = model.getSnapshot().working.head, durableAfterAbort = (await device.read(chat, 0)).pages.find(page => page.id === base.id)?.journal.head ?? null;
				offlineRead = true; abort = false; await model.retry();
				const repaired = model.getSnapshot(), durable = (await device.read(chat, 0)).pages.find(page => page.id === base.id);
				model.draw(ink); const next = model.getSnapshot().working, parent = next.events[next.head]?.parent;
				await model.retry(); model.dispose(); offlineRead = false;
				const reopened = new HandwritingPages(chat, deps); await reopened.open();
				const result = { aborts, blocked, admitted: !!complete, headAfterRefusal, durableAfterAbort, repairedReady: repaired.ready, repairedHead: repaired.working.head, durableHead: durable.journal.head, assets: Object.keys(durable.journal.backgrounds).length, parent, synced: remote.journal.head === next.head, reloaded: reopened.getSnapshot().ready && reopened.getSnapshot().working.head === next.head, conflicts };
				reopened.dispose(); return result;
			} finally { model.dispose(); IDBObjectStore.prototype.put = put; }
		}, mode);
		assert.ok(result.aborts > 0);
		assert.deepEqual({ ...result, aborts: undefined }, { aborts: undefined, blocked: true, admitted: false, headAfterRefusal: mode === "cold" ? null : "base", durableAfterAbort: mode === "cold" ? null : "base", repairedReady: true, repairedHead: "incoming", durableHead: "incoming", assets: 1, parent: "incoming", synced: true, reloaded: true, conflicts: 0 });
		console.log(`PASS R4 native ${mode} adoption abort refuses stale edits, retains incoming state through offline-read repair, then syncs and reloads the next stroke`);
	}
	const admitted = await page.evaluate(async () => {
		const { IndexedPagesDevice, HandwritingPages, initialHandwritingPage, appendHandwriting } = window;
		const chat = "incoming-during-admitted-stroke", device = new IndexedPagesDevice();
		const ink = { tool: "pen", colour: "#171717", penScale: 1, width: 38, points: [{ x: 10, y: 20, pressure: .5 }] };
		const base = initialHandwritingPage(appendHandwriting({ version: 1, operations: [] }, { id: "base", kind: "stroke", stroke: ink }));
		const incoming = { ...base, journal: appendHandwriting(base.journal, { id: "incoming", kind: "clear" }) };
		await device.open(chat); await device.commit(chat, 0, { pages: [base], expected: { page_initial: null } });
		let release, entered, refused, puts = 0;
		const gate = new Promise(resolve => { release = resolve; }), started = new Promise(resolve => { entered = resolve; }), blocked = new Promise(resolve => { refused = resolve; });
		const model = new HandwritingPages(chat, { device, storage: () => localStorage, prepare: async () => {}, flatten: async () => { throw Error("unexpected"); }, fetch: async (url, init) => {
			if (init?.method === "PUT") { puts++; entered(); await gate; return Response.json(incoming); }
			return String(url).endsWith("/pages") ? Response.json({ pages: [] }) : Response.json(incoming);
		} });
		await model.open(); await started;
		const complete = model.beginStroke(); model.subscribe(() => { if (!model.getSnapshot().ready) refused(); }); release(); await blocked;
		const refusedNext = model.beginStroke() === null; complete?.(ink); await model.retry();
		const working = model.getSnapshot().working, recovery = JSON.parse(localStorage.getItem(`lh:handwriting:pages:recovery:v1:${chat}:page_initial`) ?? "null");
		model.dispose(); const durable = (await device.read(chat, 0)).pages[0];
		return { admitted: !!complete, refusedNext, retainedCompletion: working.events[working.head]?.kind === "stroke" && working.events[working.head]?.parent === "base", durableHead: durable.journal.head, incomingHead: incoming.journal.head, puts, recoveryHead: recovery?.journal.head, workingHead: working.head };
	});
	assert.equal(admitted.admitted, true); assert.equal(admitted.refusedNext, true); assert.equal(admitted.retainedCompletion, true);
	assert.equal(admitted.durableHead, "base"); assert.equal(admitted.incomingHead, "incoming"); assert.equal(admitted.puts, 1); assert.equal(admitted.recoveryHead, admitted.workingHead);
	console.log("PASS R4 incoming extension during an admitted stroke refuses further edits and retains the completed local branch without overwriting either history");
}
