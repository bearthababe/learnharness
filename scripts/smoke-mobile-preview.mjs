/** Read-only preview verification. See docs/verification/mobile-preview-checks.md. */
import assert from "node:assert/strict";
import puppeteer from "puppeteer-core";

async function readResponse(url) {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(new Error(`${url}: HTTP request/body exceeded 10000ms`)), 10_000);
	try {
		const response = await fetch(url, { redirect: "error", signal: controller.signal });
		const chunks = [];
		let size = 0;
		// Consume the body under the SAME deadline, including error responses.
		for await (const chunk of response.body ?? []) {
			size += chunk.length;
			assert.ok(size <= 4 * 1024 * 1024, `${url}: response exceeded 4 MiB`);
			chunks.push(chunk);
		}
		assert.equal(response.status, 200, `${url}: HTTP ${response.status}, expected 200`);
		return { body: Buffer.concat(chunks), type: response.headers.get("content-type") ?? "" };
	} catch (error) {
		if (controller.signal.aborted) throw controller.signal.reason;
		throw error;
	} finally {
		controller.abort();
		clearTimeout(timer);
	}
}

async function checkLaunch(page, destination, manifestPath) {
	const response = await page.goto(destination, { waitUntil: "domcontentloaded" });
	assert.equal(response?.status(), 200, `${destination}: browser document must return 200`);
	assert.equal(page.url(), destination, "Preview must retain its intended destination");
	// Next can stream metadata after the initial head; inspect the settled DOM.
	await page.waitForSelector(`link[rel="manifest"][href="${manifestPath}"]`);
	const metadata = await page.evaluate(() => ({
		title: document.title,
		manifest: document.querySelector('link[rel="manifest"]')?.href,
		icon: document.querySelector('link[rel="apple-touch-icon"]')?.href,
		capable: document.querySelector('meta[name="mobile-web-app-capable"]')?.content,
		appleTitle: document.querySelector('meta[name="apple-mobile-web-app-title"]')?.content,
		statusBar: document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')?.content,
		viewport: document.querySelector('meta[name="viewport"]')?.content,
	}));
	assert.equal(metadata.title, "Learning Harness", "Root layout must identify the intended app");
	assert.equal(metadata.capable, "yes", "Installed Next emits mobile-web-app-capable");
	assert.equal(metadata.appleTitle, "LearnHarness");
	assert.equal(metadata.statusBar, "default");
	assert.match(metadata.viewport ?? "", /width=device-width/);
	assert.match(metadata.viewport ?? "", /viewport-fit=cover/);
	assert.equal(metadata.manifest, new URL(manifestPath, destination).href);
	assert.equal(metadata.icon, new URL("/writing-touch-icon.png", destination).href);

	const { body, type } = await readResponse(metadata.manifest);
	assert.match(type, /^application\/manifest\+json\b/i, "Manifest content type");
	const manifest = JSON.parse(body.toString("utf8"));
	assert.equal(manifest.display, "standalone");
	assert.equal(manifest.short_name, "LearnHarness");
	if (new URL(destination).pathname === "/") assert.equal(manifest.name, "LearnHarness");
	else assert.match(manifest.name, /^LearnHarness · .+/);
	for (const field of ["id", "start_url", "scope"]) {
		assert.equal(typeof manifest[field], "string", `Manifest must include ${field}`);
		assert.equal(new URL(manifest[field], metadata.manifest).href, destination, `Stable manifest ${field}`);
	}
	assert.ok(Array.isArray(manifest.icons) && manifest.icons.length > 0, "Manifest must publish an icon");
	for (const icon of manifest.icons) {
		assert.equal(new URL(icon.src, metadata.manifest).href, metadata.icon, "Manifest and Apple icon agree");
		assert.equal(icon.type, "image/png");
		assert.equal(icon.sizes, "180x180");
	}
	const image = await readResponse(metadata.icon);
	assert.match(image.type, /^image\/png\b/i);
	assert.ok(image.body.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), "Touch icon must have a PNG signature");
	// Decode the consumed bytes too: a PNG header alone can hide a broken image.
	const dimensions = await page.evaluate(async data => {
		const image = new Image();
		image.src = data;
		await image.decode();
		return [image.naturalWidth, image.naturalHeight];
	}, `data:image/png;base64,${image.body.toString("base64")}`);
	assert.deepEqual(dimensions, [180, 180], "Touch icon must decode at its advertised size");
	console.log(`PASS page, mobile/Apple metadata, standalone manifest and PNG: ${destination}`);
}

