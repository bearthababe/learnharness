import { handleNotebookRequest } from "@/src/server";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
	return handleNotebookRequest(request, (await params).id);
}
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
	return handleNotebookRequest(request, (await params).id);
}
