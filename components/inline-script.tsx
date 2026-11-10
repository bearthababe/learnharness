/**
 * A script that runs while the browser parses the HTML, before the first
 * paint (Next guide: "Preventing flash before hydration"). On the client it
 * renders as inert text/plain, so React never re-runs or warns about it.
 */
export function InlineScript({ html }: { html: string }) {
	return (
		<script
			type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
			suppressHydrationWarning
			dangerouslySetInnerHTML={{ __html: html }}
		/>
	);
}

/** B13 (round 18): the laptop sidebar's remembered state, known before the
 *  first paint. Mirrors SidebarProvider: only the docked sidebar (not phones,
 *  not the tablet drawer) restores "lh:sidebar-open" (open by default), and a
 *  narrow Electron window starts closed. Sets <html data-sidebar-boot>. */
export const SIDEBAR_BOOT_SCRIPT = `try{var d=document.documentElement,m=function(q){return window.matchMedia&&matchMedia(q).matches},s=localStorage.getItem("lh:sidebar-open"),e=navigator.userAgent.indexOf("Electron")>=0;var o=!m("(max-width: 767px)")&&!m("(min-width: 768px) and (max-width: 1023px)")&&(s===null||s==="1")&&!(e&&innerWidth<928);d.dataset.sidebarBoot=o?"open":"closed"}catch(_){}`;