async function checkReload(page, destination) {
	const input = '[data-file-path-input][data-placeholder="What do you want to learn?"]';
	const draft = "Preview verification: unsent draft must reset on reload.";
	await page.locator(input).fill(draft);
	assert.equal(await page.$eval(input, element => element.textContent), draft);
	await page.evaluate(() => { window.__lhPreviewBeforeReload = true; });
	await page.locator('button[data-testid="open-sidebar"]').click();
	await page.waitForSelector('[aria-label="Sessions"][role="dialog"]');
	await page.locator('aside[aria-label="Sessions"] summary').filter(element => element.textContent.trim() === "Tools").click();
	const [response] = await Promise.all([
		page.waitForNavigation({ waitUntil: "domcontentloaded" }),
		page.locator('aside[aria-label="Sessions"] details button').filter(element => element.textContent.trim() === "Reload preview").click(),
	]);
	assert.equal(response?.status(), 200, "Tools → Reload preview must fetch a fresh 200 document");
	assert.equal(page.url(), destination, "Reload must preserve the destination");
	await page.waitForSelector(input);
	assert.equal(await page.evaluate(() => window.__lhPreviewBeforeReload), undefined, "Reload must replace the document");
	assert.equal(await page.evaluate(() => performance.getEntriesByType("navigation")[0]?.type), "reload", "The actual Reload preview control must reload");
	assert.equal(await page.$eval(input, element => element.textContent), "", "Reload must clear the unsent Home draft");
	console.log("PASS Sessions → Tools → Reload preview: fresh document, same URL, unsent Home draft reset");
}

async function closeBrowser(browser) {
	let timer;
	try {
		await Promise.race([
			browser.close(),
			new Promise((_, reject) => {
				timer = setTimeout(() => {
					const child = browser.process();
					try {
						// Puppeteer owns a detached POSIX group, including Chromium's
						// descendants. Match mobile-browser-runner's platform handling.
						if (child?.pid) {
							if (process.platform === "win32") child.kill("SIGKILL");
							else process.kill(-child.pid, "SIGKILL");
						}
					} catch (error) {
						if (error.code !== "ESRCH") { reject(error); return; }
					}
					reject(new Error("Browser cleanup exceeded 5000ms; Chromium killed"));
				}, 5000);
			}),
		]);
	} finally { clearTimeout(timer); }
}

async function main() {
	assert.ok(process.env.LH_SMOKE_URL, "LH_SMOKE_URL is required; select the intended preview explicitly");
	const url = new URL(process.env.LH_SMOKE_URL);
	assert.ok(["http:", "https:"].includes(url.protocol) && !url.username && !url.password, "LH_SMOKE_URL must be an HTTP(S) URL without credentials");
	assert.ok(url.pathname === "/" && !url.search && !url.hash, "LH_SMOKE_URL must name the root preview URL (no path, query or fragment)");
	const chatId = process.env.LH_SMOKE_CHAT_ID;
	if (chatId !== undefined) assert.match(chatId, /^[A-Za-z0-9_-]+$/, "LH_SMOKE_CHAT_ID must identify an existing session");
	const root = await readResponse(url.href);
	assert.match(root.type, /^text\/html\b/i, "Root page must be HTML");
	const browser = await puppeteer.launch({
		executablePath: process.env.CHROMIUM_PATH ?? "/usr/bin/chromium",
		headless: true, timeout: 30_000, protocolTimeout: 20_000,
		args: ["--no-sandbox", "--disable-features=BackForwardCache"],
	});
	try {
		const page = await browser.newPage();
		page.setDefaultTimeout(15_000);
		page.setDefaultNavigationTimeout(15_000);
		await page.setViewport({ width: 375, height: 667, isMobile: true, hasTouch: true });
		await page.setCacheEnabled(false);
		await page.setBypassServiceWorker(true);
		await page.setRequestInterception(true);
		const blocked = [];
		const interceptionErrors = [];
		page.on("request", request => {
			// Includes API writes and Next server actions. No submitted drafts,
			// credentials or learner mutations can leave this fresh browser.
			const read = ["GET", "HEAD"].includes(request.method());
			if (!read) blocked.push(`${request.method()} ${new URL(request.url()).pathname}`);
			void (read ? request.continue() : request.abort("blockedbyclient")).catch(error => interceptionErrors.push(error));
		});
		await checkLaunch(page, url.href, "/manifest.webmanifest");
		await checkReload(page, url.href);
		if (chatId) {
			const destination = new URL(`/chat/${chatId}`, url).href;
			const session = await readResponse(destination);
			assert.match(session.type, /^text\/html\b/i);
			await checkLaunch(page, destination, `/chat/${chatId}/manifest.webmanifest`);
		} else console.log("SKIP session-scoped launch (set LH_SMOKE_CHAT_ID to an existing session)");
		assert.equal(interceptionErrors.length, 0, "Request interception must remain active");
		console.log(`PASS read-only browser guard (${blocked.length} non-read requests blocked)`);
	} finally { await closeBrowser(browser); }
	console.log("Mobile preview checks passed (Chromium touch emulation; physical iOS acceptance is separate).");
}

try { await main(); }
catch (error) {
	console.error(`Mobile preview check failed: ${error.message}`);
	process.exitCode = 1;
}
