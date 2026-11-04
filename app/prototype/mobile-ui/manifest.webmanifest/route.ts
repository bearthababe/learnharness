export function GET() {
	if (process.env.NODE_ENV === "production") return new Response(null, { status: 404 });
	return Response.json({
		id: "/prototype/mobile-ui", name: "LearnHarness Mobile studies", short_name: "LH Studies",
		start_url: "/prototype/mobile-ui?variant=A", scope: "/prototype/mobile-ui", display: "standalone",
		background_color: "#141414", theme_color: "#141414",
		icons: [{ src: "/prototype/mobile-ui/icon", sizes: "180x180", type: "image/png" }],
	}, { headers: { "Content-Type": "application/manifest+json", "Cache-Control": "no-cache" } });
}
