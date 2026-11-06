import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Source_Sans_3 } from "next/font/google";
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
import { previewCookieBootstrap } from "@/lib/preview-cookie-bootstrap";

// Chrome = JetBrains Mono, teaching prose = Source Sans 3, titles = CMU
// Serif (the bundled lh-cmu @font-face in globals.css — no CDN).
const ui = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains" });
const prose = Source_Sans_3({ subsets: ["latin"], variable: "--font-sans3" });

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

export default function RootLayout({ children }: { children: React.ReactNode }) {
	const previewCookies = previewCookieBootstrap(process.env.LH_PREVIEW_COOKIE_PREFIX);
	return (
		<html lang="en" className={`dark ${ui.variable} ${prose.variable}`}>
			{previewCookies && <head><script id="lh-preview-cookies" dangerouslySetInnerHTML={{ __html: previewCookies }} /></head>}
			<body className="min-h-dvh antialiased">
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
			{process.env.LH_NOTEBOOK_PREVIEW === "1" && <NotebookPreviewTools />}
		</body>
		</html>
	);
}
