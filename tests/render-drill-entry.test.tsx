import React from "react";
(globalThis as Record<string, unknown>).React = React;
import assert from "node:assert/strict";
import { it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { parseHTML } from "linkedom";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime.js";
import { Home } from "../components/home.tsx";
import { AppShell } from "../components/sidebar.tsx";
import { Chat } from "../components/chat.tsx";
import { ServerEventsProvider } from "../components/server-events.tsx";

function render(children: React.ReactNode) {
	return renderToStaticMarkup(
		<AppRouterContext.Provider value={{ back() {}, forward() {}, refresh() {}, push() {}, replace() {}, prefetch() {}, bfcacheId: "drill-test" }}>
			<ServerEventsProvider>{children}</ServerEventsProvider>
		</AppRouterContext.Provider>,
	);
}

it("home and sidebar offer Drill alongside their existing launch choices", () => {
	const home = render(<Home initialConfigured={true} rendering={false} />);
	assert.match(home, />Teach<\/button>/);
	assert.match(home, /Practice<\/button>/);
	assert.match(home, /Drill<\/button>/);
	const { document } = parseHTML(render(<AppShell><span>Session content</span></AppShell>));
	assert.match(document.querySelector('[data-testid="new-session"]')!.textContent!, /^Teaching/);
	assert.match(document.querySelector('[data-testid="new-session-practice"]')!.textContent!, /^Practice/);
	assert.match(document.querySelector('[data-testid="new-session-drill"]')!.textContent!, /^Drill/);
});

it("a reopened drill header says Drill while an ordinary practice header still says Practice", () => {
	const drill = render(<Chat chatId="drill" title="Volume conversions" kind="practice" practiceMode="drill" initialMessages={[]} initialConfigured={true} />);
	assert.match(drill, /Volume conversions/);
	assert.match(drill, />Drill<\/span>/);
	const ordinary = render(<Chat chatId="ordinary" title="Mixed work" kind="practice" initialMessages={[]} initialConfigured={true} />);
	assert.match(ordinary, />Practice<\/span>/);
	assert.doesNotMatch(ordinary, />Drill<\/span>/);
});
