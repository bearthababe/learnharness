"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SidebarToggle } from "@/components/sidebar";
import { HomeButton } from "@/components/app-nav";
import { PageMenuButton } from "@/components/page-menu";

/**
 * Round 19 (§0): the bar of the report pages — Home's own bar (Sessions,
 * Home, ⋯ in the corner), at the same coordinates as every other screen.
 */
export function ReportsBar() {
	return (
		<header className="lh-home-navigation lh-reports-bar flex items-center gap-2 px-3 py-2">
			<div className="flex items-center gap-2">
				<SidebarToggle />
				<HomeButton />
			</div>
			<div className="lh-home-page-menu ml-auto"><PageMenuButton /></div>
		</header>
	);
}

/** Delete a report (a second tap confirms). */
export function DeleteReport({ id }: { id: string }) {
	const router = useRouter();
	const [sure, setSure] = useState(false), [busy, setBusy] = useState(false);
	return (
		<button type="button" className="lh-report-button" data-danger={sure || undefined} data-testid="report-delete" disabled={busy}
			onClick={async () => {
				if (!sure) { setSure(true); window.setTimeout(() => setSure(false), 4000); return; }
				setBusy(true);
				await fetch(`/api/bugs/${id}`, { method: "DELETE" });
				router.push("/bugs");
				router.refresh();
			}}>
			{sure ? "Tap again to delete" : "Delete"}
		</button>
	);
}

export function CopyReportLink({ id }: { id: string }) {
	const [copied, setCopied] = useState(false);
	return (
		<button type="button" className="lh-report-button" data-testid="report-copy"
			onClick={async () => { try { await navigator.clipboard.writeText(`${location.origin}/bugs/${id}`); setCopied(true); } catch { /* not allowed */ } }}>
			{copied ? "✓ Copied" : "Copy link"}
		</button>
	);
}
