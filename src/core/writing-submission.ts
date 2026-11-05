import type { TurnInput } from "./input-events.ts";
import type { LhMessage } from "./native-messages.ts";
import { canonicalHandwriting } from "./handwriting.ts";
import { activeProblemOf } from "./native-messages.ts";
import { submittedWritingIds } from "./shared-writing.ts";

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

/** Positive canonical evidence only. An absent pending image/target is not
 * evidence: failed or incomplete reads must never unlock a conflicting send. */
export function writingInputObsolete(messages: readonly LhMessage[], input: TurnInput): boolean {
	const consumed = submittedWritingIds(messages);
	if ("writingIds" in input && input.writingIds?.some(id => consumed.has(id))) return true;
	if (input.type === "answer") return messages.some(message => message.role === "toolResult" && message.toolCallId === input.toolCallId);
	if (input.type === "thinking") {
		const posed = messages.some(message => message.role === "assistant" && message.content.some(block => block.type === "toolCall" && block.name === "problem" && block.id === input.problemCallId));
		const acknowledged = messages.some(message => message.role === "toolResult" && message.toolCallId === input.problemCallId && !message.isError);
		return posed && acknowledged && activeProblemOf(messages)?.toolCallId !== input.problemCallId;
	}
	return false;
}
