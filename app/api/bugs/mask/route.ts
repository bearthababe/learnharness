import { heldKeysAmong } from "@/src/server";

export const dynamic = "force-dynamic";

/**
 * POST {words: string[]} → {held: string[]}: which words from the screen a
 * 🐞 screenshot is about to show are keys this instance holds, so the
 * screenshot masks them (round 19 §0: screenshots mask secrets; never put
 * keys in a report). The answer only ever holds words the page sent.
 */
export async function POST(req: Request) {
	let body: { words?: unknown };
	try { body = await req.json(); } catch { return new Response("Bad request", { status: 400 }); }
	const words = Array.isArray(body.words) ? body.words.filter((word): word is string => typeof word === "string" && word.length >= 8 && word.length <= 512).slice(0, 5000) : [];
	return Response.json({ held: heldKeysAmong(words) }, { headers: { "Cache-Control": "no-store" } });
}
