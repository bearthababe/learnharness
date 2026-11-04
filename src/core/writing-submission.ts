import type { TurnInput } from "./input-events.ts";
import type { LhMessage } from "./native-messages.ts";
import { canonicalHandwriting } from "./handwriting.ts";

export type WritingSubmissionReceipt = { id: string; inputSha256: string };
export function canonicalWritingInput(input: TurnInput): string {
	const { submissionId: _identity, ...payload } = input as TurnInput & { submissionId?: string };
	// Browser answer builders include optional undefined fields; JSON transport
	// omits them. Hash the exact wire value on both sides of the receipt check.
	return canonicalHandwriting(JSON.parse(JSON.stringify(payload)));
}
export function matchWritingSubmission(messages: readonly LhMessage[], receipt: WritingSubmissionReceipt): "accepted" | "conflict" | "absent" {
	const existing = messages.find(message => message.writingSubmission?.id === receipt.id)?.writingSubmission;
	return !existing ? "absent" : existing.inputSha256 === receipt.inputSha256 ? "accepted" : "conflict";
}
export type WritingInputOutcome = { disposition: "accepted" | "not_accepted" | "unknown"; original: boolean };
