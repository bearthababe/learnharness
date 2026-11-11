import assert from "node:assert/strict";
import { runInContext, type Context, type RunningScriptOptions } from "node:vm";

export function loadNormalShell(source: string, context: Context, options?: RunningScriptOptions) {
	assert.match(source, /\n} else {\nconst \{ app, BrowserWindow/);
	assert.match(source, /\n}\s*$/);
	const instrumented = source.replace(/\n}\s*$/, '\nglobalThis.evaluateNormalShell = source => eval(source);\n}\n');
	runInContext(instrumented, context, options);
	assert.equal(typeof context.evaluateNormalShell, "function");
	return (code: string) => runInContext(`evaluateNormalShell(${JSON.stringify(code)})`, context);
}
