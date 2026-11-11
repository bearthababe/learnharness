import dgram from "node:dgram";

export async function probeBrowserRTC(page) {
	const endpoint = dgram.createSocket("udp4");
	let datagrams = 0;
	endpoint.on("message", () => { datagrams++; });
	await new Promise((resolve, reject) => { endpoint.once("error", reject); endpoint.bind(0, "127.0.0.1", resolve); });
	try {
		const renderer = await page.evaluate(async port => {
			let peer;
			let candidates = 0;
			try {
				peer = new RTCPeerConnection({ iceServers: [{ urls: `stun:127.0.0.1:${port}` }] });
				peer.onicecandidate = event => { if (event.candidate) candidates++; };
				peer.createDataChannel("owned-boundary-probe");
				await peer.setLocalDescription(await peer.createOffer());
				await new Promise(resolve => setTimeout(resolve, 2500));
				return { candidates };
			} catch (error) { return { candidates, refused: error.name }; }
			finally { peer?.close(); }
		}, endpoint.address().port);
		return { datagrams, renderer };
	} finally { await new Promise(resolve => endpoint.close(resolve)); }
}
