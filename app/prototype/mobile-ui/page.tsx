import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getChat, listChats } from "@/src/server";
import { projectView } from "@/src/core";
import { MobileUIPrototype, type PreviewSession } from "./prototype";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
	title: "LearnHarness · Mobile studies",
	manifest: "/prototype/mobile-ui/manifest.webmanifest",
	appleWebApp: { capable: true, title: "LH Mobile studies", statusBarStyle: "default" },
	icons: { apple: "/prototype/mobile-ui/icon" },
};

/** Throwaway A/B whole-navigation trial. All changes and responses are in memory.
 * Separate route because navigation, overlays and composer are compared together;
 * keeping the production sidebar around either version would invalidate the trial. */
export default async function Page({ searchParams }: { searchParams: Promise<{ variant?: string }> }) {
	if (process.env.NODE_ENV === "production") notFound();
	const { variant } = await searchParams;
	const sessions: PreviewSession[] = listChats().map(summary => {
		const chat = getChat(summary.id);
		return {
			id: summary.id, title: summary.title,
			kind: summary.practiceMode === "drill" ? "Drill" : summary.kind === "practice" ? "Practice" : "Teaching",
			updated: new Date(summary.updatedAt).toISOString().slice(0, 10),
			messages: chat ? projectView(chat.messages).map(m => ({ role: m.role, text: m.parts.filter(p => p.type === "text" && p.text).map(p => p.text).join("\n\n") })).filter(m => m.text.trim()).slice(-4) : [],
		};
	});
	return <MobileUIPrototype initialVariant={variant === "B" ? "B" : "A"} sessions={sessions} />;
}
