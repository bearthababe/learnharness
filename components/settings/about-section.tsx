"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BugIcon } from "lucide-react";
import { SettingsRow } from "./controls.tsx";
import { captureBug } from "@/components/bug-capture";

/**
 * Round 19 (L15, §0): About this app, at the end of Settings — the build this
 * instance runs (when known) and the 🐞 problem reports: how many, the list,
 * and a report of the screen as it is (Settings kept open).
 */
export function AboutSection() {
	const [about, setAbout] = useState<{ buildId: string | null; reports: { bugs: number; changes: number }; reportsFiledTo?: string | null } | null>(null);
	useEffect(() => {
		let live = true;
		void fetch("/api/about", { cache: "no-store" }).then(r => (r.ok ? r.json() : null)).then(value => { if (live) setAbout(value); }).catch(() => {});
		return () => { live = false; };
	}, []);
	const total = about ? about.reports.bugs + about.reports.changes : null;
	return (
		<>
			<SettingsRow label="Build" testid="row-build" hint={<span data-testid="about-build">{about === null ? "…" : about.buildId ?? "Not recorded on this computer"}</span>}>{null}</SettingsRow>
			<SettingsRow label="Problem reports" testid="row-reports"
				hint={<span data-testid="about-reports">{total === null ? "…" : total === 0 ? "None yet. Use 🐞 Report a problem in ⋯." : `${about!.reports.bugs} bug${about!.reports.bugs === 1 ? "" : "s"}, ${about!.reports.changes} change${about!.reports.changes === 1 ? "" : "s"} · kept on this computer${about!.reportsFiledTo ? `, filed in ${about!.reportsFiledTo}` : ""}`}</span>}>
				<Link href="/bugs" className="lh-about-link" data-testid="about-reports-link">See all</Link>
			</SettingsRow>
			<div className="lh-about-report">
				<button type="button" className="lh-about-report-button" data-testid="about-report" onClick={() => captureBug(true)}>
					<BugIcon aria-hidden />Report a problem with this screen
				</button>
			</div>
		</>
	);
}
