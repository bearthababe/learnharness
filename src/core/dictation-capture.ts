/** Optional capture observer. Audio/credentials remain owned by useDictation. */
export interface DictationFinal {
	id: string;
	text: string;
	start: number | null;
	end: number | null;
	words: Array<{ text: string; start: number; end: number }>;
	speechFinal: boolean;
	/** A requested flush response is a hint, never proof of cutoff coverage. */
	fromFinalize?: boolean;
}
export interface DictationCaptureRun {
	audio?(start: number, end: number): void;
	final(result: DictationFinal): void;
	incomplete(): void;
	end(reason: "stop" | "interrupted" | "cancel"): Promise<void>;
}
export interface DictationCaptureAdapter {
	begin(clock: { id: string; now: () => number; requestFinalization?: (cutoff: number) => void }): Promise<DictationCaptureRun>;
}

export interface DictationAudioPacket { buffer: ArrayBuffer | Int16Array; contextStart?: number; sampleRate?: number }
export interface DeepgramFinal {
	start?: number;
	duration?: number;
	speech_final?: boolean;
	from_finalize?: boolean;
	channel_index?: number[];
	channel?: { alternatives?: Array<{ transcript?: string; words?: Array<{ word: string; punctuated_word?: string; start: number; end: number }> }> };
}

/** The provider clock starts at the first SENT sample of each socket, not at
 * getUserMedia, socket-open, or result arrival. Silence occupies samples too. */
export function createDictationTimeline(socketId: string) {
	const spans: Array<{ from: number; to: number; context: number | null }> = [];
	let samples = 0;
	let untimed = 0;
	function sent(packet: DictationAudioPacket) {
		const from = samples / 16000;
		samples += packet.buffer.byteLength / 2;
		const context = Number.isFinite(packet.contextStart) && packet.sampleRate === 16000 ? packet.contextStart! : null;
		const prior = spans.at(-1);
		spans.push({ from, to: samples / 16000, context });
		return context !== null && (!prior || prior.context !== null && Math.abs(context - (prior.context + prior.to - prior.from)) <= 1 / 16000);
	}
	function interval(start: number, end: number): [number, number] | null {
		if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start) return null;
		const included = spans.filter(span => span.to > start && span.from < end);
		if (!included.length && start === end) {
			const span = spans.find(span => span.from <= start && span.to >= start);
			return span?.context !== null && span?.context !== undefined ? [span.context + start - span.from, span.context + start - span.from] : null;
		}
		const first = included[0]; const last = included.at(-1);
		if (!first || !last || first.from > start || last.to + 1 / 16000 < end || included.some(span => span.context === null)) return null;
		for (let i = 1; i < included.length; i++) {
			const prior = included[i - 1]!; const next = included[i]!;
			if (Math.abs(next.context! - (prior.context! + prior.to - prior.from)) > 1 / 16000) return null;
		}
		return [first.context! + start - first.from, last.context! + end - last.from];
	}
	function final(message: DeepgramFinal): DictationFinal {
		const alternative = message.channel?.alternatives?.[0];
		const span = interval(message.start!, message.start! + message.duration!);
		const words = (alternative?.words ?? []).map(word => {
			const mapped = interval(word.start, word.end);
			return mapped ? { text: word.punctuated_word ?? word.word, start: mapped[0], end: mapped[1] } : null;
		});
		const identity = Number.isFinite(message.start) && Number.isFinite(message.duration) ? `${message.start}:${message.duration}` : `untimed:${untimed++}`;
		return { id: `${socketId}:${message.channel_index?.join(",") ?? "0"}:${identity}`,
			text: alternative?.transcript ?? "", start: span?.[0] ?? null, end: span?.[1] ?? null,
			words: words.some(word => !word) ? [] : words as DictationFinal["words"], speechFinal: message.speech_final === true,
			...(message.from_finalize === true ? { fromFinalize: true } : {}) };
	}
	return { sent, final };
}
