"use client";

import { useRef, useState } from "react";
import { ActivityIcon, BugIcon, SettingsIcon } from "lucide-react";
import { ActivitySection, failedHelpers, HELPERS_DESCRIPTION, toBlobs, useActivity } from "@/components/activity-dock";
import { useBugPress } from "@/components/bug-capture";
import { useCardDismiss } from "@/components/card-dismiss";
import { MenuShell } from "@/components/menu-shell";
import { useOneMenu } from "@/components/one-menu";
import { useSettingsDialog } from "@/components/settings/settings-dialog";
import { Hint } from "@/components/ui/hint";

/**
 * L1 (round 20): the laptop's folded sidebar keeps a narrow, labelled rail, so
 * Report a problem, Helpers and Settings stay one click away. Each sits where
 * the open sidebar has it: Report at the top, Helpers and Settings at the
 * foot. Laptops only (phones and tablets have them in ⋯), and never in focus
 * mode, which hides the bars. CSS decides when it shows (the boot script's
 * reading before React's own), so loading a page never moves the lesson.
 */
export function FoldedRail({ folded }: { folded: boolean }) {
	const { feed } = useActivity();
	const running = toBlobs(feed).length;
	const failed = failedHelpers(feed.recent ?? []);
	const [helpers, setHelpers] = useState(false);
	const helpersButton = useRef<HTMLButtonElement>(null);
	const bugPress = useBugPress();
	const { open: openSettings } = useSettingsDialog();
	useOneMenu("rail-helpers", helpers, () => setHelpers(false));
	useCardDismiss(helpers, () => setHelpers(false), ['[data-testid="rail-helpers-sheet"]', '[data-testid="rail-helpers"]']);
	const status = failed > 0 ? `${failed} failed` : running > 0 ? `${running} running` : null;
	return (
		<nav className="lh-folded-rail sidebar-motion duration-200" data-folded={folded || undefined} aria-label="App" data-testid="folded-rail" inert={!folded}>
			<div className="lh-rail-inner">
				<Hint label="Report a problem with this screen (hold to keep a menu open)" side="right">
					<button type="button" className="lh-rail-item lh-rail-report" data-testid="rail-report" {...bugPress}>
						<BugIcon aria-hidden />
						<span>Report</span>
					</button>
				</Hint>
				<div className="lh-rail-foot">
					<Hint label={HELPERS_DESCRIPTION} side="right">
						<button ref={helpersButton} type="button" className="lh-rail-item" data-testid="rail-helpers"
							aria-label={status ? `Helpers · ${status}` : "Helpers"} aria-haspopup="dialog" aria-expanded={helpers}
							onClick={() => setHelpers((v) => !v)}>
							<span className="lh-rail-icon">
								<ActivityIcon aria-hidden />
								{status && <span className="lh-rail-dot" data-failed={failed > 0 || undefined} aria-hidden />}
							</span>
							<span aria-hidden>Helpers</span>
						</button>
					</Hint>
					<Hint label="Settings" action="open-settings" side="right">
						<button type="button" className="lh-rail-item" data-testid="rail-settings" onClick={() => openSettings()}>
							<SettingsIcon aria-hidden />
							<span>Settings</span>
						</button>
					</Hint>
				</div>
			</div>
			{helpers && (
				<MenuShell anchorRef={helpersButton} testid="rail-helpers-sheet" preferredSide="up" align="left" onClose={() => setHelpers(false)}
					menuClass="lh-helpers-sheet lh-rail-sheet lh-glass w-[24rem] max-w-[calc(100vw-24px)] rounded-xl border bg-card p-1 shadow-xl">
					<ActivitySection sheet />
				</MenuShell>
			)}
		</nav>
	);
}
