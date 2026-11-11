const verifiedChromiumMajors = new Set(["152", "155"]);

export function previewBrowserAdmitted(headers) {
	const declaration = headers["sec-ch-ua"];
	if (typeof declaration !== "string" || declaration.length > 512 || /[\r\n]/.test(declaration)) return false;
	const brands = new Map();
	for (const entry of declaration.split(",")) {
		const match = /^\s*"([^"\\\x00-\x1f\x7f]{1,80})"\s*;\s*v="([0-9]{1,3})"\s*$/.exec(entry);
		if (!match || brands.has(match[1])) return false;
		const [, brand, version] = match;
		if (!["Chromium", "Google Chrome"].includes(brand) && brand.replace(/[^A-Za-z]/g, "") !== "NotABrand") return false;
		brands.set(brand, version);
	}
	const chromium = brands.get("Chromium");
	return verifiedChromiumMajors.has(chromium) && (!brands.has("Google Chrome") || brands.get("Google Chrome") === chromium);
}

export function refusePreviewBrowser(response) {
	response.writeHead(403, {
		"content-type": "text/plain; charset=utf-8",
		"content-security-policy": "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; sandbox",
		"cache-control": "no-store",
		"vary": "Sec-CH-UA",
		"x-content-type-options": "nosniff",
	}).end("Untrusted preview blocked: this browser's network isolation has not been verified. Use a verified Chromium browser or the isolated desktop preview. Normal LearnHarness access is unaffected.\n");
}
