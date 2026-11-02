import { z } from "zod";
import type { ThinkingLevel } from "@earendil-works/pi-agent-core";
import type { CallUsage } from "./chat.ts";
import type { LhMessage } from "../native-messages.ts";
import type { QuestionFormDraft, QuestionAnswerData } from "../question-core.ts";

export interface NotebookLine { id: string; latex: string }
export interface NotebookState { lines: NotebookLine[]; undo: NotebookLine[][] }
export interface NotebookHistoryEntry { id: string; lines: NotebookLine[] }
export interface SavedNotebookHistoryEntry extends NotebookHistoryEntry {
	sourceContextId: string;
	sourceRevision: number;
	createdAt: string;
}
export interface NotebookExchange {
	instruction: string;
	selection: { lineId: string; text: string } | null;
	cursorLineId: string | null;
	response: NotebookResponse | null;
	error?: string;
	notebookAfter: NotebookLine[];
}
export interface NotebookEditorInput {
	state: NotebookState;
	instruction: string;
	selection?: { lineId: string; text: string } | null;
	cursorLineId?: string | null;
	history?: NotebookExchange[];
	notebookHistory?: NotebookHistoryEntry[];
}

const operation = z.discriminatedUnion("op", [
	z.object({ op: z.literal("replace"), id: z.string(), latex: z.string() }).strict(),
	z.object({ op: z.literal("insert"), after: z.string().nullable(), id: z.string().regex(/^L[1-9]\d*$/), latex: z.string() }).strict(),
]);
export const notebookResponseSchema = z.discriminatedUnion("action", [
	z.object({ action: z.literal("edit"), operations: z.array(operation).min(1) }).strict(),
	z.object({ action: z.literal("question"), question: z.string().trim().min(1) }).strict(),
	z.object({ action: z.literal("undo") }).strict(),
]);
export type NotebookResponse = z.infer<typeof notebookResponseSchema>;

export interface NotebookAttemptRecord {
	id: string;
	model: string;
	returnedModel?: { provider: string; id: string };
	thinkingLevel?: ThinkingLevel;
	at: string;
	elapsedMs: number;
	usage: CallUsage | null;
	failure?: "format" | "provider";
	error?: string;
	raw?: string;
}
export interface NotebookOperation {
	id: string;
	sequence: number;
	contextId: string;
	kind: "edit" | "undo" | "start-fresh";
	instruction?: string;
	cursorLineId?: string | null;
	acceptedAt: string;
	status: "queued" | "running" | "result-ready" | "applied" | "clarification" | "failed" | "unknown" | "recovered";
	baseRevision?: number;
	execution?: { id: string; model: string; input: NotebookEditorInput; attempts: NotebookAttemptRecord[]; unobservedCall?: boolean };
	result?: { state: NotebookState; response: NotebookResponse | null; exchanges: NotebookExchange[]; error?: string };
	appliedRevision?: number;
	error?: string;
}
export interface NotebookRecord {
	revision: number;
	visible: boolean;
	current: { id: string; revision: number; state: NotebookState; exchanges: NotebookExchange[] };
	/** Absent on sessions saved before history support. */
	history?: SavedNotebookHistoryEntry[];
	notebookDraft: { id: string; revision: number; text: string };
	nextSequence: number;
	operations: NotebookOperation[];
	tutorDrafts?: OwnedTutorDraft[];
	snapshots?: WorkingSnapshot[];
	submissions?: NotebookSubmissionReceipt[];
	speechRuns?: NotebookSpeechRun[];
}
export type NotebookSpeechTarget =
	| { kind: "notebook"; draftId: string }
	| { kind: "tutor"; owner: TutorDraftOwner; draftId: string; partId: string };
export interface NotebookSpeechFragment {
	id: string;
	start: number | null;
	end: number | null;
	text: string;
	target: NotebookSpeechTarget | null;
}
export interface NotebookSpeechRun {
	id: string;
	revision: number;
	status: "recording" | "revealed" | "interrupted" | "cancelled";
	incomplete: boolean;
	fragments: NotebookSpeechFragment[];
	/** Server-computed placement failures; never silently retarget an input. */
	unplaced?: string[];
	discarded?: string[];
}
export interface NotebookDraftReference {
	draftId: string;
	draftRevision: number;
	owner: TutorDraftOwner;
}
export interface NotebookSubmission extends NotebookDraftReference {
	id: string;
	additionalDrafts?: NotebookDraftReference[];
}
export interface NotebookSubmissionReceipt {
	answer?: QuestionAnswerData;
	submission: NotebookSubmission;
	explanation: LearnerExplanation;
	message: LhMessage;
	status: "pending" | "delivered";
}
export type TutorDraftOwner =
	| { kind: "ordinary" }
	| { kind: "question"; toolCallId: string; channel: "text" | "thinking" | "reading-thinking" }
	| { kind: "practice"; problemCallId: string };
export interface WorkingSnapshot {
	id: string;
	contextId: string;
	revision: number;
	lines: NotebookLine[];
	owner: TutorDraftOwner;
	draftId: string;
}
export type LearnerExplanationPart =
	| { id: string; kind: "text"; text: string }
	| { id: string; kind: "working"; snapshotId: string; contextId: string; revision: number; lines: NotebookLine[] };
export type LearnerExplanation = LearnerExplanationPart[];
export interface OwnedTutorDraft {
	id: string;
	owner: TutorDraftOwner;
	revision: number;
	parts: LearnerExplanation;
	form?: Omit<QuestionFormDraft, "selection"> & { selection: { selected: number[]; otherSelected: boolean; dontKnow: boolean } };
}
export type NotebookCommand =
	| { type: "speech-run"; expectedRevision: number; run: NotebookSpeechRun }
	| { type: "discard-speech"; runId: string; fragmentId: string }
	| { type: "discard-tutor-draft"; owner: TutorDraftOwner; draftId: string; expectedRevision: number }
	| { type: "visibility"; visible: boolean }
	| { type: "draft"; expectedRevision: number; text: string }
	| { type: "tutor-draft"; expectedRevision: number; draft: OwnedTutorDraft }
	| { type: "snapshot"; id: string; owner: TutorDraftOwner; draftId: string; expectedRevision: number; continuationId: string; contextId?: string; workingRevision?: number }
	| { type: "apply"; id: string; contextId: string; draftRevision: number; instruction: string; cursorLineId?: string | null }
	| { type: "undo" | "start-fresh"; id: string; contextId: string };
export interface NotebookUsage {
	calls: number;
	unknownCalls: number;
	subscriptionCalls: number;
	unpricedCalls: number;
	apiSubtotal: number;
	tokens: number;
}
/** Deliberate learner projection: no prompt, raw provider output or executor input. */
export interface NotebookView {
	revision: number;
	visible: boolean;
	contextId: string | null;
	workingRevision: number;
	lines: NotebookLine[];
	history: SavedNotebookHistoryEntry[];
	startFreshPending: boolean;
	canUndo: boolean;
	draft: { id: string; revision: number; text: string };
	pending: { id: string; kind: NotebookOperation["kind"]; status: NotebookOperation["status"] } | null;
	problem: { operationId: string; instruction?: string; status: "failed" | "clarification" | "unknown"; message: string } | null;
	usage: NotebookUsage;
	tutorDrafts?: OwnedTutorDraft[];
	submissions?: Array<Pick<NotebookSubmissionReceipt, "submission" | "status" | "explanation">>;
	speechRuns?: NotebookSpeechRun[];
}
export interface NotebookCommandReceipt { id?: string; view: NotebookView }
