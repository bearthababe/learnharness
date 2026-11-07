import path from "node:path";

export async function checkSidebarSwipes(page, check, origin, chatId) {
	const client = await page.createCDPSession();
	const sidebar = 'aside[aria-label="Sessions"]';
	const frame = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
	const state = () => page.$eval(sidebar, element => ({ hidden: element.getAttribute("aria-hidden") === "true", inert: element.inert, x: element.getBoundingClientRect().x, width: element.getBoundingClientRect().width }));
	const point = (clientX, clientY, id = 1) => ({ x: clientX, y: clientY, id });
	const send = (type, touchPoints) => client.send("Input.dispatchTouchEvent", { type, touchPoints });
	const finish = async (cancel = false) => {
		await send(cancel ? "touchCancel" : "touchEnd", []);
		await page.waitForFunction(() => !document.querySelector("[data-sessions-swipe]"));
	};
	const drag = async (start, end, cancel = false) => {
		await send("touchStart", [point(...start)]);
		for (let index = 1; index <= 6; index++) {
			await send("touchMove", [point(start[0] + (end[0] - start[0]) * index / 6, start[1] + (end[1] - start[1]) * index / 6)]);
			await frame();
		}
		const preview = await state();
		await finish(cancel);
		return preview;
	};
	const close = async () => {
		await page.click('button[aria-label="Close sidebar"]');
		await page.waitForFunction(() => document.querySelector('aside[aria-label="Sessions"]').getAttribute("aria-hidden") === "true");
	};
	try {
		await page.waitForSelector("canvas");
		const graphY = await page.$eval("canvas", element => {
			const rect = element.getBoundingClientRect();
			for (let clientY = rect.top + 100; clientY < rect.bottom - 160; clientY += 20) {
				if ([48, 150, 280].every(clientX => document.elementFromPoint(clientX, clientY) === element)) return clientY;
			}
			throw new Error("No unobstructed canvas row for real swipe checks");
		});
		await drag([150, graphY], [210, graphY]);
		await page.waitForFunction(() => localStorage.getItem("lh.graph.camera.v1"));
		await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 300)));
		const camera = () => page.evaluate(() => localStorage.getItem("lh.graph.camera.v1"));
		let before = await camera();
		const preview = await drag([48, graphY], [280, graphY]);
		check(preview.hidden && preview.inert && preview.width === 375 && Math.abs(preview.x + 143) < 2, "Sessions follows the finger over Home graph while preview stays inert and hidden from accessibility");
		check(!(await state()).hidden, "A real touch swipe opens Sessions from Home");
		await frame();
		check(await camera() === before, "A Sessions swipe does not move the graph camera");
		check(await page.$eval('button[aria-label="Close sidebar"]', element => element === document.activeElement), "Committed swipe opening focuses the existing modal close control");
		if (process.env.LH_MOBILE_TEST_DIR) await page.screenshot({ path: path.join(process.env.LH_MOBILE_TEST_DIR, "sessions-swipe-open.png") });
		await close();
		await drag([48, graphY], [130, graphY]);
		check((await state()).hidden, "Short rightward swipe returns Sessions to closed without a fling shortcut");
		await drag([48, graphY], [280, graphY], true);
		check((await state()).hidden, "Touch cancellation beyond the opening threshold never commits Sessions");
		for (const clientX of [10, 31, 81, 110]) {
			await drag([clientX, graphY], [clientX + 210, graphY]);
			check((await state()).hidden, `Swipe beginning outside the approved band (${clientX}px) does not open Sessions`);
		}
		await drag([48, graphY], [48, graphY + 100]);
		check((await state()).hidden, "Vertical gesture in the band does not become navigation");
		before = await camera();
		await drag([150, graphY], [230, graphY]);
		await page.waitForFunction(previous => localStorage.getItem("lh.graph.camera.v1") !== previous, {}, before);
		check(true, "One-finger graph panning outside the band remains functional");
		before = await camera();
		await send("touchStart", [point(48, graphY + 80)]);
		await send("touchMove", [point(70, graphY + 80)]);
		await frame();
		await send("touchStart", [point(70, graphY + 80), point(180, graphY + 140, 2)]);
		await send("touchMove", [point(40, graphY + 65), point(235, graphY + 170, 2)]);
		await finish();
		await page.waitForFunction(previous => JSON.parse(localStorage.getItem("lh.graph.camera.v1")).k !== JSON.parse(previous).k, {}, before);
		check((await state()).hidden, "A second finger cancels the drawer and graph pinch zoom still changes scale");
		await page.goto(`${origin}/chat/${chatId}`, { waitUntil: "networkidle2" });
		await page.waitForSelector('[data-file-path-input][contenteditable="true"]');
		const conversationY = 180;
		const opener = await page.$eval('button[data-testid="open-sidebar"]', element => { const rect = element.getBoundingClientRect(); return { x: rect.right - 5, y: rect.y + rect.height / 2 }; });
		await send("touchStart", [point(opener.x, opener.y)]);
		await finish();
		await page.waitForFunction(() => document.querySelector('aside[aria-label="Sessions"]').getAttribute("aria-hidden") === "false");
		check(true, "An ordinary touch on the existing Sessions button still works inside the band");
		await close();
		const editor = "[data-file-path-input]";
		const originalDraft = await page.$eval(editor, element => element.textContent);
		await page.locator(editor).fill("Swipe draft preservation");
		await drag([48, conversationY], [130, conversationY]);
		check(await page.$eval(editor, element => element === document.activeElement && element.textContent === "Swipe draft preservation") && (await state()).hidden, "Aborted conversation swipe preserves composer focus and its exact draft");
		const editorY = await page.$eval(editor, element => { const rect = element.getBoundingClientRect(); return rect.y + rect.height / 2; });
		await drag([48, editorY], [280, editorY]);
		check((await state()).hidden && await page.$eval(editor, element => element.textContent === "Swipe draft preservation"), "Swiping inside the editable composer does not open Sessions or change the draft");
		await page.$eval(editor, element => element.blur());
		await page.evaluate(() => getSelection()?.removeAllRanges());
		const historyBefore = await page.$eval('[role="log"]', element => {
			const scroll = [...element.querySelectorAll("div")].find(child => /auto|scroll/.test(getComputedStyle(child).overflowY));
			scroll.scrollTop = (scroll.scrollHeight - scroll.clientHeight) / 2;
			return scroll.scrollTop;
		});
		await drag([48, conversationY], [48, conversationY + 100]);
		check((await state()).hidden && await page.$eval('[role="log"]', (element, previous) => [...element.querySelectorAll("div")].find(child => /auto|scroll/.test(getComputedStyle(child).overflowY)).scrollTop < previous, historyBefore), "A real vertical touch in the opening band still scrolls the conversation");
		await send("touchStart", [point(48, conversationY)]);
		await send("touchMove", [point(280, conversationY)]);
		await page.setViewport({ width: 375, height: 650, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
		await finish();
		check((await state()).hidden, "Viewport interruption cancels an otherwise completing swipe");
		await page.setViewport({ width: 375, height: 667, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
		await frame();
		await page.$eval('[role="log"] p', element => {
			const range = document.createRange();
			range.selectNodeContents(element);
			getSelection().removeAllRanges();
			getSelection().addRange(range);
		});
		await drag([48, conversationY], [280, conversationY]);
		check((await state()).hidden, "Existing message text selection is not claimed by Sessions");
		await page.evaluate(() => getSelection()?.removeAllRanges());
		await send("touchStart", [point(48, conversationY)]);
		await send("touchMove", [point(140, conversationY)]);
		await frame();
		check((await state()).hidden && (await state()).x < 0, "Conversation swipe previews without exposing modal controls");
		if (process.env.LH_MOBILE_TEST_DIR) await page.screenshot({ path: path.join(process.env.LH_MOBILE_TEST_DIR, "sessions-swipe-preview.png") });
		await send("touchMove", [point(280, conversationY)]);
		await finish();
		check(!(await state()).hidden, "Real touch swipe also opens Sessions from a learning conversation");
		await page.keyboard.press("Escape");
		check((await state()).hidden, "Escape retains existing dismissal after swipe opening");
		await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
		await drag([48, conversationY], [130, conversationY]);
		check((await state()).hidden, "Reduced-motion cancellation restores the closed state");
		await page.emulateMediaFeatures([]);
		await page.locator(editor).fill(originalDraft);
		await page.$eval(editor, element => element.blur());
		await page.goto(origin, { waitUntil: "networkidle2" });
		await page.waitForSelector('[data-testid="import-notes"]');
	} finally {
		await client.detach();
	}
}
