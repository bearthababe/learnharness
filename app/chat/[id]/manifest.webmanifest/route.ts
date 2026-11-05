import { getChat } from "@/src/server";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;
	if (!/^[A-Za-z0-9_-]+$/.test(id) || !getChat(id)) return new Response(null, { status: 404 });
	const url = `/chat/${id}`;
	return Response.json({
		id: url,
		name: "LearnHarness · " + getChat(id)!.title,
		short_name: "LearnHarness",
		start_url: url,
		scope: url,
		display: "standalone",
		background_color: "#18181b",
		theme_color: "#18181b",
		icons: [{ src: "/writing-touch-icon.png", sizes: "180x180", type: "image/png" }],
	}, { headers: { "Content-Type": "application/manifest+json", "Cache-Control": "no-cache" } });
}
