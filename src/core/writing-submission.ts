import type { TurnInput } from "./input-events.ts";
import type { LhMessage } from "./native-messages.ts";
import { canonicalHandwriting } from "./handwriting.ts";

export type WritingSubmissionReceipt = { id: string; inputSha256: string };
export function canonicalWritingInput(input: TurnInput): string {
	if (!("submissionId" in input)) return canonicalHandwriting(input);
	const { submissionId: _identity, ...payload } = input;
	return canonicalHandwriting(payload);
}
export function matchWritingSubmission(messages: readonly LhMessage[], receipt: WritingSubmissionReceipt): "accepted" | "conflict" | "absent" {
	const existing = messages.find(message => message.writingSubmission?.id === receipt.id)?.writingSubmission;
	return !existing ? "absent" : existing.inputSha256 === receipt.inputSha256 ? "accepted" : "conflict";
}
export type WritingInputOutcome = { disposition: "accepted" | "not_accepted" | "unknown"; original: boolean };
