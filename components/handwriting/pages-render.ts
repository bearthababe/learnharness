import { HANDWRITING_PAGE, replayHandwriting, type BackgroundPixels, type HandwritingPage } from "../../src/core/index.ts";
import { svgImageSource } from "../artifacts/svg-image.tsx";
import { decodeHandwritingBackground, HIGHLIGHT_OPACITY, paint } from "./render.ts";

const backgrounds = new Map<string, Promise<HTMLImageElement>>();
export function preparedBackground(background: BackgroundPixels) {
	let pending = backgrounds.get(background.data);
	if (!pending) { pending = decodeHandwritingBackground(background).catch(error => { backgrounds.delete(background.data); throw error; }); backgrounds.set(background.data, pending); }
	return pending;
}
export async function prepareHandwritingPage(page: HandwritingPage) {
	await Promise.all(Object.values(page.journal.backgrounds).map(preparedBackground));
}
function canvas() { const value = document.createElement("canvas"); value.width = HANDWRITING_PAGE.width; value.height = HANDWRITING_PAGE.height; return value; }
async function imageBackground(src: string, kind: "figure" | "external"): Promise<BackgroundPixels> {
	const image = new Image(); image.src = src; await image.decode();
	if (!image.naturalWidth || !image.naturalHeight) throw new Error("Invalid image geometry");
	const paper = canvas(), context = paper.getContext("2d")!;
	context.fillStyle = "white"; context.fillRect(0, 0, paper.width, paper.height);
	const scale = kind === "figure" ? Math.min(1240 / image.naturalWidth, 760 / image.naturalHeight) : Math.min(paper.width / image.naturalWidth, paper.height / image.naturalHeight);
	const width = image.naturalWidth * scale, height = image.naturalHeight * scale;
	context.drawImage(image, (paper.width - width) / 2, kind === "figure" ? 80 : (paper.height - height) / 2, width, height);
	return { mediaType: "image/png", ...HANDWRITING_PAGE, data: paper.toDataURL("image/png").split(",")[1]! };
}
export async function figureBackground(svg: string) {
	if (new TextEncoder().encode(svg).byteLength > 25 * 1024 * 1024) throw new Error("Figure too large");
	return imageBackground(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgImageSource(svg))}`, "figure");
}
export async function externalBackground(url: string) {
	const response = await fetch(url, { cache: "no-store" }); if (!response.ok || !response.body) throw new Error("Image unavailable");
	const reader = response.body.getReader(), chunks: Uint8Array<ArrayBuffer>[] = []; let size = 0;
	while (true) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > 25 * 1024 * 1024) { await reader.cancel(); throw new Error("Image too large"); } chunks.push(new Uint8Array(value)); }
	const blob = new Blob(chunks, { type: "image/png" }), src = URL.createObjectURL(blob);
	try { return await imageBackground(src, "external"); } finally { URL.revokeObjectURL(src); }
}
/** Thumbnails use the same accepted painter and layer ordering as capture.
 * The full-size intermediate preserves eraser/highlighter semantics. */
export async function pageThumbnail(page: HandwritingPage) {
	const drawing = replayHandwriting(page.journal), paper = canvas(), ink = canvas(), highlight = canvas();
	const context = paper.getContext("2d")!, foreground = ink.getContext("2d")!, overlay = highlight.getContext("2d")!;
	context.fillStyle = "white"; context.fillRect(0, 0, paper.width, paper.height);
	if (drawing.background) context.drawImage(await preparedBackground(drawing.background), 0, 0);
	for (const stroke of drawing.strokes) {
		const target = stroke.tool === "highlighter" ? overlay : foreground;
		stroke.points.forEach((point, index) => paint(target, stroke, stroke.points[Math.max(0, index - 1)]!, point));
		if (stroke.tool === "highlighter") { foreground.save(); foreground.globalCompositeOperation = "multiply"; foreground.globalAlpha = HIGHLIGHT_OPACITY; foreground.drawImage(highlight, 0, 0); foreground.restore(); overlay.clearRect(0, 0, highlight.width, highlight.height); }
	}
	context.drawImage(ink, 0, 0); const thumbnail = document.createElement("canvas"); thumbnail.width = 140; thumbnail.height = 180; thumbnail.getContext("2d")!.drawImage(paper, 0, 0, 140, 180); return thumbnail.toDataURL("image/png");
}
