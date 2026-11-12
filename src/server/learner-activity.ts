import { stores } from "./stores.ts";

/**
 * THE LEARNER ACTED HERE (round 14, P15; merge proof E2): the sessions list
 * is ordered by the learner's own activity. Every learner-initiated write
 * that changes the conversation stamps it once that write is accepted:
 *
 * - a message, answer, retry or other input through `POST /api/chat`
 *   (chat-handler);
 * - an Esc-dismissal of a question or problem, written at once or parked
 *   while a turn runs (`POST /api/chats/[id]/dismiss`);
 * - a steer typed while the tutor is still answering
 *   (`POST /api/chats/[id]/steer`);
 * - the demo/figure invert switch (`POST /api/chats/[id]/artifact-ui`).
 *
 * Background writes (a job's result delivered by the wake pipeline, a wake
 * turn, compaction) never call this, so they never move a session.
 * A refused request writes nothing and stamps nothing. The stamp only
 * orders the list; a failure to write it never fails the learner's action.
 * tests/learner-activity-routes.test.ts pins both sides and checks that
 * every route writing the conversation is listed here.
 */
export function noteLearnerActivity(chatId: string): void {
	try { stores.chatStore.markLearnerActivity?.(chatId); } catch { /* the order only; the action stands */ }
}
