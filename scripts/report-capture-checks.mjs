import assert from "node:assert/strict";

/**
 * Report a problem (round 19 §0; merge proof N1): the stored screenshot is
 * the current screen. A scrolled area keeps its scroll position, and a row
 * pinned to its top or bottom (`position: sticky`) stays where it shows
 * instead of being carried off with the scrolled content.
 *
 * A plain fixture area on the current page: a red row pinned to the top, a
 * yellow row pinned to the bottom, blue rows first and green rows after, so
 * the pixels tell "scrolled", "from the top" and "pin lost" apart.
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
		return { scrollTop: box.scrollTop };
	});
	assert.equal(area.scrollTop, 240, "the fixture area scrolls");
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
		return { top: at(100, 20), body: at(100, 120), bottom: at(100, 225) };
	}, report.id);
	const near = (rgb, want) => rgb.every((value, i) => Math.abs(value - want[i]) <= 60);
	assert.ok(near(pixels.top, [230, 0, 0]), `the row pinned to the top stays in the shot (got rgb ${pixels.top})`);
	assert.ok(near(pixels.body, [0, 170, 0]), `the area shows where it was scrolled, not its top (got rgb ${pixels.body})`);
	assert.ok(near(pixels.bottom, [250, 210, 0]), `the row pinned to the bottom stays in the shot (got rgb ${pixels.bottom})`);
	assert.equal(await page.evaluate(() => document.querySelectorAll("[data-lh-shot-shift]").length), 0, "the capture leaves no marks on the page");
	await page.click('[data-testid="bug-close"]');
	await page.waitForFunction(() => !document.querySelector('[data-testid="bug-dialog"]'));
	await page.evaluate(() => document.getElementById("zz-report-capture")?.remove());
	assert.equal((await fetch(`${origin}/api/bugs/${report.id}`, { method: "DELETE" })).ok, true, "the check's report is discarded");
}
