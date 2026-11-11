import assert from "node:assert/strict";
import { previewHelperCommand } from "./lib/preview-subscription-helper.mjs";

const [operation, directory, ticketId, lease] = process.argv.slice(2);
assert.ok(["grant", "revoke"].includes(operation) && directory && ticketId && lease && process.argv.length === 6, "Usage: node scripts/preview-subscriptions.mjs grant|revoke HELPER_DIRECTORY TICKET LEASE");
console.log(JSON.stringify(await previewHelperCommand(directory, { op: operation, ticketId, lease })));
