import assert from "node:assert/strict";
import childProcess from "node:child_process";
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import os from "node:os";
import path from "node:path";
import { mock, test } from "node:test";
import { runtimeLibraries } from "../../scripts/lib/preview-sandbox.mjs";

const interpreter = "/lib64/ld-linux-x86-64.so.2";
const loader = "/usr/lib/x86_64-linux-gnu/ld-linux-x86-64.so.2";
const soname = "libpreview-ci-test.so.1";
const multiarch = `/usr/lib/x86_64-linux-gnu/${soname}`;
const flat = `/usr/lib/${soname}`;
const metadata = names => names.map(name => `(NEEDED) Shared library: [${name}]`).join("\n");

function inspect(libraries, details, operation) {
	const directory = fs.mkdtempSync(path.join(os.tmpdir(), "lh-runtime-libraries-"));
	const original = { exists: fs.existsSync, realpath: fs.realpathSync, stat: fs.statSync };
	const system = filename => ["/usr/lib/", "/lib/", "/lib64/"].some(prefix => String(filename).startsWith(prefix));
	const entries = new Map([[interpreter, loader], ...libraries]);
	mock.method(fs, "existsSync", filename => system(filename) ? entries.has(filename) : original.exists(filename));
	mock.method(fs, "realpathSync", filename => entries.has(filename) ? entries.get(filename) : original.realpath(filename));
	mock.method(fs, "statSync", filename => entries.has(filename) ? { isFile: () => true } : original.stat(filename));
	mock.method(childProcess, "execFileSync", (command, argumentsList, options) => {
		assert.equal(command, "/usr/bin/readelf");
		assert.deepEqual(options.env, { PATH: "/usr/bin", LANG: "C" });
		const filename = argumentsList.at(-1);
		if (filename === process.execPath) return details[filename] ?? `Requesting program interpreter: ${interpreter}]\n${metadata([soname])}`;
		return details[filename] ?? "";
	});
	syncBuiltinESMExports();
	try { operation(() => runtimeLibraries(directory)); }
	finally { mock.restoreAll(); syncBuiltinESMExports(); fs.rmSync(directory, { recursive: true, force: true }); }
}

test("Ubuntu multiarch libraries and the actual ELF interpreter are mounted individually", () => {
	inspect([[multiarch, multiarch]], {}, discover => {
		assert.deepEqual(discover(), [interpreter, multiarch].sort());
	});
});

test("a valid multiarch library is preferred over a flat symlink outside the trusted directory", () => {
	inspect([[flat, "/opt/runner-driver/libpreview-ci-test.so.1"], [multiarch, multiarch]], {}, discover => {
		assert.deepEqual(discover(), [interpreter, multiarch].sort());
	});
});

test("flat system library layouts remain supported", () => {
	inspect([[flat, flat]], {}, discover => {
		assert.deepEqual(discover(), [interpreter, flat].sort());
	});
});

test("a library available only outside the trusted directory still fails closed", () => {
	inspect([[flat, "/home/synthetic-owner/private/libpreview-ci-test.so.1"]], {}, discover => {
		assert.throws(discover, /Runtime dependency escaped the system library directory/);
	});
});

test("trusted directory lookalikes are not accepted", () => {
	inspect([[flat, "/usr/library-private/libpreview-ci-test.so.1"]], {}, discover => {
		assert.throws(discover, /Runtime dependency escaped the system library directory/);
	});
});

test("transitive multiarch library cycles are deduplicated", () => {
	const otherName = "libpreview-ci-cycle.so.2";
	const other = `/usr/lib/x86_64-linux-gnu/${otherName}`;
	inspect([[multiarch, multiarch], [other, other]], { [multiarch]: metadata([otherName]), [other]: metadata([soname]) }, discover => {
		assert.deepEqual(discover(), [interpreter, multiarch, other].sort());
	});
});

test("needed library names cannot contain a path", () => {
	inspect([[multiarch, multiarch]], { [multiarch]: metadata(["../private/libescape.so.1"]) }, discover => {
		assert.throws(discover, /Native dependency library name is not a basename/);
	});
});

test("an interpreter in a private directory is refused", () => {
	inspect([[multiarch, multiarch]], { [process.execPath]: "Requesting program interpreter: /home/synthetic-owner/ld-linux-x86-64.so.2]" }, discover => {
		assert.throws(discover, /Unsupported Linux runtime interpreter/);
	});
});

test("a supported interpreter path cannot resolve outside trusted system libraries", () => {
	inspect([[interpreter, "/opt/private/ld-linux-x86-64.so.2"], [multiarch, multiarch]], {}, discover => {
		assert.throws(discover, /Runtime dependency escaped the system library directory/);
	});
});
