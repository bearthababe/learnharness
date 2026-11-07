/**
 * POST /api/activity/retry — the Background agents panel's Retry (owner O2,
 * round 12): body {id: jobId}. Re-runs a failed sub-agent job as it was
 * dispatched (server/jobs.ts retryJob); its result reaches the lesson like
 * any job's. Outcomes: not_found -> 404, a job that cannot be retried
 * (still running, already retried, its failure notice still on its way, no
 * saved input) -> 409 with the reason, started -> 200 with the new job id.
 */
import { retryJob } from "@/src/server";

export async function POST(req: Request) {
	let body: unknown;
	try {
		body = await req.json();
	} catch {
		return Response.json({ error: "Invalid JSON body" }, { status: 400 });
	}
	const { id } = (body ?? {}) as { id?: unknown };
	if (typeof id !== "string" || !/^[A-Za-z0-9:_-]+$/.test(id)) {
		return Response.json({ error: "Body must be {id: string}" }, { status: 400 });
	}
	const outcome = retryJob(id);
	if (!outcome.ok) return Response.json({ ok: false, reason: outcome.reason }, { status: outcome.reason === "not_found" ? 404 : 409 });
	return Response.json({ ok: true, jobId: outcome.jobId });
}
