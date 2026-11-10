// Copied over app/api/chat/route.ts in the owned live-exercise app only (scripts/lib/learning-live-app.mjs).
// D-8 (owner decision 2026-11-10): the real handler and real tool registries, restricted to teaching,
// question and planning tools. Any other tool in a registry refuses the turn. Keep both lists equal to
// TUTOR_TOOLS and DENIED_TOOLS in scripts/lib/learning-live.mjs (tests/verification/learning-live.test.mjs checks this).
import { handleChatRequest, stores, deliverJobResult } from "@/src/server";
import { createProberAgent, createTeacherAgent } from "@/src/agent/teacher-agent";

const ALLOWED = new Set(["probe", "recall", "quiz", "explain", "ask_user_question", "probe_done", "plan_init", "send_to_user"]);
const DENIED = ["read", "ls", "find", "grep", "show_image", "research", "pdf", "demo", "visual", "list_sessions", "list_propositions", "find_candidates"];

export async function POST(req: Request) {
	const body = await req.clone().json();
	return handleChatRequest(req, opts => {
		const ctx = { chatId: body.chatId, chatStore: stores.chatStore, jobStore: stores.jobStore, spawn: () => {}, searchAvailable: () => false, deliver: (steer: Parameters<typeof deliverJobResult>[0]) => void deliverJobResult(steer) };
		const options = { ...opts, toolToggles: { ...(opts.toolToggles ?? {}), ...Object.fromEntries(DENIED.map(name => [name, false])) } };
		const agent = opts.teaching ? createTeacherAgent(ctx, options) : createProberAgent(ctx, options);
		const extra = agent.state.tools.map(tool => tool.name).filter(name => !ALLOWED.has(name));
		if (extra.length) throw new Error(`D-8 tool boundary violated: ${extra.join(", ")}`);
		return agent;
	});
}
