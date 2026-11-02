import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";

test("capture preserves timestamped full and partial audio, including silence, before acknowledging Stop", () => {
	const packets: Array<{ type: string; buffer?: Int16Array; contextStart?: number; sampleRate?: number }> = [];
	let processor!: { process(inputs: Float32Array[][]): boolean; port: { onmessage: (event: { data: { type: string } }) => void } };
	const clock = {
		currentFrame: 160_000, sampleRate: 16000,
		AudioWorkletProcessor: class { port = { postMessage(packet: typeof packets[number]) { packets.push(structuredClone(packet)); } }; },
		registerProcessor(_name: string, constructor: new () => typeof processor) { processor = new constructor(); },
	};
	runInNewContext(readFileSync(new URL("../public/worklets/pcm-capture.js", import.meta.url), "utf8"), clock);
	// 16 full quanta then one partial packet: 128 ms + 8 ms at 16 kHz.
	for (let i = 0; i < 17; i++) {
		const samples = new Float32Array(128);
		if (i === 0) samples.set([1, -1, 2, -2, 0.5]);
		processor.process([[samples]]);
		clock.currentFrame += 128;
	}
	assert.equal(packets.filter(packet => packet.type === "audio").length, 1);
	assert.equal(typeof processor.port.onmessage, "function", "Stop must drain the worklet instead of discarding its tail");
	processor.port.onmessage({ data: { type: "flush" } });
	const audio = packets.filter(packet => packet.type === "audio");
	assert.deepEqual(audio.map(packet => [packet.contextStart, packet.sampleRate, packet.buffer!.length]), [[10, 16000, 2048], [10.128, 16000, 128]]);
	assert.deepEqual(Array.from(audio[0]!.buffer!.slice(0, 6)), [32767, -32768, 32767, -32768, 16383, 0]);
	assert.ok(audio[1]!.buffer!.every(sample => sample === 0), "silence still occupies capture time");
	assert.equal(packets.at(-1)!.type, "flushed", "acknowledgment follows the last audio packet");
	const count = packets.length;
	processor.process([[new Float32Array(128).fill(1)]]);
	processor.port.onmessage({ data: { type: "flush" } });
	assert.equal(packets.length, count, "Stop neither duplicates the tail nor captures later audio");
});

test("a capture gap is represented by separate timestamped packets rather than invented continuous audio", () => {
	const packets: Array<{ type: string; buffer?: Int16Array; contextStart?: number }> = [];
	let processor!: { process(inputs: Float32Array[][]): boolean; port: { onmessage: (event: { data: { type: string } }) => void } };
	const clock = {
		currentFrame: 160_000, sampleRate: 16000,
		AudioWorkletProcessor: class { port = { postMessage(packet: typeof packets[number]) { packets.push(structuredClone(packet)); } }; },
		registerProcessor(_name: string, constructor: new () => typeof processor) { processor = new constructor(); },
	};
	runInNewContext(readFileSync(new URL("../public/worklets/pcm-capture.js", import.meta.url), "utf8"), clock);
	processor.process([[new Float32Array(128).fill(1)]]);
	clock.currentFrame = 161_600;
	processor.process([[new Float32Array(128).fill(-1)]]);
	processor.port.onmessage({ data: { type: "flush" } });
	const audio = packets.filter(packet => packet.type === "audio");
	assert.deepEqual(audio.map(packet => [packet.contextStart, packet.buffer!.length]), [[10, 128], [10.1, 128]]);
	assert.equal(audio[0]!.buffer![127], 32767);
	assert.equal(audio[1]!.buffer![0], -32768);
});
