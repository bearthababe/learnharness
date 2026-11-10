import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

export function validatePreviewHelper(directory, state) {
	assert.ok(typeof directory === "string" && path.isAbsolute(directory), "Helper directory must be absolute");
	const resolved = fs.realpathSync(directory);
	assert.equal(resolved, path.resolve(directory), "Helper directory must not contain symlinks");
	const information = fs.lstatSync(resolved);
	assert.ok(information.isDirectory() && information.uid === process.getuid() && !(information.mode & 0o077), "Helper directory must be owner-only");
	for (const root of [state.root, ...Object.values(state.tickets).flatMap(ticket => [ticket.worktree, ticket.profile])].filter(Boolean)) {
		const target = path.resolve(root);
		assert.ok(resolved !== target && !resolved.startsWith(target + path.sep) && !target.startsWith(resolved + path.sep), "Helper administration must be separate from source and preview profiles");
	}
	const socket = fs.lstatSync(path.join(resolved, "control.sock"));
	assert.ok(socket.isSocket() && socket.uid === process.getuid() && !(socket.mode & 0o077), "Helper control must be an owner-only Unix socket");
	return resolved;
}
