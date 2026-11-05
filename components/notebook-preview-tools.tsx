"use client";

/** Only mounted by the explicitly enabled integration preview. No offline cache. */
export function NotebookPreviewTools() {
	return <button type="button" className="fixed right-2 top-2 z-50 rounded border border-border bg-background px-2 py-1 text-xs shadow-sm" onClick={() => window.location.reload()}>Reload preview</button>;
}
