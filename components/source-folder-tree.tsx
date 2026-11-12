"use client";

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type DragEvent, type HTMLAttributes, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { isDictationActive, joinDictation, useDictationTarget } from "@/components/dictation";
import { FolderIcon, FolderOpenIcon, GripVerticalIcon } from "lucide-react";
import { useCoarsePointer } from "@/components/use-phone-viewport";
import { canMoveFolder, folderIsEmpty, fuzzyScore, placementOf, folderEntryCheck, type SourceEntrySelection, type OrganizationAction, type SourceDirectory } from "@/src/core";
import type { ChainSort } from "./chain-table";
import { chainRow } from "./chain-navigation";

export type OrganizationChange = (action: OrganizationAction) => Promise<string | void>;
const DRAG_TYPE = "application/x-learnharness-source";
const RowEditing = createContext<((editing: boolean) => void) | null>(null);

/** Keep the existing row as the drag surface, not the editor. A transient,
 * fixed-position preview carries only the icon/name, never the row's columns. */
export function SourceDragRow({ kind, id, name, enabled, children, ...props }: HTMLAttributes<HTMLDivElement> & {
	kind: "source" | "folder"; id: string; name: string; enabled: boolean; children: ReactNode;
}) {
	const [editing, setEditing] = useState(false);
	// F1 (round 16): touch screens move a row from its handle only (pointer
	// drag below), so scrolling never picks a row up; a mouse can still drag
	// the whole row.
	const coarse = useCoarsePointer();
	return <RowEditing.Provider value={setEditing}>
		<div {...props} data-source-drag-row={id} draggable={enabled && !editing && !coarse}
			onDragStart={(event) => {
				if (!enabled || editing || (event.target as Element).closest('input:not([type="checkbox"]),textarea,[contenteditable="true"]')) { event.preventDefault(); return; }
				event.dataTransfer.setData(DRAG_TYPE, JSON.stringify({ kind, id }));
				event.dataTransfer.effectAllowed = "move";
				const preview = event.currentTarget.ownerDocument.createElement("div");
				preview.dataset.sourceDragPreview = "";
				preview.className = "pointer-events-none fixed z-50 flex w-max max-w-72 items-center gap-1.5 rounded-md border border-border/70 bg-card px-2 py-1 text-sm font-medium text-foreground shadow-md";
				preview.style.left = `${event.clientX - 12}px`;
				preview.style.top = `${event.clientY - 12}px`;
				preview.style.fontFamily = getComputedStyle(event.currentTarget).fontFamily;
				const icon = event.currentTarget.querySelector("[data-source-icon] svg")?.cloneNode(true);
				if (icon) preview.appendChild(icon);
				const label = preview.ownerDocument.createElement("span");
				label.className = "truncate"; label.textContent = name; preview.appendChild(label);
				preview.ownerDocument.body.appendChild(preview);
				event.dataTransfer.setDragImage(preview, 12, 12);
				requestAnimationFrame(() => preview.remove());
			}}>{children}</div>
	</RowEditing.Provider>;
}

/** F1 (round 16): an item being moved, and the tree's pointer-drag seam. */
export type MoveItem = { kind: "source" | "folder"; id: string; name: string };
const TreeDrag = createContext<{ start: (item: MoveItem, event: ReactPointerEvent<HTMLElement>) => void; dragging: string | null } | null>(null);

/** The always-visible 44px handle at a row's right end. Drag it (touch or
 *  mouse) to move the row; a plain tap or Enter opens "Move to…". */
export function DragHandle({ kind, id, name, enabled }: MoveItem & { enabled: boolean }) {
	const drag = useContext(TreeDrag);
	if (!enabled || !drag) return <span className="lh-drag-handle lh-drag-handle-off" aria-hidden="true" />;
	return <button type="button" className="lh-drag-handle" data-testid={`drag-handle-${id}`} aria-label={`Move ${name}`} title="Drag to move, or tap for Move to…"
		onPointerDown={(event) => drag.start({ kind, id, name }, event)}
		onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.stopPropagation(); drag.start({ kind, id, name }, event as unknown as ReactPointerEvent<HTMLElement>); } }}
		onClick={(event) => event.preventDefault()}>
		<GripVerticalIcon aria-hidden />
	</button>;
}

