import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { previewCookieBootstrap } from "../lib/preview-cookie-bootstrap.ts";

test("ordinary apps have no cookie override; managed previews reject malformed prefixes", () => {
	assert.equal(previewCookieBootstrap(undefined), undefined);
	assert.throws(() => previewCookieBootstrap('</script>'), /Invalid preview cookie prefix/);
});

test("managed document cookies expose and update only their ticket namespace", () => {
	const stored = new Map([["other", "everyday"], ["lh-preview-beta__session", "beta"], ["lh-preview-alpha--beta__session", "overlapping-slug-secret"], ["lh-preview-alpha__session", "alpha"]]);
	class Document {
		get cookie() { return [...stored].map(([name, value]) => `${name}=${value}`).join("; "); }
		set cookie(value: string) {
			const [name, content] = value.split(";")[0]!.split("=");
			stored.set(name!, content!);
		}
	}
	const document = new Document();
	vm.runInNewContext(previewCookieBootstrap("lh-preview-alpha__")!, { Document, document });
	assert.equal(document.cookie, "session=alpha");
	document.cookie = "session=alpha-updated;Path=/";
	assert.equal(document.cookie, "session=alpha-updated");
	assert.equal(stored.get("lh-preview-beta__session"), "beta");
	assert.equal(stored.get("lh-preview-alpha--beta__session"), "overlapping-slug-secret");
	assert.equal(stored.get("other"), "everyday");
});
