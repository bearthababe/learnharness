import { sharedWritingSourceResponse } from "@/src/server";

export async function GET(_request: Request, context: { params: Promise<{ id: string; imageId: string }> }) {
	const { id, imageId } = await context.params;
	return sharedWritingSourceResponse(id, imageId);
}