/** Source/folder names are also searchable, including sources without nodes. */
export function sourceNameMatches(directory: SourceDirectory | undefined, id: string, label: string | null, query: string): boolean {
	if (!query.trim()) return true;
	if (fuzzyScore(query, label ?? "") !== null) return true;
	if (!directory) return false;
	let parent = placementOf(directory.organization, id)?.folderId ?? null;
	const seen = new Set<string>();
	while (parent !== null && !seen.has(parent)) {
		seen.add(parent);
		const folder = directory.organization.folders.find((f) => f.id === parent);
		if (!folder) break;
		if (fuzzyScore(query, folder.name) !== null) return true;
		parent = folder.parentId;
	}
	return false;
}

/** Same Enter/blur commit and Escape cancel interaction as session titles.
 * The in-flight guard prevents Enter followed by blur from double-writing. */
export function EditableSourceName({ name, onSave, onCancel, initiallyEditing = false, muted = false }: {
	name: string; onSave: (name: string) => Promise<unknown>; onCancel?: () => void; initiallyEditing?: boolean; muted?: boolean;
}) {
	const [editing, setEditing] = useState(initiallyEditing);
	const [draft, setDraft] = useState(name);
	const [failure, setFailure] = useState("");
	const input = useRef<HTMLInputElement>(null);
	const submitting = useRef(false);
	const cancelled = useRef(false);
	const setRowEditing = useContext(RowEditing);
	// B1 (round 17): a name being typed takes the app's dictation (the words
	// go into the name, never into another field), and a tap on a mic does not
	// end the edit. Its keyboard always rises (S3: naming is never a learning
	// field, and the field is focused within the tap that opened it).
	const draftRef = useRef(draft); draftRef.current = draft;
	useDictationTarget(useCallback((text: string) => { const next = joinDictation(draftRef.current, text); draftRef.current = next; setDraft(next); }, []), editing);
	useLayoutEffect(() => { setRowEditing?.(editing); return () => setRowEditing?.(false); }, [editing, setRowEditing]);
	useLayoutEffect(() => { if (editing) { input.current?.focus(); input.current?.select(); } }, [editing]);
	const commit = async () => {
		if (cancelled.current || submitting.current) return;
		const value = draft.trim();
		if (!value) { setEditing(false); onCancel?.(); return; }
		if (value === name && !initiallyEditing) { setEditing(false); return; }
		submitting.current = true;
		try { await onSave(value); setEditing(false); setFailure(""); }
		catch (error) { setFailure(error instanceof Error ? error.message : String(error)); input.current?.focus(); }
		finally { submitting.current = false; }
	};
	return <span className="min-w-0 flex-1">
		{editing ? <input ref={input} value={draft} placeholder="Folder name" aria-label="Source or folder name" data-testid="source-name-input"
			className="block h-5 w-full min-w-0 border-0 bg-transparent p-0 text-sm font-medium leading-5 outline-none shadow-none focus:ring-0"
			onChange={(e) => setDraft(e.target.value)} onBlur={(e) => {
				// A mic tap (or a run still finishing) keeps the edit open for the words.
				if ((e.relatedTarget as Element | null)?.closest?.('.lh-mic-button, [aria-label="Start dictation"], [aria-label="Stop dictation"]') || isDictationActive()) return;
				void commit();
			}}
			onKeyDown={(e) => {
				if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); cancelled.current = true; setEditing(false); setFailure(""); onCancel?.(); }
				if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); void commit(); }
			}} onDragStart={(e) => { e.preventDefault(); e.stopPropagation(); }} />
			: <button type="button" className={`block max-w-full truncate rounded-sm text-left text-sm font-medium leading-5 transition-colors hover:bg-accent${muted ? " text-muted-foreground/60" : ""}`} title="Rename"
				onClick={() => { cancelled.current = false; setDraft(name); setEditing(true); }}>{name}</button>}
		{failure && <span role="alert" className="block text-xs text-red-400">{failure}</span>}
	</span>;
}

/** E3 (round 16): an Ideas row's title opens (expands) it; renaming is an
 *  explicit action ("Rename" in the opened row), never a tap on the title. */
