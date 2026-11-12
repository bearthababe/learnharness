"use client";

import { useState } from "react";
import { NotebookPenIcon, XIcon } from "lucide-react";
import type { TutorDraftOwner } from "@/src/core";
import type { NotebookSession } from "./notebook-session";
import { useNotebookActivityDraft } from "./notebook-activity-draft";

/**
 * P1 (round 20): notebook working waiting to go with the next message (Ask
 * tutor, or Back with working) is a visible, removable chip in the field it
 * goes with — the composer, or the open question's / problem's field. It
 * lives in the activity's notebook draft, so it is there from the moment the
 * working is attached until it is sent or removed, including after a reload.
 * Its arrival is the confirmation (no toast over the lesson).
 */
export function WorkingChip({ session, owner, goesWith = "your next message" }: { session?: NotebookSession; owner: TutorDraftOwner; goesWith?: string }) {
	const owned = useNotebookActivityDraft(session, owner);
	const [removing, setRemoving] = useState(false);
	const working = owned.draft?.parts.filter((part) => part.kind === "working") ?? [];
	if (!session || !working.length) return null;
	const lines = working.reduce((count, part) => count + (part.kind === "working" ? part.lines.length : 0), 0);
	const label = `Your working${lines ? ` · ${lines} ${lines === 1 ? "line" : "lines"}` : ""}`;
	return (
		<div className="lh-working-chip" data-testid="working-chip" role="status" aria-label={`${label} — goes with ${goesWith}`}>
			<NotebookPenIcon aria-hidden />
			{/* The note shares the line when it fits, else takes its own (never cut short). */}
			<span className="lh-working-chip-text">
				<span className="lh-working-chip-label">{label}</span>
				<span className="lh-working-chip-note" aria-hidden="true">goes with {goesWith}</span>
			</span>
			<button type="button" className="lh-working-chip-remove" data-testid="working-chip-remove" aria-label="Remove your working (it stays in your notebook)"
				title="Remove your working (it stays in your notebook)" disabled={removing || owned.blocked}
				onClick={() => { setRemoving(true); void session.tutor.removeWorking(owner).catch(() => {}).finally(() => setRemoving(false)); }}>
				<XIcon aria-hidden />
			</button>
		</div>
	);
}
