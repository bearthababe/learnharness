import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { DeploymentActivity } from "@/components/deployment-activity";
import localFont from "next/font/local";
import "katex/dist/katex.min.css";
import "./globals.css";
import "@/components/compact-learning-input.css";
import "@/components/notebook-layout.css";
import { AppShell, SidebarProvider } from "@/components/sidebar";
import { ActivityProvider } from "@/components/activity-dock";
import { ServerEventsProvider } from "@/components/server-events";
import { AppearanceProvider } from "@/components/settings/appearance";
import UpdateBanner from "@/components/update-banner";
import { NotebookPreviewTools } from "@/components/notebook-preview-tools";
import { BugCapture } from "@/components/bug-capture";
import { BugRecorder } from "@/components/bug-recorder";
import { InlineScript, SIDEBAR_BOOT_SCRIPT } from "@/components/inline-script";
import { previewCookieBootstrap } from "@/lib/preview-cookie-bootstrap";

const ui = localFont({ src: "../public/fonts/jetbrains-mono/JetBrainsMono.ttf", weight: "100 800", display: "swap", variable: "--font-jetbrains" });
const prose = localFont({ src: "../public/fonts/source-sans-3/SourceSans3.ttf", weight: "200 900", display: "swap", variable: "--font-sans3" });

export const metadata: Metadata = {
	title: "Learning Harness",
	description: "A teacher agent with a memory — sessions, quizzes, and a knowledge graph of what you know.",
	manifest: "/manifest.webmanifest",
	appleWebApp: { capable: true, title: "LearnHarness", statusBarStyle: "default" },
	icons: { apple: "/writing-touch-icon.png" },
	...(process.env.LH_NOTEBOOK_PREVIEW === "1" ? {
		manifest: "/notebook-preview/manifest.webmanifest",
		appleWebApp: { capable: true, title: "Notebook preview", statusBarStyle: "default" as const },
		icons: { apple: "/notebook-preview/apple-touch-icon.png" },
	} : {}),
};

export const viewport: Viewport = {
	width: "device-width",
	initialScale: 1,
	viewportFit: "cover",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
	const documentId = (await headers()).get("x-lh-document");
	const previewCookies = previewCookieBootstrap(process.env.LH_PREVIEW_COOKIE_PREFIX);
	return (
		// suppressHydrationWarning: the sidebar boot script marks <html> before React hydrates.
		<html lang="en" className={`dark ${ui.variable} ${prose.variable}`} suppressHydrationWarning>
			<head>
				{/* Preview cookie isolation first: it patches document.cookie before any other script. */}
				{previewCookies && <script id="lh-preview-cookies" dangerouslySetInnerHTML={{ __html: previewCookies }} />}
				{/* B13 (round 18): the sidebar's remembered state before the first paint. */}
				<InlineScript html={SIDEBAR_BOOT_SCRIPT} />
			</head>
			<body className="min-h-dvh antialiased">
			<DeploymentActivity documentId={documentId} />
			{/* The notification channel rides OUTSIDE everything: sidebar, dock,
				 and pages all subscribe as the polls retire (push S3, 2026-10-02). */}
			<ServerEventsProvider>
				<AppearanceProvider>
					<SidebarProvider>
						<ActivityProvider>
							<AppShell>{children}</AppShell>
						</ActivityProvider>
					</SidebarProvider>
				</AppearanceProvider>
			</ServerEventsProvider>
			{/* Auto-update banner (Wave C): fixed card, Electron-only pushes. */}
			<UpdateBanner />
			{/* §0 (round 19): 🐞 Report a problem — the client log, and the dialog
			    every 🐞 entry opens (the ⋯ menu, the notebook's options, the
			    laptop's sidebar, Settings → About). */}
			<BugRecorder />
			<BugCapture />
			{process.env.LH_NOTEBOOK_PREVIEW === "1" && <NotebookPreviewTools />}
		</body>
		</html>
	);
}
