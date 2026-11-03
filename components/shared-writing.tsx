"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { sharedWritingImageUrl, type LhMessage, type SharedWriting } from "@/src/core";
import { useServerEvent, useServerResync } from "@/components/server-events";

export function useSharedWriting(chatId: string, messages: readonly LhMessage[]) {
	const submittedKey = messages.flatMap((m) => m.sharedWriting?.map((w) => w.id) ?? []).join(",");
	const [pending, setPending] = useState<SharedWriting[]>([]);
	const [error, setError] = useState<string | null>(null);
	const generation = useRef(0);
	const refresh = useCallback(async () => {
		const run = ++generation.current;
		try {
			const response = await fetch(`/api/chats/${encodeURIComponent(chatId)}/writing`, { cache: "no-store" });
			if (!response.ok) throw new Error("Could not check for shared writing. Try again.");
			const result = await response.json() as { pending: SharedWriting[] };
			if (run !== generation.current) return;
			setPending(result.pending);
			setError(null);
		} catch (err) {
			if (run === generation.current) setError(err instanceof Error ? err.message : "Could not check shared writing.");
		}
	}, [chatId]);
	useEffect(() => {
		void refresh();
		return () => { generation.current++; };
	}, [refresh, submittedKey]);
	useEffect(() => {
		const onVisible = () => { if (!document.hidden) void refresh(); };
		window.addEventListener("focus", onVisible);
		document.addEventListener("visibilitychange", onVisible);
		return () => {
			window.removeEventListener("focus", onVisible);
			document.removeEventListener("visibilitychange", onVisible);
		};
	}, [refresh]);
	useServerEvent("writing-changed", (e) => { if (e.chatId === chatId) void refresh(); });
	useServerEvent("record-changed", (e) => { if (e.chatId === chatId) void refresh(); });
	useServerEvent("turn-settled", (e) => { if (e.chatId === chatId) void refresh(); });
	useServerResync(() => void refresh());
	return { pending, error, refresh, ids: () => pending.map((w) => w.id) };
}

export function SharedWritingImages({ chatId, writing }: { chatId: string; writing: readonly SharedWriting[] }) {
	return <div className="flex max-h-32 gap-2 overflow-auto overscroll-contain py-2" data-testid="shared-writing-images">
		{writing.map((item, index) => <a key={item.id} href={sharedWritingImageUrl(chatId, item.id)} target="_blank" rel="noreferrer" className="shrink-0 rounded border bg-white p-1" aria-label={`Open handwritten working ${index + 1}`}>
			{/* Preserve the original pixels; the private endpoint supplies the PNG. */}
			{/* eslint-disable-next-line @next/next/no-img-element */}
			<img src={sharedWritingImageUrl(chatId, item.id)} alt={`Handwritten working ${index + 1}`} className="h-24 max-w-48 object-contain" />
		</a>)}
	</div>;
}

export function SharedWritingPanel({ chatId, writing, busy }: {
	chatId: string;
	writing: ReturnType<typeof useSharedWriting>;
	busy: boolean;
}) {
	const [uploadUrl, setUploadUrl] = useState("");
	const [copied, setCopied] = useState(false);
	useEffect(() => { setUploadUrl(`${location.origin}/api/chats/${encodeURIComponent(chatId)}/writing`); }, [chatId]);
	return <section className="mb-2 rounded-lg border border-border bg-card px-3 py-2 text-xs" aria-label="Shared writing">
		{writing.pending.length > 0 && <>
			<p className="font-medium">{writing.pending.length} shared {writing.pending.length === 1 ? "image" : "images"} · not sent</p>
			<SharedWritingImages chatId={chatId} writing={writing.pending} />
			<p className="text-muted-foreground">{busy ? "Waiting for the tutor to finish. Your writing stays here." : "Review the images, add an explanation below if needed, then send your answer."}</p>
		</>}
		{writing.error && <p role="alert" className="text-destructive">{writing.error} <button type="button" className="underline" onClick={() => void writing.refresh()}>Try again</button></p>}
		<details className={writing.pending.length ? "mt-2" : ""}>
			<summary className="cursor-pointer text-muted-foreground">Share from Concepts · setup & tools</summary>
			<ol className="my-2 list-decimal space-y-1 pl-5">
				<li>Create a Shortcut named <strong>Send to LearnHarness</strong> and enable <strong>Show in Share Sheet</strong>, accepting Images.</li>
				<li>Add <strong>Get Contents of URL</strong> using this session’s URL. Set <strong>Method: POST</strong>, <strong>Request Body: File</strong>, with <strong>Shortcut Input</strong> as the file.</li>
				<li>Add <strong>Show Result</strong> with the HTTP response. A successful upload says “Writing received”.</li>
				<li>In Concepts, export as <strong>PNG</strong>, choose Share, then the shortcut. Return here to review and send.</li>
			</ol>
			<label className="block">This session’s upload URL<input readOnly value={uploadUrl} onFocus={(e) => e.currentTarget.select()} className="my-1 w-full rounded border bg-background p-2" /></label>
			<div className="flex flex-wrap gap-4">
				<button type="button" className="underline" onClick={() => { void navigator.clipboard.writeText(uploadUrl).then(() => setCopied(true)).catch(() => setCopied(false)); }}>{copied ? "Copied" : "Copy upload URL"}</button>
				<button type="button" className="underline" onClick={() => void writing.refresh()}>Check for writing</button>
				<button type="button" className="underline" onClick={() => location.reload()}>Reload preview</button>
			</div>
			<p className="mt-2 text-muted-foreground">Reload keeps uploaded images and saved conversation. Unsent typed text resets.</p>
		</details>
	</section>;
}
