import { handwritingPagesResponse } from "@/src/server";
export async function GET(request: Request, { params }: { params: Promise<{ id: string; pageId: string }> }) { const { id, pageId } = await params; return handwritingPagesResponse(request, id, pageId); }
export async function PUT(request: Request, { params }: { params: Promise<{ id: string; pageId: string }> }) { const { id, pageId } = await params; return handwritingPagesResponse(request, id, pageId); }
