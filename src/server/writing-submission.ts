import { createHash } from "node:crypto";
import type { TurnInput } from "../core/input-events.ts";
import { canonicalWritingInput, matchWritingSubmission, type WritingSubmissionReceipt } from "../core/writing-submission.ts";
import type { LhMessage } from "../core/native-messages.ts";
import { settledTurnResponse } from "./turn-runs.ts";

export function writingSubmissionReceipt(input: TurnInput): WritingSubmissionReceipt | undefined {
	return "submissionId" in input && input.submissionId ? { id: input.submissionId, inputSha256: createHash("sha256").update(canonicalWritingInput(input)).digest("hex") } : undefined;
}
export function writingSubmissionResponse(messages: readonly LhMessage[], receipt?: WritingSubmissionReceipt): Response | undefined {
	if (!receipt) return;
	const match = matchWritingSubmission(messages, receipt);
	if (match === "accepted") return settledTurnResponse();
	if (match === "conflict") return Response.json({ code: "submission_conflict", error: "This submission identity belongs to a different answer.", inputDisposition: "not_accepted" }, { status: 422 });
}
