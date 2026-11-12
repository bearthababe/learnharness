import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createNotebookTutorDrafts } from "../components/notebook-tutor-drafts.ts";
import type { OwnedTutorDraft, TutorDraftOwner } from "../src/core/index.ts";

// P1 (round 20): the composer chip's ✕ takes the notebook working out of a
// draft before it is sent. The server keeps a saved draft's working parts, so
// the draft is discarded and a fresh plain one keeps the learner's own words.
const working = (id: string) => ({ id, kind: "working" as const, snapshotId: id, contextId: "ctx", revision: 3, lines: [{ id: `${id}-l`, latex: "p = F/A" }] as never });
const same = (a: TutorDraftOwner, b: TutorDraftOwner) => JSON.stringify(a) === JSON.stringify(b);

function fakeServer(seed: OwnedTutorDraft[]) {
	let drafts = structuredClone(seed);
	const commands: Array<Record<string, unknown>> = [];
	const view = () => ({ contextId: "ctx", workingRevision: 3, lines: [], tutorDrafts: structuredClone(drafts) }) as never;
	const post = async (command: Record<string, unknown>) => {
		commands.push(structuredClone(command));
		if (command.type === "discard-tutor-draft") {
			const current = drafts.find((d) => same(d.owner, command.owner as TutorDraftOwner));
			assert.ok(current && current.id === command.draftId && current.revision === command.expectedRevision, "discards exactly the saved draft at its revision");
			drafts = drafts.filter((d) => d !== current);
		} else if (command.type === "tutor-draft") {
			const next = command.draft as OwnedTutorDraft;
			const current = drafts.find((d) => same(d.owner, next.owner));
			assert.equal(current?.revision ?? 0, command.expectedRevision, "saves on top of the server's revision");
			if (current) assert.ok(current.parts.filter((p) => p.kind === "working").every((p) => next.parts.some((q) => q.id === p.id)), "never edits saved working out of a draft");
			drafts = [...drafts.filter((d) => d !== current), next];
		} else throw new Error(`unexpected ${String(command.type)}`);
		return { view: view() } as never;
	};
	return { post, view, commands, drafts: () => drafts };
}

describe("removeWorking (the working chip's ✕)", () => {
	it("discards the draft and keeps the learner's words as one plain draft", async () => {
		const owner = { kind: "ordinary" } as const;
		const server = fakeServer([{ id: "d1", owner, revision: 2, parts: [{ id: "t1", kind: "text", text: "Why does it double?" }, working("w1"), { id: "t2", kind: "text", text: "And halve?" }] }]);
		const drafts = createNotebookTutorDrafts("chat", server.post as never, async () => drafts.adopt(server.view()));
		drafts.adopt(server.view());
		await drafts.removeWorking(owner);
		assert.deepEqual(server.commands.map((c) => c.type), ["discard-tutor-draft", "tutor-draft"]);
		const saved = server.drafts();
		assert.equal(saved.length, 1);
		assert.notEqual(saved[0]!.id, "d1", "a fresh draft");
		assert.deepEqual(saved[0]!.parts.map((p) => p.kind === "text" ? p.text : p.kind), ["Why does it double?\n\nAnd halve?"]);
		const shown = drafts.getSnapshot().drafts;
		assert.equal(shown.length, 1);
		assert.ok(!shown[0]!.parts.some((p) => p.kind === "working"), "the chip goes away");
		assert.equal(drafts.getSnapshot().error, null);
	});

	it("leaves nothing behind when there were no words", async () => {
		const owner = { kind: "ordinary" } as const;
		const server = fakeServer([{ id: "d1", owner, revision: 1, parts: [working("w1"), { id: "t1", kind: "text", text: "" }] }]);
		const drafts = createNotebookTutorDrafts("chat", server.post as never, async () => drafts.adopt(server.view()));
		drafts.adopt(server.view());
		await drafts.removeWorking(owner);
		assert.deepEqual(server.commands.map((c) => c.type), ["discard-tutor-draft"]);
		assert.equal(server.drafts().length, 0);
		assert.equal(drafts.getSnapshot().drafts.length, 0);
	});

	it("keeps a question answer's form, with its text joined", async () => {
		const owner = { kind: "question", toolCallId: "q1", channel: "text" } as const;
		const form = { text: "My answer", thinking: "", selection: { selected: [1], otherSelected: false, dontKnow: false } } as never;
		const server = fakeServer([{ id: "d1", owner, revision: 1, parts: [{ id: "t1", kind: "text", text: "My answer" }, working("w1"), { id: "t2", kind: "text", text: "because" }], form }]);
		const drafts = createNotebookTutorDrafts("chat", server.post as never, async () => drafts.adopt(server.view()));
		drafts.adopt(server.view());
		await drafts.removeWorking(owner);
		const saved = server.drafts()[0]!;
		assert.deepEqual(saved.parts.map((p) => p.kind === "text" ? p.text : p.kind), ["My answer\n\nbecause"]);
		assert.equal((saved.form as { text: string }).text, "My answer\n\nbecause");
		assert.deepEqual((saved.form as { selection: unknown }).selection, { selected: [1], otherSelected: false, dontKnow: false }, "the chosen option stays chosen");
	});

	it("does nothing to a draft without working", async () => {
		const owner = { kind: "ordinary" } as const;
		const server = fakeServer([{ id: "d1", owner, revision: 1, parts: [{ id: "t1", kind: "text", text: "Just words" }] }]);
		const drafts = createNotebookTutorDrafts("chat", server.post as never, async () => drafts.adopt(server.view()));
		drafts.adopt(server.view());
		await drafts.removeWorking(owner);
		assert.equal(server.commands.length, 0);
		assert.equal(server.drafts()[0]!.id, "d1");
	});
});