export function RowTitle({ id, name, meta, icon, open, onToggle, renaming, onRename, onSave, muted = false, testid, iconTestid }: {
	id: string; name: string; meta?: ReactNode; icon: ReactNode; open: boolean; onToggle: () => void; renaming: boolean;
	onRename: (id: string | null) => void; onSave?: (name: string) => Promise<unknown>; muted?: boolean; testid: string; iconTestid: string;
}) {
	if (renaming && onSave) return <span className="lh-row-open lh-row-renaming">
		<span data-source-icon data-testid={iconTestid} className={`lh-row-icon${muted ? " text-muted-foreground/60" : ""}`}>{icon}</span>
		<EditableSourceName name={name} initiallyEditing muted={muted} onCancel={() => onRename(null)} onSave={async (next) => { await onSave(next); onRename(null); }} />
	</span>;
	return <button type="button" className="lh-row-open" data-testid={testid} aria-expanded={open} onClick={onToggle} data-row-id={id}>
		<span data-source-icon data-testid={iconTestid} className={`lh-row-icon${muted ? " text-muted-foreground/60" : ""}`}>{icon}</span>
		<span className="lh-row-text">
			<span className={`lh-row-name${muted ? " text-muted-foreground/60" : ""}`}>{name}</span>
			{meta && <span className="lh-row-meta">{meta}</span>}
		</span>
	</button>;
}

/** The opened row's own actions (E3): Rename, and for a session, Open. */
export function RowActions({ depth, children }: { depth: number; children: ReactNode }) {
	return <div className="lh-row-actions" style={{ paddingLeft: 12 + 44 + depth * 36 }}>{children}</div>;
}

