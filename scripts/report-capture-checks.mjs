import assert from "node:assert/strict";

/**
 * Report a problem (round 19 §0; merge proof N1): the stored screenshot is
 * the current screen. A scrolled area keeps its scroll position, and a row
 * pinned to its top or bottom (`position: sticky`) stays where it shows
 * instead of being carried off with the scrolled content.
 *
 * A scrolled text field (plain text, or a textarea) shows the lines on
 * screen, not its first ones.
 *
 * Plain fixtures on the current page: an area with a red row pinned to the
 * top, a yellow row pinned to the bottom, blue rows first and green rows
 * after, so the pixels tell "scrolled", "from the top" and "pin lost" apart;
 * and two text fields whose first lines are empty and last lines are text,
 * scrolled to the end, so dark pixels mean "the lines on screen".
 */
export async function checkReportCapture({ page, origin }) {
	const known = new Set((await (await fetch(`${origin}/api/bugs`)).json()).reports.map(report => report.id));
	const area = await page.evaluate(() => {
		const box = document.createElement("div");
		box.id = "zz-report-capture";
		box.style.cssText = "position:fixed;left:0;top:0;width:240px;height:240px;overflow-y:auto;z-index:2147483000;background:#fff;margin:0;padding:0";
		const row = (css) => { const div = document.createElement("div"); div.style.cssText = `margin:0;padding:0;${css}`; box.append(div); };
		row("position:sticky;top:0;height:40px;background:rgb(230,0,0);z-index:1");
		for (let i = 0; i < 20; i++) row(`height:40px;background:${i < 5 ? "rgb(0,0,230)" : "rgb(0,170,0)"}`);
		row("position:sticky;bottom:0;height:30px;background:rgb(250,210,0);z-index:1");
		document.body.append(box);
		box.scrollTop = 240;
		const lines = "\n".repeat(12) + "MMMMMMMM\n".repeat(12);
		const text = document.createElement("div");
		text.id = "zz-report-capture-text";
		text.style.cssText = "position:fixed;left:0;top:250px;width:200px;height:120px;overflow-y:auto;white-space:pre-wrap;font:700 16px/20px monospace;color:#000;background:#fff;z-index:2147483000;margin:0;padding:0";
		text.textContent = lines;
		const field = document.createElement("textarea");
		field.id = "zz-report-capture-field";
		field.style.cssText = "position:fixed;left:0;top:380px;width:200px;height:120px;overflow-y:auto;font:700 16px/20px monospace;color:#000;background:#fff;z-index:2147483000;margin:0;padding:0;border:0;resize:none";
		field.value = lines;
		document.body.append(text, field);
		text.scrollTop = text.scrollHeight; field.scrollTop = field.scrollHeight;
		return { scrollTop: box.scrollTop, text: text.scrollTop, field: field.scrollTop };
	});
	assert.equal(area.scrollTop, 240, "the fixture area scrolls");
	assert.ok(area.text > 200 && area.field > 200, `the text fields scroll to their last lines (${area.text}, ${area.field})`);
	await page.evaluate(() => window.dispatchEvent(new CustomEvent("lh:bug-capture", { detail: { keepMenus: false } })));
	await page.waitForSelector('[data-testid="bug-dialog"]', { visible: true });
	let report;
	for (let tries = 0; tries < 120 && !report; tries++) {
		report = (await (await fetch(`${origin}/api/bugs`)).json()).reports.find(entry => !known.has(entry.id) && entry.hasScreenshot);
		if (!report) await new Promise(resolve => setTimeout(resolve, 250));
	}
	assert.ok(report, "the report's screenshot is stored");
	const pixels = await page.evaluate(async (id) => {
		const bitmap = await createImageBitmap(await (await fetch(`/api/bugs/${id}/screenshot`)).blob());
		const canvas = new OffscreenCanvas(bitmap.width, bitmap.height), context = canvas.getContext("2d");
		context.drawImage(bitmap, 0, 0);
		const at = (x, y) => [...context.getImageData(x, y, 1, 1).data.slice(0, 3)];
		const dark = (top) => { const { data } = context.getImageData(0, top, 200, 120); let count = 0; for (let i = 0; i < data.length; i += 4) if (data[i] + data[i + 1] + data[i + 2] < 300) count++; return count; };
		return { top: at(100, 20), body: at(100, 120), bottom: at(100, 225), text: dark(250), field: dark(380) };
	}, report.id);
	const near = (rgb, want) => rgb.every((value, i) => Math.abs(value - want[i]) <= 60);
	assert.ok(near(pixels.top, [230, 0, 0]), `the row pinned to the top stays in the shot (got rgb ${pixels.top})`);
	assert.ok(near(pixels.body, [0, 170, 0]), `the area shows where it was scrolled, not its top (got rgb ${pixels.body})`);
	assert.ok(near(pixels.bottom, [250, 210, 0]), `the row pinned to the bottom stays in the shot (got rgb ${pixels.bottom})`);
	assert.ok(pixels.text > 1000, `a scrolled text field shows the lines on screen, not its empty first lines (${pixels.text} dark pixels)`);
	assert.ok(pixels.field > 1000, `a scrolled textarea shows the lines on screen, not its empty first lines (${pixels.field} dark pixels)`);
	assert.equal(await page.evaluate(() => document.querySelectorAll("[data-lh-shot-shift], [data-lh-shot-text]").length), 0, "the capture leaves no marks on the page");
	await page.click('[data-testid="bug-close"]');
	await page.waitForFunction(() => !document.querySelector('[data-testid="bug-dialog"]'));
	await page.evaluate(() => { for (const id of ["zz-report-capture", "zz-report-capture-text", "zz-report-capture-field"]) document.getElementById(id)?.remove(); });
	assert.equal((await fetch(`${origin}/api/bugs/${report.id}`, { method: "DELETE" })).ok, true, "the check's report is discarded");
}
