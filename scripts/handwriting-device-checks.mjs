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
		return { aborted, abortRows: afterAbort.captures.length + afterAbort.drafts.length, newerText: afterOldCheckpoint.drafts[0].editor.text, receiptRevision: afterReceipt.captureReceipts[0].pageRevision, retiredCaptures: afterReceipt.captures.length, retainedDrafts: afterReceipt.drafts.length, staleWrite, reopen, corruptBlocked, retained };
	});
	assert.deepEqual(result, { aborted: true, abortRows: 0, newerText: "newer", receiptRevision: 2, retiredCaptures: 0, retainedDrafts: 1, staleWrite: true, reopen: true, corruptBlocked: true, retained: 99 });
	console.log("PASS native IndexedDB atomic abort, newer drafts, monotone receipts, deletion tombstone and retained corrupt records");
}
