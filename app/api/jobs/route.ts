import { isTurnRunning, listChats, listJobs, listRecentJobs } from "@/src/server";

export const dynamic = "force-dynamic";

/**
 * Job status endpoint (contracts.ts "THE ASYNC PROTOCOL" §4): the chat
 * view's jobs fetch lands here — once on mount, per jobs-changed
 * announcement (the store emits post-write, debounced client-side), and
 * on channel resync (push-architecture S4, 2026-10-02 — the old interval
 * poll is retired). It drives the dispatch cards, the sub-agents panel,
 * and the re-sync when a job settles. `turnInFlight` rides along for the
 * settle logic's idle check.
 */
export async function GET(req: Request) {
	const params = new URL(req.url).searchParams;
	// The sidebar's Background agents history: recent jobs across sessions
	// that still exist, with the session title for the link.
	if (params.has("recent")) {
		const titles = new Map(listChats().map((c) => [c.id, c.title]));
		const recent = listRecentJobs(24)
			.filter((job) => job.status !== "running" && titles.has(job.chatId))
			.slice(0, 6)
			.map((job) => ({ id: job.id, chatId: job.chatId, chatTitle: titles.get(job.chatId)!, kind: job.kind, status: job.status, error: job.error ?? null, updatedAt: job.updatedAt }));
		return Response.json({ recent });
	}
	const chatId = params.get("chatId");
	if (!chatId) {
		return Response.json({ error: "chatId query parameter is required" }, { status: 400 });
	}
	if (!/^[A-Za-z0-9_-]+$/.test(chatId)) {
		return Response.json({ error: "Invalid chatId" }, { status: 400 });
	}
	return Response.json({ jobs: listJobs(chatId), turnInFlight: isTurnRunning(chatId) });
}
