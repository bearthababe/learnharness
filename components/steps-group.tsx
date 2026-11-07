"use client";

import { Children, Fragment, isValidElement, useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronRightIcon } from "lucide-react";
import { artifactRenderers } from "@/components/artifacts";
import { ToolCallCard, toolStepLabel } from "@/components/artifacts/tool-call-card";

type Part = { type: string; state?: string; errorText?: string; text?: string };

/** Behind-the-scenes work: the tutor's thinking notes, lookup steps and
 *  retried calls. Content (text, questions, visuals, plans) never is. */
export function isTracePart(part: Part): boolean {
	if (part.type === "reasoning") return true;
	if (!part.type.startsWith("tool-")) return false;
	if (part.state === "output-error" && part.errorText !== "Operation aborted") return true;
	return part.state !== "input-streaming" && artifactRenderers[part.type.slice("tool-".length)] === ToolCallCard;
}

function summary(parts: Part[]): { title: string; detail: string } {
	const thinking = parts.filter((part) => part.type === "reasoning").length;
	const tools = parts.filter((part) => part.type.startsWith("tool-"));
	const labels = [...new Set(tools.map((part) => toolStepLabel(part.type.slice("tool-".length))))];
	if (tools.length === 0) return { title: "Tutor's thinking", detail: thinking > 1 ? `${thinking} notes` : "" };
	const title = `${thinking ? "Thinking and " : ""}${tools.length} ${tools.length === 1 ? "step" : "steps"}`;
	return { title, detail: labels.slice(0, 2).join(" · ") + (labels.length > 2 ? " …" : "") };
}

/** One quiet, collapsible line for a run of behind-the-scenes parts. Open
 *  while the run is live (the tutor is still working on it). */
export function StepsGroup({ parts, live, children }: { parts: Part[]; live: boolean; children: ReactNode }) {
	const [open, setOpen] = useState(live);
	const wasLive = useRef(live);
	useEffect(() => {
		// Open while the tutor works on it; fold away once its answer begins.
		if (live) setOpen(true);
		else if (wasLive.current) setOpen(false);
		wasLive.current = live;
	}, [live]);
	const { title, detail } = summary(parts);
	const thinkingOnly = parts.every((part) => part.type === "reasoning");
	return (
		<details
			className="lh-steps"
			data-testid="steps-group"
			data-kind={thinkingOnly ? "thinking" : "steps"}
			data-live={live || undefined}
			open={open}
			onToggle={(event) => setOpen(event.currentTarget.open)}
		>
			<summary className="lh-steps-summary">
				<ChevronRightIcon className="lh-steps-chevron" aria-hidden />
				<span className="lh-steps-title">{title}</span>
				{detail && <span className="lh-steps-detail">{detail}</span>}
			</summary>
			{/* Rendered only while open: long histories stay light. */}
			{open && <div className="lh-steps-body">{children}</div>}
		</details>
	);
}

/** Wrap consecutive trace parts of one message into StepsGroups. `nodes[i]`
 *  is what part i renders (null for nothing); plain step separators inside
 *  a run are dropped. */
export function groupTraceParts(parts: Part[], nodes: ReactNode[], liveIndex: number | null): ReactNode[] {
	const out: ReactNode[] = [];
	let run: { start: number; parts: Part[]; nodes: ReactNode[] } | null = null;
	const flush = (end: number) => {
		if (!run) return;
		const live = liveIndex !== null && liveIndex >= run.start && liveIndex <= end;
		out.push(<StepsGroup key={`steps-${run.start}`} parts={run.parts} live={live}>{run.nodes}</StepsGroup>);
		run = null;
	};
	parts.forEach((part, i) => {
		const node = nodes[i];
		// Empty text between steps (a model's blank preamble) is not content.
		if (isBlankText(part)) return;
		if (isTracePart(part)) {
			run ??= { start: i, parts: [], nodes: [] };
			run.parts.push(part);
			if (node !== null && node !== undefined) run.nodes.push(isValidElement(node) ? node : <Fragment key={`n-${i}`}>{node}</Fragment>);
			return;
		}
		// A plain separator between two trace parts belongs to the run.
		if (run && part.type === "step-start" && isPlainSeparator(node)) {
			let next = i + 1;
			while (next < parts.length && isBlankText(parts[next]!)) next++;
			if (next < parts.length && isTracePart(parts[next]!)) return;
		}
		flush(i - 1);
		if (node === null || node === undefined) return;
		// Rules divide content: never two in a row (an empty step between),
		// never one leading the message.
		if (isPlainSeparator(node) && (out.length === 0 || isPlainSeparator(out[out.length - 1]))) return;
		out.push(node);
	});
	flush(parts.length - 1);
	return Children.toArray(out);
}

function isBlankText(part: Part): boolean {
	return part.type === "text" && !(part.text ?? "").trim();
}

function isPlainSeparator(node: ReactNode): boolean {
	return isValidElement(node) && (node.props as { "data-lh-separator"?: boolean })["data-lh-separator"] === true;
}
