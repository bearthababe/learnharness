/*
 * pcm-capture — the dictation audio path (STT wave, 2026-09-17).
 *
 * Runs OFF the main thread (AudioWorklet): converts the mic's Float32
 * samples to 16-bit little-endian PCM (linear16) and hands buffers to the
 * main thread in two streams:
 *
 *   { type: "level", rms }  — every render quantum (128 samples ≈ 8ms at
 *                             16kHz): the quantum's RMS level, 0..1. This
 *                             is the meter's heartbeat; posting per quantum
 *                             is what makes the meter feel instant (the
 *                             dominant latency in the owner's terminal
 *                             version was a 256ms IO buffer — see
 *                             ~/.pi/agent/extensions/dictate).
 *   { type: "audio", buffer, contextStart, sampleRate } — Int16Array frames
 *                             of 2048 samples (128ms at 16 kHz),
 *                             zero-copy (transferred). Deepgram recommends
 *                             ~100–200ms chunks; silence is streamed too,
 *                             so the socket never idles (no KeepAlive
 *                             needed — the 10s NET-0001 timeout only bites
 *                             a stream that stops SENDING).
 *   { type: "flushed" } — after a "flush" request seals capture and sends
 *                         the final partial packet. No ASR guarantee.
 *
 * Ships as a static file under public/ so it rides the standalone bundle.
 * Plain JS by necessity (worklets run outside the module graph).
 */
class PcmCaptureProcessor extends AudioWorkletProcessor {
	constructor() {
		super();
		this.frame = new Int16Array(2048);
		this.count = 0;
		this.contextStart = 0;
		this.nextFrame = null;
		this.stopped = false;
		// Same final-frame drain as the accepted Notebook prototype. The ack
		// follows the partial packet on this port; it does not certify ASR completion.
		this.port.onmessage = ({ data }) => {
			if (data.type !== "flush" || this.stopped) return;
			this.stopped = true;
			if (this.count) {
				const tail = this.frame.slice(0, this.count);
				this.port.postMessage({ type: "audio", buffer: tail, contextStart: this.contextStart, sampleRate }, [tail.buffer]);
			}
			this.count = 0;
			this.port.postMessage({ type: "flushed" });
		};
	}

	process(inputs) {
		const channel = inputs[0] && inputs[0][0];
		if (!channel || this.stopped) return true; // no input yet — stay alive
		// A suspended/missing quantum must not compress two capture intervals
		// into a falsely continuous provider-to-capture timestamp mapping.
		if (this.count && currentFrame !== this.nextFrame) {
			const tail = this.frame.slice(0, this.count);
			this.port.postMessage({ type: "audio", buffer: tail, contextStart: this.contextStart, sampleRate }, [tail.buffer]);
			this.count = 0;
		}
		this.nextFrame = currentFrame + channel.length;

		// RMS for the meter (float domain, before conversion).
		let sumSquares = 0;
		for (let i = 0; i < channel.length; i++) sumSquares += channel[i] * channel[i];
		this.port.postMessage({ type: "level", rms: Math.sqrt(sumSquares / channel.length) });

		// Float32 → Int16 (clamp first: a hot mic can exceed ±1.0).
		for (let i = 0; i < channel.length; i++) {
			if (!this.count) this.contextStart = (currentFrame + i) / sampleRate;
			const s = Math.max(-1, Math.min(1, channel[i]));
			this.frame[this.count++] = s < 0 ? s * 0x8000 : s * 0x7fff;
			if (this.count === this.frame.length) {
				this.port.postMessage({ type: "audio", buffer: this.frame, contextStart: this.contextStart, sampleRate }, [this.frame.buffer]);
				this.frame = new Int16Array(2048);
				this.count = 0;
			}
		}
		return true;
	}
}

registerProcessor("pcm-capture", PcmCaptureProcessor);
