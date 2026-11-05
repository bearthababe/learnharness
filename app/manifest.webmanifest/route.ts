export function GET() {
	return Response.json({
		id: "/",
		name: "LearnHarness",
		short_name: "LearnHarness",
		start_url: "/",
		scope: "/",
		display: "standalone",
		background_color: "#18181b",
		theme_color: "#18181b",
		icons: [{ src: "/writing-touch-icon.png", sizes: "180x180", type: "image/png" }],
	}, { headers: { "Content-Type": "application/manifest+json", "Cache-Control": "no-cache" } });
}
