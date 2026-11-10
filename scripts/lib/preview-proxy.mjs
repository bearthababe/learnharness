import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import { previewBrowserAdmitted, refusePreviewBrowser } from "./preview-browser-admission.mjs";

const token = /^[!#$%&'*+.^_`|~0-9a-z-]+$/i;
const value = /^[\x21\x23-\x2b\x2d-\x3a\x3c-\x5b\x5d-\x7e]*$/;
const requestHeaders = new Set(["accept", "accept-language", "content-type", "content-length", "range", "if-none-match", "if-modified-since", "origin", "rsc", "next-action", "next-router-state-tree", "next-router-prefetch", "next-url", "x-learnharness-subscriptions"]);
const responseHeaders = new Set(["content-type", "content-length", "content-encoding", "cache-control", "etag", "last-modified", "vary", "accept-ranges", "content-range", "content-disposition", "x-nextjs-cache"]);

export const previewCookiePrefix = ticket => `${new URL(ticket.origin).protocol === "https:" ? "__Host-" : ""}lh-preview-${ticket.id}__`;

export function scopedCookies(cookies, prefix) {
	return (cookies ?? "").split(";").map(cookie => cookie.trim()).filter(cookie => {
		const separator = cookie.indexOf("=");
		return separator > prefix.length && cookie.startsWith(prefix) && token.test(cookie.slice(prefix.length, separator)) && value.test(cookie.slice(separator + 1));
	}).map(cookie => cookie.slice(prefix.length)).join("; ");
}

export function scopedSetCookie(cookie, prefix, secure) {
	if (typeof cookie !== "string" || /[\r\n\x00]/.test(cookie)) return null;
	const [pair, ...attributes] = cookie.split(";").map(part => part.trim());
	const separator = pair.indexOf("=");
	if (separator < 1 || !token.test(pair.slice(0, separator)) || !value.test(pair.slice(separator + 1))) return null;
	const allowed = [];
	const seen = new Set();
	for (const attribute of attributes) {
		const boundary = attribute.indexOf("=");
		const name = (boundary < 0 ? attribute : attribute.slice(0, boundary)).toLowerCase();
		const content = boundary < 0 ? "" : attribute.slice(boundary + 1);
		if (seen.has(name)) return null;
		seen.add(name);
		if (name === "domain") return null;
		if (name === "path" && content !== "/") return null;
		if (name === "max-age") {
			if (!/^-?\d{1,10}$/.test(content)) return null;
			allowed.push(`Max-Age=${content}`);
		} else if (name === "expires") {
			const date = new Date(content);
			if (!Number.isFinite(date.getTime())) return null;
			allowed.push(`Expires=${date.toUTCString()}`);
		} else if (!["path", "secure", "httponly", "samesite"].includes(name)) return null;
	}
	return `${prefix}${pair}; Path=/; SameSite=Strict; HttpOnly${secure ? "; Secure" : ""}${allowed.length ? "; " + allowed.join("; ") : ""}`;
}

export function connectPinnedSocket(socketPath) {
	const descriptor = fs.openSync(socketPath, 0x200000 | fs.constants.O_NOFOLLOW);
	try { assert.ok(fs.fstatSync(descriptor).isSocket(), "Upstream transport must be a socket, not a symlink or file"); }
	catch (error) { fs.closeSync(descriptor); throw error; }
	const connection = net.connect(`/proc/self/fd/${descriptor}`);
	let closed = false;
	const release = () => { if (!closed) { closed = true; fs.closeSync(descriptor); } };
	connection.once("connect", release).once("error", release).once("close", release);
	return connection;
}

export function proxyFor(ticket, socketPath, { ready = () => true } = {}) {
	const prefix = previewCookiePrefix(ticket);
	const origin = new URL(ticket.origin);
	const valid = request => request.headers.host === origin.host && (!request.headers.origin || request.headers.origin === origin.origin) && (!request.headers["sec-fetch-site"] || ["same-origin", "none"].includes(request.headers["sec-fetch-site"])) && !request.url.startsWith("//") && request.url.startsWith("/");
	const headers = request => ({ ...Object.fromEntries(Object.entries(request.headers).filter(([name]) => requestHeaders.has(name))), host: origin.host, "accept-encoding": "identity", cookie: scopedCookies(request.headers.cookie, prefix) });
	const agent = new http.Agent({ keepAlive: false });
	agent.createConnection = () => connectPinnedSocket(typeof socketPath === "function" ? socketPath() : socketPath);
	const server = http.createServer((request, response) => {
		if (!valid(request)) { response.writeHead(403).end("Wrong preview origin"); return; }
		if (!previewBrowserAdmitted(request.headers)) { refusePreviewBrowser(response); return; }
		if (!ready()) { response.writeHead(503).end("Preview is building, stopped or expired"); return; }
		let upstream;
		try {
			upstream = http.request({ host: "localhost", agent, path: request.url, method: request.method, headers: headers(request) }, incoming => {
				const outgoing = Object.fromEntries(Object.entries(incoming.headers).filter(([name]) => responseHeaders.has(name)));
				outgoing.vary = [...new Set(`${outgoing.vary ?? ""}, Sec-CH-UA`.split(",").map(field => field.trim()).filter(Boolean))].join(", ");
				const cookies = (incoming.headers["set-cookie"] ?? []).map(cookie => scopedSetCookie(cookie, prefix, origin.protocol === "https:")).filter(Boolean);
				if (cookies.length) outgoing["set-cookie"] = cookies;
				if (incoming.headers.location) {
					try {
						const target = new URL(incoming.headers.location, origin);
						if (target.origin === origin.origin) outgoing.location = target.href;
					} catch {}
				}
				outgoing["content-security-policy"] = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; frame-src 'none'; worker-src 'none'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; sandbox allow-scripts allow-same-origin allow-forms";
				outgoing["referrer-policy"] = "no-referrer";
				outgoing["connection-allowlist"] = "(response-origin); redirects=allow";
				outgoing["cross-origin-opener-policy"] = "same-origin";
				outgoing["x-content-type-options"] = "nosniff";
				response.writeHead(incoming.statusCode, outgoing);
				incoming.pipe(response);
				incoming.once("error", () => response.destroy());
			});
		} catch { response.writeHead(503).end("Sandbox transport unavailable"); return; }
		upstream.once("error", () => { if (!response.headersSent) response.writeHead(503); response.end("Ticket preview is building or unavailable"); });
		request.once("aborted", () => upstream.destroy());
		response.once("close", () => upstream.destroy());
		request.pipe(upstream);
	});
	server.on("upgrade", (request, socket) => socket.destroy());
	server.stopUpgrades = () => agent.destroy();
	return server;
}
