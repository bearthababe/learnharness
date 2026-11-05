"use client";
import { createContext } from "react";
import type { OpenChoice, SnapshotWriting } from "./pages";
export type PageActionResult = { kind: "opened" | "choice" | "failed" | "cancelled"; notice: string | null };
export const HandwritingPagesContext = createContext<{
	openSnapshot: (writing: SnapshotWriting, duplicate?: boolean) => Promise<PageActionResult>;
	choose: (choice: OpenChoice) => Promise<PageActionResult>;
	cancel: () => void;
	annotate: (svg: string) => Promise<PageActionResult>;
} | null>(null);
