import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { groupTraceParts, isTracePart, StepsGroup } from "../components/steps-group.tsx";

type Part = { type: string; state?: string; errorText?: string; text?: string };
const sep = (key: string) => <hr key={key} data-lh-separator />;

describe("behind-the-scenes steps fold into one line per run", () => {
	it("thinking, lookups and failed calls are trace; content is not", () => {
		assert.equal(isTracePart({ type: "reasoning" }), true);
		assert.equal(isTracePart({ type: "tool-read", state: "output-available" }), true);
		assert.equal(isTracePart({ type: "tool-list_sessions", state: "output-available" }), true);
		assert.equal(isTracePart({ type: "tool-read", state: "input-streaming" }), false, "a call still forming shows live");
		assert.equal(isTracePart({ type: "tool-problem", state: "output-available" }), false, "practice problems stay in the lesson");
		assert.equal(isTracePart({ type: "tool-quiz", state: "output-error", errorText: "bad input" }), true, "a failed retry is housekeeping");
		assert.equal(isTracePart({ type: "tool-quiz", state: "output-error", errorText: "Operation aborted" }), false);
		assert.equal(isTracePart({ type: "text", text: "Hello" }), false);
	});

	it("groups a run, drops separators and empty text inside it, and never doubles rules", () => {
		const parts: Part[] = [
			{ type: "reasoning", text: "plan" },
			{ type: "step-start" },
			{ type: "text", text: "  " },
			{ type: "tool-read", state: "output-available" },
			{ type: "text", text: "The answer." },
			{ type: "step-start" },
			{ type: "step-start" },
			{ type: "text", text: "More." },
		];
		const nodes: ReactNode[] = [
			<p key="r">thinking</p>, sep("s1"), <p key="e" />, <p key="t">lookup</p>,
			<p key="a">The answer.</p>, sep("s2"), sep("s3"), <p key="m">More.</p>,
		];
		const out = groupTraceParts(parts, nodes, null) as ReactElement[];
		assert.equal(out.length, 4, "group, answer, one rule, more");
		assert.ok(isValidElement(out[0]) && out[0].type === StepsGroup);
		const group = out[0] as ReactElement<{ parts: Part[]; live: boolean }>;
		assert.deepEqual(group.props.parts.map((part) => part.type), ["reasoning", "tool-read"]);
		assert.equal(group.props.live, false);
		const html = renderToStaticMarkup(<>{out}</>);
		assert.match(html, /Thinking and 1 step/);
		assert.match(html, /The answer\./);
		assert.equal((html.match(/data-lh-separator/g) ?? []).length, 1);
		assert.doesNotMatch(html, /lookup/, "a folded run renders no body until opened");
	});

	it("the run holding the streaming tail stays folded and says the tutor is working", () => {
		const parts: Part[] = [{ type: "text", text: "Hi" }, { type: "reasoning", text: "…" }];
		const out = groupTraceParts(parts, [<p key="h">Hi</p>, <p key="r">notes</p>], 1) as ReactElement[];
		const group = out[1] as ReactElement<{ live: boolean }>;
		assert.equal(group.props.live, true);
		const html = renderToStaticMarkup(<>{out}</>);
		assert.match(html, /Thinking…/);
		assert.match(html, /lh-steps-pulse/);
		assert.doesNotMatch(html, /notes/, "hidden by default, also while live");
	});
});
