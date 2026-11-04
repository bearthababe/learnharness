/** Device keys and the small successful-session-deletion lifecycle hook. */
import { handwritingTransferDevice } from "./transfer-device.ts";
export const handwritingKey = (id: string) => `lh:handwriting:v1:${id}`;
export const handwritingRecoveryKey = (id: string) => `lh:handwriting:recovery:v1:${id}`;
export const handwritingVisibilityKey = (id: string) => `lh:handwriting:open:${id}`;
export const HANDWRITING_DELETED_EVENT = "lh:handwriting-deleted";

export function clearHandwritingDevice(chatId: string, storage: () => Pick<Storage, "removeItem">) {
	for (const key of [handwritingKey(chatId), handwritingRecoveryKey(chatId), handwritingVisibilityKey(chatId)]) {
		try { storage().removeItem(key); } catch { /* Storage access may be denied; server deletion still prevents replay. */ }
	}
}

/** Called only after successful deletion, including a session not mounted in
 * this window. Notify mounted controllers before any delayed ACK can persist. */
export function forgetHandwritingOnDevice(chatId: string) {
	clearHandwritingDevice(chatId, () => localStorage);
	window.dispatchEvent(new CustomEvent(HANDWRITING_DELETED_EVENT, { detail: chatId }));
	void handwritingTransferDevice.deleteChat(chatId).catch(() => { /* Retain failed cleanup; the server still refuses transfer to the deleted session. */ });
}
