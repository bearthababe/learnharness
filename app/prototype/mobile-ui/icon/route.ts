import { readFileSync } from "node:fs";
import path from "node:path";

export function GET() {
	if (process.env.NODE_ENV === "production") return new Response(null, { status: 404 });
	return new Response(readFileSync(path.join(process.cwd(), "public/writing-touch-icon.png")), {
		headers: { "Content-Type": "image/png", "Cache-Control": "no-cache" },
	});
}
