import { sharedWritingResponse } from "@/src/server";

export async function GET(request: Request, { params }: { params: Promise<{ id: string; imageId: string }> }) {
	const { id, imageId } = await params;
	return sharedWritingResponse(request, id, imageId);
}

/** Take a pending snapshot out of the next message (the image stays saved). */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string; imageId: string }> }) {
	const { id, imageId } = await params;
	return sharedWritingResponse(request, id, imageId);
}
