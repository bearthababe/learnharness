"use client";

import { useEffect, useState } from "react";
import type { RuntimeStatus } from "@/src/core";
import { SettingsRow } from "./controls.tsx";

export function RuntimeSettings() {
	const [status, setStatus] = useState<RuntimeStatus | null>(null);
	useEffect(() => {
		const controller = new AbortController();
		const refresh = () => {
			void fetch("/api/runtime", { cache: "no-store", signal: controller.signal }).then(response => {
				if (!response.ok) throw new Error("Runtime status unavailable");
				return response.json();
			}).then(setStatus).catch(() => { if (!controller.signal.aborted) setStatus(null); });
		};
		refresh();
		const timer = setInterval(refresh, 15000);
		return () => { controller.abort(); clearInterval(timer); };
	}, []);
	return <SettingsRow label="Running service" testid="row-runtime" hint={<span role="status" data-testid="runtime-status" className="[overflow-wrap:anywhere]">{status ? <><span className="block">Commit {status.revision}</span><span className="block">Build {status.buildId ?? status.sourceHash} · Process {status.pid ?? "external"}</span><span className="block">{status.mode === "local-service" ? `Local Linux service · ${status.updater === "running" ? "Updater running" : "Updater not running"} · ${status.updateState} · Activity ${status.activity}` : "External runtime · Updates managed outside this service"}</span>{status.candidate && <span className="block">Candidate {status.candidate}</span>}{status.updateReason && <span className="block">{status.updateReason}</span>}{!!status.activityReasons?.length && <span className="block">{status.activityReasons.join(", ")}</span>}</> : "Runtime status unavailable"}</span>}>{null}</SettingsRow>;
}
