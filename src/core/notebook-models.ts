import { z } from "zod";

/** Owner-selected test candidates. The choice belongs to one learning session. */
export const notebookCandidateSchema = z.enum(["deepseek-low", "terra-off"]);
export type NotebookCandidate = z.infer<typeof notebookCandidateSchema>;
export const DEFAULT_NOTEBOOK_CANDIDATE: NotebookCandidate = "deepseek-low";
export const NOTEBOOK_CANDIDATES = {
	"deepseek-low": { label: "DeepSeek / low · Zen", provider: "opencode", id: "deepseek-v4.1-flash", thinkingLevel: "low" },
	"terra-off": { label: "Terra / off · ChatGPT", provider: "chatgpt", id: "gpt-6.1-terra", thinkingLevel: "off" },
} as const;
