import assert from "node:assert/strict";
import { test } from "node:test";
import { browserServiceSpawnEnv } from "../src/agent/subagents/headless.ts";

test("normal service browser helper inherits neither credentials nor profile/private-shell authority", () => {
	const environment = browserServiceSpawnEnv({ HOME: "/synthetic/home", PATH: "/usr/bin", LH_BROWSER_SERVICE_DATA_DIR: "/synthetic/helper", LH_PROFILE_DIR: "/synthetic/profile", LH_DATA_DIR: "/synthetic/profile/data", LH_AUTH_FILE: "/synthetic/profile/auth.json", LH_LOCAL_SERVICE_CONFIG: "/synthetic/run/service.json", LH_DESKTOP_API_SECRET: "not-a-real-capability", LH_DESKTOP_SERVER: "1", OPENAI_API_KEY: "synthetic-not-real", GITHUB_TOKEN: "synthetic-not-real", LH_DEV_URL: "http://127.0.0.1:3999", ELECTRON_RUN_AS_NODE: "1", NODE_OPTIONS: "--inspect" });
	assert.deepEqual(environment, { HOME: "/synthetic/home", PATH: "/usr/bin", LH_BROWSER_SERVICE_DATA_DIR: "/synthetic/helper" });
});
