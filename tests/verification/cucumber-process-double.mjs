import fs from "node:fs";
import childProcess from "node:child_process";
import { syncBuiltinESMExports } from "node:module";

childProcess.spawnSync = (_binary, args) => {
	const file = args.find(value => value.startsWith("json:")).slice(5);
	const ids = [...new Set(args[args.indexOf("--tags") + 1].match(/@LJ-[A-Z]+/g))];
	const status = args.includes("--dry-run") ? "skipped" : process.env.LH_CUCUMBER_TEST_STATUS;
	fs.writeFileSync(file, JSON.stringify([{ elements: ids.map(id => ({ tags: [{ name: id }], steps: [{ name: "controlled runtime outcome", result: { status } }] })) }]));
	return { status: 0, stdout: "Cucumber process test double", stderr: "" };
};
syncBuiltinESMExports();
