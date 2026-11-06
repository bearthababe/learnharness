"use client";

import type { ReactNode } from "react";
import { BookOpenIcon, DumbbellIcon, RepeatIcon } from "lucide-react";

/** Home and the draft share one wrapping action row. Picker controls lead;
 * setup is centered only when it is the sole action. */
export function ComposerActions({ picker, setup, leading }: { picker?: ReactNode; setup?: ReactNode; leading?: ReactNode }) {
	if (!picker && !setup && !leading) return null;
	return (
		<div
			data-testid="composer-actions"
			className={`pointer-events-auto mb-2 flex flex-wrap items-center gap-2 ${leading ? "justify-between" : picker ? "justify-start" : "justify-center"}`}
		>
			{leading ? <>
				{leading}
				{(picker || setup) && <div className="flex flex-wrap items-center gap-2">{picker}{setup}</div>}
			</> : <>
				{picker}
				{setup}
			</>}
		</div>
	);
}

/** Count and Clear stay together if the setup action wraps onto another line.
 * These are node counts, even when a whole chain supplied the selection. */
export function NodePickerControl({ count, onOpen, onClear }: {
	count: number;
	onOpen?: () => void;
	onClear?: () => void;
}) {
	return (
		<div className="flex items-center gap-1.5">
			<button
				type="button"
				data-testid="practice-props-chip"
				onClick={onOpen}
				className={
					"flex h-8 cursor-pointer items-center gap-1.5 rounded-full border px-3 font-ui text-[13px] backdrop-blur transition-colors " +
					(count > 0
						? "border-transparent bg-card/90 text-foreground hover:bg-accent"
						: "border-dashed border-border bg-background/60 text-muted-foreground hover:bg-accent hover:text-foreground")
				}
			>
				<DumbbellIcon aria-hidden="true" className="size-3.5 text-muted-foreground" />
				{count > 0 ? `${count} ${count === 1 ? "node" : "nodes"} selected` : "Pick nodes"}
			</button>
			{count > 0 && (
				<button
					type="button"
					data-testid="practice-props-clear"
					onClick={onClear}
					className="h-8 cursor-pointer rounded-full px-2.5 font-ui text-[13px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
				>
					Clear
				</button>
			)}
		</div>
	);
}

export type SessionMode = "teach" | "practice" | "drill";

/** The session-type switch (whole-app redesign): the same segmented control
 *  on home and on the new-session draft, so starting any kind of session
 *  reads one way everywhere. */
export function ModeSwitch({ mode, onChange, testid = "home-mode-switch", itemTestid = "home-mode" }: {
	mode: SessionMode;
	onChange: (mode: SessionMode) => void;
	testid?: string;
	itemTestid?: string;
}) {
	return (
		<div className="lh-mode-switch flex items-center gap-0.5 rounded-full bg-card/90 p-1 backdrop-blur" data-testid={testid} role="group" aria-label="Session type">
			{(["teach", "practice", "drill"] as const).map((m) => (
				<button
					key={m}
					type="button"
					data-testid={`${itemTestid}-${m}`}
					aria-pressed={mode === m}
					onClick={() => onChange(m)}
					className={
						"flex h-8 items-center gap-1.5 rounded-full px-3.5 text-[13.5px] font-medium transition-colors " +
						(mode === m
							? "bg-accent text-foreground shadow-[0_1px_2px_rgb(0_0_0/0.45)]"
							: "text-muted-foreground hover:text-foreground")
					}
				>
					{m === "teach" ? <BookOpenIcon aria-hidden="true" className="size-3.5" /> : m === "drill" ? <RepeatIcon aria-hidden="true" className="size-3.5" /> : <DumbbellIcon aria-hidden="true" className="size-3.5" />}
					{m === "teach" ? "Teach" : m === "drill" ? "Drill" : "Practice"}
				</button>
			))}
		</div>
	);
}
