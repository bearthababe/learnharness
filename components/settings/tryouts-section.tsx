"use client";

import { setPrototypeView, usePrototypeView } from "@/components/device-prefs";
import { useDeviceClass, type DeviceClass } from "@/components/device-features";
import { TRYOUT_DEFS, TRYOUT_DEVICE, tryoutIdsFor, type TryoutDef } from "@/components/tryout-registry";

export { TRYOUT_DEVICE, tryoutIdsFor };

/**
 * Settings → Try-out designs (round 16, owner rule): the alternatives the
 * owner wants to compare, kept apart from the everyday settings. Every
 * variant is complete and working; the first is the default. Each is kept
 * on this device, and says which device it is for.
 */
type Variant = { value: string; label: string; description: string; testid: string };
type TryoutRow = {
	id: string;
	title: string;
	description: string;
	device: string;
	applies: boolean;
	note?: string;
	value: string;
	variants: Variant[];
	onPick: (value: string) => void;
};

function TryoutCard({ row }: { row: TryoutRow }) {
	return (
		<section className="lh-tryout" data-testid={`tryout-${row.id}`} data-applies={row.applies} aria-labelledby={`tryout-${row.id}-title`}>
			<div className="lh-tryout-head">
				<h3 id={`tryout-${row.id}-title`} className="lh-tryout-title">{row.title}</h3>
				<span className="lh-tryout-device">{row.device}</span>
			</div>
			<p className="lh-tryout-desc">{row.description}</p>
			<div className="lh-tryout-options" role="radiogroup" aria-labelledby={`tryout-${row.id}-title`}>
				{row.variants.map((variant, index) => {
					const checked = row.value === variant.value;
					return (
						<button
							key={variant.value}
							type="button"
							role="radio"
							aria-checked={checked}
							data-active={checked}
							disabled={!row.applies}
							data-testid={variant.testid}
							className="lh-tryout-option"
							onClick={() => row.onPick(variant.value)}
						>
							<span className="lh-tryout-radio" aria-hidden="true" />
							<span className="lh-tryout-option-text">
								<span className="lh-tryout-option-label">
									{variant.label}
									{index === 0 && <span className="lh-tryout-default">Default</span>}
								</span>
								<span className="lh-tryout-option-desc">{variant.description}</span>
							</span>
						</button>
					);
				})}
			</div>
			{!row.applies && row.note && <p className="lh-tryout-note" data-testid={`tryout-${row.id}-note`}>{row.note}</p>}
		</section>
	);
}

const ON: Record<DeviceClass, string> = { phone: "phone", tablet: "tablet", laptop: "computer" };

/** One try-out's row, read from its declaration (the hooks run in the
 *  registry's fixed order, so the list is stable). */
function useTryoutRow(def: TryoutDef): TryoutRow & { on: DeviceClass } {
	const value = def.useValue();
	const applies = def.useApplies?.() ?? { applies: true };
	return {
		on: def.on, id: def.id, title: def.title, description: def.description,
		device: def.on === "phone" ? "Phone" : def.on === "tablet" ? "Tablet" : "Computer",
		applies: applies.applies, note: applies.note, value,
		variants: def.variants.map((variant) => ({ ...variant, testid: `${def.id}-${variant.value}` })),
		onPick: def.set,
	};
}

/**
 * Round 17 (L2): only this device's options are listed — a phone shows
 * the phone's, a tablet the tablet's; a computer has none to try and says
 * so. An option this device has but cannot use yet (the handwriting
 * notebook switched off, say) stays listed, greyed, with how to turn it on.
 * B18 (round 18, owner): "Prototype view" puts a switch next to each of
 * them where it shows (PrototypeSwitch), to flip it in place.
 */
export function TryoutsSection() {
	const device = useDeviceClass();
	const prototype = usePrototypeView();
	const rows = TRYOUT_DEFS.map(useTryoutRow);
	if (!device) return <div className="lh-tryouts" data-testid="tryouts" />;
	const ids: string[] = tryoutIdsFor(device);
	const here = rows.filter((row) => ids.includes(row.id));
	// Usable ones first; one this device cannot use yet stays, greyed.
	const ordered = [...here.filter((row) => row.applies), ...here.filter((row) => !row.applies)];
	return (
		<div className="lh-tryouts" data-testid="tryouts" data-device={device}>
			{ordered.length
				? <p className="lh-tryouts-intro">Alternative designs to compare on this {ON[device]}. Each one works fully; switch any time. Kept on this {ON[device]}.</p>
				: <p className="lh-tryouts-intro" data-testid="tryouts-none">There is nothing to try on a {ON[device]} right now. The try-out designs are for phones and tablets; open Settings there to compare them.</p>}
			{ordered.length > 0 && (
				<button type="button" role="switch" aria-checked={prototype} className="lh-proto-toggle" data-testid="prototype-view-toggle" onClick={() => setPrototypeView(!prototype)}>
					<span className="lh-proto-toggle-text">
						<span className="lh-proto-toggle-title">Prototype view</span>
						<span className="lh-proto-toggle-desc">A small switch next to each design below, right where it shows, to flip it in place. For comparing; kept on this {ON[device]}.</span>
					</span>
					<span className="lh-proto-toggle-track" aria-hidden="true"><span className="lh-proto-toggle-knob" /></span>
				</button>
			)}
			{ordered.map((row) => <TryoutCard key={row.id} row={row} />)}
		</div>
	);
}
