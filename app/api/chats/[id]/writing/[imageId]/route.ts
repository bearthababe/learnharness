import { sharedWritingResponse } from "@/src/server";

export async function GET(request: Request, { params }: { params: Promise<{ id: string; imageId: string }> }) {
	const { id, imageId } = await params;
	return sharedWritingResponse(request, id, imageId);
}
