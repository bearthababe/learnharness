"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BookOpenIcon, ChevronRightIcon, DumbbellIcon, TargetIcon } from "lucide-react";
import type { ChatListItem } from "@/src/core";
import { timeAgo } from "@/components/sidebar";

/**
 * Home's "pick up where you left off": the few sessions worth returning to,
 * waiting-for-you first, then the most recent. Shown where the sessions
 * list isn't already on screen (phones and portrait tablets; the wide
 * layout's sidebar carries the same list).
 */
export function ResumeStrip() {
	const [items, setItems] = useState<ChatListItem[] | null>(null);
	useEffect(() => {
		let alive = true;
		fetch("/api/chats")
			.then((res) => (res.ok ? res.json() : null))
			.then((body: { chats?: ChatListItem[] } | null) => { if (alive) setItems(body?.chats ?? []); })
			.catch(() => { if (alive) setItems([]); });
		return () => { alive = false; };
	}, []);
	if (!items || items.length === 0) return null;
	const waits = (c: ChatListItem) => !!c.pendingQuestion || ((c.kind ?? "teach") === "practice" && !!c.pendingProblem);
	const recent = [...items].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
	const picks = [...recent.filter(waits), ...recent.filter((c) => !waits(c))].slice(0, 3);
	return (
		<section className="lh-resume" aria-label="Pick up where you left off" data-testid="resume-strip">
			<div className="lh-resume-label">Pick up where you left off</div>
			<div className="lh-resume-row">
				{picks.map((chat) => {
					const kind = chat.kind === "practice" ? (chat.practiceMode === "drill" ? "drill" : "practice") : "teach";
					const Icon = kind === "drill" ? TargetIcon : kind === "practice" ? DumbbellIcon : BookOpenIcon;
					return (
						<Link key={chat.id} href={`/chat/${chat.id}`} className="lh-resume-card" data-kind={kind} data-waiting={waits(chat) || undefined} data-testid="resume-card">
							<span className="lh-kind-tile" data-kind={kind}><Icon aria-hidden /></span>
							<span className="min-w-0 flex-1">
								<span className="lh-resume-title">{chat.title}</span>
								<span className="lh-resume-meta">{waits(chat) ? "Your turn" : "Continue"} · {timeAgo(chat.updatedAt)}</span>
							</span>
							<ChevronRightIcon className="lh-resume-chevron" aria-hidden />
						</Link>
					);
				})}
			</div>
		</section>
	);
}
