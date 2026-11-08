"use strict";

const http = require("node:http");
const fs = require("node:fs");
const directory = fs.mkdtempSync("/tmp/lh-native-proxy-");
let origin;
let proxy;
const { previewResponseHeaders } = require("../../../electron/preview-shell.cjs");
const udp = require("node:dgram").createSocket("udp4");
udp.on("message", () => process.send({ udpRequest: true }));
udp.bind(0, "127.0.0.1");
let scenario = "first";
const outsider = http.createServer((request, response) => {
	process.send({ outsiderRequest: request.url });
	response.end("unexpected external request");
});
outsider.on("connection", () => process.send({ outsiderConnection: true }));
const server = http.createServer((request, response) => {
	process.send({ request: request.url });
	for (const [name, value] of Object.entries(previewResponseHeaders(origin))) response.setHeader(name, value);
	if (request.url === "/report") {
		let body = "";
		request.on("data", chunk => { body += chunk; });
		request.on("end", () => { process.send({ report: JSON.parse(body) }); response.end("ok"); });
		return;
	}
	if (request.url === "/download") {
		response.writeHead(200, { "content-disposition": 'attachment; filename="must-not-download.txt"' });
		response.end("synthetic blocked download"); return;
	}
	response.setHeader("content-type", "text/html");
	response.end(`<!doctype html><meta charset="utf-8"><title>Isolated native preview attack fixture</title>
<style>body{background:#172331;color:#eef6ff;font:20px sans-serif;padding:48px}pre{white-space:pre-wrap;font-size:16px}</style>
<h1>Isolated native preview</h1><p>Synthetic loopback diagnostic — not HTTPS or packaged acceptance</p><pre id="result">Attacks running…</pre>
<script>
(async () => {
	const report = { scenario: ${JSON.stringify(scenario)}, beforeCookie: document.cookie, electronAPI: typeof window.electronAPI, require: typeof require, process: typeof process, popup: null };
	document.cookie = "source_canary=${scenario}; Path=/; SameSite=Strict";
	report.afterCookie = document.cookie;
	const external = "http://127.0.0.1:${outsider.address().port}";
	const networkReports = [];
	const observer = new ReportingObserver(entries => networkReports.push(...entries.map(entry => ({ type: entry.type, body: entry.body.toJSON() }))), { buffered: true });
	observer.observe();
	const peer = new RTCPeerConnection({ iceServers: [{ urls: ["stun:127.0.0.1:${udp.address().port}", "turn:127.0.0.1:${outsider.address().port}?transport=tcp"], username: "synthetic", credential: "synthetic" }] });
	report.iceCandidates = [];
	peer.onicecandidate = event => { if (event.candidate) report.iceCandidates.push(event.candidate.candidate); };
	peer.createDataChannel("synthetic-exfiltration-attempt");
	await peer.setLocalDescription(await peer.createOffer());
	await new Promise(resolve => setTimeout(resolve, 800));
	peer.close();
	report.networkReports = networkReports;
	report.popup = window.open(external) === null;
	try { await fetch(external + "/fetch", { method: "POST", body: "must-not-escape" }); report.fetch = "escaped"; } catch (error) { report.fetch = error.name; }
	try { await fetch("file:///etc/passwd"); report.file = "escaped"; } catch (error) { report.file = error.name; }
	try {
		report.worker = await new Promise(resolve => {
			const worker = new Worker("/worker.js");
			worker.onerror = event => { event.preventDefault(); resolve("blocked"); };
			worker.onmessage = () => resolve("escaped");
			setTimeout(() => resolve("timeout"), 1500);
		});
	} catch (error) { report.worker = error.name; }
	try { await navigator.serviceWorker.register("/service-worker.js"); report.serviceWorker = "registered"; } catch (error) { report.serviceWorker = error.name; }
	for (const permission of ["geolocation", "microphone", "camera", "notifications"]) {
		try { report[permission] = (await navigator.permissions.query({ name: permission })).state; } catch (error) { report[permission] = error.name; }
	}
	const image = new Image(); image.src = external + "/image"; document.body.append(image);
	const frame = document.createElement("iframe"); frame.src = external + "/frame"; document.body.append(frame);
	const fileFrame = document.createElement("iframe"); fileFrame.src = "file:///etc/passwd"; document.body.append(fileFrame);
	const download = document.createElement("a"); download.href = "/download"; download.download = "must-not-download.txt"; document.body.append(download); download.click();
	const socket = new WebSocket(external.replace("http", "ws") + "/socket"); socket.onerror = () => {};
	setTimeout(async () => {
		report.location = location.origin;
		document.querySelector("#result").textContent = JSON.stringify(report, null, 2);
		await fetch("/report", { method: "POST", body: JSON.stringify(report) });
		location.href = external + "/navigation";
		setTimeout(() => fetch("/report", { method: "POST", body: JSON.stringify({ scenario: report.scenario, navigationBlocked: location.origin === report.location }) }), 200);
	}, 300);
})().catch(error => fetch("/report", { method: "POST", body: JSON.stringify({ error: error.stack }) }));
</script>`);
});
process.on("message", message => { if (message.scenario) { scenario = message.scenario; process.send({ scenario }); } });
async function start() {
	const { proxyFor } = await import("../../../scripts/lib/preview-proxy.mjs");
	await new Promise(resolve => outsider.listen(0, "127.0.0.1", resolve));
	const socketPath = `${directory}/app.sock`;
	await new Promise(resolve => server.listen(socketPath, resolve));
	const reservation = http.createServer();
	await new Promise(resolve => reservation.listen(0, "127.0.0.1", resolve));
	const port = reservation.address().port;
	await new Promise(resolve => reservation.close(resolve));
	origin = `http://127.0.0.1:${port}`;
	proxy = proxyFor({ id: "native-admission-fixture", origin }, socketPath);
	proxy.prependListener("request", (request, response) => response.once("finish", () => process.send({ browserAdmission: { path: request.url, clientHint: request.headers["sec-ch-ua"] ?? null, status: response.statusCode } })));
	await new Promise(resolve => proxy.listen(port, "127.0.0.1", resolve));
	process.send({ ready: true, origin, outsider: outsider.address().port, udp: udp.address().port });
}
let stopping = false;
async function stop() {
	if (stopping) return;
	stopping = true;
	proxy?.stopUpgrades();
	await Promise.all([proxy, server, outsider].filter(Boolean).map(listener => new Promise(resolve => {
		if (!listener.listening) return resolve();
		listener.close(resolve); listener.closeAllConnections();
	})));
	await new Promise(resolve => udp.close(resolve));
	fs.rmSync(directory, { recursive: true, force: true });
	process.exit(0);
}
process.on("SIGTERM", () => { void stop(); });
process.on("SIGINT", () => { void stop(); });
start().catch(error => { process.stderr.write(`${error.stack}\n`); void stop(); });
