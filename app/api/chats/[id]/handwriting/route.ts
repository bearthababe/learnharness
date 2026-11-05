import { handwritingResponse } from "@/src/server";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
	return handwritingResponse(request, (await params).id);
}
export const PUT = GET;
