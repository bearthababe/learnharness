const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { createHash } = require("node:crypto");

function buildIdentity(root) {
	try {
		const revision = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
		const filenames = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { cwd: root, encoding: "utf8" }).split("\0").filter(filename => /^(app|components|src|lib|electron|scripts)\//.test(filename) || /^(config\.ts|instrumentation\.ts|proxy\.ts|next\.config\.ts|package(-lock)?\.json|electron-builder\.yml)$/.test(filename));
		const hash = createHash("sha256");
		for (const filename of [...new Set(filenames)].sort()) {
			const target = path.join(root, filename);
			if (fs.existsSync(target)) hash.update(filename).update("\0").update(fs.readFileSync(target)).update("\0");
		}
		return { revision, sourceHash: hash.digest("hex") };
	} catch { return { revision: "unknown", sourceHash: "unknown" }; }
}

module.exports = { buildIdentity };
