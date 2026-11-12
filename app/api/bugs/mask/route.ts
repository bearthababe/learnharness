import { heldKeysWithin } from "@/src/server";

export const dynamic = "force-dynamic";

/**
 * POST {words: string[]} → {held: {word, masked}[]}: which words from the
 * screen a 🐞 screenshot is about to show hold a key this instance holds —
 * the whole word or inside a longer one — each with the key cut out, so the
 * screenshot masks it (round 19 §0: screenshots mask secrets; never put keys
 * in a report). The answer only ever holds words the page sent, cut.
 */
export async function POST(req: Request) {
	let body: { words?: unknown };
	try { body = await req.json(); } catch { return new Response("Bad request", { status: 400 }); }
	const words = Array.isArray(body.words) ? body.words.filter((word): word is string => typeof word === "string" && word.length >= 8 && word.length <= 512).slice(0, 5000) : [];
	return Response.json({ held: heldKeysWithin(words) }, { headers: { "Cache-Control": "no-store" } });
}
