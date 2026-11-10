import assert from "node:assert/strict";
import { execFileSync, fork } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import os from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import puppeteer from "puppeteer-core";
import { createAdmission } from "../electron/local-service-ingress.cjs";
import { buildIdentity } from "../electron/deployment-build.cjs";
import { alive, delay, freePort, git, ownerOf, ownedGroup, readState } from "./lib/ticket-state.mjs";
import { monotonicMilliseconds, spawnSandbox } from "./lib/preview-sandbox.mjs";

const { values } = parseArgs({ options: { spec: { type: "string" }, node: { type: "string" }, run: { type: "string" }, "retry-of": { type: "string" } } });
assert.ok(values.spec && values.node, "Usage: node scripts/prove-managed-preview.mjs --spec PRIVATE_SPEC --node OWNED_NODE_JSON [--run EVIDENCE_DIRECTORY]");
const root = path.resolve(import.meta.dirname, "..");
const projectRoot = "/home/bjorn/repo/teach/learnharness";
const stamp = new Date().toISOString().replaceAll(":", "-");
const run = path.resolve(values.run ?? path.join(root, ".prove-it", "runs", `${stamp}-managed-preview`));
assert.ok(!fs.existsSync(run), "Use a fresh evidence directory");
fs.mkdirSync(run, { recursive: true, mode: 0o700 });
const external = fs.mkdtempSync(path.join(os.homedir(), ".cache/learnharness/managed-proof-"));
const home = path.join(external, "home");
const registry = path.join(external, "registry");
fs.mkdirSync(home, { mode: 0o700 });
const helperDirectory = fs.mkdtempSync("/tmp/lh-mph-");
const node = JSON.parse(fs.readFileSync(values.node, "utf8"));
const normalHostname = "thinkpad.tailfd9bf6.ts.net";
const normalOrigin = `https://${normalHostname}:8452`;
const browserPath = "/home/bjorn/.cache/puppeteer/chrome/linux-152.0.7977.42/chrome-linux64/chrome";
const ticketId = "zz-prove-it-managed";
const env = { PATH: process.env.PATH, HOME: home, XDG_CONFIG_HOME: path.join(home, ".config"), XDG_CACHE_HOME: path.join(home, ".cache"), XDG_DATA_HOME: path.join(home, ".local/share"), LH_DATA_DIR: path.join(external, "data"), LH_AUTH_FILE: path.join(external, "auth.json"), LH_IGNORE_ENV_KEYS: "1", NEXT_TELEMETRY_DISABLED: "1", LANG: "C.UTF-8" };
const checksum = filename => createHash("sha256").update(fs.readFileSync(filename)).digest("hex");
const titles = ["Exact main eligibility and retry", "Idle gating and interrupted preparation", "Shared profile and packaged native parity", "External storage and migration", "Backup rotation and restore", "Code-only rollback", "Browser/desktop preview isolation", "Optional subscriptions and model choice", "Hard expiry, stop and queue advancement", "Existing behavior and route ownership"];
const record = { schemaVersion: 1, status: "running", deploymentAcceptance: "BLOCKED", checker: "automation driver; builder rehearsal only, not a final independent verdict", startedAt: new Date().toISOString(), source: { ...buildIdentity(root), dirty: git(root, "status", "--porcelain"), base: git(root, "merge-base", "HEAD", "origin/main") }, spec: { path: path.resolve(values.spec), sha256: checksum(values.spec) }, environment: { root, projectRoot, browserPath, transport: "actual authorized private HTTPS; no TLS/DNS exceptions", registry, home, helperDirectory }, checks: titles.map((flow, index) => ({ number: index + 1, status: "blocked", flow, answerKey: `Approved private spec §4 row ${index + 1}`, expected: "Every required surface and observation in the approved row", observed: "Scoped builder rehearsal cannot accept the complete deployment row", commands: [], artifacts: [], startedAt: null, finishedAt: null })), scopedChecks: [], failures: [], retries: [], limitations: ["All ten deployment rows remain BLOCKED; this is a scoped builder rehearsal", "No packaged build/native launch, physical device or live provider compatibility claim", "One authorized preview hostname, so multi-source FIFO/queue advancement is not exercised", "Source may change during this shared-checkout run; prepared source identity, not final integration source, is authoritative", "Synthetic normal admission backend is not normal LearnHarness/native parity"], owned: { registry, external, helperDirectory, ports: [3800, 3801, 3802, 18150], daemonBorrowed: node.owner }, activity: [], network: [] };
if (values["retry-of"]) record.retries.push({ evidence: path.resolve(values["retry-of"]), reason: "Previous attempt retained unchanged. This run exercises the currently fingerprinted verifier and product source; consult both receipts for the exact failure and correction." });
const write = (filename, value) => { const temporary = path.join(run, `${filename}.tmp`); fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 }); fs.renameSync(temporary, path.join(run, filename)); };
const save = () => { write("deployment.json", record); write("scoped-result.json", { status: record.status, scopedChecks: record.scopedChecks, failures: record.failures, cleanup: record.cleanup, limitations: record.limitations }); };
const raw = (program, args) => execFileSync(program, args, { cwd: root, env, encoding: "utf8", timeout: 35_000, maxBuffer: 4 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
const routes = dedicated => JSON.parse(raw("/usr/bin/tailscale", [...(dedicated ? [`--socket=${node.socket}`] : []), "serve", "status", "--json"]));
const cli = (...args) => {
 const command = ["scripts/ticket.mjs", ...args, "--root", projectRoot, "--state-dir", registry];
 try { const output = raw(process.execPath, command); record.commands ??= []; record.commands.push({ command: [process.execPath, ...command], output: JSON.parse(output), at: new Date().toISOString() }); save(); return JSON.parse(output); }
 catch (error) { write(`cli-failure-${record.failures.length}.json`, { command, stdout: String(error.stdout ?? ""), stderr: String(error.stderr ?? ""), error: error.message }); throw error; }
};
const check = async (name, operation) => {
 const entry = { name, status: "running", startedAt: new Date().toISOString() }; record.scopedChecks.push(entry); save();
 try { entry.observed = await operation(); entry.status = "passed"; return entry.observed; }
 catch (error) { entry.status = "failed"; entry.error = error.stack; record.failures.push({ name, error: error.stack, at: new Date().toISOString() }); throw error; }
 finally { entry.finishedAt = new Date().toISOString(); save(); }
};
const inspectTLS = url => new Promise((resolve, reject) => {
 const request = https.get(url, { timeout: 60_000, agent: false }, response => { const observation = { status: response.statusCode, authorized: response.socket.authorized, protocol: response.socket.getProtocol() }; response.resume(); response.once("end", () => resolve(observation)); });
 request.once("timeout", () => request.destroy(new Error("Private HTTPS timed out"))); request.once("error", reject);
});
let helper;
let helperReady;
let browser;
let page;
let normal;
let normalServer;
let first;
let second;
let beforeRoutes;
let admission;
let normalWrites = 0;
const normalRequests = [];
const normalSockets = new Set();
async function helperMessage(operation) {
 return new Promise((resolve, reject) => {
  const timeout = setTimeout(() => { helper.off("message", receive); reject(new Error("Helper IPC timed out")); }, 10_000);
  const receive = message => { if (!message.stats) return; clearTimeout(timeout); helper.off("message", receive); resolve(message); };
  helper.on("message", receive); helper.send({ op: operation });
 });
}
const admin = (operation, lease) => {
 const command = ["scripts/preview-subscriptions.mjs", operation, helperDirectory, ticketId, lease];
 const output = JSON.parse(raw(process.execPath, command)); record.commands.push({ command: [process.execPath, ...command], output, at: new Date().toISOString() }); save(); return output;
};
async function api(route, method = "GET", body) {
 return page.evaluate(async ({ route, method, body }) => {
  const response = await fetch(route, { method, headers: { "Content-Type": "application/json", "x-learnharness-subscriptions": "1" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(40_000) });
  const text = await response.text(); let data; try { data = JSON.parse(text); } catch { data = text; } return { status: response.status, data };
 }, { route, method, body });
}
async function probeBrowserEgress() {
 try {
  await page.setBypassCSP(true);
  const response = await page.reload({ waitUntil: "domcontentloaded", timeout: 60_000 });
  assert.equal(response.headers()["connection-allowlist"], "(response-origin); redirects=allow");
  record.negativeControlExceptions ??= [];
  record.negativeControlExceptions.push({ scope: "browser egress diagnostic only, not ingress proof", method: "CSP bypassed; production Connection-Allowlist remains on the wire", ingressProof: "Separate trusted-HTTPS diagnostic after manager cleanup" });
  save();
  return await page.evaluate(async origin => { try { const response = await fetch(origin + "/api/write", { method: "POST", credentials: "include", headers: { "Content-Type": "text/plain" }, body: "denied" }); return { status: response.status }; } catch (error) { return { browserRefusal: error.name }; } }, normalOrigin);
 } finally {
  await page.setBypassCSP(false);
  const restored = await page.reload({ waitUntil: "domcontentloaded", timeout: 60_000 });
  assert.equal(restored.headers()["connection-allowlist"], "(response-origin); redirects=allow");
 }
}
function runIngressControl() {
 const directory = path.join(run, "ingress-negative-control");
 fs.mkdirSync(directory, { mode: 0o700 });
 const command = [path.join(root, "scripts/prove-preview-tailnet.mjs"), directory, path.resolve(values.node), normalOrigin, "3810"];
 record.commands ??= []; record.commands.push({ command: [process.execPath, ...command], at: new Date().toISOString() }); save();
 const log = fs.openSync(path.join(directory, "drive.log"), "wx", 0o600);
 try { execFileSync(process.execPath, command, { cwd: root, env: { ...env, CHROMIUM_PATH: browserPath }, timeout: 180_000, stdio: ["ignore", log, log] }); }
 finally { fs.closeSync(log); }
 const result = JSON.parse(fs.readFileSync(path.join(directory, "result.json"), "utf8"));
 assert.equal(result.status, "passed-scoped-builder-checks");
 const ingress = result.steps.find(step => step.name === "both-ingresses-deny-same-site-CSRF");
 assert.ok(ingress, "The independent ingress probe must run, not just browser-side blocking");
 for (const target of [ingress.observed.normal, ingress.observed.preview]) {
  assert.equal(target.post.status, 403); assert.equal(target.post.hasSessionCookie, true); assert.equal(target.post.site, "same-site");
  assert.equal(target.image.status, 403); assert.equal(target.image.hasSessionCookie, true);
 }
 assert.equal(ingress.observed.writes, 0); assert.equal(ingress.observed.previewWrites, 0);
 for (const field of ["ownedBrowserStopped", "listenersClosed", "disposableRoutesRemoved", "originalRoutesUnchanged"]) assert.equal(result.cleanup[field], true);
 record.cleanup.ingressDiagnosticStopped = true;
 return { directory, actualCookieBearingPostAndImage403OnBoth: true, normalWrites: 0, previewWrites: 0, negativeControlExceptions: result.negativeControlExceptions };
}
async function ready() {
 const started = Date.now();
 for (;;) {
  const state = readState(registry); const ticket = state.tickets[ticketId];
  assert.ok(alive(state.manager), "Manager exited; inspect retained manager.log");
  assert.ok(!["error", "none"].includes(ticket.preview), `Managed preview failed: ${ticket.error}; inspect retained profile/server.log`);
  if (ticket.preview === "running") { assert.ok(ticket.sandbox?.sourceHash && ticket.sandbox.revision); return structuredClone(ticket); }
  assert.ok(Date.now() - started < 600_000, "Actual ten-minute lease elapsed before readiness");
  await delay(500);
 }
}
async function openPreview(ticket) {
 const response = await page.goto(ticket.origin, { waitUntil: "domcontentloaded", timeout: 60_000 });
 await page.bringToFront();
 assert.equal(response.status(), 200); assert.match(await page.$eval("body", element => element.textContent), /LearnHarness|model|session|Set up/i);
 const runtime = await api("/api/runtime"); write(`runtime-${ticket.claim}.json`, runtime);
 assert.equal(runtime.status, 200); assert.equal(runtime.data.revision, ticket.sandbox.revision); assert.equal(runtime.data.sourceHash, ticket.sandbox.sourceHash);
 return runtime;
}
async function catalog() { const response = await api("/api/models"); assert.equal(response.status, 200); return response.data.models; }
async function switchModels(models) {
 const settings = await api("/api/settings/models", "PUT", Object.fromEntries(["strong", "cheap", "vision"].map(slot => [slot, { model: { provider: models[0].provider, id: models[0].id } }])));
 write("model-slot-setup.json", settings);
 assert.equal(settings.status, 200);
 const chat = await api("/api/chats", "POST", { title: "zz-prove-it-managed retained expiry marker" }); assert.equal(chat.status, 200); record.chatId = chat.data.id; save();
 await page.goto(`${first.origin}chat/${chat.data.id}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
 await page.waitForSelector('[data-testid="stats-model"]', { visible: true, timeout: 20_000 });
 const switched = [];
 for (const model of models) {
  await page.click('[data-testid="stats-model"]');
  await page.waitForSelector('[data-testid="model-search"]', { visible: true });
  await page.click('[data-testid="model-search"]', { clickCount: 3 }); await page.keyboard.press("Backspace");
  await page.type('[data-testid="model-search"]', model.id);
  const selector = `[data-testid="model-option-${model.id.replace(/[^a-z0-9-]/gi, "_")}"]`;
  await page.waitForSelector(selector, { visible: true });
  const persisted = page.waitForResponse(response => response.url().includes(`/api/chats/${chat.data.id}/settings`) && response.request().method() === "PUT", { timeout: 20_000 });
  await page.click(selector); assert.equal((await persisted).status(), 200);
  await page.waitForFunction(modelId => document.querySelector('[data-testid="stats-model"]')?.parentElement?.textContent?.length > 0 && !document.querySelector('[data-testid="model-search"]'), {}, model.id);
  const saved = await api(`/api/chats/${chat.data.id}`); write(`selected-${switched.length}.json`, saved);
  assert.equal(saved.status, 200); assert.equal(saved.data.settings.model.id, model.id); assert.equal(saved.data.settings.model.provider, model.provider);
  await page.screenshot({ path: path.join(run, `model-${switched.length}.png`), fullPage: true });
  switched.push({ provider: model.provider, id: model.id });
 }
 return switched;
}
save();
try {
 await check("authorized ownership, free ports and unchanged routes preflight", async () => {
  assert.ok(alive(node.owner), "Authorized daemon identity does not match owner metadata");
  const dedicated = JSON.parse(raw("/usr/bin/tailscale", [`--socket=${node.socket}`, "status", "--json"]));
  assert.equal(dedicated.BackendState, "Running"); assert.equal(dedicated.Self?.Online, true);
  record.previewHostname = dedicated.Self.DNSName.replace(/\.$/, "");
  beforeRoutes = routes(false); write("routes-before.json", beforeRoutes);
  assert.deepEqual(routes(true), {}, "Dedicated node route is occupied; preserve it");
  assert.equal(beforeRoutes.Web?.[`${normalHostname}:8452`]?.Handlers?.["/"]?.Proxy, "http://127.0.0.1:3810");
  assert.ok(!beforeRoutes.AllowFunnel?.[`${normalHostname}:8452`], "Normal synthetic route must remain private");
  for (const port of [3800, 3801, 3802, 18150, 18151, 3810]) assert.ok(await freePort(port), `Port ${port} occupied; preserve its owner`);
  return { node: record.previewHostname, dedicatedRoutes: {}, portsFree: true };
 });
 await check("real CLI external registry and stopped-manager helper configuration", async () => {
  cli("init", "--ports", "3800,3801,3802", "--origin-port", "18150");
  cli("configure-tailnet", "--tailnet-host", normalHostname, "--https-ports", "8453,8454,8455");
  const log = fs.openSync(path.join(run, "helper.log"), "a", 0o600);
  helper = fork(path.join(root, "tests/deployment/fixtures/preview-helper.mjs"), [helperDirectory], { cwd: root, env, stdio: ["ignore", log, log, "ipc"] }); fs.closeSync(log);
  record.owned.helper = ownerOf(helper.pid);
  helperReady = await new Promise((resolve, reject) => { const timer = setTimeout(() => reject(new Error("Helper readiness timed out")), 25_000); helper.once("message", message => { clearTimeout(timer); resolve(message); }); helper.once("error", reject); });
  assert.equal(helperReady.ready, true); assert.equal(helperReady.models.length, 2);
  cli("configure-helper", "--helper-directory", helperDirectory);
  return { helper: helperReady, managerStopped: !readState(registry).manager };
 });
 await check("sole real manager full build and runtime", async () => {
  cli("preview", ticketId, "--worktree", root, "--tailnet-socket", node.socket);
  first = await ready(); write("first-ticket.json", first); record.owned.firstProcess = first.process; record.owned.manager = readState(registry).manager; record.owned.profile = first.profile;
  assert.equal(first.launch.deadline - first.launch.started, 600_000);
  assert.equal(first.origin, `https://${record.previewHostname}/`);
  return { claim: first.claim, launch: first.launch, preparedSource: { sourceHash: first.sandbox.sourceHash, revision: first.sandbox.revision }, sandbox: first.sandbox };
 });
 await check("trusted private HTTPS and actual LearnHarness browser", async () => {
  admission = createAdmission([normalOrigin]);
  normalServer = http.createServer((request, response) => { response.once("finish", () => { normalRequests.push({ method: request.method, path: request.url.split("?")[0], status: response.statusCode, site: request.headers["sec-fetch-site"], hasSessionCookie: (request.headers.cookie ?? "").includes("__Host-lh-local-session=") }); write("normal-requests.json", normalRequests); }); void admission.handle(request, response, () => { if (request.method !== "GET") normalWrites++; response.writeHead(200, { "Content-Type": "text/html", "Cache-Control": "no-store" }); response.end("<!doctype html><h1>zz-prove-it independently scoped normal admission fixture</h1>"); }); });
  normalServer.on("connection", socket => { normalSockets.add(socket); socket.once("close", () => normalSockets.delete(socket)); });
  await new Promise((resolve, reject) => { normalServer.once("error", reject); normalServer.listen(3810, "127.0.0.1", resolve); }); record.owned.normalPort = 3810;
  const tls = { preview: await inspectTLS(first.origin), normal: await inspectTLS(normalOrigin) }; assert.equal(tls.preview.authorized, true); assert.equal(tls.normal.authorized, true);
  browser = await puppeteer.launch({ executablePath: browserPath, headless: true, userDataDir: path.join(external, "browser"), env, args: ["--disable-dev-shm-usage", "--no-proxy-server"] }); record.owned.browser = ownerOf(browser.process().pid);
  page = await browser.newPage(); await page.setViewport({ width: 1280, height: 900 });
  page.on("response", response => { const url = new URL(response.url()); if (url.pathname.startsWith("/api/")) { record.network.push({ at: new Date().toISOString(), origin: url.origin, path: url.pathname, status: response.status(), method: response.request().method() }); save(); } });
  page.on("pageerror", error => { record.browserErrors ??= []; record.browserErrors.push(error.message); save(); });
  page.on("requestfailed", request => { const url = new URL(request.url()); record.failedRequests ??= []; record.failedRequests.push({ origin: url.origin, path: url.pathname, method: request.method(), error: request.failure()?.errorText }); save(); });
  normal = await browser.newPage(); await normal.goto(`${normalOrigin}/__local/admit#${admission.issue(normalOrigin)}`, { waitUntil: "networkidle0", timeout: 60_000 });
  await normal.evaluate(() => { document.cookie = "lh-normal-canary=original; Path=/; Secure; SameSite=Strict"; });
  await openPreview(first); await page.screenshot({ path: path.join(run, "default-denied.png"), fullPage: true });
  return { tls, actualAppIdentity: (await api("/api/runtime")).data };
 });
 await check("actual sandbox filesystem environment and network refusal", async () => {
  const source = `const fs=require('node:fs');const net=require('node:net');const assert=require('node:assert/strict');(async()=>{const targets=${JSON.stringify([projectRoot, home, helperDirectory, "/home/bjorn/.ssh", "/home/bjorn/.config", node.directory])};for(const target of targets)assert.equal(fs.existsSync(target),false,target);assert.equal(process.env.HOST_SECRET_CANARY,undefined);assert.equal(fs.existsSync('/capability/control.sock'),false);const denied=await Promise.all([3810,${helperReady.upstreamPort}].map(port=>new Promise(resolve=>{const socket=net.connect({host:'127.0.0.1',port});socket.setTimeout(1500);socket.once('connect',()=>{socket.destroy();resolve(false)});socket.once('error',()=>resolve(true));socket.once('timeout',()=>{socket.destroy();resolve(true)})})));assert.ok(denied.every(Boolean));console.log(JSON.stringify({hiddenPaths:targets,environmentDenied:true,loopbackDenied:denied,adminSocketUnavailable:true}));})().catch(error=>{console.error(error);process.exit(1)});`;
  const child = spawnSandbox(first.sandbox, ["-e", source], { lease: first.claim, helperSocket: JSON.parse(fs.readFileSync(path.join(registry, "leases", first.claim, "config.json"))).helperSocket, stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "", stderr = ""; child.stdout.on("data", chunk => { stdout += chunk; }); child.stderr.on("data", chunk => { stderr += chunk; });
  const code = await new Promise((resolve, reject) => { child.once("error", reject); child.once("exit", resolve); }); write("sandbox-refusals.json", { code, stdout, stderr }); assert.equal(code, 0, stderr); return JSON.parse(stdout);
 });
 try {
 await check("browser cookies sessions native bridge and cross-host egress refusal", async () => {
  const session = (await browser.defaultBrowserContext().cookies(normalOrigin)).find(cookie => cookie.name === "__Host-lh-local-session"); assert.ok(session?.httpOnly && session.secure);
  const isolation = await page.evaluate(() => ({ cookie: document.cookie, nativeBridge: typeof window.electronAPI })); assert.doesNotMatch(isolation.cookie, /lh-normal-canary|lh-local-session/); assert.equal(isolation.nativeBridge, "undefined");
  const firstRequest = normalRequests.length;
  const firstFailure = record.failedRequests?.length ?? 0;
  const attack = await probeBrowserEgress();
  write("normal-attack.json", { attack, normalWrites, requests: normalRequests });
  assert.equal(normalWrites, 0); assert.equal(attack.browserRefusal, "TypeError");
  assert.equal(normalRequests.slice(firstRequest).filter(request => request.path === "/api/write").length, 0, "Production browser policy must refuse the request before ingress");
  assert.ok((record.failedRequests ?? []).slice(firstFailure).some(request => request.origin === normalOrigin && request.path === "/api/write" && request.error === "net::ERR_NETWORK_ACCESS_REVOKED"));
  await normal.reload({ waitUntil: "networkidle0" }); assert.match(await normal.$eval("body", element => element.textContent), /independently scoped normal/); assert.match(await normal.evaluate(() => document.cookie), /lh-normal-canary=original/);
  const after = (await browser.defaultBrowserContext().cookies(normalOrigin)).find(cookie => cookie.name === session.name); assert.equal(after.value, session.value);
  await normal.screenshot({ path: path.join(run, "normal-after-attacks.png") }); return { noNormalCookiesVisible: true, nativeBridge: isolation.nativeBridge, attack, normalWrites, normalSessionUnchanged: true, ingressProof: "Required separate trusted-HTTPS negative control after runtime cleanup" };
 });
 } catch (error) { record.limitations.push(`Browser boundary probe remains FAILED, not skipped or accepted: ${error.message}`); save(); }
 try {
  await check("real browser subscription status read reaches helper adapter", async () => { const response = await api("/api/subscriptions"); write("browser-subscription-status.json", response); assert.equal(response.status, 200, JSON.stringify(response.data)); return { status: response.status }; });
 } catch (error) { record.limitations.push(`Product integration gap: ${error.message}`); save(); }
 try {
  await check("default deny then explicit real CLI grant", async () => {
   const denied = await catalog(); assert.equal(denied.filter(model => ["chatgpt", "xai", "github-copilot"].includes(model.provider)).length, 0);
   const before = await helperMessage("stats"); assert.equal(before.stats.length, 0);
   const grant = admin("grant", first.claim); write("first-grant.json", grant);
   const models = (await catalog()).filter(model => model.provider === "chatgpt" && helperReady.models.includes(model.id)); assert.equal(models.length, 2); record.models = models.map(model => ({ id: model.id, provider: model.provider }));
   return { deniedCount: denied.length, approvedModels: record.models, deadlineUnchanged: readState(registry).tickets[ticketId].launch.deadline === first.launch.deadline };
  });
  await check("actual in-app model switching between two models", async () => ({ switched: await switchModels(record.models) }));
  await check("actual composer synthetic upstream chat response", async () => {
   const selector = 'textarea, [contenteditable="true"]'; await page.waitForSelector(selector, { visible: true }); await page.click(selector); await page.keyboard.type("Reply with the synthetic preview response.");
   await page.click('button[aria-label="Send"]'); await page.waitForFunction(() => document.body.textContent.includes("Synthetic preview response"), { timeout: 45_000 });
   const stats = await helperMessage("stats"); write("chat-helper-stats.json", stats); assert.ok(stats.stats.some(request => request.model === record.models[1].id && request.authenticated));
   await page.screenshot({ path: path.join(run, "synthetic-chat.png"), fullPage: true }); return { responseVisible: true, upstream: stats };
  });
 } catch (error) { record.limitations.push(`UI/helper flow failure retained; elapsed expiry still runs: ${error.message}`); save(); }
 await check("actual elapsed ten-minute expiry despite browser interaction", async () => {
  while (monotonicMilliseconds() < first.launch.deadline) {
   const state = readState(registry); const ticket = state.tickets[ticketId]; assert.equal(ticket.claim, first.claim); assert.equal(ticket.launch.deadline, first.launch.deadline);
   await page.mouse.move(100 + record.activity.length % 100, 100); await page.keyboard.press("Shift");
   const observation = { monotonic: monotonicMilliseconds(), wall: new Date().toISOString(), preview: ticket.preview, deadline: ticket.launch.deadline, runtime: await api("/api/runtime") }; record.activity.push(observation); save();
   await delay(Math.min(15_000, Math.max(0, first.launch.deadline - monotonicMilliseconds())));
  }
  const timeout = Date.now() + 20_000; while (readState(registry).tickets[ticketId].claim) { assert.ok(Date.now() < timeout, "Expired claim not released"); await delay(250); }
  const elapsed = monotonicMilliseconds() - first.launch.started; assert.ok(elapsed >= 600_000); assert.equal(ownedGroup(first.process), false); assert.ok(fs.existsSync(path.join(first.profile, "data")));
  const config = JSON.parse(fs.readFileSync(path.join(registry, "leases", first.claim, "config.json"))); const helperSocket = config.helperSocket;
  assert.ok(helperSocket, "Actual manager must have issued a helper capability");
  const probe = await new Promise(resolve => { const request = http.request({ socketPath: helperSocket, path: "/read", method: "POST", headers: { "content-type": "application/json", "x-preview-lease": first.claim }, timeout: 3000 }, response => { response.resume(); resolve({ status: response.statusCode }); }); request.once("error", error => resolve({ refused: error.code ?? error.message })); request.once("timeout", () => request.destroy(new Error("expired helper timed out"))); request.end(JSON.stringify({ channel: "lh:chatgpt", op: "status", fields: {} })); });
  write("expired-helper.json", probe); assert.ok(["ENOENT", "ECONNREFUSED", "ECONNRESET"].includes(probe.refused), "Expired helper must no longer accept connections, not merely reject an invalid route");
  write("expired-state.json", readState(registry)); write("expired-event.json", JSON.parse(fs.readFileSync(first.eventPath, "utf8")));
  return { elapsed, launch: first.launch, interactionCount: record.activity.length, supervisorStopped: true, slotReleased: true, syntheticDataRetained: true };
 });
 await check("same-source replacement fresh denial, revoke cached selection, stale stop", async () => {
  cli("preview", ticketId); second = await ready(); write("second-ticket.json", second); record.owned.secondProcess = second.process;
  assert.notEqual(second.claim, first.claim); assert.equal(second.origin, first.origin); assert.equal(second.profile, first.profile); await openPreview(second);
  assert.equal((await catalog()).filter(model => model.provider === "chatgpt").length, 0);
  const retained = await api("/api/chats");
  if (!record.chatId && fs.existsSync(path.join(run, "ui-followup.json"))) record.chatId = JSON.parse(fs.readFileSync(path.join(run, "ui-followup.json"))).chatId;
  if (record.chatId) assert.ok(retained.data.chats.some(chat => chat.id === record.chatId)); write("retained-chats.json", retained);
  admin("grant", second.claim); assert.equal((await catalog()).filter(model => model.provider === "chatgpt" && helperReady.models.includes(model.id)).length, 2);
  const before = await helperMessage("stats"); admin("revoke", second.claim);
  assert.equal((await catalog()).filter(model => model.provider === "chatgpt").length, 0);
  const cached = await api("/api/settings/chat", "PUT", { model: record.models[1] }); write("cached-selection-refusal.json", cached); assert.equal(cached.status, 400); assert.match(cached.data.error, /No model .* in the chatgpt catalog/);
  assert.ok(record.chatId, "Cached dispatch requires a real retained chat");
  const dispatch = await api("/api/chat", "POST", { chatId: record.chatId, input: { type: "text", text: "zz-prove-it revoked cached model must not call upstream" } }); write("revoked-cached-dispatch.json", dispatch); assert.equal(dispatch.status, 503, "Revoked cached chat dispatch must fail"); assert.equal(dispatch.data.inputDisposition, "not_accepted");
  assert.deepEqual((await helperMessage("stats")).stats, before.stats);
  assert.throws(() => cli("release", ticketId, "--lease", first.claim), /Command failed/); assert.equal(readState(registry).tickets[ticketId].claim, second.claim);
  cli("release", ticketId, "--lease", second.claim); const deadline = Date.now() + 20_000; while (readState(registry).tickets[ticketId].claim) { assert.ok(Date.now() < deadline); await delay(250); }
  assert.equal(ownedGroup(second.process), false); return { replacementDefaultDenied: true, retainedProfile: true, cachedSelectionStatus: cached.status, noRevokedUpstream: true, staleReleaseRefused: true, matchingManualRelease: true };
 });
} catch (error) {
 record.error = error.stack; process.exitCode = 1;
} finally {
 if (page && !page.isClosed()) { try { await page.screenshot({ path: path.join(run, "final-browser.png"), fullPage: true }); } catch (error) { record.screenshotError = error.message; } }
 record.cleanup = { status: "running", daemonRetained: true, profileRetained: external }; save();
 const cleanupErrors = [];
 try { if (fs.existsSync(path.join(registry, "registry.json"))) { cli("stop"); const state = readState(registry); assert.ok(!alive(state.manager)); assert.ok(state.slots.every(slot => !slot.ticket)); for (const ticket of Object.values(state.tickets)) assert.ok(!ownedGroup(ticket.process)); write("final-state.json", state); record.cleanup.managerAndRuntimeStopped = true; } } catch (error) { cleanupErrors.push(error.stack); }
 try { await browser?.close(); record.cleanup.browserStopped = !browser?.connected; } catch (error) { cleanupErrors.push(error.stack); }
 try { if (helper?.connected) { helper.disconnect(); await Promise.race([new Promise(resolve => helper.once("exit", resolve)), delay(10_000)]); assert.ok(!alive(record.owned.helper), "Owned helper failed to stop"); } record.cleanup.helperStopped = !helper || !alive(record.owned.helper); assert.ok(!fs.existsSync(path.join(helperDirectory, "control.sock"))); } catch (error) { cleanupErrors.push(error.stack); }
 try { for (const socket of normalSockets) socket.destroy(); if (normalServer?.listening) await new Promise(resolve => normalServer.close(resolve)); record.cleanup.normalListenerStopped = !normalServer?.listening; } catch (error) { cleanupErrors.push(error.stack); }
 try { assert.ok(alive(node.owner), "Borrowed daemon must remain live"); assert.deepEqual(routes(true), {}); if (beforeRoutes) assert.deepEqual(routes(false), beforeRoutes); write("routes-after.json", routes(false)); record.cleanup.routesRemovedAndUnrelatedUnchanged = true; for (const port of record.owned.ports) assert.ok(await freePort(port), `Owned port ${port} still occupied`); } catch (error) { cleanupErrors.push(error.stack); }
 if (!cleanupErrors.length && beforeRoutes && record.cleanup.managerAndRuntimeStopped && record.cleanup.normalListenerStopped) {
  try { await check("trusted-HTTPS actual cookie-bearing normal and preview ingress refusals", runIngressControl); }
  catch (error) {
   record.limitations.push(`Required ingress negative control failed, never substituted by browser blocking: ${error.message}`);
   const filename = path.join(run, "ingress-negative-control/result.json");
   const cleanup = fs.existsSync(filename) ? JSON.parse(fs.readFileSync(filename, "utf8")).cleanup : null;
   if (!["ownedBrowserStopped", "listenersClosed", "disposableRoutesRemoved", "originalRoutesUnchanged"].every(field => cleanup?.[field] === true)) cleanupErrors.push("Ingress diagnostic cleanup could not be verified; inspect its retained artifacts");
  }
 }
 record.cleanup.status = cleanupErrors.length ? "failed" : "passed"; record.cleanup.errors = cleanupErrors;
 record.sourceAfter = { ...buildIdentity(root), dirty: git(root, "status", "--porcelain") }; record.sourceUnchanged = record.source.sourceHash === record.sourceAfter.sourceHash;
 if (!record.sourceUnchanged) record.limitations.push("Working source fingerprint changed during proof; no final-source claim");
 if (record.error || record.failures.length || cleanupErrors.length) process.exitCode = 1;
 record.status = record.error || record.failures.length || cleanupErrors.length ? "failed-scoped-checks" : "passed-scoped-checks";
 record.finishedAt = new Date().toISOString(); save();
 for (const entry of record.checks) {
  entry.commands = (record.commands ?? []).map(command => command.command);
  entry.artifacts = ["deployment.json", "scoped-result.json", "receipt.md", "manager.log", "server.log"];
  entry.startedAt = record.startedAt; entry.finishedAt = record.finishedAt;
  if ([7, 8, 9].includes(entry.number)) entry.observed = { scoped: record.scopedChecks.map(check => ({ name: check.name, status: check.status })), completeRow: "BLOCKED: omitted native/multi-source queue/final-source requirements are not passed" };
 }
 save();
 for (const filename of [path.join(registry, "manager.log"), path.join(registry, "profiles", ticketId, "server.log")]) if (fs.existsSync(filename)) fs.copyFileSync(filename, path.join(run, path.basename(filename)));
 fs.writeFileSync(path.join(run, "receipt.md"), `# Managed preview builder rehearsal\n\nVerdict: BLOCKED (all ten deployment rows)\nScoped result: ${record.status}\nChecker: ${record.checker}\n\n## Couldn't prove\n${record.limitations.map(item => `- ${item}`).join("\n")}\n\n## Answer keys\nApproved private spec §4 rows 7–9, SHA-256 ${record.spec.sha256}. Full-row native/FIFO/regression proof remains blocked.\n\n## Steps\n${record.scopedChecks.map(entry => `- [${entry.status.toUpperCase()}] ${entry.name}${entry.error ? `: ${entry.error.split("\n")[0]}` : ""}`).join("\n")}\n\n## Source\nBefore: ${record.source.sourceHash}\nAfter: ${record.sourceAfter.sourceHash}\nPrepared exact source: first-ticket.json and second-ticket.json when launch succeeded. No final-source acceptance claim.\n\n## Failures and cleanup\nRaw failures and commands: deployment.json. Manager/server/helper logs retained. Cleanup: ${record.cleanup.status}.\nExternal synthetic state/profile retained: ${external}\nHelper directory retained: ${helperDirectory}\nAuthorized existing daemon retained, never provisioned/authenticated/stopped by this driver.\n`, { mode: 0o600 });
 console.log(JSON.stringify({ run, status: record.status, deploymentAcceptance: "BLOCKED", error: record.error, failures: record.failures.length, cleanup: record.cleanup }));
}
