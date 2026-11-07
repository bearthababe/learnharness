import { runtimeStatus } from "@/src/server";

export const dynamic = "force-dynamic";

export function GET() {
	return Response.json(runtimeStatus(), { headers: { "Cache-Control": "no-store" } });
}
