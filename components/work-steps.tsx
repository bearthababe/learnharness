"use client";

/**
 * The tutor's working, folded (whole-app redesign; owner amendment 2):
 * a run of thinking and quiet tool steps (reading sessions, files, folders)
 * becomes one plain line — "The tutor looked through your sessions and read
 * the ideas from 4 sessions" — with every step, and each step's technical
 * details, one tap away. Display only: the parts are the same parts, the
 * tools did the same work.
 */

import type { ReactNode } from "react";
import { ChevronRightIcon, ListChecksIcon } from "lucide-react";

/** The quiet tool steps that fold (their own cards stay one-liners). */
const STEP_TOOLS = new Set(["read", "ls", "find", "grep", "list_sessions", "list_propositions"]);

type PartLike = { type: string; state?: string; errorText?: string };

const toolOf = (part: PartLike) => (part.type.startsWith("tool-") ? part.type.slice("tool-".length) : null);

/** A part that belongs to the tutor's working rather than to the lesson. */
function isWorkPart(part: PartLike, index: number, isTeachBoundary: (index: number) => boolean): boolean {
	if (part.type === "reasoning") return true;
	if (part.type === "step-start") return !isTeachBoundary(index);
	const tool = toolOf(part);
	if (!tool) return false;
	if (part.state === "input-streaming") return false; // the live card stays visible
	if (part.state === "output-error" && part.errorText !== "Operation aborted") return true; // a retried step
	return STEP_TOOLS.has(tool);
}

const isStep = (part: PartLike) => {
	const tool = toolOf(part);
	return !!tool && (STEP_TOOLS.has(tool) || part.state === "output-error");
};

export type WorkSegment = { kind: "part"; index: number } | { kind: "work"; indexes: number[] };

/** Split a message's parts into lesson parts and folded runs of working. A
 *  run folds only when it holds at least one tool step; step separators at
 *  its edges stay outside it (they still divide the lesson). Pure. */
export function workSegments(parts: readonly PartLike[], isTeachBoundary: (index: number) => boolean = () => false): WorkSegment[] {
	const segments: WorkSegment[] = [];
	let run: number[] = [];
	const flush = () => {
		// Leading/trailing separators belong to the lesson, not the fold.
		let start = 0, end = run.length;
		while (start < end && parts[run[start]!]!.type === "step-start") start++;
		while (end > start && parts[run[end - 1]!]!.type === "step-start") end--;
		const core = run.slice(start, end);
		for (const index of run.slice(0, start)) segments.push({ kind: "part", index });
		if (core.some((index) => isStep(parts[index]!))) segments.push({ kind: "work", indexes: core });
		else for (const index of core) segments.push({ kind: "part", index });
		for (const index of run.slice(end)) segments.push({ kind: "part", index });
		run = [];
	};
	parts.forEach((part, index) => {
		if (isWorkPart(part, index, isTeachBoundary)) run.push(index);
		else { flush(); segments.push({ kind: "part", index }); }
	});
	flush();
	return segments;
}

const count = (n: number, one: string, many: (n: number) => string) => (n === 1 ? one : many(n));

/** "The tutor looked through your sessions and read the ideas from 4 sessions". Pure. */
export function workSummary(parts: readonly PartLike[]): string {
	const tally = new Map<string, number>();
	let retried = 0;
	for (const part of parts) {
		const tool = toolOf(part);
		if (!tool) continue;
		if (part.state === "output-error") { retried++; continue; }
		tally.set(tool, (tally.get(tool) ?? 0) + 1);
	}
	const phrases: string[] = [];
	const n = (tool: string) => tally.get(tool) ?? 0;
	if (n("list_sessions")) phrases.push("looked through your sessions");
	if (n("list_propositions")) phrases.push(count(n("list_propositions"), "read the ideas from a session", (k) => `read the ideas from ${k} sessions`));
	if (n("read")) phrases.push(count(n("read"), "read a file", (k) => `read ${k} files`));
	if (n("ls")) phrases.push(count(n("ls"), "looked in a folder", (k) => `looked in ${k} folders`));
	if (n("find") + n("grep")) phrases.push("searched your files");
	if (retried) phrases.push(count(retried, "retried a step", (k) => `retried ${k} steps`));
	if (phrases.length === 0) return "The tutor thought it through";
	const joined = phrases.length === 1 ? phrases[0]! : `${phrases.slice(0, -1).join(", ")} and ${phrases.at(-1)}`;
	return `The tutor ${joined}`;
}

/** One folded run: the summary line, then (opened) each original step. */
export function WorkSteps({ parts, children }: { parts: readonly PartLike[]; children: ReactNode }) {
	return (
		<details data-testid="work-steps" className="lh-work-steps group my-2 w-full max-w-2xl">
			<summary className="lh-fold-toggle flex min-h-8 cursor-pointer list-none items-center gap-2 text-[13.5px] text-muted-foreground transition-colors hover:text-foreground [&::-webkit-details-marker]:hidden">
				<ListChecksIcon aria-hidden className="size-4 shrink-0 opacity-70" />
				<span className="min-w-0">{workSummary(parts)}</span>
				<ChevronRightIcon aria-hidden className="size-3.5 shrink-0 opacity-60 transition-transform group-open:rotate-90" />
			</summary>
			<div className="mt-2 flex flex-col gap-1 border-l border-border/70 pl-3">{children}</div>
		</details>
	);
}
