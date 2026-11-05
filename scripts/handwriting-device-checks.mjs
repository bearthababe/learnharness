import assert from "node:assert/strict";

export async function checkTransferDevice({ page, origin }) {
	await page.goto(`${origin}/transfer-fixture`, { waitUntil: "networkidle2" });
	await page.waitForFunction(() => !!window.transferDevice);
	const result = await page.evaluate(async () => {
		const device = window.transferDevice, chat = "native-transfer-boundaries", generation = await device.open(chat);
		const draft = { version: 1, chatId: chat, targetKey: "composer", draftId: "draft", revision: 1, editor: { text: "checkpoint" } };
		const capture = { version: 1, chatId: chat, pageId: "page_initial", writingId: `writing_${crypto.randomUUID()}`, expectedPageRevision: 0, sourceJson: "{}", sourceFingerprint: "source", contentFingerprint: "content", capturedAt: new Date().toISOString(), explanationDraft: { targetKey: draft.targetKey, draftId: draft.draftId, revision: 1 }, raster: { width: 1400, height: 1800, rgba: new ArrayBuffer(1400 * 1800 * 4) }, state: "captured" };
		// A successful put followed by transaction abort must acknowledge neither
		// half of capture+draft. This exercises the actual native transaction.
		const put = IDBObjectStore.prototype.put;
		IDBObjectStore.prototype.put = function (...args) { const request = put.apply(this, args); if (this.name === "drafts") this.transaction.abort(); return request; };
		let aborted = false;
		try { await device.saveCapture(chat, generation, capture, draft); } catch { aborted = true; }
		finally { IDBObjectStore.prototype.put = put; }
		const afterAbort = await device.read(chat, generation);
		await device.saveCapture(chat, generation, capture, draft);
		await device.saveDraft(chat, generation, { ...draft, revision: 2, editor: { text: "newer" } });
		await device.saveCapture(chat, generation, { ...capture, state: "failed" }, draft);
		const afterOldCheckpoint = await device.read(chat, generation);
		const receipt = { version: 1, chatId: chat, pageId: capture.pageId, sourceFingerprint: "source", contentFingerprint: "content", writingId: capture.writingId, pageRevision: 2, createdAt: capture.capturedAt };
		await device.finishCapture(chat, generation, capture.writingId, receipt);
		await device.finishCapture(chat, generation, capture.writingId, { ...receipt, pageRevision: 1 });
		const afterReceipt = await device.read(chat, generation);
		let retiredWriteBlocked = false;
		try { await device.saveCapture(chat, generation, { ...capture, state: "failed" }, draft); } catch { retiredWriteBlocked = true; }
		const afterLateFailure = await device.read(chat, generation);
		let nextCaptureSaved = false;
		const next = { ...capture, writingId: `writing_${crypto.randomUUID()}`, expectedPageRevision: 2 };
		try { await device.saveCapture(chat, generation, next); nextCaptureSaved = true; } catch { /* asserted below */ }
		await device.finishCapture(chat, generation, capture.writingId, { ...receipt, pageRevision: 1 });
		const afterLateSuccess = await device.read(chat, generation);
		let staleAfterNewerReceipt = false;
		await device.finishCapture(chat, generation, next.writingId, { ...receipt, writingId: next.writingId, pageRevision: 3 });
		try { await device.saveCapture(chat, generation, { ...capture, state: "failed" }, { ...draft, revision: 99, editor: { text: "stale must not overwrite" } }); } catch { staleAfterNewerReceipt = true; }
		const terminal = await device.read(chat, generation);
		if (!staleAfterNewerReceipt || terminal.captures.length || terminal.drafts[0].editor.text !== "newer" || terminal.captureReceipts[0].writingId !== next.writingId) throw new Error("Older capture crossed newer terminal receipt");
		await device.deleteChat(chat);
		let staleWrite = false, reopen = false;
		try { await device.saveDraft(chat, generation, draft); } catch { staleWrite = true; }
		try { await device.open(chat); } catch { reopen = true; }
		// Corrupt/future rows remain inspectable and block reads instead of
		// becoming an empty authoritative recovery snapshot.
		const corruptChat = "native-corrupt", corruptGeneration = await device.open(corruptChat);
		const db = await new Promise((resolve, reject) => { const r = indexedDB.open("lh-handwriting-transfer", 1); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
		await new Promise((resolve, reject) => { const tx = db.transaction("drafts", "readwrite"); tx.objectStore("drafts").put({ ...draft, chatId: corruptChat, version: 99 }); tx.oncomplete = resolve; tx.onabort = reject; });
		let corruptBlocked = false;
		try { await device.read(corruptChat, corruptGeneration); } catch { corruptBlocked = true; }
		const retained = await new Promise(resolve => { const r = db.transaction("drafts").objectStore("drafts").get([corruptChat, "composer", "draft"]); r.onsuccess = () => resolve(r.result.version); });
		db.close();
		return { aborted, abortRows: afterAbort.captures.length + afterAbort.drafts.length, newerText: afterOldCheckpoint.drafts[0].editor.text, receiptRevision: afterReceipt.captureReceipts[0].pageRevision, retiredCaptures: afterReceipt.captures.length, retainedDrafts: afterReceipt.drafts.length, retiredWriteBlocked, resurrectedCaptures: afterLateFailure.captures.length, nextCaptureSaved, nextSurvivesLateSuccess: afterLateSuccess.captures.some(value => value.writingId === next.writingId), staleWrite, reopen, corruptBlocked, retained };
	});
	assert.deepEqual(result, { aborted: true, abortRows: 0, newerText: "newer", receiptRevision: 2, retiredCaptures: 0, retainedDrafts: 1, retiredWriteBlocked: true, resurrectedCaptures: 0, nextCaptureSaved: true, nextSurvivesLateSuccess: true, staleWrite: true, reopen: true, corruptBlocked: true, retained: 99 });
	// Real controllers and native IDB, with real HTTP/store receipts. Hold the
	// original transport across dispose/reopen rather than simulating its state.
	for (const outcome of ["success", "failure", "lost-ack"]) {
		const chat = `mobile_remount_${outcome}`;
		const result = await page.evaluate(async ({ chat, outcome }) => {
			const { transferDevice: device, HandwritingAttachment, emptyHandwriting, notebookSource, appendHandwriting } = window;
			const generation = await device.open(chat), source = notebookSource(emptyHandwriting());
			const newer = notebookSource(appendHandwriting(source.journal, { id: "newer", kind: "stroke", stroke: { tool: "pen", colour: "#2563eb", penScale: 1, width: 38, points: [{ x: 100, y: 200, pressure: 0.6 }] } }));
			const draft = { version: 1, chatId: chat, targetKey: "composer", draftId: "draft", revision: 1, editor: { text: "Original" } };
			let release, entered, joined;
			const held = new Promise(resolve => { release = resolve; }), posting = new Promise(resolve => { entered = resolve; }), reopening = new Promise(resolve => { joined = resolve; });
			const requests = []; let active = 0, maximum = 0, reveals = 0;
			const canvas = document.createElement("canvas"); canvas.width = 1400; canvas.height = 1800;
			const png = await new Promise(resolve => canvas.toBlob(resolve, "image/png"));
			const deps = { device, encode: async () => png, changed() {}, reveal() { reveals++; }, refresh: async () => {
				const response = await fetch(`/api/chats/${chat}/writing`); return response.json();
			}, fetch: async (url, init) => {
				const form = init.body, first = requests.length === 0;
				requests.push({ id: form.get("writingId"), revision: form.get("expectedPageRevision"), source: await form.get("source").text(), png: [...new Uint8Array(await form.get("image").arrayBuffer())] });
				active++; maximum = Math.max(maximum, active);
				try {
					if (first) { entered(); await held; if (outcome === "failure") throw new Error("Offline before acceptance"); }
					const response = await fetch(url, init);
					if (first && outcome === "lost-ack") { await response.text(); throw new Error("Lost accepted response"); }
					return response;
				} finally { active--; }
			} };
			const prepare = (value, head, revision) => ({ pageId: "page_initial", head, valid: () => true, finish: async () => true, freeze: () => ({ source: value, draft: { ...draft, revision, editor: { text: revision === 1 ? "Original" : "Newer" } }, raster: { width: 1400, height: 1800, rgba: new ArrayBuffer(1400 * 1800 * 4) } }) });
			const old = new HandwritingAttachment(chat, deps); await old.open();
			const original = old.attach(prepare(source, undefined, 1)); await posting; old.dispose();
			await device.saveDraft(chat, generation, { ...draft, revision: 2, editor: { text: "Newer" } });
			localStorage.setItem(`remount-working:${chat}`, JSON.stringify(newer));
			const next = new HandwritingAttachment(chat, { ...deps, changed() { joined(); } });
			const opened = next.open(); await reopening;
			// Let the replacement finish its native reads and join the held owner.
			await new Promise(resolve => setTimeout(resolve, 50));
			const beforeRelease = requests.length;
			release(); await Promise.all([original, opened]);
			const afterA = await device.read(chat, generation), aRequests = requests.length;
			const review = await deps.refresh();
			await next.attach(prepare(newer, review.pageAttachments.page_initial, 2));
			const afterB = await device.read(chat, generation); next.dispose();
			return { beforeRelease, maximum, aRequests, exactReplay: aRequests === 1 || JSON.stringify(requests[0]) === JSON.stringify(requests[1]), capturesA: afterA.captures.length, revisionA: afterA.captureReceipts[0]?.pageRevision, capturesB: afterB.captures.length, revisionB: afterB.captureReceipts[0]?.pageRevision, newerDraft: afterB.drafts[0]?.editor.text, workingUnchanged: localStorage.getItem(`remount-working:${chat}`) === JSON.stringify(newer), reviewed: reveals > 0 };
		}, { chat, outcome });
		assert.deepEqual(result, { beforeRelease: 1, maximum: 1, aRequests: outcome === "success" ? 1 : 2, exactReplay: true, capturesA: 0, revisionA: 1, capturesB: 0, revisionB: 2, newerDraft: "Newer", workingUnchanged: true, reviewed: true });
		const record = await (await fetch(`${origin}/api/chats/${chat}`)).json();
		assert.equal(record.messages.filter(message => message.role === "user").length, 0);
		console.log(`PASS native-IDB controller remount ${outcome}: single flight, exact recovery, receipts, next Attach and no Send`);
	}
	console.log("PASS native IndexedDB atomic abort, newer drafts, monotone receipts, deletion tombstone and retained corrupt records");
}
