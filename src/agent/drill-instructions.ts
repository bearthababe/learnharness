import fs from "node:fs";
import path from "node:path";
import { PATHS } from "../../config.ts";
import { effectivePromptSegments } from "./prompt-segments.ts";

/** Code-maintained drill policy, read per turn; shared overrides keep their existing switches. */
export function composeDrillInstructions(switches: Record<string, boolean> = {}): string {
	const policy = fs.readFileSync(path.join(PATHS.root, "src/agent/prompts/drill/10-drill.md"), "utf-8");
	const shared = effectivePromptSegments("practice", switches).filter((segment) => segment.shared);
	return [policy, ...shared.map((segment) => segment.enabled ? segment.overrideText! : segment.sourceText)]
		.map((text) => text.trim())
		.filter(Boolean)
		.join("\n\n---\n\n");
}
