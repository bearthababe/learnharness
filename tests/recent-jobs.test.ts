// The sidebar's Background agents history (whole-app redesign): recent jobs
// across every chat, newest activity first, without touching any one chat's
// listing contract.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, it } from "node:test";

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "lh-recent-jobs-"));
process.env.LH_DATA_DIR = path.join(directory, "data");
const { jobStore, listRecentJobs } = await import("../src/store/jobs.ts");

after(() => fs.rmSync(directory, { recursive: true, force: true }));

it("lists jobs from every chat, newest activity first, capped by the limit", () => {
	const a = jobStore.createJob({ chatId: "chat_a", kind: "research", toolCallId: "t1" } as never);
	const b = jobStore.createJob({ chatId: "chat_b", kind: "pdf", toolCallId: "t2" } as never);
	const c = jobStore.createJob({ chatId: "chat_a", kind: "visual", toolCallId: "t3" } as never);
	jobStore.updateJob(a.id, { status: "done", updatedAt: "2026-01-01T00:00:03.000Z" });
	jobStore.updateJob(b.id, { status: "error", error: "Invalid PDF structure.", updatedAt: "2026-01-01T00:00:02.000Z" });
	jobStore.updateJob(c.id, { status: "done", updatedAt: "2026-01-01T00:00:01.000Z" });
	assert.deepEqual(listRecentJobs(6).map((job) => job.id), [a.id, b.id, c.id]);
	assert.deepEqual(listRecentJobs(2).map((job) => job.id), [a.id, b.id]);
	assert.deepEqual(listRecentJobs(0), []);
	// The per-chat listing is unchanged.
	assert.deepEqual(jobStore.listJobs("chat_a").map((job) => job.id), [a.id, c.id]);
});
