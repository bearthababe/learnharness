"use client";

/** Accepted canvas/layout from c663dcecd22a, isolated from session/model state.
 * Only completed strokes touch recovery. No React/storage work on movement. */
import { useCallback, useContext, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type Ref, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import { Button } from "@/components/ui/button";
import { FilesIcon, Maximize2Icon, Minimize2Icon, MoreHorizontalIcon, PaperclipIcon, XIcon } from "lucide-react";
import { useSidebar } from "@/components/sidebar";
import { HandwritingPages, type PagesState } from "./pages";
import { handwritingPagesDevice } from "./pages-device";
import { externalBackground, prepareHandwritingPage, preparedBackground, pageThumbnail } from "./pages-render";
import type { HandwritingPage, PageSummary } from "@/src/core";
import { HandwritingToolbar } from "./toolbar";
import { HANDWRITING_DELETED_EVENT } from "./device";
import { notebookSource, normalizeHandwriting, replayHandwriting, HANDWRITING_PAGE, HANDWRITING_PEN_COLOURS, HANDWRITING_PEN_SCALES, HANDWRITING_BROAD_WIDTHS, HANDWRITING_HIGHLIGHT_COLOUR, type HandwritingStroke as Stroke } from "@/src/core";
import type { AttachmentReview } from "./attachment";
import { HandwritingSubmissionContext } from "./submission";
import { dictationCheckpoint, finishDictation } from "../dictation";
import { useMenuEscape } from "../menu-escape";
import { paint, HIGHLIGHT_OPACITY, freezeHandwritingRaster } from "./render";

const { width: WIDTH, height: HEIGHT } = HANDWRITING_PAGE;
const PEN_COLOURS = ["Black", "Blue", "Red", "Green"].map((name, i) => ({ name, value: HANDWRITING_PEN_COLOURS[i]! }));
const PEN_SIZES = ["Thin", "Medium", "Thick"].map((name, i) => ({ name, value: HANDWRITING_PEN_SCALES[i]! }));
const BROAD_SIZES = ["Small", "Medium", "Large"].map((name, i) => ({ name, value: HANDWRITING_BROAD_WIDTHS[i]! }));
type Point = Stroke["points"][number];
export type HandwritingHandle = { canResize: () => boolean };

export function HandwritingNotebook({ ref, chatId, hidden, expanded, onToggleExpanded, onClose, review, onReview, register }: {
	ref?: Ref<HandwritingHandle>; chatId: string; hidden: boolean; expanded: boolean; onToggleExpanded: () => void; onClose: () => void; review: () => Promise<AttachmentReview>; onReview: () => void; register: (model: HandwritingPages) => () => void;
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
	const attachmentNotice = submission?.attachment()?.notice(normalizeHandwriting(recovery.current?.getSnapshot().working ?? { version: 1, operations: [] }).pageId);
	const [saved, setSaved] = useState<Pick<PagesState, "ready" | "notice">>({ ready: false, notice: "Opening notebook…" });
	const [pageId, setPageId] = useState("page_initial"), [pages, setPages] = useState<PageSummary[]>([]), [pagesOpen, setPagesOpen] = useState(false), [optionsOpen, setOptionsOpen] = useState(false);
	// Handedness: the tool palette sits on the right by default; left-handed
	// writers can move it to the left (stored on this device).
	const [toolsLeft, setToolsLeft] = useState(false);
	useEffect(() => { try { setToolsLeft(localStorage.getItem("lh:writing-tools-side") === "left"); } catch { /* storage blocked */ } }, []);
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
	const [colour, setColour] = useState<Stroke["colour"]>(HANDWRITING_PEN_COLOURS[0]);
	const [penScale, setPenScale] = useState<Stroke["penScale"]>(HANDWRITING_PEN_SCALES[1]), [eraserWidth, setEraserWidth] = useState<Stroke["width"]>(HANDWRITING_BROAD_WIDTHS[1]), [highlighterWidth, setHighlighterWidth] = useState<Stroke["width"]>(HANDWRITING_BROAD_WIDTHS[1]);
	const [dimPaper, setDimPaper] = useState(true), [toolsOpen, setToolsOpen] = useState(false);
	useMenuEscape(hidden ? null : pagesOpen ? "pages" : optionsOpen ? "options" : toolsOpen ? "tools" : null, () => {
		const trigger = pagesOpen ? "Pages" : "Notebook options";
		setPagesOpen(false); setOptionsOpen(false); setToolsOpen(false);
		controlsRef.current?.querySelector<HTMLButtonElement>(`[aria-label="${trigger}"]`)?.focus();
	});
	const [paperSize, setPaperSize] = useState({ width: 1, height: 1 });
	const viewRef = useRef({ expanded, paperSize }); viewRef.current = { expanded, paperSize };
	const paperPositions = useRef<{ split: number; full?: number }>({ split: 0 }), restorePaperPosition = useRef<number | null>(null);
	const mergeHighlight = useCallback((context: CanvasRenderingContext2D) => {
		const overlay = highlightRef.current!;
		context.save();
		try { context.globalCompositeOperation = "multiply"; context.globalAlpha = HIGHLIGHT_OPACITY; context.drawImage(overlay, 0, 0); }
		finally { context.restore(); }
		overlay.getContext("2d")!.clearRect(0, 0, WIDTH, HEIGHT);
	}, []);
	const redraw = useCallback(() => {
		const context = canvasRef.current?.getContext("2d"); if (!context) return;
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
		const unregister = submissionRef.current?.registerNotebook({ canUpdate: () => !active.current, reveal: pageId => { if (recovery.current?.getSnapshot().working.pageId !== pageId) return; if (active.current) reviewDeferred.current = true; else callbacks.current.onReview(); } });
		return () => { unregister?.(); for (const resolve of strokeWaiters.current.splice(0)) resolve(); };
	}, [chatId]);
	async function attachSnapshot() {
		const working = recovery.current, transfer = submissionRef.current, uploader = transfer?.attachment();
		if (!working?.getSnapshot().ready || decoding.current || active.current || !transfer?.ready || !uploader || !transfer.claim()) return;
		const field = transfer.activeField(), pageId = normalizeHandwriting(working.getSnapshot().working).pageId, validSpeech = dictationCheckpoint();
		const valid = () => recovery.current === working && normalizeHandwriting(working.getSnapshot().working).pageId === pageId && transfer.activeField() === field && !!field && validSpeech();
		try {
			if (uploader.hasCapture(pageId)) { await uploader.retry(pageId); return; }
			const observed = await callbacks.current.review();
			if (!valid()) return;
			await uploader.attach({ pageId, head: observed.pageAttachments[pageId], valid, finish: async () => {
				await finishDictation();
				if (active.current) await new Promise<void>(resolve => strokeWaiters.current.push(resolve));
				return valid() && working.getSnapshot().ready && !decoding.current;
			}, freeze: () => {
				if (!valid() || active.current) throw new Error("Capture target changed");
				const source = structuredClone(notebookSource(working.getSnapshot().working)), draft = transfer.checkpoint(field!.targetKey), raster = freezeHandwritingRaster(backgroundRef.current!, canvasRef.current!);
				transfer.release();
				return { source, draft, raster };
			} });
		} catch { uploader.report(pageId, "review_unavailable"); }
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
		redraw(); const area = areaRef.current!;
		const observer = new ResizeObserver(() => { if (area.clientWidth && area.clientHeight) { const width = Math.max(1, area.clientWidth - 16); setPaperSize({ width, height: width * HEIGHT / WIDTH }); } });
		observer.observe(area); return () => observer.disconnect();
	}, [redraw]);
	function prepareViewChange(nextExpanded: boolean) {
		const position = (areaRef.current?.scrollTop ?? 0) / paperSize.height;
		paperPositions.current[expanded ? "full" : "split"] = position;
		restorePaperPosition.current = paperPositions.current[nextExpanded ? "full" : "split"] ?? position;
		setToolsOpen(false); if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
	}
	useLayoutEffect(() => {
		const area = areaRef.current;
		if (!area || restorePaperPosition.current === null || Math.abs(paperSize.width - (area.clientWidth - 16)) > 1) return;
		area.scrollTop = restorePaperPosition.current * paperSize.height; restorePaperPosition.current = null;
	}, [expanded, paperSize]);
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
		if (event.pointerType === "touch" || event.button !== 0 || active.current || decoding.current) return;
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
	function clear() { recovery.current?.clear(); }
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
	return <div ref={slotRef} className="hw-notebookSlot" hidden={hidden} data-testid="notebook-slot" data-layout-revision="component-sized-card"
		style={{ position: expanded ? "absolute" : "relative", inset: expanded ? 0 : undefined, flex: "1 1 0px", minWidth: 0, minHeight: 0, boxSizing: "border-box", padding: 16, overflow: "hidden" }}>
		<aside ref={controlsRef} className="rounded-2xl border bg-card shadow-lg hw-notebook" aria-label="Handwriting notebook" data-testid="handwriting-notebook" data-ready={saved.ready} data-page-id={pageId} data-expanded={expanded} data-tools-side={toolsLeft ? "left" : "right"}
			style={{ position: "absolute", inset: 16, margin: 0, display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0, overflow: "hidden" }}>
			<header className="hw-notebookHeader"><h2>Writing</h2>
				<Button variant="ghost" size="sm" className="hw-headerAction" disabled={!saved.ready || submission?.preparing} {...handlers("Attach snapshot", () => { void attachSnapshot(); })} data-testid="notebook-attach"><PaperclipIcon aria-hidden />Attach page</Button>
				<Button variant="ghost" size="sm" className="hw-headerAction" aria-label="Pages" aria-expanded={pagesOpen} disabled={!saved.ready || submission?.preparing} {...handlers("Pages", () => { setPagesOpen(value => !value); setOptionsOpen(false); setToolsOpen(false); void recovery.current?.refreshPages().catch(() => {}); })}><FilesIcon aria-hidden />Pages</Button>
				<Button variant="ghost" size="sm" className="hw-headerAction hw-tabletControl" aria-label={expanded ? "Back to question" : "Expand notebook"} {...handlers("Expand", () => { prepareViewChange(!expanded); onToggleExpanded(); })} data-testid="notebook-expand">{expanded ? <Minimize2Icon /> : <Maximize2Icon />}{expanded ? "Back to question" : "Expand"}</Button>
				<Button variant="ghost" size="sm" className="hw-headerAction hw-tabletControl" aria-label="Close notebook" {...handlers("Close writing", () => { if (expanded) prepareViewChange(false); onClose(); })}><XIcon aria-hidden />Close</Button>
				<Button variant="ghost" size="sm" className="hw-headerAction hw-mobileSwitch" {...handlers("Chat", onClose)} data-testid="open-notebook-chat">Chat</Button>
				<Button variant="ghost" size="sm" className="hw-headerAction" aria-label="Notebook options" aria-expanded={optionsOpen} {...handlers("Notebook options", () => { setOptionsOpen(v => !v); setPagesOpen(false); setToolsOpen(false); })} data-testid="notebook-options-toggle"><MoreHorizontalIcon /></Button>
			</header>
			{optionsOpen && <div className="hw-toolsPanel" data-testid="notebook-options">
				<Button variant="ghost" disabled={!saved.ready || submission?.preparing} {...handlers("Duplicate", () => { setOptionsOpen(false); void recovery.current?.duplicateWorking(); })}>Duplicate</Button><hr />
				<Button variant="ghost" {...handlers("Tools side", () => { setOptionsOpen(false); toggleToolsSide(); })} data-testid="notebook-tools-side">{toolsLeft ? "Tools on the right" : "Tools on the left (left-handed)"}</Button><hr />
				<Button variant="ghost" {...handlers("Tools and help", () => { setOptionsOpen(false); setToolsOpen(true); })} data-testid="notebook-tools-toggle">Tools and help</Button>
			</div>}
			{pagesOpen && <div className="hw-toolsPanel hw-pagesPanel" data-testid="notebook-pages">
				<div className="hw-toolsHeading"><h3>Pages</h3><Button variant="ghost" aria-label="Close pages" {...handlers("Close pages", () => { setPagesOpen(false); controlsRef.current?.querySelector<HTMLButtonElement>('[aria-label="Pages"]')?.focus(); })}><XIcon /></Button></div>
				{pages.map((page, index) => <PageRow key={page.id} page={page} index={index} pages={pages} current={pageId} revision={page.id === pageId ? recovery.current?.getSnapshot().working.head : undefined} model={recovery.current!} disabled={!saved.ready || !!submission?.preparing} choose={() => { void recovery.current?.switchPage(page.id).then(opened => { if (opened) { setPagesOpen(false); controlsRef.current?.querySelector<HTMLButtonElement>('[aria-label="Pages"]')?.focus(); } }); }} />)}
			</div>}
			{toolsOpen && <div id="handwriting-tools" className="hw-toolsPanel" role="group" aria-label="Notebook tools">
				<div className="hw-toolsHeading"><span>Notebook tools</span><Button variant="ghost" size="icon" aria-label="Close notebook tools" {...handlers("Close tools", () => { setToolsOpen(false); controlsRef.current?.querySelector<HTMLButtonElement>('[aria-label="Notebook options"]')?.focus(); })}><XIcon /></Button></div>
				<p>Write with Pencil; scroll the paper with a finger. Working, Undo and Redo save automatically. A new edit clears Redo. Clear can be undone.</p>
				<button type="button" className="min-h-11 underline" {...handlers("Reload preview", () => location.reload())}>Reload preview</button>
				<p>Reload keeps your notebook, Undo and Redo, attached snapshots and explanation saved at Attach.</p>
			</div>}
			{flattened && <p className="hw-notice">Flattened image · original marks cannot be erased</p>}
			<div className="hw-drawingWorkspace"><div className="hw-paperArea"><div ref={areaRef} className="hw-paperScroll" data-testid="notebook-paper-scroll">
				<div className={`hw-paperStack ${dimPaper ? "hw-dimPaper" : ""}`} style={{ width: paperSize.width, height: paperSize.height }}>
					<canvas ref={backgroundRef} width={WIDTH} height={HEIGHT} className="hw-figureBackground" aria-hidden="true" data-testid="notebook-background" />
					<canvas ref={canvasRef} width={WIDTH} height={HEIGHT} className="hw-paper" style={{ cursor: tool === "eraser" ? "cell" : "crosshair" }} aria-label="Handwriting page — use Pencil or mouse; fingers do not draw" data-testid="notebook-canvas" onPointerDown={start} onPointerMove={move} onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={finish} onContextMenu={e => e.preventDefault()} />
					<canvas ref={highlightRef} width={WIDTH} height={HEIGHT} className="hw-highlightOverlay" style={{ opacity: HIGHLIGHT_OPACITY }} aria-hidden="true" data-testid="notebook-highlight-overlay" />
				</div>
			</div><HandwritingToolbar tool={tool} colour={colour} colours={PEN_COLOURS} sizes={sizes} size={currentSize} dimPaper={dimPaper} disabled={!saved.ready} handlers={handlers} selectTool={setTool} selectColour={value => setColour(value as Stroke["colour"])} selectSize={value => { if (tool === "pen") setPenScale(value as Stroke["penScale"]); else if (tool === "eraser") setEraserWidth(value as Stroke["width"]); else setHighlighterWidth(value as Stroke["width"]); }} undo={undoLast} redo={() => recovery.current?.redo()} canUndo={history.canUndo} canRedo={history.canRedo} clear={clear} togglePaper={() => setDimPaper(v => !v)} /></div></div>
			{saved.notice && <div className="hw-notice" role="status">{saved.notice}{saved.notice !== "Opening notebook…" && <button type="button" className="min-h-11 px-3 underline" {...handlers("Retry", () => { void recovery.current?.retry().then(() => refreshStatus.current()); })}>Retry</button>}</div>}
			{attachmentNotice && <div className="hw-notice" role="status">{attachmentNotice.text}{attachmentNotice.refresh && <button type="button" className="min-h-11 px-3 underline" onClick={() => void review().catch(() => {})}>Refresh review</button>}</div>}
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
