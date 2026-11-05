import { z } from "zod";

/** Frozen model/effort pairs. Legacy pairs remain resolvable for accepted work. */
export const notebookCandidateSchema = z.enum(["deepseek-low", "terra-off", "terra-low", "terra-medium", "terra-high", "terra-xhigh", "terra-max", "sol-low", "sol-medium", "sol-high", "sol-xhigh", "sol-max"]);
export type NotebookCandidate = z.infer<typeof notebookCandidateSchema>;
export const DEFAULT_NOTEBOOK_CANDIDATE: NotebookCandidate = "terra-medium";
export const NOTEBOOK_MODEL_PICKER_VERSION = 2;
const terra = (thinkingLevel: "off" | "low" | "medium" | "high" | "xhigh" | "max") => ({ label: `Terra / ${thinkingLevel} · ChatGPT`, provider: "chatgpt", id: "gpt-6.1-terra", thinkingLevel });
const sol = (thinkingLevel: "low" | "medium" | "high" | "xhigh" | "max") => ({ label: `Sol / ${thinkingLevel} · ChatGPT`, provider: "chatgpt", id: "gpt-6.1-sol", thinkingLevel });
export const NOTEBOOK_CANDIDATES = {
	"deepseek-low": { label: "DeepSeek / low · Zen", provider: "opencode", id: "deepseek-v4.1-flash", thinkingLevel: "low" },
	"terra-off": terra("off"), "terra-low": terra("low"), "terra-medium": terra("medium"),
	"terra-high": terra("high"), "terra-xhigh": terra("xhigh"), "terra-max": terra("max"),
	"sol-low": sol("low"), "sol-medium": sol("medium"), "sol-high": sol("high"), "sol-xhigh": sol("xhigh"), "sol-max": sol("max"),
} as const;
export const NOTEBOOK_PICKER_MODELS = {
	terra: { label: "Terra 6.1 · ChatGPT", candidates: ["terra-off", "terra-low", "terra-medium", "terra-high", "terra-xhigh", "terra-max"] },
	sol: { label: "Sol 6.1 · ChatGPT", candidates: ["sol-low", "sol-medium", "sol-high", "sol-xhigh", "sol-max"] },
} as const;
export type NotebookPickerModel = keyof typeof NOTEBOOK_PICKER_MODELS;
export function notebookPickerModel(candidate: NotebookCandidate): NotebookPickerModel { return candidate.startsWith("sol-") ? "sol" : "terra"; }
export function notebookCandidateFor(model: NotebookPickerModel, current: NotebookCandidate): NotebookCandidate {
	return NOTEBOOK_PICKER_MODELS[model].candidates.find(id => NOTEBOOK_CANDIDATES[id].thinkingLevel === NOTEBOOK_CANDIDATES[current].thinkingLevel) ?? `${model}-medium`;
}
