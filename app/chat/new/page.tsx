import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * One place to start a session (owner O4, round 12): Home. The old draft
 * start page looked like a second home, so "/chat/new" now lands on Home
 * with the chosen mode selected; old links and the new-session shortcut
 * keep working.
 */
export default async function NewSessionPage({
	searchParams,
}: {
	searchParams: Promise<{ mode?: string }>;
}) {
	const { mode } = await searchParams;
	redirect(`/?mode=${mode === "drill" ? "drill" : mode === "practice" ? "practice" : "teach"}`);
}
