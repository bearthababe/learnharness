import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";

// Serve a catalog with a duplicated story so the CLI must refuse before any run folder or Cucumber process.
const read = fs.readFileSync;
fs.readFileSync = (file, ...rest) => {
	const value = read(file, ...rest);
	if (!String(file).endsWith("verification/learning/stories.json")) return value;
	const catalog = JSON.parse(value);
	catalog.stories.push(catalog.stories[0]);
	return JSON.stringify(catalog);
};
fs.mkdtempSync = () => { throw new Error("An invalid catalog must not create run evidence"); };
syncBuiltinESMExports();
