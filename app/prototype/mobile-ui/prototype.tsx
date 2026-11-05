"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, ArrowUp, Check, ChevronRight, CircleHelp, Home, Layers, LoaderCircle, Menu, Mic, Plus, Search, Settings, SlidersHorizontal, Square, X } from "lucide-react";
import { MessageResponse } from "@/components/ai-elements/message";
import styles from "./prototype.module.css";

export type PreviewSession = { id: string; title: string; kind: string; updated: string; messages: { role: "user" | "assistant"; text: string }[] };
type Variant = "A" | "B";
type Screen = "home" | "sessions" | "chat";
type Panel = "model" | "settings" | "tools" | "plan" | "usage" | "chains" | "graph" | "import" | "agents" | "attachment";
const panelNames: Record<Panel, string> = { model: "Model & thinking", settings: "Settings", tools: "Tools", plan: "Teaching plan", usage: "Session usage", chains: "Reasoning chains", graph: "Graph display", import: "Import notes", agents: "Background agents", attachment: "Your working" };
const sampleSpeech = "The force can still be present during the hold, but the speed is zero. So useful mechanical power is zero, because power equals force times speed.";
const sectionNames = ["Providers", "Agent", "Appearance", "Graph", "Keyboard", "General"];

export function MobileUIPrototype({ initialVariant, sessions }: { initialVariant: Variant; sessions: PreviewSession[] }) {
	const [variant, setVariant] = useState(initialVariant);
	const [screen, setScreen] = useState<Screen>("home");
	const [selected, setSelected] = useState(sessions.find(s => s.title === "Hydraulics 101") ?? sessions[0]);
	const [panel, setPanel] = useState<Panel | null>(null);
	const [section, setSection] = useState<string | null>(null);
	const [expanded, setExpanded] = useState(false);
	const [query, setQuery] = useState("");
	const [filter, setFilter] = useState("All");
	const [model, setModel] = useState("ChatGPT · current model");
	const [thinking, setThinking] = useState("High");
	const [drafts, setDrafts] = useState<Record<string, string>>({});
	const [sent, setSent] = useState<Record<string, string[]>>({});
	const [phase, setPhase] = useState<"idle" | "recording" | "finalizing">("idle");
	const [elapsed, setElapsed] = useState(0);
	const [notice, setNotice] = useState("");
	const [fileName, setFileName] = useState("");
	const [largeText, setLargeText] = useState(false);
	const [light, setLight] = useState(false);
	const [focused, setFocused] = useState(false);
	const root = useRef<HTMLDivElement>(null);
	const content = useRef<HTMLDivElement>(null);
	const history = useRef<HTMLDivElement>(null);
	const answer = useRef<HTMLTextAreaElement>(null);
	const microphone = useRef<HTMLButtonElement>(null);
	const recordingStarted = useRef(0);
	const dialog = useRef<HTMLDivElement>(null);
	const opener = useRef<HTMLElement | null>(null);
	const chatScroll = useRef<Record<string, number>>({});
	const listScroll = useRef(0);
	const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const sessionKey = selected?.id ?? "draft";
	const draft = drafts[sessionKey] ?? "";
	const setDraft = (value: string) => setDrafts(current => ({ ...current, [sessionKey]: value }));
	const name = variant === "A" ? "Page-led" : "Context-led";
	const sheet = variant === "B" && panel && !["chains", "plan", "attachment"].includes(panel) && !section && !expanded;

	function showPanel(next: Panel) {
		opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
		opener.current?.blur();
		setPanel(next); setSection(null); setExpanded(false);
	}
	function closePanel() {
		setPanel(null); setSection(null); setExpanded(false);
		requestAnimationFrame(() => opener.current?.isConnected && opener.current.focus({ preventScroll: true }));
	}
	function go(next: Screen) {
		if (screen === "chat" && history.current) chatScroll.current[sessionKey] = history.current.scrollTop;
		if (screen === "sessions" && content.current) listScroll.current = content.current.scrollTop;
		if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
		if (next !== screen && phase !== "idle") cancelDictation(false);
		setScreen(next); setNotice("");
	}
	function openSession(session: PreviewSession) { setSelected(session); go("chat"); }
	function create(kind: string) {
		setSelected({ id: `prototype-${kind}`, title: `New ${kind.toLowerCase()} session`, kind, updated: "Preview", messages: [] });
		go("chat");
	}
	function switchVariant() {
		if (screen === "chat" && history.current) chatScroll.current[sessionKey] = history.current.scrollTop;
		const next = variant === "A" ? "B" : "A";
		setVariant(next);
		const url = new URL(location.href); url.searchParams.set("variant", next);
		window.history.replaceState(null, "", url);
	}
	function dictate() {
		if (phase === "idle") { recordingStarted.current = Date.now(); setElapsed(0); setPhase("recording"); setNotice("Simulated recording · no microphone is used"); return; }
		if (phase !== "recording") return;
		setPhase("finalizing");
		timer.current = setTimeout(() => {
			setDrafts(current => ({ ...current, [sessionKey]: [current[sessionKey], sampleSpeech].filter(Boolean).join(" ") }));
			setPhase("idle"); setNotice("Sample transcript added. Edit it before sending.");
		}, 650);
	}
	function cancelDictation(returnFocus = true) {
		if (timer.current) { clearTimeout(timer.current); timer.current = null; }
		setPhase("idle"); setNotice("Recording cancelled. Your existing draft is kept.");
		if (returnFocus) requestAnimationFrame(() => microphone.current?.focus({ preventScroll: true }));
	}
	function submit() {
		if (!draft.trim() || phase !== "idle") return;
		setSent(current => ({ ...current, [sessionKey]: [...(current[sessionKey] ?? []), draft] }));
		setDraft(""); setNotice("Answer kept in this preview only. No tutor request was sent.");
		requestAnimationFrame(() => history.current?.scrollTo({ top: history.current.scrollHeight, behavior: "smooth" }));
	}

	useEffect(() => {
		if (phase !== "recording") return;
		const interval = setInterval(() => setElapsed(Math.floor((Date.now() - recordingStarted.current) / 1000)), 1000);
		return () => clearInterval(interval);
	}, [phase]);
	useEffect(() => {
		if (phase === "idle" || panel) return;
		const cancel = (event: KeyboardEvent) => {
			if (event.key !== "Escape") return;
			event.preventDefault(); event.stopImmediatePropagation(); cancelDictation();
		};
		document.addEventListener("keydown", cancel, true);
		return () => document.removeEventListener("keydown", cancel, true);
	}, [phase, panel]);
	useLayoutEffect(() => {
		const input = answer.current;
		if (variant !== "B" || !input) return;
		// Bound native multiline scrolling to the existing input-height budget.
		// Measuring scrollHeight also supports Safari without field-sizing.
		const resize = () => {
			const top = input.scrollTop;
			input.style.height = "0px";
			const css = getComputedStyle(input);
			input.style.height = `${Math.max(parseFloat(css.minHeight), Math.min(input.scrollHeight, parseFloat(css.maxHeight)))}px`;
			input.scrollTop = top;
		};
		resize();
		let width = input.parentElement?.clientWidth;
		const observer = new ResizeObserver(() => {
			const next = input.parentElement?.clientWidth;
			if (next === width) return;
			width = next; resize();
		});
		if (input.parentElement) observer.observe(input.parentElement, { box: "border-box" });
		window.visualViewport?.addEventListener("resize", resize);
		return () => { observer.disconnect(); window.visualViewport?.removeEventListener("resize", resize); };
	}, [draft, screen, sessionKey, variant, largeText]);
	useEffect(() => {
		// The inherited phone viewport hook contains edge gestures. This focus /
		// modal lock also prevents Safari from moving the document underneath it.
		const media = matchMedia("(pointer: coarse) and (max-width: 767px)");
		let unlock: (() => void) | undefined;
		const update = () => {
			const shouldLock = !!panel || (focused && media.matches);
			if (shouldLock && !unlock) {
				const body = document.body, x = scrollX, y = scrollY;
				if (getComputedStyle(body).position === "fixed") return;
				const saved = { position: body.style.position, top: body.style.top, width: body.style.width };
				Object.assign(body.style, { position: "fixed", top: `${-y}px`, width: "100%" });
				unlock = () => { Object.assign(body.style, saved); window.scrollTo(x, y); };
			} else if (!shouldLock && unlock) { unlock(); unlock = undefined; }
		};
		update(); media.addEventListener("change", update);
		return () => { media.removeEventListener("change", update); unlock?.(); };
	}, [focused, panel]);
	useEffect(() => {
		const viewport = window.visualViewport;
		const fit = () => {
			if (viewport && viewport.scale !== 1) return;
			root.current?.style.setProperty("--preview-height", `${viewport?.height ?? innerHeight}px`);
			root.current?.style.setProperty("--preview-top", `${viewport?.offsetTop ?? 0}px`);
		};
		fit(); viewport?.addEventListener("resize", fit); viewport?.addEventListener("scroll", fit); window.addEventListener("resize", fit);
		return () => { viewport?.removeEventListener("resize", fit); viewport?.removeEventListener("scroll", fit); window.removeEventListener("resize", fit); if (timer.current) clearTimeout(timer.current); };
	}, []);
	useEffect(() => {
		if (screen === "chat" && history.current) history.current.scrollTop = chatScroll.current[sessionKey] ?? Math.max(0, history.current.scrollHeight - history.current.clientHeight - 110);
		if (screen === "sessions" && content.current) content.current.scrollTop = listScroll.current;
	}, [screen, sessionKey, variant]);
	useEffect(() => {
		if (!panel) return;
		dialog.current?.focus({ preventScroll: true });
		const key = (event: KeyboardEvent) => {
			if (event.key === "Escape") { event.preventDefault(); event.stopImmediatePropagation(); closePanel(); }
			if (event.key !== "Tab") return;
			const targets = [...(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input, textarea, select, a[href], [tabindex="0"]') ?? [])].filter(e => e.getClientRects().length > 0);
			const first = targets[0], last = targets.at(-1);
			if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last?.focus(); }
			else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog.current)) { event.preventDefault(); first?.focus(); }
		};
		document.addEventListener("keydown", key, true);
		return () => document.removeEventListener("keydown", key, true);
	}, [panel]);
	useEffect(() => {
		const key = (event: KeyboardEvent) => {
			if (event.target instanceof Element && event.target.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]')) return;
			if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); switchVariant(); }
		};
		window.addEventListener("keydown", key);
		return () => window.removeEventListener("keydown", key);
	}, [variant]);
	useEffect(() => {
		console.info("[mobile-ui prototype state]", { variant, screen, session: selected?.title, panel, section, phase, drafts, sent, query, filter, model, thinking, fileName, largeText, light });
	}, [variant, screen, selected, panel, section, phase, drafts, sent, query, filter, model, thinking, fileName, largeText, light]);

	const toolButton = <button aria-label="Tools" onClick={() => showPanel("tools")}><SlidersHorizontal size={21} /></button>;
	const sessionButton = <button onClick={() => go("sessions")} aria-label="Open Sessions"><Menu size={21} /><span>Sessions</span></button>;
	const recordButton = <button className={phase !== "idle" ? styles.recording : styles.record} onClick={dictate} disabled={phase === "finalizing"} aria-label={phase === "idle" ? "Dictate (simulation)" : "Stop dictation (simulation)"}>{phase === "idle" ? <Mic size={19} /> : <Square size={17} />}{phase === "idle" ? "Dictate" : phase === "recording" ? "Stop" : "Finishing…"}{phase === "recording" && <span className={styles.meter} aria-hidden="true">▂ ▅ ▃ ▇ ▄ ▆ ▂ ▅</span>}</button>;
	const composer = <div className={styles.composer} data-focused={focused}>
		<label htmlFor="preview-answer">{selected?.messages.length ? "Your explanation" : "What would you like to work on?"}</label>
		{variant === "B" ? <div className={styles.compactLine}>
			<button className={styles.compactIcon} aria-label="Attach working" onClick={() => showPanel("attachment")}><Plus size={18} /></button>
			<div className={styles.compactField} data-phase={phase}>
				<textarea ref={answer} id="preview-answer" value={draft} onChange={e => setDraft(e.target.value)} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} placeholder="Write an answer…" rows={1} readOnly={phase !== "idle"} aria-hidden={phase !== "idle"} tabIndex={phase === "idle" ? 0 : -1} className={phase !== "idle" ? styles.concealedDraft : undefined} />
				{phase !== "idle" && <div className={styles.captureSurface}>
					{phase === "recording" ? <><span className={styles.elapsed} aria-hidden="true">{Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")}</span><span className={styles.audioBars} aria-hidden="true">{[3, 7, 11, 5, 15, 22, 12, 6, 18, 9, 14, 4].map((height, index) => <span key={index} style={{ height, animationDelay: `${index * -0.13}s` }} />)}</span></> : <span className={styles.finishing}>Finishing…</span>}
					<button className={styles.compactIcon} aria-label="Cancel dictation (simulation)" onClick={() => cancelDictation()}><X size={18} /></button>
				</div>}
				<button ref={microphone} className={`${styles.compactIcon} ${styles.micControl}`} onClick={dictate} disabled={phase === "finalizing"} aria-label={phase === "idle" ? "Dictate (simulation)" : phase === "recording" ? "Stop dictation (simulation)" : "Finalizing dictation (simulation)"}>{phase === "idle" ? <Mic size={20} /> : phase === "recording" ? <Square size={18} /> : <LoaderCircle size={20} className={styles.finalizingSpinner} />}</button>
			</div>
			<button className={`${styles.send} ${styles.compactIcon}`} onClick={submit} disabled={!draft.trim() || phase !== "idle"} aria-label="Send answer"><ArrowUp size={22} /></button>
		</div> : <><textarea id="preview-answer" value={draft} onChange={e => setDraft(e.target.value)} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} placeholder="Think it through. Type or dictate…" rows={2} /><div className={styles.answerActions}>{recordButton}<button aria-label="Attach working" onClick={() => showPanel("attachment")}><Plus size={21} /></button><button className={styles.send} onClick={submit} disabled={!draft.trim() || phase !== "idle"} aria-label="Send answer"><ArrowUp size={22} /></button></div></>}
		{variant === "A" ? <div className={styles.secondary}><button onClick={() => showPanel("model")}>{model.includes("current") ? "ChatGPT" : model}<span> · {thinking}</span></button><button onClick={() => showPanel("usage")}>Usage</button></div> : <div className={styles.contextActions}><button onClick={() => showPanel("plan")}><Layers size={16} />Plan</button><button onClick={() => showPanel("model")}>Model · {thinking}</button><button onClick={() => showPanel("usage")}>Usage</button></div>}
		{notice && <p className={variant === "B" && phase !== "idle" ? styles.screenReaderOnly : styles.notice} role="status">{phase === "finalizing" ? "Finishing simulated dictation." : notice}</p>}
	</div>;
	const conversation = <div className={styles.history} ref={history} role="log" aria-label="Conversation history" aria-live="off">
			{selected?.messages.length ? selected.messages.map((message, i) => <article key={i} className={message.role === "user" ? styles.userMessage : styles.tutorMessage}><div className={styles.speaker}>{message.role === "user" ? "You" : "LearnHarness"}</div><MessageResponse>{message.text}</MessageResponse></article>) : <article className={styles.tutorMessage}><h2>Start with what you want to understand.</h2><p>Try a goal or a question. This preview lets you feel the input and navigation without starting a real session.</p></article>}
			{(sent[sessionKey] ?? []).map((text, i) => <article key={`sent-${i}`} className={styles.userMessage}><div className={styles.speaker}>You · preview only</div><p>{text}</p></article>)}
			<div className={styles.endNote}><CircleHelp size={16} /><span>Try explaining why a stationary cylinder can exert force while useful mechanical power is zero.</span></div>
		</div>;
	const chat = variant === "A"
		? <VariantA title={selected?.title ?? "A new beginning"} kind={selected?.kind ?? "Teaching"} navigation={<>{sessionButton}<button onClick={() => showPanel("plan")}><Layers size={19} />Plan</button>{toolButton}</>} history={conversation} composer={composer} />
		: <VariantB title={selected?.title ?? "A new beginning"} kind={selected?.kind ?? "Teaching"} navigation={<button aria-label="Open Sessions" onClick={() => go("sessions")}><Menu size={21} /></button>} tools={toolButton} history={conversation} composer={composer} />;
	const visibleSessions = sessions.filter(s => (filter === "All" || s.kind === filter || (filter === "Practice" && s.kind === "Drill")) && s.title.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
	const sessionsView = <div className={styles.sessions}>
		<header className={styles.header}><button onClick={() => go("home")}><Home size={19} />Home</button><h1>Sessions</h1><button onClick={() => go(selected ? "chat" : "home")}>Close</button></header>
		<div className={styles.createRow}>{["Teaching", "Practice", "Drill"].map(kind => <button key={kind} onClick={() => create(kind)}><Plus size={16} />{kind}</button>)}</div>
		<label className={styles.search}><Search size={19} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search sessions" aria-label="Search sessions" />{query && <button onClick={() => setQuery("")} aria-label="Clear search"><X size={18} /></button>}</label>
		<div className={styles.filters} aria-label="Filter sessions">{["Teaching", "Practice", "All"].map(kind => <button key={kind} aria-pressed={filter === kind} onClick={() => setFilter(kind)}>{kind}</button>)}</div>
		<div ref={content} className={styles.sessionList}>{visibleSessions.map(s => <button className={styles.sessionRow} key={s.id} onClick={() => openSession(s)} aria-current={s.id === selected?.id ? "page" : undefined}><span><strong>{s.title}</strong><small>{s.kind} · {s.updated}</small></span><ChevronRight size={18} /></button>)}{!visibleSessions.length && <p className={styles.empty}>No sessions match. Try another search or filter.</p>}</div>
		<footer className={styles.sessionFooter}><button onClick={() => showPanel("agents")}>Background agents</button><div><button onClick={() => showPanel("settings")}><Settings size={18} />Settings</button><button onClick={() => showPanel("tools")}><SlidersHorizontal size={18} />Tools</button></div></footer>
	</div>;
	const home = <div className={styles.home}>
		<header className={`${styles.header} ${styles.homeHeader}`}><button onClick={() => go("sessions")} aria-label="Open Sessions"><Menu size={21} /></button><label className={styles.search}><Search size={19} /><input placeholder="Search nodes" aria-label="Search nodes" onChange={e => setNotice(e.target.value ? `Preview search: ${e.target.value}` : "")} /></label></header>
		<div className={styles.homeActions}><button onClick={() => showPanel("chains")}>Chains</button><button onClick={() => showPanel("import")}>Import notes</button><button onClick={() => showPanel("graph")} aria-label="Graph display settings"><Settings size={20} /></button></div>
		<div className={styles.homeBody}>
			<div className={styles.homeIntro}><span className={styles.eyebrow}>Your knowledge, connected</span><h1>Pick up the thread.</h1><p>Explore what you have worked on, or continue a conversation.</p></div>
			<div className={styles.graph} aria-label="Illustrative hydraulics concept map"><svg viewBox="0 0 340 200" role="img" aria-label="Force connects to work and pressure; work connects to power"><path d="M60 66L173 38L276 84L237 163L94 160L60 66M173 38L237 163M60 66L237 163" /><g><circle cx="60" cy="66" r="8" /><circle cx="173" cy="38" r="8" /><circle cx="276" cy="84" r="8" /><circle cx="237" cy="163" r="8" /><circle cx="94" cy="160" r="8" /></g><text x="30" y="43">Pressure</text><text x="153" y="18">Force</text><text x="260" y="64">Work</text><text x="216" y="192">Power</text><text x="70" y="190">Flow</text></svg><small>Illustrative map · same content in A and B</small></div>
			{selected && <button className={styles.resume} onClick={() => go("chat")}><span><small>Continue learning</small><strong>{selected.title}</strong><span>{selected.kind} · return to the conversation</span></span><ArrowRight size={22} /></button>}
			<div className={styles.newSession}><h2>Start something new</h2><div className={styles.createRow}>{["Teaching", "Practice", "Drill"].map(kind => <button key={kind} onClick={() => create(kind)}>{kind}<Plus size={16} /></button>)}</div></div>
			{notice && <p className={styles.notice} role="status">{notice}</p>}
		</div>
		<div className={styles.homeFooter}><button onClick={() => showPanel("settings")}><Settings size={18} />Settings</button><button onClick={() => showPanel("usage")}>Usage</button>{toolButton}</div>
	</div>;

	function row(label: string, detail: string, action: () => void, checked = false) {
		return <button key={label} className={styles.option} onClick={action}><span><strong>{label}</strong><small>{detail}</small></span>{checked ? <Check size={20} /> : <ChevronRight size={18} />}</button>;
	}
	let panelBody: ReactNode;
	if (panel === "model") panelBody = <><p className={styles.description}>Choose for this preview. The live session keeps its current configuration.</p>{["ChatGPT · current model", "Strong model", "Fast model"].map(value => row(value, value === model ? "Selected in this preview" : "Illustrative model slot", () => setModel(value), model === value))}<h3>Thinking level</h3><div className={styles.choiceRow}>{["Low", "Medium", "High"].map(value => <button key={value} aria-pressed={thinking === value} onClick={() => setThinking(value)}>{value}</button>)}</div><button className={styles.primary} onClick={closePanel}>Done</button></>;
	else if (panel === "settings" && !section) panelBody = <><p className={styles.description}>One section at a time. Your conversation and draft stay in place.</p>{sectionNames.map(value => row(value, { Providers: "Accounts and dictation", Agent: "Models and thinking", Appearance: "Text and color", Graph: "Knowledge map display", Keyboard: "Shortcuts and input", General: "App and preview" }[value] ?? "", () => setSection(value)))}</>;
	else if (panel === "settings") panelBody = <>{section === "Appearance" ? <><h3>Reading</h3>{row("Larger text", "Try the layout with enlarged reading text", () => setLargeText(!largeText), largeText)}{row("Light appearance", "Local preview only", () => setLight(!light), light)}<p className={styles.readingSample}>A useful interface leaves room to think. Force, distance and time each tell us something different about a hydraulic system.</p></> : <><p className={styles.description}>{section} settings · illustrative controls</p>{row(section === "Providers" ? "ChatGPT" : "Current configuration", "Connected · preview state", () => setNotice("This setting is illustrative; the live configuration is unchanged."), true)}{row(section === "Providers" ? "Deepgram dictation" : "Model & thinking", "Explore the model picker", () => { setPanel("model"); setSection(null); })}<p className={styles.description}>Settings would apply to the app here. This study keeps selections in memory.</p></>}</>;
	else if (panel === "tools") panelBody = <><p className={styles.description}>Two mobile layouts, using recent text from your saved sessions.</p>{row("Reload preview", "Resets drafts, simulated answers and local choices", () => location.reload())}{row("Settings", "Try the section navigation", () => { setPanel("settings"); setSection(null); })}{row("Reset walkthrough", "Return Home; clear preview-only work", () => { setDrafts({}); setSent({}); setPhase("idle"); if (timer.current) clearTimeout(timer.current); setNotice(""); setScreen("home"); closePanel(); })}<h3>Current prototype state</h3><pre className={styles.state}>{JSON.stringify({ variant, screen, session: selected?.title, phase, draft, submittedAnswers: sent[sessionKey] ?? [], query, filter, model, thinking, fileName, largeText, light }, null, 2)}</pre><Link className={styles.exit} href="/">Return to LearnHarness</Link></>;
	else if (panel === "plan" || panel === "chains") panelBody = <><p className={styles.description}>Illustrative {panel === "plan" ? "teaching outline" : "chain detail"} for comparing long supporting content.</p>{["Pressure relates force to area", "Work transfers energy through displacement", "Power describes the rate of energy transfer", "Flow determines cylinder speed"].map((title, i) => <details className={styles.chain} key={title} open={i === 1}><summary><span>{i + 1}. {title}</span></summary><p>For a constant force along the motion, work equals force multiplied by displacement. Dividing by elapsed time connects this to speed and power.</p><div className={styles.formula}>W = F Δx &nbsp; · &nbsp; P = F v</div></details>)}</>;
	else if (panel === "graph") panelBody = <><p className={styles.description}>Display controls · local demonstration</p>{["Node size", "Label size", "Edge width"].map(label => <label className={styles.slider} key={label}>{label}<input type="range" min="0" max="100" defaultValue="50" /></label>)}{row("Reasoning chains", "Inspect the full-height content view", () => setPanel("chains"))}</>;
	else if (panel === "import" || panel === "attachment") panelBody = <><p className={styles.description}>{panel === "import" ? "Choose notes to see the selection state." : "Try attaching a photo of your handwritten working."} Files stay on this device; this prototype does not upload them.</p><label className={styles.fileLabel}>Choose {panel === "import" ? "notes" : "image"}<input type="file" accept={panel === "import" ? ".txt,.md,.pdf" : "image/*"} onChange={e => setFileName(e.target.files?.[0]?.name ?? "")} /></label>{fileName && <div className={styles.fileName}><Check size={20} /><span>{fileName}</span><button aria-label="Remove selected file" onClick={() => setFileName("")}><X size={19} /></button></div>}<button className={styles.primary} onClick={closePanel}>Return to {screen === "chat" ? "answer" : "Home"}</button></>;
	else if (panel === "agents") panelBody = <><p className={styles.description}>Example activity list</p>{["Hydraulics research", "Supporting force visual", "Mechanical work demo"].map(value => <div key={value} className={styles.activity}><Check size={20} /><span>{value}<small>Completed · illustrative status</small></span></div>)}</>;
	else panelBody = <><p className={styles.description}>Illustrative usage layout. These are example values, not billing measurements.</p><dl className={styles.usage}><div><dt>Provider</dt><dd>ChatGPT</dd></div><div><dt>Context</dt><dd>24k / 128k</dd></div><div><dt>Model</dt><dd>{model}</dd></div><div><dt>Thinking</dt><dd>{thinking}</dd></div></dl></>;
	const surface = screen === "home" ? home : screen === "sessions" ? sessionsView : chat;
	return <div ref={root} className={`${styles.root} ${light ? styles.light : ""} ${largeText ? styles.large : ""}`} data-variant={variant} data-screen={screen} data-chat-focused={focused}>
		<div className={`${styles.stage} ${variant === "A" ? styles.variantA : styles.variantB}`} inert={!!panel}>{surface}</div>
		{panel && <div className={styles.backdrop} onClick={e => { if (e.target === e.currentTarget) closePanel(); }}><div ref={dialog} className={`${styles.panel} ${sheet ? styles.sheet : styles.fullPanel}`} role="dialog" aria-modal="true" aria-label={section ?? panelNames[panel]} tabIndex={-1}>
			{sheet && <button className={styles.expand} onClick={() => setExpanded(true)} aria-label="Expand panel"><span /><ArrowUp size={16} /></button>}
			<header className={styles.panelHeader}>{section && <button onClick={() => setSection(null)} aria-label="Back to settings"><ArrowLeft size={20} /></button>}<h2>{section ?? panelNames[panel]}</h2><button onClick={closePanel} aria-label={`Close ${panelNames[panel]}`}><X size={21} /></button></header>
			<div className={styles.panelBody}>{panelBody}</div>
		</div></div>}
		<div className={styles.reviewBar} aria-label="Prototype comparison" inert={!!panel}>
			<button onClick={switchVariant} aria-label="Previous prototype"><ArrowLeft size={18} /></button><div><strong>{variant} · {name}</strong><span>Prototype · speech simulated</span></div><button onClick={switchVariant} aria-label="Next prototype"><ArrowRight size={18} /></button>
		</div>
	</div>;
}

type ConversationLayout = { title: string; kind: string; navigation: ReactNode; history: ReactNode; composer: ReactNode; tools?: ReactNode };
/** A: orientation and supporting-task navigation above the reading surface. */
export function VariantA({ title, kind, navigation, history, composer }: ConversationLayout) {
	return <div className={styles.chat}><header className={styles.header}>{navigation}</header><div className={styles.chatHeading}><span className={styles.eyebrow}>{kind} session</span><h1>{title}</h1><p>Recent history excerpt · preview replies stay here</p></div>{history}{composer}</div>;
}
/** B: compact identity band; supporting-task controls live beside the answer. */
export function VariantB({ title, kind, navigation, tools, history, composer }: ConversationLayout) {
	return <div className={styles.chat}><header className={styles.contextHeader}>{navigation}<div><span>{kind} · recent history</span><h1>{title}</h1></div>{tools}</header>{history}{composer}</div>;
}
