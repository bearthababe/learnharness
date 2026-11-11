import childProcess from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
import { promisify } from "node:util";

const original = childProcess.execFile;
const asynchronous = promisify(original);
const executable = filename => filename === "/usr/bin/tailscale" ? process.env.ZZ_PROVE_TAILNET_EXECUTABLE : filename;
const replacement = (filename, ...argumentsList) => original(executable(filename), ...argumentsList);
replacement[promisify.custom] = (filename, ...argumentsList) => asynchronous(executable(filename), ...argumentsList);
childProcess.execFile = replacement;
syncBuiltinESMExports();