interface TreeSource {
	key: string; birth: string | null; label: string | null; nodeIds: string[]; newestCreatedAt: string;
}
type PointerDrag = MoveItem & { from: string | null; x: number; y: number; target: string | null | undefined; begun: boolean; touch: boolean };
export function SourceFolderTree<T extends TreeSource>({ groups, directory, query, sort, renderSource, onAction, expanded,
	onToggleExpanded, selection, selectedFolders, onToggleNodes, onToggleFolder, allSourceNodes, allowEmptySelection = true, collapsedForSearch, sourceSelection,
	renaming = null, onRename = () => {}, onMove, onMoveTo }: {
	groups: T[]; directory?: SourceDirectory; query: string; sort: ChainSort;
	renderSource: (source: T, depth: number) => ReactNode;
	allSourceNodes?: ReadonlyMap<string, ReadonlySet<string>>;
	allowEmptySelection?: boolean;
	collapsedForSearch?: ReadonlySet<string>;
	sourceSelection?: SourceEntrySelection;
	onAction?: OrganizationChange; expanded: ReadonlySet<string>; onToggleExpanded: (id: string) => void;
	selection: ReadonlySet<string>; selectedFolders: ReadonlySet<string>;
	onToggleNodes: (ids: string[], next: boolean) => void; onToggleFolder: (id: string, next: boolean) => void;
	/** E3: the row being renamed (started from its Rename action). */
	renaming?: string | null; onRename?: (id: string | null) => void;
	/** F1: move items into a folder (null = the top level), with Undo. */
	onMove?: (items: MoveItem[], parentId: string | null) => void;
	/** F1: the "Move to…" sheet for these items (a tap on a handle). */
	onMoveTo?: (items: MoveItem[]) => void;
}) {
	const [dropTarget, setDropTarget] = useState<string | null | undefined>(undefined);
	const [draggedItem, setDraggedItem] = useState<{ kind: "source" | "folder"; id: string }>();
	// E4 (round 16): sources with no ideas wait behind "Show empty (N)".
	const [showEmpty, setShowEmpty] = useState(false);
	const [drag, setDrag] = useState<PointerDrag | null>(null);
	const dragRef = useRef<PointerDrag | null>(null);
	const expandedRef = useRef(expanded); expandedRef.current = expanded;
	const stop = useRef<(() => void) | null>(null);
	useEffect(() => () => stop.current?.(), []);
	if (!directory) return <>{groups.map((g) => renderSource(g, 0))}</>;
	const state = directory.organization;
	const ids = new Set(directory.sources.map((s) => s.id));
	const search = query.trim() !== "";
	const collator = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });
	const parentOf = (g: Pick<T, "birth">) => g.birth === null ? null : placementOf(state, g.birth)?.folderId ?? null;
	const parentOfItem = (item: Pick<MoveItem, "kind" | "id">) => item.kind === "source" ? placementOf(state, item.id)?.folderId ?? null : state.folders.find((f) => f.id === item.id)?.parentId ?? null;
	const canDrop = (item: Pick<MoveItem, "kind" | "id">, target: string | null) => target !== parentOfItem(item) && (item.kind !== "folder" || canMoveFolder(state, item.id, target));
	const isDescendant = (g: Pick<T, "birth">, folderId: string): boolean => {
		let parent = parentOf(g);
		while (parent !== null) {
			if (parent === folderId) return true;
			parent = state.folders.find((f) => f.id === parent)?.parentId ?? null;
		}
		return false;
	};
	const nodeIds = (folderId: string) => [...new Set(allSourceNodes
		? [...allSourceNodes].filter(([birth]) => isDescendant({ birth }, folderId)).flatMap(([, nodes]) => [...nodes])
		: groups.filter((g) => isDescendant(g, folderId)).flatMap((g) => g.nodeIds))];
	const isEmptySource = (g: T) => g.birth !== null && !(allSourceNodes ? allSourceNodes.get(g.birth)?.size : g.nodeIds.length);
	const emptyCount = groups.filter(isEmptySource).length;
	const hideEmpty = !showEmpty && !search;
	const visibleFolder = (id: string): boolean => !search || groups.some((g) => isDescendant(g, id))
		|| state.folders.some((f) => f.id === id && fuzzyScore(query, f.name) !== null)
		|| state.folders.some((f) => f.parentId === id && visibleFolder(f.id));
	const dropProps = (parentId: string | null) => onAction ? {
		onDragOver(event: DragEvent) {
			if (!Array.from(event.dataTransfer.types).includes(DRAG_TYPE)) return;
			event.preventDefault(); event.stopPropagation();
			const valid = draggedItem?.kind !== "folder" || canMoveFolder(state, draggedItem.id, parentId);
			event.dataTransfer.dropEffect = valid ? "move" : "none";
			setDropTarget(valid ? parentId : undefined);
		},
		onDragLeave(event: DragEvent) {
			if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
			event.stopPropagation();
			setDropTarget((previous) => previous === parentId ? undefined : previous);
		},
		onDrop(event: DragEvent) {
			const raw = event.dataTransfer.getData(DRAG_TYPE);
			if (!raw) return;
			event.preventDefault(); event.stopPropagation();
			setDropTarget(undefined); setDraggedItem(undefined);
			let item: { kind?: unknown; id?: unknown };
			try { item = JSON.parse(raw); } catch { return; }
			if (!item || typeof item !== "object") return;
			if ((item.kind !== "source" && item.kind !== "folder") || typeof item.id !== "string") return;
			if (item.kind === "folder" && !canMoveFolder(state, item.id, parentId)) return;
			const name = item.kind === "folder" ? state.folders.find((f) => f.id === item.id)?.name ?? "" : directory.sources.find((x) => x.id === item.id)?.label ?? "";
			if (onMove) { if (canDrop({ kind: item.kind, id: item.id }, parentId)) onMove([{ kind: item.kind, id: item.id, name }], parentId); return; }
			void onAction({ action: "move", kind: item.kind, id: item.id, parentId }).catch(() => {});
		},
	} : {};
	// F1 (round 16): the pointer drag from a row's handle — touch and mouse
	// alike. Valid folder rows outline, the one under the finger is named,
	// a closed folder opens after a short hover, the list scrolls near its
	// edges, a pinned "Top level" target appears for an item in a folder, and
	// Escape (or letting go away from a target) cancels.
	const start = (item: MoveItem, event: ReactPointerEvent<HTMLElement>) => {
		const keyboard = !("pointerId" in event) || event.pointerId === undefined;
		if (keyboard) { onMoveTo?.([item]); return; }
		if (event.pointerType === "mouse" && event.button !== 0) return;
		event.preventDefault();
		stop.current?.();
		const handle = event.currentTarget;
		const pointerId = event.pointerId;
		try { handle.setPointerCapture(pointerId); } catch { /* synthetic pointers */ }
		const from = parentOfItem(item);
		const origin = { x: event.clientX, y: event.clientY };
		const scroller = handle.closest<HTMLElement>("[data-ideas-scroll]");
		let begun = false, frame = 0, hoverTimer = 0, hovered: string | null | undefined = undefined, speed = 0;
		const pick = (x: number, y: number): string | null | undefined => {
			for (const hit of document.elementsFromPoint(x, y)) {
				const folder = hit.closest?.("[data-drop-folder]");
				if (folder) return folder.getAttribute("data-drop-folder");
				if (hit.closest?.("[data-drop-root]")) return null;
			}
			return undefined;
		};
		const scroll = () => {
			if (!scroller || speed === 0) { frame = 0; return; }
			scroller.scrollTop += speed;
			frame = requestAnimationFrame(scroll);
		};
		const move = (e: PointerEvent) => {
			if (e.pointerId !== pointerId) return;
			if (!begun && Math.hypot(e.clientX - origin.x, e.clientY - origin.y) < 6) return;
			begun = true;
			e.preventDefault();
			let target = pick(e.clientX, e.clientY);
			if (target !== undefined && !canDrop(item, target)) target = undefined;
			if (target !== hovered) {
				window.clearTimeout(hoverTimer);
				if (typeof target === "string" && !expandedRef.current.has(target)) {
					const folder = target;
					hoverTimer = window.setTimeout(() => { if (!expandedRef.current.has(folder)) onToggleExpanded(folder); }, 650);
				}
				hovered = target;
			}
			if (scroller) {
				const box = scroller.getBoundingClientRect();
				speed = e.clientY < box.top + 56 ? -Math.ceil((box.top + 56 - e.clientY) / 6) : e.clientY > box.bottom - 56 ? Math.ceil((e.clientY - (box.bottom - 56)) / 6) : 0;
				if (speed !== 0 && !frame) frame = requestAnimationFrame(scroll);
			}
			const next = { ...item, from, x: e.clientX, y: e.clientY, target, begun: true, touch: e.pointerType !== "mouse" };
			dragRef.current = next; setDrag(next);
		};
		const finish = (commit: boolean) => {
			cleanup();
			const last = dragRef.current;
			dragRef.current = null; setDrag(null);
			if (!begun) { if (commit) onMoveTo?.([item]); return; }
			// The release is not a tap: swallow the click the browser makes
			// where the finger lifted (it would toggle the row under it).
			const swallow = (e: MouseEvent) => { e.preventDefault(); e.stopPropagation(); };
			window.addEventListener("click", swallow, { capture: true, once: true });
			window.setTimeout(() => window.removeEventListener("click", swallow, { capture: true }), 400);
			if (commit && last && last.target !== undefined && canDrop(item, last.target)) onMove?.([item], last.target);
		};
		const up = (e: PointerEvent) => { if (e.pointerId === pointerId) finish(true); };
		const cancel = (e: PointerEvent) => { if (e.pointerId === pointerId) finish(false); };
		const key = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); finish(false); } };
		const cleanup = () => {
			window.clearTimeout(hoverTimer); cancelAnimationFrame(frame); frame = 0; speed = 0;
			window.removeEventListener("pointermove", move);
			window.removeEventListener("pointerup", up);
			window.removeEventListener("pointercancel", cancel);
			document.removeEventListener("keydown", key, true);
			stop.current = null;
		};
		stop.current = () => { cleanup(); dragRef.current = null; setDrag(null); };
		window.addEventListener("pointermove", move, { passive: false });
		window.addEventListener("pointerup", up);
		window.addEventListener("pointercancel", cancel);
		document.addEventListener("keydown", key, true);
	};
	const dropState = (folderId: string) => !drag ? {} : {
		"data-drop-valid": canDrop(drag, folderId) || undefined,
		"data-drop-invalid": !canDrop(drag, folderId) || undefined,
		"data-drop-hover": drag.target === folderId || undefined,
	};
	const renderLevel = (parentId: string | null, depth: number): ReactNode => {
		const items = [
			...groups.filter((g) => parentOf(g) === parentId).map((g) => ({ kind: "source" as const, source: g, id: g.key, name: g.label ?? "\uffff", count: g.nodeIds.length, date: g.newestCreatedAt, empty: isEmptySource(g) })),
			...state.folders.filter((f) => f.parentId === parentId && visibleFolder(f.id)).map((f) => ({ kind: "folder" as const, folder: f, id: f.id, name: f.name, count: nodeIds(f.id).length, date: f.createdAt, empty: false })),
		];
		// Folders first (E2/F1 — drop targets in reach), then sources with
		// ideas, then any empty ones (E4); the chosen column orders each group.
		const rank = (item: (typeof items)[number]) => item.kind === "folder" ? 0 : item.empty ? 2 : 1;
		items.sort((a, b) => {
			const byName = collator.compare(a.name, b.name);
			return rank(a) - rank(b) || (sort.col === "name" ? byName : sort.col === "props" ? a.count - b.count : a.date.localeCompare(b.date)) * sort.dir || byName || a.id.localeCompare(b.id);
		});
		return items.map((item) => {
			// E4: an empty source stays in place but out of sight until "Show empty".
			if (item.kind === "source") return <div key={item.id} {...dropProps(parentId)} hidden={hideEmpty && item.empty} data-empty-source={item.empty || undefined} data-dragging={drag?.kind === "source" && drag.id === item.source.birth ? true : undefined}>{renderSource(item.source, depth)}</div>;
			const folder = item.folder;
			const open = search ? !collapsedForSearch?.has(folder.id) : expanded.has(folder.id);
			const members = nodeIds(folder.id);
			const empty = folderIsEmpty(state, folder.id, ids);
			const selectedCount = members.filter((id) => selection.has(id)).length;
			const entryCheck = sourceSelection ? folderEntryCheck(directory, folder.id, sourceSelection) : undefined;
			const hasChildren = state.folders.some((f) => f.parentId === folder.id && visibleFolder(f.id)) || groups.some((g) => parentOf(g) === folder.id);
			return <div key={folder.id} data-testid={`source-folder-${folder.id}`} className="relative" {...dropProps(folder.id)} data-dragging={drag?.kind === "folder" && drag.id === folder.id ? true : undefined}>
				<SourceDragRow {...chainRow(["folder", folder.id], depth, open)} kind="folder" id={folder.id} name={folder.name} enabled={Boolean(onAction)} data-testid={`folder-row-${folder.id}`}
					data-drop-active={dropTarget === folder.id} data-drop-folder={folder.id} {...dropState(folder.id)}
					className={`lh-idea-row lh-folder-row transition-colors ${!open || !hasChildren ? "border-b border-transparent" : ""} ${dropTarget === folder.id ? "bg-accent/50" : ""}`}
					style={{ paddingLeft: 12 + depth * 36 }}>
					<label className="lh-row-check">
						<input type="checkbox" aria-label={`Select ${sourceSelection ? "folder" : "contents of"} ${folder.name}`} data-testid={`folder-checkbox-${folder.id}`}
							className="size-3.5 shrink-0 accent-primary" disabled={entryCheck ? false : empty ? !allowEmptySelection : members.length === 0}
							checked={entryCheck?.checked ?? (empty ? selectedFolders.has(folder.id) : members.length > 0 && selectedCount === members.length)}
							ref={(el) => { if (el) el.indeterminate = entryCheck?.indeterminate ?? (!empty && selectedCount > 0 && selectedCount < members.length); }}
							onChange={(e) => { if (entryCheck || empty) onToggleFolder(folder.id, e.target.checked); else onToggleNodes(members, e.target.checked); }} />
					</label>
					<RowTitle id={folder.id} name={folder.name} open={open} onToggle={() => onToggleExpanded(folder.id)} testid={`folder-toggle-${folder.id}`} iconTestid={`folder-icon-${folder.id}`}
						icon={open ? <FolderOpenIcon className="size-4 shrink-0" /> : <FolderIcon className="size-4 shrink-0" />}
						meta={<>{members.length} {members.length === 1 ? "idea" : "ideas"} · folder</>}
						renaming={renaming === folder.id} onRename={onRename} onSave={onAction ? (name) => onAction({ action: "rename-folder", id: folder.id, name }) : undefined} />
					{drag && drag.target === folder.id && <span className="lh-drop-label" aria-hidden="true">Move here</span>}
					<span className="lh-row-count w-14 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{members.length}</span>
					<span className="lh-row-date w-20 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{folder.createdAt.slice(0, 10)}</span>
					<DragHandle kind="folder" id={folder.id} name={folder.name} enabled={Boolean(onAction && onMove)} />
				</SourceDragRow>
				{open && onAction && renaming !== folder.id && <RowActions depth={depth}>
					<button type="button" title="Rename" data-testid={`folder-rename-${folder.id}`} onClick={() => onRename(folder.id)}>Rename folder</button>
				</RowActions>}
				{open && hasChildren && <div data-testid={`folder-thread-${folder.id}`} className="pointer-events-none absolute bottom-[8px] top-[23px] w-px bg-border/50" style={{ left: 37 + depth * 36 }} />}
				{open && renderLevel(folder.id, depth + 1)}
				<div data-testid={`folder-separator-${folder.id}`} className="pointer-events-none absolute bottom-0 right-0 border-b border-border/60" style={{ left: depth === 0 ? 0 : depth * 36 + 1 }} />
			</div>;
		});
	};
	return <TreeDrag.Provider value={{ start, dragging: drag?.id ?? null }}>
	<div className="flex flex-1 flex-col" data-ideas-dragging={drag ? true : undefined} onDragStart={(event) => {
		try {
			const item = JSON.parse(event.dataTransfer.getData(DRAG_TYPE));
			if (item && (item.kind === "source" || item.kind === "folder") && typeof item.id === "string") setDraggedItem(item);
		} catch { /* An unrelated native text/file drag is not an organization move. */ }
	}} onDragEnd={() => { setDropTarget(undefined); setDraggedItem(undefined); }}>
		{/* The pinned top-level target: only for an item that is in a folder,
		    and distinct from "Ungrouped ideas". */}
		{drag && drag.from !== null && <div className="lh-drop-top" data-drop-root="" data-testid="drop-top-level" data-drop-hover={drag.target === null || undefined}>
			Move to the top level (no folder)
		</div>}
		<div>{renderLevel(null, 0)}</div>
		{!search && emptyCount > 0 && <button type="button" className="lh-show-empty" data-testid="show-empty-sources" aria-expanded={showEmpty} onClick={() => setShowEmpty((v) => !v)}>
			{showEmpty ? `Hide empty sources (${emptyCount})` : `Show empty (${emptyCount})`}
			<span className="lh-show-empty-note">Sources with no ideas yet</span>
		</button>}
		{onAction && <div data-testid="source-root-drop" aria-label="Move outside folders" data-drop-active={dropTarget === null} data-drop-root=""
			className={`min-h-16 flex-1 transition-colors ${dropTarget === null ? "bg-accent/30" : ""}`} {...dropProps(null)} />}
		{/* B1 (round 17): the label sits left of the finger (the handles are on
		    the right) and says how to cancel by touch. */}
		{/* L12 (round 19): it stays on screen — left of the finger, but never
		    past the left edge (its own width, clamped by max()), nor the top. */}
		{drag && <div className="lh-drag-ghost" aria-hidden="true" style={{ left: drag.x - 18, top: Math.max(8, drag.y - 46), translate: `max(-100%, ${Math.round(8 - (drag.x - 18))}px) 0` }}>
			<span className="lh-drag-ghost-name">{drag.name}</span>
			<span className="lh-drag-ghost-target">{drag.target === undefined ? (drag.touch ? "Drop on a folder · let go anywhere else to cancel" : "Drop on a folder · Esc cancels") : drag.target === null ? "→ Top level" : `→ ${state.folders.find((f) => f.id === drag.target)?.name ?? "folder"}`}</span>
		</div>}
		{drag && <span className="sr-only" role="status">{drag.target === undefined ? "" : drag.target === null ? "Move to the top level" : `Move to ${state.folders.find((f) => f.id === drag.target)?.name ?? "folder"}`}</span>}
	</div>
	</TreeDrag.Provider>;
}
