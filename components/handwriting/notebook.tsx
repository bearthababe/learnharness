"use client";

/** Accepted canvas/layout from c663dcecd22a, isolated from session/model state.
 * Only completed strokes touch recovery. No React/storage work on movement. */
import { useCallback, useContext, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type Ref, type RefObject, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import { Button } from "@/components/ui/button";
import { ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon, FilesIcon, Maximize2Icon, Minimize2Icon, MinusIcon, MoreHorizontalIcon, PaperclipIcon, PlusIcon, SquareDashedIcon, XIcon } from "lucide-react";
import { useSidebar } from "@/components/sidebar";
import { HandwritingPages, type PagesState } from "./pages";
import { handwritingPagesDevice } from "./pages-device";
import { externalBackground, prepareHandwritingPage, preparedBackground, pageThumbnail } from "./pages-render";
import type { HandwritingPage, PageSummary } from "@/src/core";
import { HandwritingToolbar, setWheelSpot, useWheelSpot } from "./toolbar";
import { useWritingPalette } from "@/components/device-features";
import { HANDWRITING_DELETED_EVENT } from "./device";
import { notebookSource, normalizeHandwriting, replayHandwriting, slotPage, HANDWRITING_PAGE, HANDWRITING_PEN_COLOURS, HANDWRITING_PEN_SCALES, HANDWRITING_BROAD_WIDTHS, HANDWRITING_HIGHLIGHT_COLOUR, type HandwritingStroke as Stroke } from "@/src/core";
import type { AttachmentReview } from "./attachment";
import { HandwritingSubmissionContext } from "./submission";
import { dictationCheckpoint, finishDictation } from "../dictation";
import { useMenuEscape } from "../menu-escape";
import { useOneMenu } from "../one-menu";
import { paint, HIGHLIGHT_OPACITY, freezeHandwritingArea, freezeHandwritingRaster } from "./render";
import { ConceptsSetup } from "../shared-writing";

const { width: WIDTH, height: HEIGHT } = HANDWRITING_PAGE;
const PEN_COLOURS = ["Black", "Blue", "Red", "Green"].map((name, i) => ({ name, value: HANDWRITING_PEN_COLOURS[i]! }));
const PEN_SIZES = ["Thin", "Medium", "Thick"].map((name, i) => ({ name, value: HANDWRITING_PEN_SCALES[i]! }));
const BROAD_SIZES = ["Small", "Medium", "Large"].map((name, i) => ({ name, value: HANDWRITING_BROAD_WIDTHS[i]! }));
type Point = Stroke["points"][number];
export type HandwritingHandle = { canResize: () => boolean };

export function HandwritingNotebook({ ref, chatId, hidden, expanded, onToggleExpanded, onClose, review, onReview, register, origin = "lesson" }: {
	ref?: Ref<HandwritingHandle>; chatId: string; hidden: boolean; expanded: boolean; onToggleExpanded: () => void; onClose: () => void; review: () => Promise<AttachmentReview>; onReview: () => void; register: (model: HandwritingPages) => () => void;
	/** What the expanded notebook returns to (round 14, C4): named by where
	 *  the learner came from, never a question that is not there. */
	origin?: "lesson" | "question" | "practice" | "drill";
}) {
	const submission = useContext(HandwritingSubmissionContext), submissionRef = useRef(submission); submissionRef.current = submission;
	const callbacks = useRef({ review, onReview }); callbacks.current = { review, onReview };
	const reviewDeferred = useRef(false), strokeWaiters = useRef<(() => void)[]>([]);
	const decodedBackground = useRef<HTMLImageElement | null>(null), decoding = useRef(false);
	const sidebar = useSidebar(), sidebarRef = useRef(sidebar); sidebarRef.current = sidebar;
	useEffect(() => {
		if (hidden) return;
		const narrow = matchMedia("(max-width: 979px)");
		const close = () => { if (narrow.matches && sidebarRef.current.open) sidebarRef.current.toggle(); };
		const frame = requestAnimationFrame(close); narrow.addEventListener("change", close);
		return () => { cancelAnimationFrame(frame); narrow.removeEventListener("change", close); };
	}, [hidden]);
	const canvasRef = useRef<HTMLCanvasElement>(null), backgroundRef = useRef<HTMLCanvasElement>(null), highlightRef = useRef<HTMLCanvasElement>(null);
	const controlsRef = useRef<HTMLElement>(null), slotRef = useRef<HTMLDivElement>(null), areaRef = useRef<HTMLDivElement>(null);
	const strokes = useRef<Stroke[]>([]), active = useRef<{ pointerId: number; stroke: Stroke; complete: (stroke: Stroke) => void } | null>(null);
	const recovery = useRef<HandwritingPages | null>(null);
	const attachmentNotice = submission?.attachment()?.noticeForPage(normalizeHandwriting(recovery.current?.getSnapshot().working ?? { version: 1, operations: [] }).pageId);
	// The confirmation folds away once seen (round 11); failures stay.
	const confirmation = attachmentNotice && (attachmentNotice.kind === "attached" || attachmentNotice.kind === "updated" || attachmentNotice.kind === "unchanged") ? `${attachmentNotice.kind}:${attachmentNotice.text}` : "";
	const [seenConfirmation, setSeenConfirmation] = useState("");
	useEffect(() => {
		if (!confirmation) { setSeenConfirmation(""); return; }
		const timer = window.setTimeout(() => setSeenConfirmation(confirmation), 4000);
		return () => window.clearTimeout(timer);
	}, [confirmation]);
	const shownNotice = confirmation && seenConfirmation === confirmation ? undefined : attachmentNotice;
	const [saved, setSaved] = useState<Pick<PagesState, "ready" | "notice">>({ ready: false, notice: "Opening notebook…" });
	const [pageId, setPageId] = useState("page_initial"), [pages, setPages] = useState<PageSummary[]>([]), [pagesOpen, setPagesOpen] = useState(false), [optionsOpen, setOptionsOpen] = useState(false);
	const palette = useWritingPalette();
	// Handedness: the tool palette sits on the right by default; left-handed
	// writers can move it to the left (stored on this device).
	// The wheel goes wherever the learner drags it (round 14, T2), so its
	// side follows its spot; the arc keeps the left-handed option.
	const [arcLeft, setToolsLeft] = useState(false);
	useEffect(() => { try { setToolsLeft(localStorage.getItem("lh:writing-tools-side") === "left"); } catch { /* storage blocked */ } }, []);
	const wheelSpot = useWheelSpot();
	const toolsLeft = palette === "wheel" ? wheelSpot.endsWith("left") : arcLeft;
	// Clear says so and offers Undo right there (round 14, T3).
	const [clearedAt, setClearedAt] = useState<number | null>(null);
	useEffect(() => {
		if (clearedAt === null) return;
		const timer = window.setTimeout(() => setClearedAt(null), 8000);
		return () => window.clearTimeout(timer);
	}, [clearedAt]);
	const toggleToolsSide = () => setToolsLeft((left) => {
		try { localStorage.setItem("lh:writing-tools-side", left ? "right" : "left"); } catch { /* storage blocked */ }
		return !left;
	});
	const [flattened, setFlattened] = useState(false);
	const positions = useRef(new Map<string, { split: number; full?: number }>()), displayedPage = useRef("page_initial");
	const [history, setHistory] = useState({ canUndo: false, canRedo: false });
	const refreshStatus = useRef<() => void>(() => {});
	const ownMutation = useRef(false);
	const penToolTap = useRef<{ pointerId: number; button: HTMLButtonElement } | null>(null), penToolClick = useRef<HTMLButtonElement | null>(null);
	const [tool, setTool] = useState<Stroke["tool"]>("pen");
	// Fingers scroll and never draw (palm rejection); say so the first few
	// times a finger lands, instead of leaving the page silently inert.
	const [fingerHint, setFingerHint] = useState(false);
	const fingerHints = useRef(0);
	const fingerTimer = useRef<number | undefined>(undefined);
	function noteFinger() {
		if (fingerHints.current >= 2) return;
		fingerHints.current++;
		setFingerHint(true);
		window.clearTimeout(fingerTimer.current);
		fingerTimer.current = window.setTimeout(() => setFingerHint(false), 2600);
	}
	useEffect(() => () => window.clearTimeout(fingerTimer.current), []);
	const [colour, setColour] = useState<Stroke["colour"]>(HANDWRITING_PEN_COLOURS[0]);
	const [penScale, setPenScale] = useState<Stroke["penScale"]>(HANDWRITING_PEN_SCALES[1]), [eraserWidth, setEraserWidth] = useState<Stroke["width"]>(HANDWRITING_BROAD_WIDTHS[1]), [highlighterWidth, setHighlighterWidth] = useState<Stroke["width"]>(HANDWRITING_BROAD_WIDTHS[1]);
	const [dimPaper, setDimPaper] = useState(true), [toolsOpen, setToolsOpen] = useState(false), [conceptsOpen, setConceptsOpen] = useState(false);
	// T6: the Attach menu (whole page, or an area) and the area being drawn.
	const [attachOpen, setAttachOpen] = useState(false);
	const [selecting, setSelecting] = useState(false), [area, setArea] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
	const areaDrag = useRef<{ id: number; x: number; y: number } | null>(null);
	useMenuEscape(hidden ? null : pagesOpen ? "pages" : optionsOpen ? "options" : toolsOpen ? "tools" : conceptsOpen ? "concepts" : attachOpen ? "attach" : selecting ? "select-area" : null, () => {
		const trigger = pagesOpen ? "Pages" : attachOpen || selecting ? "More ways to attach" : "Notebook options";
		setPagesOpen(false); setOptionsOpen(false); setToolsOpen(false); setConceptsOpen(false); setAttachOpen(false); setSelecting(false); setArea(null);
		controlsRef.current?.querySelector<HTMLButtonElement>(`[aria-label="${trigger}"]`)?.focus();
	});
	// One menu open at a time, app-wide (round 11): a notebook panel closes
	// when Settings, a model menu or Extract files opens, and vice versa.
	useOneMenu("handwriting-panel", !hidden && (pagesOpen || optionsOpen || toolsOpen || conceptsOpen || attachOpen), () => { setPagesOpen(false); setOptionsOpen(false); setToolsOpen(false); setConceptsOpen(false); setAttachOpen(false); });
	// T3 (round 17): one fixed paper size. Its base is the size at which the
	// whole page fits the expanded notebook; the card beside the lesson shows
	// part of the same page at the same size, so moving the card never
	// resizes the paper. Only zoom changes it — pinch, or − / reset / + —
	// and strokes are in page units, so the pen's width follows the zoom.
	const [baseWidth, setBaseWidth] = useState(1);
	const [zoom, setZoomState] = useState(() => readZoom());
	const setZoom = useCallback((next: number) => { const value = clampZoom(next); setZoomState(value); try { localStorage.setItem(ZOOM_KEY, String(value)); } catch { /* this view only */ } }, []);
	const paperSize = { width: baseWidth * zoom, height: baseWidth * zoom * HEIGHT / WIDTH };
	// B4 (round 18): ink is drawn at the paper's displayed size × the screen's
	// pixel ratio (in quarter steps, so zoom does not repaint on every step),
	// never below page resolution and at most 2.5× it (Safari's per-canvas
	// size limit). Drawing stays in page units through the canvas transform.
	const [pixelRatio, setPixelRatio] = useState(1);
	useEffect(() => {
		const read = () => setPixelRatio(window.devicePixelRatio || 1); read();
		const query = window.matchMedia?.(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
		query?.addEventListener?.("change", read); window.addEventListener("resize", read);
		return () => { query?.removeEventListener?.("change", read); window.removeEventListener("resize", read); };
	}, []);
	const inkScale = Math.min(2.5, Math.max(1, Math.ceil(paperSize.width * pixelRatio / WIDTH * 4) / 4));
	const viewRef = useRef({ expanded, paperSize }); viewRef.current = { expanded, paperSize };
	const paperPositions = useRef<{ split: number; full?: number }>({ split: 0 }), restorePaperPosition = useRef<number | null>(null);
	const mergeHighlight = useCallback((context: CanvasRenderingContext2D) => {
		const overlay = highlightRef.current!;
		context.save();
		try { context.globalCompositeOperation = "multiply"; context.globalAlpha = HIGHLIGHT_OPACITY; context.drawImage(overlay, 0, 0, WIDTH, HEIGHT); }
		finally { context.restore(); }
		overlay.getContext("2d")!.clearRect(0, 0, WIDTH, HEIGHT);
	}, []);
	const redraw = useCallback(() => {
		const context = canvasRef.current?.getContext("2d"); if (!context) return;
		for (const canvas of [canvasRef.current!, highlightRef.current!]) { const k = canvas.width / WIDTH; canvas.getContext("2d")!.setTransform(k, 0, 0, k, 0, 0); }
		context.clearRect(0, 0, WIDTH, HEIGHT);
		const background = backgroundRef.current!.getContext("2d")!; background.fillStyle = "white"; background.fillRect(0, 0, WIDTH, HEIGHT);
		if (decodedBackground.current) background.drawImage(decodedBackground.current, 0, 0);
		const highlight = highlightRef.current!.getContext("2d")!; highlight.clearRect(0, 0, WIDTH, HEIGHT);
		for (const stroke of strokes.current) {
			const target = stroke.tool === "highlighter" ? highlight : context;
			stroke.points.forEach((point, index) => paint(target, stroke, stroke.points[Math.max(0, index - 1)]!, point));
			if (stroke.tool === "highlighter") mergeHighlight(context);
		}
	}, [mergeHighlight]);
	useEffect(() => {
		const model = new HandwritingPages(chatId, { device: handwritingPagesDevice, storage: () => localStorage, fetch: (url, init) => fetch(url, init), prepare: prepareHandwritingPage, flatten: externalBackground, preserveDrafts: async () => { await submissionRef.current?.model?.flush(); } });
		recovery.current = model;
		const unregister = register(model);
		let painted = model.getSnapshot().working;
		let decodeGeneration = 0, live = true;
		const update = () => {
			if (!live) return;
			// An ACK/failure arriving mid-stroke must not change surrounding UI or
			// repaint the active stroke. Apply its status on completion instead.
			if (active.current) return;
			const state = model.getSnapshot();
			setPages(state.pages); setPageId(state.page.id); setFlattened(state.page.origin.kind === "external");
			if (painted !== state.working) {
				if (displayedPage.current !== state.page.id) {
					const area = areaRef.current;
					paperPositions.current[viewRef.current.expanded ? "full" : "split"] = area ? area.scrollTop / Math.max(1, viewRef.current.paperSize.height) : 0;
					positions.current.set(displayedPage.current, paperPositions.current);
					paperPositions.current = state.readingPosition === "top" ? { split: 0, full: 0 } : positions.current.get(state.page.id) ?? { split: 0 };
					displayedPage.current = state.page.id;
					if (area) area.scrollTop = (paperPositions.current[viewRef.current.expanded ? "full" : "split"] ?? 0) * viewRef.current.paperSize.height;
				} else if (state.readingPosition === "top" && areaRef.current) { areaRef.current.scrollTop = 0; paperPositions.current = { split: 0, full: 0 }; }
				const previousPainted = painted;
				painted = state.working;
				const { canUndo, canRedo } = replayHandwriting(state.working); setHistory({ canUndo, canRedo });
				if (!ownMutation.current) {
					const page = replayHandwriting(state.working), generation = ++decodeGeneration;
					if (page.background) {
						decoding.current = true; setSaved({ ready: false, notice: "Opening notebook…" });
						void preparedBackground(page.background).then(image => {
							if (generation !== decodeGeneration) return;
							decodedBackground.current = image; decoding.current = false; strokes.current = page.strokes; redraw(); update();
						}).catch(() => { if (generation === decodeGeneration) { painted = previousPainted; decoding.current = true; setSaved({ ready: false, notice: "Page saved on this device. Couldn’t finish opening it." }); } });
						return;
					}
					decodedBackground.current = null; decoding.current = false; strokes.current = page.strokes; redraw();
				}
			}
			if (decoding.current) return;
			setSaved(previous => previous.ready === (state.ready && !state.busy) && previous.notice === state.notice ? previous : { ready: state.ready && !state.busy, notice: state.notice });
		};
		refreshStatus.current = update;
		const unsubscribe = model.subscribe(update);
		void model.open();
		const retry = () => { if (!active.current) void model.retry().then(update); };
		const visible = () => { if (document.visibilityState === "visible") retry(); };
		const timer = window.setInterval(retry, 5000);
		const deleted = (event: Event) => { if ((event as CustomEvent<string>).detail === chatId) model.sessionDeleted(); };
		window.addEventListener(HANDWRITING_DELETED_EVENT, deleted);
		window.addEventListener("online", retry); window.addEventListener("focus", retry); document.addEventListener("visibilitychange", visible);
		return () => { live = false; decodeGeneration++; unregister(); unsubscribe(); model.dispose(); clearInterval(timer); window.removeEventListener(HANDWRITING_DELETED_EVENT, deleted); window.removeEventListener("online", retry); window.removeEventListener("focus", retry); document.removeEventListener("visibilitychange", visible); };
	}, [chatId, redraw, register]);
	useEffect(() => {
		const unregister = submissionRef.current?.registerNotebook({ canUpdate: () => !active.current, reveal: slot => { if (recovery.current?.getSnapshot().working.pageId !== slotPage(slot)) return; if (active.current) reviewDeferred.current = true; else callbacks.current.onReview(); } });
		return () => { unregister?.(); for (const resolve of strokeWaiters.current.splice(0)) resolve(); };
	}, [chatId]);
	// T6 (round 17): Attach says what it attaches to, and says why when it
	// cannot attach — never a tap that does nothing.
	const [attachNote, setAttachNote] = useState("");
	useEffect(() => { if (!attachNote) return; const timer = window.setTimeout(() => setAttachNote(""), 6000); return () => window.clearTimeout(timer); }, [attachNote]);
	async function attachSnapshot(area?: { x: number; y: number; width: number; height: number }) {
		const working = recovery.current, transfer = submissionRef.current, uploader = transfer?.attachment();
		if (!working?.getSnapshot().ready || decoding.current || !transfer?.ready || !uploader) { setAttachNote("The notebook is still opening. Try again in a moment."); return; }
		if (active.current || transfer.isPreparing() || transfer.blocked()) { setAttachNote("Wait a moment: the last change is still being saved."); return; }
		if (!transfer.activeField()) { setAttachNote("There is nothing to attach to right now. Open the question, or write a message to the tutor."); return; }
		const content = replayHandwriting(working.getSnapshot().working);
		if (!content.strokes.length && !content.background) { setAttachNote("This page is empty. Write something first."); return; }
		if (!transfer.claim()) { setAttachNote("Wait a moment: the last change is still being saved."); return; }
		setAttachNote("");
		const field = transfer.activeField(), pageId = normalizeHandwriting(working.getSnapshot().working).pageId, validSpeech = dictationCheckpoint();
		const valid = () => recovery.current === working && normalizeHandwriting(working.getSnapshot().working).pageId === pageId && transfer.activeField() === field && !!field && validSpeech();
		// B2 (round 18): the whole page attaches into the page's own slot (a newer
		// version replaces its older one, and says so); each area gets a slot of
		// its own, so areas add up beside the page and each other.
		const slot = area ? `${pageId}~area_${crypto.getRandomValues(new Uint32Array(1))[0]!.toString(16).padStart(8, "0")}` : pageId;
		try {
			if (uploader.hasCapture(slot) && !area) { await uploader.retry(slot); return; }
			const observed = await callbacks.current.review();
			if (!valid()) return;
			await uploader.attach({ pageId: slot, head: observed.pageAttachments[slot], valid, finish: async () => {
				await finishDictation();
				if (active.current) await new Promise<void>(resolve => strokeWaiters.current.push(resolve));
				return valid() && working.getSnapshot().ready && !decoding.current;
			}, freeze: () => {
				if (!valid() || active.current) throw new Error("Capture target changed");
				const source = structuredClone(notebookSource(working.getSnapshot().working)), draft = transfer.checkpoint(field!.targetKey), raster = area ? freezeHandwritingArea(backgroundRef.current!, canvasRef.current!, area) : freezeHandwritingRaster(backgroundRef.current!, canvasRef.current!);
				transfer.release();
				return { source, draft, raster };
			} });
		} catch { uploader.report(slot, "review_unavailable"); }
		finally { transfer.release(); }
	}
	useLayoutEffect(() => {
		const slot = slotRef.current!, viewport = window.visualViewport;
		const fit = () => {
			if (!slot.getClientRects().length || (viewport && viewport.scale !== 1)) return;
			const bottom = viewport ? viewport.offsetTop + viewport.height : innerHeight;
			slot.style.maxHeight = `${Math.max(0, bottom - slot.getBoundingClientRect().top)}px`;
		};
		fit(); const observer = new ResizeObserver(fit);
		for (const element of slot.parentElement?.children ?? []) observer.observe(element);
		window.addEventListener("resize", fit); window.addEventListener("scroll", fit, { passive: true }); viewport?.addEventListener("resize", fit); viewport?.addEventListener("scroll", fit);
		return () => { observer.disconnect(); window.removeEventListener("resize", fit); window.removeEventListener("scroll", fit); viewport?.removeEventListener("resize", fit); viewport?.removeEventListener("scroll", fit); };
	}, [expanded, hidden]);
	useEffect(() => {
		redraw();
		// The box the expanded notebook fills: the split layout where it is a
		// box (tablets, laptops); on phones it is display: contents, so the
		// first sized ancestor (the session's workspace).
		let layout = slotRef.current?.parentElement ?? null;
		while (layout && (!layout.clientWidth || !layout.clientHeight)) layout = layout.parentElement;
		if (!layout) return;
		const box = layout;
		const measure = () => { const width = fittedPaperWidth(box); if (width > 1) setBaseWidth(prior => Math.abs(prior - width) < 1 ? prior : width); };
		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(box); return () => observer.disconnect();
	}, [redraw]);
	// Pinch to zoom (two fingers on the paper); the point between the fingers
	// stays where it is. One finger still scrolls, and the pen still writes.
	useEffect(() => {
		const area = areaRef.current; if (!area) return;
		const touches = new Map<number, { x: number; y: number }>();
		let pinch: { distance: number; zoom: number } | null = null;
		const spread = () => { const [a, b] = [...touches.values()]; return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0; };
		const down = (event: PointerEvent) => {
			if (event.pointerType !== "touch") return;
			touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
			if (touches.size === 2) pinch = { distance: spread(), zoom: zoomRef.current };
		};
		const move = (event: PointerEvent) => {
			if (!touches.has(event.pointerId)) return;
			touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
			if (!pinch || touches.size !== 2 || pinch.distance < 10) return;
			event.preventDefault();
			const [a, b] = [...touches.values()];
			zoomAround(pinch.zoom * spread() / pinch.distance, (a!.x + b!.x) / 2, (a!.y + b!.y) / 2);
		};
		const up = (event: PointerEvent) => { touches.delete(event.pointerId); if (touches.size < 2) pinch = null; };
		area.addEventListener("pointerdown", down); area.addEventListener("pointermove", move, { passive: false });
		area.addEventListener("pointerup", up); area.addEventListener("pointercancel", up);
		return () => { area.removeEventListener("pointerdown", down); area.removeEventListener("pointermove", move); area.removeEventListener("pointerup", up); area.removeEventListener("pointercancel", up); };
	}, []);
	// B1 (round 18): the paper's finger panning follows what can actually scroll
	// (see the CSS), and a sideways wheel or trackpad swipe that the paper cannot
	// take is consumed here rather than turning into browser back/forward.
	useEffect(() => {
		const area = areaRef.current; if (!area) return;
		const stack = area.querySelector<HTMLElement>(".hw-paperStack");
		const update = () => {
			const x = area.scrollWidth > area.clientWidth + 1, y = area.scrollHeight > area.clientHeight + 1;
			const pan = x && y ? "xy" : x ? "x" : y ? "y" : "none";
			if (area.dataset.pan !== pan) area.dataset.pan = pan;
		};
		update();
		const observer = new ResizeObserver(update);
		observer.observe(area); if (stack) observer.observe(stack);
		const wheel = (event: WheelEvent) => {
			if (Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return;
			const max = area.scrollWidth - area.clientWidth;
			const atEdge = max <= 1 || (event.deltaX < 0 && area.scrollLeft <= 0) || (event.deltaX > 0 && area.scrollLeft >= max - 1);
			if (atEdge && event.cancelable) event.preventDefault();
		};
		area.addEventListener("wheel", wheel, { passive: false });
		return () => { observer.disconnect(); area.removeEventListener("wheel", wheel); };
	}, []);
	// B4: a new ink resolution resized (and so cleared) the canvases: repaint
	// before the browser paints, including any stroke still being drawn.
	useLayoutEffect(() => {
		redraw();
		const current = active.current; if (!current) return;
		const target = (current.stroke.tool === "highlighter" ? highlightRef.current : canvasRef.current)?.getContext("2d"); if (!target) return;
		current.stroke.points.forEach((point, index) => paint(target, current.stroke, current.stroke.points[Math.max(0, index - 1)]!, point));
	}, [inkScale, redraw]);
	const zoomRef = useRef(zoom); zoomRef.current = zoom;
	/** Zoom, keeping the paper under (x, y) — or the view's centre — in place. */
	function zoomAround(next: number, x?: number, y?: number) {
		const area = areaRef.current, value = clampZoom(next);
		if (!area || value === zoomRef.current) return;
		const box = area.getBoundingClientRect();
		const fx = (x ?? box.left + box.width / 2) - box.left, fy = (y ?? box.top + box.height / 2) - box.top;
		const ratio = value / zoomRef.current;
		const left = (area.scrollLeft + fx) * ratio - fx, top = (area.scrollTop + fy) * ratio - fy;
		zoomRef.current = value; setZoom(value);
		requestAnimationFrame(() => { area.scrollLeft = Math.max(0, left); area.scrollTop = Math.max(0, top); });
	}
	function prepareViewChange(nextExpanded: boolean) {
		const position = (areaRef.current?.scrollTop ?? 0) / paperSize.height;
		paperPositions.current[expanded ? "full" : "split"] = position;
		restorePaperPosition.current = paperPositions.current[nextExpanded ? "full" : "split"] ?? position;
		setToolsOpen(false); if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
	}
	useLayoutEffect(() => {
		const area = areaRef.current;
		if (!area || restorePaperPosition.current === null) return;
		area.scrollTop = restorePaperPosition.current * paperSize.height; restorePaperPosition.current = null;
	}, [expanded, paperSize.height]);
	useEffect(() => {
		const canvas = canvasRef.current!, controls = controlsRef.current!;
		const claimCanvas = (event: TouchEvent) => {
			if (event.cancelable && Array.from(event.touches).some(touch => (touch as Touch & { touchType?: string }).touchType === "stylus")) event.preventDefault();
		};
		const claimTool = (event: TouchEvent) => {
			if (event.cancelable && event.target instanceof Element && event.target.closest("button[data-notebook-pencil-control]") && Array.from(event.changedTouches).some(touch => (touch as Touch & { touchType?: string }).touchType === "stylus")) event.preventDefault();
		};
		for (const name of ["touchstart", "touchmove"] as const) canvas.addEventListener(name, claimCanvas, { passive: false });
		for (const name of ["touchstart", "touchmove", "touchend"] as const) controls.addEventListener(name, claimTool, { passive: false });
		return () => { for (const name of ["touchstart", "touchmove"] as const) canvas.removeEventListener(name, claimCanvas); for (const name of ["touchstart", "touchmove", "touchend"] as const) controls.removeEventListener(name, claimTool); };
	}, []);
	useImperativeHandle(ref, () => ({ canResize: () => !active.current && !recovery.current?.getSnapshot().busy && !submissionRef.current?.isPreparing() }));
	function point(event: PointerEvent): Point {
		const rect = canvasRef.current!.getBoundingClientRect();
		return { x: Math.max(0, Math.min(WIDTH, (event.clientX - rect.left) * WIDTH / rect.width)), y: Math.max(0, Math.min(HEIGHT, (event.clientY - rect.top) * HEIGHT / rect.height)), pressure: event.pointerType === "pen" && event.pressure > 0 ? event.pressure : 0.5 };
	}
	function start(event: ReactPointerEvent<HTMLCanvasElement>) {
		if (event.pointerType === "touch") { noteFinger(); return; }
		if (event.button !== 0 || active.current || decoding.current) return;
		const complete = recovery.current?.beginStroke(); if (!complete) return;
		event.preventDefault(); if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
		const first = point(event.nativeEvent);
		const stroke: Stroke = { tool, colour: tool === "highlighter" ? HANDWRITING_HIGHLIGHT_COLOUR : colour, penScale, width: tool === "highlighter" ? highlighterWidth : eraserWidth, points: [first] };
		strokes.current.push(stroke); active.current = { pointerId: event.pointerId, stroke, complete }; event.currentTarget.setPointerCapture(event.pointerId);
		paint((tool === "highlighter" ? highlightRef.current! : event.currentTarget).getContext("2d")!, stroke, first, first);
	}
	function move(event: ReactPointerEvent<HTMLCanvasElement>) {
		const current = active.current; if (!current || current.pointerId !== event.pointerId) return;
		event.preventDefault();
		const context = (current.stroke.tool === "highlighter" ? highlightRef.current! : event.currentTarget).getContext("2d")!;
		const coalesced = event.nativeEvent.getCoalescedEvents?.() ?? [];
		for (const sample of coalesced.length ? coalesced : [event.nativeEvent]) { const next = point(sample); paint(context, current.stroke, current.stroke.points.at(-1)!, next); current.stroke.points.push(next); }
	}
	function finish(event: ReactPointerEvent<HTMLCanvasElement>) {
		if (active.current?.pointerId !== event.pointerId) return;
		if (event.type === "pointerup") move(event);
		const { stroke, complete } = active.current;
		if (stroke.tool === "highlighter") mergeHighlight(event.currentTarget.getContext("2d")!);
		active.current = null; ownMutation.current = true;
		complete(stroke); refreshStatus.current(); ownMutation.current = false;
		for (const resolve of strokeWaiters.current.splice(0)) resolve();
		submissionRef.current?.refreshNotices();
		if (reviewDeferred.current) { reviewDeferred.current = false; callbacks.current.onReview(); }
	}
	function undoLast() { recovery.current?.undo(); }
	function clear() {
		const content = recovery.current ? replayHandwriting(recovery.current.getSnapshot().working) : null;
		recovery.current?.clear();
		if (content && (content.strokes.length || content.background)) setClearedAt(Date.now());
	}
	function startToolTap(event: ReactPointerEvent<HTMLButtonElement>) {
		penToolClick.current = null;
		if (event.pointerType !== "pen" || event.button !== 0 || active.current) return;
		event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); penToolTap.current = { pointerId: event.pointerId, button: event.currentTarget };
	}
	function finishToolTap(event: ReactPointerEvent<HTMLButtonElement>, activate: () => void) {
		const tap = penToolTap.current; if (!tap || tap.pointerId !== event.pointerId || tap.button !== event.currentTarget) return;
		event.preventDefault(); penToolTap.current = null; penToolClick.current = event.currentTarget;
		if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
		const r = event.currentTarget.getBoundingClientRect();
		if (event.clientX >= r.left && event.clientX <= r.right && event.clientY >= r.top && event.clientY <= r.bottom) activate();
	}
	function cancelToolTap(event: ReactPointerEvent<HTMLButtonElement>) { if (penToolTap.current?.pointerId === event.pointerId) penToolTap.current = null; }
	function handlers(_name: string, action: () => void) {
		const activate = () => { if (!active.current && !recovery.current?.getSnapshot().busy) action(); };
		return { "data-notebook-pencil-control": "", onPointerDown: startToolTap, onPointerUp: (event: ReactPointerEvent<HTMLButtonElement>) => finishToolTap(event, activate), onPointerCancel: cancelToolTap, onLostPointerCapture: cancelToolTap,
			onClick: (event: ReactMouseEvent<HTMLButtonElement>) => {
				if (penToolClick.current === event.currentTarget && (event.detail > 0 || (event.nativeEvent as PointerEvent).pointerType === "pen")) { penToolClick.current = null; event.preventDefault(); return; }
				penToolClick.current = null; activate();
			},
		};
	}
	const sizes = tool === "pen" ? PEN_SIZES : BROAD_SIZES, currentSize = tool === "pen" ? penScale : tool === "eraser" ? eraserWidth : highlighterWidth;
	// What Attach attaches to (T6), named after the field that would take it.
	const targetKey = submission?.activeField()?.targetKey ?? "";
	const attachTarget = targetKey.startsWith("question:") ? "your answer" : targetKey.startsWith("problem:") ? "your working" : targetKey === "composer" ? "your next message" : "your answer or message";
	const attachShort = targetKey.startsWith("question:") ? "answer" : targetKey.startsWith("problem:") ? "working" : "message";
	return <div ref={slotRef} className="hw-notebookSlot" hidden={hidden} data-testid="notebook-slot" data-layout-revision="component-sized-card"
		style={{ position: expanded ? "absolute" : "relative", inset: expanded ? 0 : undefined, flex: "1 1 0px", minWidth: 0, minHeight: 0, boxSizing: "border-box", padding: 16, overflow: "hidden" }}>
		<aside ref={controlsRef} className="rounded-2xl border bg-card shadow-lg hw-notebook" aria-label="Handwriting notebook" data-testid="handwriting-notebook" data-ready={saved.ready} data-page-id={pageId} data-expanded={expanded} data-tools-side={toolsLeft ? "left" : "right"}
			style={{ position: "absolute", inset: 16, margin: 0, display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0, overflow: "hidden" }}>
			{/* One order in the side-by-side and the expanded view (round 14,
			    T5): the notebook's own controls, its primary action, then the
			    view controls with Close at the far right. */}
			{/* T2 (round 17): the card's own handle — slide it up or down; there is
			    no separate divider. The size is remembered. */}
			{!expanded && <CardHandle slotRef={slotRef} canResize={() => !active.current && !recovery.current?.getSnapshot().busy && !submissionRef.current?.isPreparing()} />}
			<header className="hw-notebookHeader"><h2>Notebook</h2>
				<Button variant="ghost" size="sm" className="hw-headerAction" aria-label="Pages" aria-expanded={pagesOpen} disabled={!saved.ready || submission?.preparing} {...handlers("Pages", () => { setPagesOpen(value => !value); setOptionsOpen(false); setToolsOpen(false); setConceptsOpen(false); void recovery.current?.refreshPages().catch(() => {}); })}><FilesIcon aria-hidden />Pages</Button>
				<Button variant="ghost" size="sm" className="hw-headerAction" aria-label="Notebook options" aria-expanded={optionsOpen} {...handlers("Notebook options", () => { setOptionsOpen(v => !v); setPagesOpen(false); setToolsOpen(false); setConceptsOpen(false); })} data-testid="notebook-options-toggle"><MoreHorizontalIcon /></Button>
				{/* T6 (round 17): a split button — one tap attaches the whole page
				    (named after where it goes); ▾ offers Whole page or an area. */}
				<span className="hw-attachSplit">
					<Button variant="ghost" size="sm" className="hw-headerAction" aria-label={`Attach the page to ${attachTarget}`} disabled={!saved.ready || submission?.preparing} {...handlers("Attach", () => { setAttachOpen(false); void attachSnapshot(); })} data-testid="notebook-attach"><PaperclipIcon aria-hidden />Attach to {attachShort}</Button>
					<Button variant="ghost" size="sm" className="hw-headerAction hw-attachMore" aria-label="More ways to attach" aria-haspopup="menu" aria-expanded={attachOpen} disabled={!saved.ready || submission?.preparing} {...handlers("Attach menu", () => { setAttachOpen(open => !open); setPagesOpen(false); setOptionsOpen(false); setToolsOpen(false); setConceptsOpen(false); })} data-testid="notebook-attach-more"><ChevronDownIcon aria-hidden /></Button>
				</span>
				{/* T3: zoom is the only thing that changes the paper's size. */}
				<span className="hw-zoom" role="group" aria-label="Zoom">
					<Button variant="ghost" size="sm" className="hw-headerAction hw-zoomButton" aria-label="Zoom out" disabled={zoom <= ZOOMS.min} {...handlers("Zoom out", () => zoomAround(zoom / 1.25))} data-testid="notebook-zoom-out"><MinusIcon aria-hidden /></Button>
					<Button variant="ghost" size="sm" className="hw-headerAction hw-zoomValue" aria-label={`Zoom ${Math.round(zoom * 100)}%: reset to 100%`} {...handlers("Reset zoom", () => zoomAround(1))} data-testid="notebook-zoom-reset">{Math.round(zoom * 100)}%</Button>
					<Button variant="ghost" size="sm" className="hw-headerAction hw-zoomButton" aria-label="Zoom in" disabled={zoom >= ZOOMS.max} {...handlers("Zoom in", () => zoomAround(zoom * 1.25))} data-testid="notebook-zoom-in"><PlusIcon aria-hidden /></Button>
				</span>
				<Button variant="ghost" size="sm" className="hw-headerAction hw-tabletControl" aria-label={expanded ? `Show ${origin} too` : "Expand notebook"} {...handlers("Expand", () => { prepareViewChange(!expanded); onToggleExpanded(); })} data-testid="notebook-expand">{expanded ? <Minimize2Icon /> : <Maximize2Icon />}{expanded ? `Show ${origin} too` : "Expand"}</Button>
				<Button variant="ghost" size="sm" className="hw-headerAction hw-tabletControl" aria-label="Close notebook" {...handlers("Close writing", () => { if (expanded) prepareViewChange(false); onClose(); })}><XIcon aria-hidden />Close</Button>
				<Button variant="ghost" size="sm" className="hw-headerAction hw-mobileSwitch" {...handlers("Chat", onClose)} data-testid="open-notebook-chat">Chat</Button>
			</header>
			{attachOpen && <div className="hw-toolsPanel hw-attachPanel" role="menu" aria-label={`Attach to ${attachTarget}`} data-testid="notebook-attach-menu">
				<p className="hw-attachFor">Goes with {attachTarget}. You can review it and take it out before sending.</p>
				<button type="button" role="menuitem" className="hw-optionRow" {...handlers("Attach whole page", () => { setAttachOpen(false); void attachSnapshot(); })} data-testid="notebook-attach-page"><PaperclipIcon aria-hidden /><span className="hw-optionLabel">Whole page</span></button>
				<button type="button" role="menuitem" className="hw-optionRow" {...handlers("Select an area", () => { setAttachOpen(false); setArea(null); setSelecting(true); })} data-testid="notebook-attach-area"><SquareDashedIcon aria-hidden /><span className="hw-optionLabel">Select an area</span><span className="hw-optionHint">Draw a box round what to send</span></button>
			</div>}
			{optionsOpen && <div className="hw-toolsPanel hw-optionsPanel" data-testid="notebook-options">
				{/* The page's own actions live here (round 14, T3): there is no
				    separate Page button on the paper any more. */}
				<div className="hw-optionsSection" role="group" aria-labelledby="hw-current-page"><h3 id="hw-current-page">Current page</h3>
					<button type="button" className="hw-optionRow" disabled={!saved.ready || submission?.preparing} {...handlers("Duplicate", () => { setOptionsOpen(false); void recovery.current?.duplicateWorking(); })} data-testid="notebook-duplicate"><span className="hw-optionLabel">Duplicate</span></button>
					{/* R7 (round 15): a plain row with the app's switch (no stuck
					    highlight, nothing spilling out); Clear says it can be undone. */}
					<button type="button" className="hw-optionRow" aria-pressed={dimPaper} {...handlers("Dim paper", () => setDimPaper(v => !v))} data-testid="notebook-paper-mode">
						<span className="hw-optionLabel">Dim paper</span><span className="hw-optionState" aria-hidden>{dimPaper ? "On" : "Off"}</span><span className="lh-switch" data-on={dimPaper || undefined} aria-hidden><span /></span>
					</button>
					<button type="button" className="hw-optionRow" aria-label="Clear page (you can undo it)" disabled={!saved.ready} {...handlers("Clear", () => { setOptionsOpen(false); clear(); })} data-testid="notebook-clear">
						<span className="hw-optionLabel">Clear page</span><span className="hw-optionHint">You can undo it</span>
					</button>
				</div><hr />
				{palette === "wheel"
					? <button type="button" className="hw-optionRow" {...handlers("Reset wheel position", () => { setOptionsOpen(false); setWheelSpot(null); })} data-testid="wheel-reset"><span className="hw-optionLabel">Reset wheel position</span><span className="hw-optionHint">{wheelSpot === "top-right" ? "Top right" : "Moved"}</span></button>
					: <button type="button" className="hw-optionRow" {...handlers("Tools side", () => { setOptionsOpen(false); toggleToolsSide(); })} data-testid="notebook-tools-side"><span className="hw-optionLabel">{toolsLeft ? "Tools on the right" : "Tools on the left (left-handed)"}</span></button>}<hr />
				<button type="button" className="hw-optionRow" {...handlers("Tools and help", () => { setOptionsOpen(false); setToolsOpen(true); })} data-testid="notebook-tools-toggle"><span className="hw-optionLabel">Tools and help</span></button><hr />
				<button type="button" className="hw-optionRow" {...handlers("Concepts setup", () => { setOptionsOpen(false); setConceptsOpen(true); })} data-testid="notebook-concepts-toggle"><span className="hw-optionLabel">Send pages from the Concepts app</span></button>
			</div>}
			{conceptsOpen && <div className="hw-toolsPanel hw-conceptsPanel" role="group" aria-label="Send pages from the Concepts app">
				<div className="hw-toolsHeading"><span>Send pages from the Concepts app</span><Button variant="ghost" size="icon" aria-label="Close Concepts setup" {...handlers("Close Concepts setup", () => { setConceptsOpen(false); controlsRef.current?.querySelector<HTMLButtonElement>('[aria-label="Notebook options"]')?.focus(); })}><XIcon /></Button></div>
				<ConceptsSetup chatId={chatId} onCheck={() => void review().catch(() => {})} />
			</div>}
			{pagesOpen && <div className="hw-toolsPanel hw-pagesPanel" data-testid="notebook-pages">
				<div className="hw-toolsHeading"><h3>Pages</h3><Button variant="ghost" aria-label="Close pages" {...handlers("Close pages", () => { setPagesOpen(false); controlsRef.current?.querySelector<HTMLButtonElement>('[aria-label="Pages"]')?.focus(); })}><XIcon /></Button></div>
				<div className="hw-pageGrid">
					{pages.map((page, index) => <PageRow key={page.id} page={page} index={index} pages={pages} current={pageId} revision={page.id === pageId ? recovery.current?.getSnapshot().working.head : undefined} model={recovery.current!} disabled={!saved.ready || !!submission?.preparing} choose={() => { void recovery.current?.switchPage(page.id).then(opened => { if (opened) { setPagesOpen(false); controlsRef.current?.querySelector<HTMLButtonElement>('[aria-label="Pages"]')?.focus(); } }); }} />)}
					{/* Round 14 (T4): a blank page after the others, opened at once. */}
					<div className="hw-pageRow hw-addPage"><button type="button" data-testid="notebook-add-page" disabled={!saved.ready || !!submission?.preparing} {...handlers("Add page", () => { void recovery.current?.addBlankPage().then(opened => { if (opened) { setPagesOpen(false); controlsRef.current?.querySelector<HTMLButtonElement>('[aria-label="Pages"]')?.focus(); } }); })}>
						<span className="hw-addPageMark" aria-hidden><PlusIcon /></span><span>Add page</span>
					</button></div>
				</div>
			</div>}
			{toolsOpen && <div id="handwriting-tools" className="hw-toolsPanel" role="group" aria-label="Notebook tools">
				<div className="hw-toolsHeading"><span>Notebook tools</span><Button variant="ghost" size="icon" aria-label="Close notebook tools" {...handlers("Close tools", () => { setToolsOpen(false); controlsRef.current?.querySelector<HTMLButtonElement>('[aria-label="Notebook options"]')?.focus(); })}><XIcon /></Button></div>
				<p>Write with Pencil; scroll the paper with a finger. Working, Undo and Redo save automatically. A new edit clears Redo. Clear can be undone.</p>
				<button type="button" className="min-h-11 underline" {...handlers("Reload preview", () => location.reload())}>Reload preview</button>
				<p>Reload keeps your notebook, Undo and Redo, attached snapshots and explanation saved at Attach.</p>
			</div>}
			<div className="hw-drawingWorkspace"><div className="hw-paperArea"><div ref={areaRef} className="hw-paperScroll" data-testid="notebook-paper-scroll">
				<div className={`hw-paperStack ${dimPaper ? "hw-dimPaper" : ""}`} style={{ width: paperSize.width, height: paperSize.height }}>
					<canvas ref={backgroundRef} width={WIDTH} height={HEIGHT} className="hw-figureBackground" aria-hidden="true" data-testid="notebook-background" />
					<canvas ref={canvasRef} width={Math.round(WIDTH * inkScale)} height={Math.round(HEIGHT * inkScale)} data-ink-scale={inkScale} className="hw-paper" style={{ cursor: tool === "eraser" ? "cell" : "crosshair" }} aria-label="Handwriting page — use Pencil or mouse; fingers do not draw" data-testid="notebook-canvas" onPointerDown={start} onPointerMove={move} onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={finish} onContextMenu={e => e.preventDefault()} />
					<canvas ref={highlightRef} width={Math.round(WIDTH * inkScale)} height={Math.round(HEIGHT * inkScale)} className="hw-highlightOverlay" style={{ opacity: HIGHLIGHT_OPACITY }} aria-hidden="true" data-testid="notebook-highlight-overlay" />
					{/* T6: draw a box round the part to attach (finger, Pencil or mouse). */}
					{selecting && <div className="hw-areaSelect" data-testid="notebook-area-select" aria-label="Drag over the part of the page to attach"
						onPointerDown={event => {
							if (event.button !== 0) return; event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId);
							const box = event.currentTarget.getBoundingClientRect(), x = (event.clientX - box.left) * WIDTH / box.width, y = (event.clientY - box.top) * HEIGHT / box.height;
							areaDrag.current = { id: event.pointerId, x, y }; setArea({ x, y, width: 0, height: 0 });
						}}
						onPointerMove={event => {
							const start = areaDrag.current; if (!start || start.id !== event.pointerId) return; event.preventDefault();
							const box = event.currentTarget.getBoundingClientRect();
							const x = Math.max(0, Math.min(WIDTH, (event.clientX - box.left) * WIDTH / box.width)), y = Math.max(0, Math.min(HEIGHT, (event.clientY - box.top) * HEIGHT / box.height));
							setArea({ x: Math.min(start.x, x), y: Math.min(start.y, y), width: Math.abs(x - start.x), height: Math.abs(y - start.y) });
						}}
						onPointerUp={() => { areaDrag.current = null; }} onPointerCancel={() => { areaDrag.current = null; }}>
						{area && area.width > 0 && <span className="hw-areaBox" data-testid="notebook-area-box" style={{ left: `${area.x / WIDTH * 100}%`, top: `${area.y / HEIGHT * 100}%`, width: `${area.width / WIDTH * 100}%`, height: `${area.height / HEIGHT * 100}%` }} />}
					</div>}
				</div>

			</div>{fingerHint && <p className="hw-fingerHint" role="status" data-testid="finger-hint">Write with your pen · fingers scroll the page</p>}
			{/* Notices sit at the top of the paper, never over the page controls. */}
			<div className="hw-noticeStack">
			{attachNote && <p className="hw-notice" role="status" data-testid="notebook-attach-note">{attachNote}</p>}
			{flattened && <p className="hw-notice">Flattened image · original marks cannot be erased</p>}
			{clearedAt !== null && !saved.notice && <div className="hw-notice hw-clearedNotice" role="status" data-testid="notebook-cleared">Page cleared<button type="button" className="min-h-11 px-3 underline" {...handlers("Undo clear", () => { setClearedAt(null); undoLast(); })}>Undo</button></div>}
			{saved.notice && <div className="hw-notice" role="status">{saved.notice}{saved.notice !== "Opening notebook…" && <button type="button" className="min-h-11 px-3 underline" {...handlers("Retry", () => { void recovery.current?.retry().then(() => refreshStatus.current()); })}>Retry</button>}</div>}
			{shownNotice && <div className="hw-notice" role="status">{shownNotice.text}{shownNotice.refresh && <button type="button" className="min-h-11 px-3 underline" onClick={() => void review().catch(() => {})}>Refresh review</button>}</div>}
			</div>
			<HandwritingToolbar variant={palette} tool={tool} colour={colour} colours={PEN_COLOURS} sizes={sizes} size={currentSize} dimPaper={dimPaper} disabled={!saved.ready} handlers={handlers} selectTool={setTool} selectColour={value => setColour(value as Stroke["colour"])} selectSize={value => { if (tool === "pen") setPenScale(value as Stroke["penScale"]); else if (tool === "eraser") setEraserWidth(value as Stroke["width"]); else setHighlighterWidth(value as Stroke["width"]); }} undo={undoLast} redo={() => recovery.current?.redo()} canUndo={history.canUndo} canRedo={history.canRedo} /></div>
			{/* T3: the page controls are always in view, under the paper. */}
				{(() => {
				const at = Math.max(0, pages.findIndex(page => page.id === pageId)), count = Math.max(1, pages.length), busy = !saved.ready || !!submission?.preparing;
				const go = (index: number) => { const target = pages[index]; if (target) void recovery.current?.switchPage(target.id); };
				// B3 (round 18): while an area is being chosen, its bar takes the page
				// controls' place under the paper, so it never covers any of the page
				// and the learner sees exactly what will be sent.
				if (selecting) return <div className="hw-pageFooter hw-areaFooter">
					<div className="hw-areaBar" role="group" aria-label="Select an area" data-testid="notebook-area-bar" data-place="footer">
						<span>{area && area.width > 20 && area.height > 20 ? `Attach this area to ${attachTarget}?` : "Drag over the part to attach."}</span>
						<button type="button" className="min-h-11 px-3" {...handlers("Cancel area", () => { setSelecting(false); setArea(null); })} data-testid="notebook-area-cancel">Cancel</button>
						<button type="button" className="hw-areaAttach min-h-11 px-3" disabled={!area || area.width <= 20 || area.height <= 20} {...handlers("Attach area", () => { const chosen = area; setSelecting(false); setArea(null); if (chosen) void attachSnapshot(chosen); })} data-testid="notebook-area-attach">Attach area</button>
					</div>
				</div>;
				return <nav className="hw-pageFooter" aria-label="Page navigation" data-testid="notebook-page-footer">
					<button type="button" aria-label="Previous page" disabled={busy || at === 0} {...handlers("Previous page", () => go(at - 1))}><ChevronLeftIcon aria-hidden /></button>
					<span>Page {at + 1} of {count}</span>
					<button type="button" aria-label="Next page" disabled={busy || at >= count - 1} {...handlers("Next page", () => go(at + 1))}><ChevronRightIcon aria-hidden /></button>
					<button type="button" className="hw-footerAdd" disabled={busy} {...handlers("Add page", () => { void recovery.current?.addBlankPage(); })} data-testid="notebook-footer-add-page"><PlusIcon aria-hidden />Add page</button>
				</nav>;
			})()}
			</div>
		</aside>
	</div>;
}

function PageRow({ page, index, pages, current, revision, model, disabled, choose }: { page: PageSummary; index: number; pages: PageSummary[]; current: string; revision?: string | null; model: HandwritingPages; disabled: boolean; choose: () => void }) {
	const [image, setImage] = useState<string | null>(null), [failed, setFailed] = useState(false), [retry, setRetry] = useState(0);
	const cache = useRef<{ page: HandwritingPage; image: string } | null>(null);
	useEffect(() => { let live = true; void model.readPage(page.id).then(async value => { value ??= model.getSnapshot().page.id === page.id ? model.getSnapshot().page : null; if (!value) throw new Error("Missing page"); const image = cache.current?.page.journal === value.journal ? cache.current.image : await pageThumbnail(value); if (live) { cache.current = { page: value, image }; setImage(image); setFailed(false); } }).catch(() => { if (live) setFailed(true); }); return () => { live = false; }; }, [model, page.id, retry, revision]);
	const origin = page.origin;
	const subtitle = origin.kind === "external" ? "Flattened image" : origin.kind === "recovered" ? "Recovered from snapshot" : origin.kind === "duplicate" ? origin.from.kind === "snapshot" ? "Copy of snapshot" : `Copy of Page ${pages.findIndex(p => origin.from.kind === "working" && p.id === origin.from.pageId) + 1}` : null;
	return <div className="hw-pageRow"><button type="button" data-page-id={page.id} disabled={disabled || failed} onClick={choose}>
		{/* eslint-disable-next-line @next/next/no-img-element */}
		{image && <img src={image} width={140} height={180} alt={`Page ${index + 1} preview`} />}<span>Page {index + 1}{page.id === current && <strong> · Current</strong>}{subtitle && <small>{subtitle}</small>}</span>
	</button>{failed && <button type="button" onClick={() => { setFailed(false); setRetry(value => value + 1); }}>Couldn’t load page. Retry</button>}</div>;
}

const ZOOM_KEY = "lh:hw-zoom";
const ZOOMS = { min: 0.5, max: 3 } as const;
function clampZoom(value: number): number { return Math.round(Math.max(ZOOMS.min, Math.min(ZOOMS.max, value)) * 100) / 100; }
function readZoom(): number {
	try { const value = Number(localStorage.getItem(ZOOM_KEY)); return Number.isFinite(value) && value > 0 ? clampZoom(value) : 1; } catch { return 1; }
}
/** T3 (round 17): the paper's width at 100% — the whole page fitting the
 *  expanded notebook (the card's full extent in its layout), with margins
 *  around the page and room for its header and page controls. The same
 *  for the card beside the lesson, so the paper never resizes with it. */
function fittedPaperWidth(layout: HTMLElement): number {
	const inset = 16 * 2, header = 56, footer = 56, margin = 16 * 2, gutter = 16;
	const width = layout.clientWidth - inset - margin - gutter;
	const height = layout.clientHeight - inset - header - footer - margin;
	if (width <= 0 || height <= 0) return 1;
	return Math.max(1, Math.min(width, height * WIDTH / HEIGHT));
}

const SHARE_KEY = "lh:hw-split";
/** Portrait tablets give the page most of the height (writing is the task
 *  there); elsewhere the split starts even. */
function defaultShare(): number {
	return typeof window !== "undefined" && window.matchMedia?.("(min-width: 768px) and (max-width: 1023px) and (pointer: coarse)").matches ? 46 : 50;
}
function readShare(): number {
	try { const value = Number(localStorage.getItem(SHARE_KEY)); return Number.isFinite(value) && value > 0 ? value : defaultShare(); } catch { return defaultShare(); }
}

/** T2 (round 17): the notebook card's handle. Drag it (finger or Pencil)
 *  to slide the card up or down — side by side, left or right. The lesson
 *  keeps the rest; the size is remembered on this device. A 44px target. */
function CardHandle({ slotRef, canResize }: { slotRef: RefObject<HTMLDivElement | null>; canResize: () => boolean }) {
	const [state, setState] = useState({ share: 50, wide: false, max: 70 });
	const share = useRef(50), drag = useRef<number | null>(null);
	const apply = useCallback((next: number, save: boolean) => {
		const layout = slotRef.current?.parentElement; if (!layout) return;
		const wide = getComputedStyle(layout).flexDirection === "row";
		const extent = wide ? layout.clientWidth : layout.clientHeight;
		if (!extent) return;
		// The card keeps room for its header, a strip of page and its page controls.
		const max = Math.max(25, Math.min(80, (extent - (wide ? 384 : 300)) / extent * 100));
		const bounded = Math.max(20, Math.min(max, next));
		layout.style.setProperty("--notebook-context-share", `${bounded}%`);
		share.current = bounded;
		setState(prior => prior.share === Math.round(bounded) && prior.wide === wide && prior.max === Math.round(max) ? prior : { share: Math.round(bounded), wide, max: Math.round(max) });
		if (save) { try { localStorage.setItem(SHARE_KEY, String(Math.round(bounded))); } catch { /* this view only */ } }
	}, [slotRef]);
	useEffect(() => {
		const layout = slotRef.current?.parentElement; if (!layout) return;
		share.current = readShare(); apply(share.current, false);
		const observer = new ResizeObserver(() => apply(share.current, false));
		observer.observe(layout); return () => observer.disconnect();
	}, [apply, slotRef]);
	const at = (event: ReactPointerEvent<HTMLDivElement>) => {
		const layout = slotRef.current?.parentElement; if (!layout) return share.current;
		const rect = layout.getBoundingClientRect();
		return 100 * (state.wide ? (event.clientX - rect.left) / rect.width : (event.clientY - rect.top) / rect.height);
	};
	return <div className="hw-cardHandle" role="separator" tabIndex={0} data-testid="notebook-card-handle" data-wide={state.wide || undefined}
		aria-label={state.wide ? "Move the notebook left or right" : "Move the notebook up or down"} aria-orientation={state.wide ? "vertical" : "horizontal"}
		aria-valuemin={20} aria-valuemax={state.max} aria-valuenow={state.share} aria-valuetext={`${state.share}% lesson`}
		onPointerDown={event => { if (event.button !== 0 || !canResize()) return; event.preventDefault(); if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); drag.current = event.pointerId; event.currentTarget.setPointerCapture(event.pointerId); }}
		onPointerMove={event => { if (drag.current !== event.pointerId) return; event.preventDefault(); apply(at(event), false); }}
		onPointerUp={event => { if (drag.current !== event.pointerId) return; drag.current = null; apply(at(event), true); }}
		onPointerCancel={() => { drag.current = null; }} onLostPointerCapture={() => { if (drag.current !== null) { drag.current = null; apply(share.current, true); } }}
		onKeyDown={event => {
			if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home"].includes(event.key) || !canResize()) return;
			event.preventDefault(); event.stopPropagation();
			apply(event.key === "Home" ? defaultShare() : share.current + (["ArrowUp", "ArrowLeft"].includes(event.key) ? -5 : 5), true);
		}}><span aria-hidden="true" /></div>;
}
