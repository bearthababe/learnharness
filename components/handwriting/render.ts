import { HANDWRITING_PAGE, type BackgroundPixels, type HandwritingStroke } from "../../src/core/index.ts";
import type { CaptureRecord } from "./transfer-device.ts";

export const HIGHLIGHT_OPACITY = 0.35;
type Point = HandwritingStroke["points"][number];
/** The accepted working painter, also used by full-page source rendering. */
export function paint(context: CanvasRenderingContext2D, stroke: HandwritingStroke, from: Point, to: Point) {
	context.globalCompositeOperation = stroke.tool === "eraser" ? "destination-out" : "source-over";
	context.strokeStyle = context.fillStyle = stroke.tool === "eraser" ? "#ffffff" : stroke.colour;
	context.lineWidth = stroke.tool === "pen" ? (3 + to.pressure * 4) * stroke.penScale : stroke.width;
	context.lineCap = context.lineJoin = "round";
	context.beginPath(); context.moveTo(from.x, from.y); context.lineTo(to.x, to.y); context.stroke();
	if (from.x === to.x && from.y === to.y) { context.beginPath(); context.arc(to.x, to.y, context.lineWidth / 2, 0, Math.PI * 2); context.fill(); }
	context.globalCompositeOperation = "source-over";
}
export async function decodeHandwritingBackground(background: BackgroundPixels): Promise<HTMLImageElement> {
	const image = new Image(); image.src = `data:image/png;base64,${background.data}`; await image.decode();
	if (image.naturalWidth !== HANDWRITING_PAGE.width || image.naturalHeight !== HANDWRITING_PAGE.height) throw new Error("Invalid background dimensions");
	return image;
}
export function freezeHandwritingRaster(background: HTMLCanvasElement, ink: HTMLCanvasElement): NonNullable<CaptureRecord["raster"]> {
	const canvas = document.createElement("canvas"); canvas.width = HANDWRITING_PAGE.width; canvas.height = HANDWRITING_PAGE.height;
	const context = canvas.getContext("2d")!;
	// B4 (round 18): the live canvases may be drawn above page resolution; the
	// snapshot is always the page at 1400×1800.
	context.fillStyle = "white"; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(background, 0, 0, canvas.width, canvas.height); context.drawImage(ink, 0, 0, canvas.width, canvas.height);
	return { ...HANDWRITING_PAGE, rgba: context.getImageData(0, 0, canvas.width, canvas.height).data.buffer as ArrayBuffer };
}
export async function encodeHandwritingRaster(raster: NonNullable<CaptureRecord["raster"]>): Promise<Blob> {
	const canvas = document.createElement("canvas"); canvas.width = raster.width; canvas.height = raster.height;
	canvas.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(raster.rgba.slice(0)), raster.width, raster.height), 0, 0);
	return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("Couldn’t encode snapshot")), "image/png"));
}

/** T6 (round 17): a snapshot of one area of the page — the area scaled to
 *  fit a page-sized image on white (the snapshot format stays one page). */
export function freezeHandwritingArea(background: HTMLCanvasElement, ink: HTMLCanvasElement, area: { x: number; y: number; width: number; height: number }): NonNullable<CaptureRecord["raster"]> {
	const { width: W, height: H } = HANDWRITING_PAGE;
	const page = document.createElement("canvas"); page.width = W; page.height = H;
	const source = page.getContext("2d")!;
	source.fillStyle = "white"; source.fillRect(0, 0, W, H); source.drawImage(background, 0, 0, W, H); source.drawImage(ink, 0, 0, W, H);
	const canvas = document.createElement("canvas"); canvas.width = W; canvas.height = H;
	const context = canvas.getContext("2d")!;
	context.fillStyle = "white"; context.fillRect(0, 0, W, H);
	const margin = 40, scale = Math.min((W - 2 * margin) / area.width, (H - 2 * margin) / area.height);
	const width = area.width * scale, height = area.height * scale;
	context.imageSmoothingQuality = "high";
	context.drawImage(page, area.x, area.y, area.width, area.height, (W - width) / 2, (H - height) / 2, width, height);
	return { ...HANDWRITING_PAGE, rgba: context.getImageData(0, 0, W, H).data.buffer as ArrayBuffer };
}
