import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const [source, sha, destination] = process.argv.slice(2);
if (!source || !/^[a-f0-9]{40}$/.test(sha || "") || !path.isAbsolute(destination || "")) throw new Error("Invalid local release preparation");
function run(command, argumentsList, cwd) {
	const result = spawnSync(command, argumentsList, { cwd, env: process.env, stdio: "inherit" });
	if (result.error || result.status !== 0) throw new Error(`Release preparation failed: ${command}`);
}
if (fs.existsSync(destination)) throw new Error("Release preparation destination already exists");
const remote = spawnSync("git", ["-C", source, "remote", "get-url", "origin"], { encoding: "utf8" });
if (remote.status !== 0) throw new Error("Cannot read deployment origin");
run("git", ["clone", "--no-hardlinks", "--no-checkout", source, destination]);
run("git", ["remote", "set-url", "origin", remote.stdout.trim()], destination);
run("git", ["checkout", "--detach", sha], destination);
for (const filename of [".env", ".env.local", "auth.json", "data"]) if (fs.existsSync(path.join(destination, filename))) throw new Error("Refusing a release checkout with ambient profile/secrets");
run("npm", ["ci", "--prefer-offline", "--no-audit", "--no-fund"], destination);
run("npm", ["run", "build"], destination);
run("node", ["scripts/smoke-provider-runtime.mjs"], destination);
run("node", ["scripts/build-server.mjs"], destination);
run("node", ["scripts/smoke-server.mjs", "--electron"], destination);
run("npx", ["--no-install", "electron-builder", "--linux", "AppImage", "--x64", "--publish", "never"], destination);
