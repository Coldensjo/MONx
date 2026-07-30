import { useCallback, useEffect, useState } from 'react';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import {
	AlertCircle,
	Check,
	FolderOpen,
	History,
	Image,
	Loader2,
	Package,
	Skull,
	Sparkles
} from 'lucide-react';
import { ENGINES } from './engine';
import { probeWorkspace, type SlotStatus, type WorkspacePaths, type WorkspaceProbe } from './monster';
import type { RecentWorkspace } from './settings';

/** The four folder rows. `engine` is on `WorkspacePaths` too, but it is a
 *  choice rather than a path and gets its own control below the rows. */
type SlotKey = 'monsters' | 'items' | 'client' | 'spells';

const SLOTS: { key: SlotKey; label: string; hint: string; icon: JSX.Element; optional?: boolean }[] = [
	{ key: 'monsters', label: 'Monsters folder', hint: 'data/monster', icon: <Skull size={16} /> },
	{
		key: 'items',
		label: 'Items folder',
		hint: 'data/items — items.otb + items.xml',
		icon: <Package size={16} />
	},
	{ key: 'client', label: 'Client folder', hint: 'Tibia.dat + Tibia.spr', icon: <Image size={16} /> },
	{
		key: 'spells',
		label: 'Spells folder',
		hint: 'data/spells — optional, enables ### spell verification',
		icon: <Sparkles size={16} />,
		optional: true
	}
];

const EMPTY: WorkspacePaths = { monsters: '', items: '', client: '', spells: null, engine: null };

interface Props {
	error: string | null;
	opening: boolean;
	/** A folder dropped on the window, from App's webview drag wiring. */
	droppedPath: string | null;
	recent: RecentWorkspace[];
	onOpen: (paths: WorkspacePaths) => void;
	onOpenRecent: (entry: RecentWorkspace) => void;
}

function slotOf(probe: WorkspaceProbe | null, key: SlotKey): SlotStatus | null {
	return probe ? probe[key] : null;
}

export default function Landing({ error, opening, droppedPath, recent, onOpen, onOpenRecent }: Props) {
	const [paths, setPaths] = useState<WorkspacePaths>(EMPTY);
	const [probe, setProbe] = useState<WorkspaceProbe | null>(null);
	const [probing, setProbing] = useState(false);
	const [hoverSlot, setHoverSlot] = useState<SlotKey | null>(null);

	// Every path change is re-probed, and the probe result — not what the user
	// picked — is what fills the rows: the backend resolves a file to its folder
	// and expands a server `data/` root into all three slots.
	useEffect(() => {
		if (!paths.monsters && !paths.items && !paths.client && !paths.spells) {
			setProbe(null);
			return;
		}
		let cancelled = false;
		setProbing(true);
		probeWorkspace(paths)
			.then(result => {
				if (cancelled) return;
				setProbe(result);
				setPaths(prev => ({
					monsters: result.monsters.path ?? prev.monsters,
					items: result.items.path ?? prev.items,
					client: result.client.path ?? prev.client,
					spells: result.spells.path ?? prev.spells,
					// Never overwritten by the probe: once the user has picked an
					// engine it stays picked, even as they keep editing paths.
					engine: prev.engine
				}));
			})
			.catch(() => {
				if (!cancelled) setProbe(null);
			})
			.finally(() => {
				if (!cancelled) setProbing(false);
			});
		return () => {
			cancelled = true;
		};
	}, [paths.monsters, paths.items, paths.client, paths.spells]);

	// The webview drop event carries no coordinates, so a drop lands in the row
	// the pointer is over, falling back to `monsters` — which is also the slot
	// that expands a server data/ root into the rest.
	useEffect(() => {
		if (!droppedPath) return;
		const key = hoverSlot ?? 'monsters';
		setPaths(prev => ({ ...prev, [key]: droppedPath }));
		// hoverSlot is read at drop time only; re-running on hover would re-apply
		// the same path to whichever row the pointer wandered into next.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [droppedPath]);

	const pick = useCallback(async (key: SlotKey) => {
		const picked = await openDialog({ directory: true, multiple: false });
		if (typeof picked === 'string') setPaths(prev => ({ ...prev, [key]: picked }));
	}, []);

	// Only the monsters folder is required. Canary and BlackTek ship neither
	// `items.otb` nor a `.spr`/`.dat` pair, so insisting on all three would make
	// their corpora unopenable in exchange for previews they cannot have. The
	// slots still show what is missing, and the editor degrades rather than
	// refusing: loot ids stay numbers and nothing is drawn.
	const ready = !!probe && probe.monsters.ok && !probing && !opening;
	const degraded = !!probe && probe.monsters.ok && !(probe.items.ok && probe.client.ok);

	return (
		<div className="ss-landing">
			<img src="/icon.png" alt="" className="ss-landing-icon" width={40} height={40} />

			{error && <div className="ss-landing-error">{error}</div>}

			<div className="mx-slots">
				{SLOTS.map(slot => {
					const status = slotOf(probe, slot.key);
					const path = slot.key === 'spells' ? paths.spells : paths[slot.key];
					const state = !path ? 'empty' : status?.ok ? 'ok' : 'bad';
					return (
						<button
							key={slot.key}
							className="mx-slot"
							data-state={state}
							data-hover={hoverSlot === slot.key ? 'true' : undefined}
							onClick={() => void pick(slot.key)}
							onMouseEnter={() => setHoverSlot(slot.key)}
							onMouseLeave={() => setHoverSlot(s => (s === slot.key ? null : s))}
						>
							<span className="mx-slot-icon">{slot.icon}</span>
							<span className="mx-slot-body">
								<span className="mx-slot-label">
									{slot.label}
									{slot.optional && <span className="mx-slot-optional">optional</span>}
								</span>
								<span className="mx-slot-path mono">{path || slot.hint}</span>
								{status && (status.summary || status.error) && (
									<span className="mx-slot-status" data-ok={status.ok ? 'true' : 'false'}>
										{status.ok ? <Check size={12} /> : <AlertCircle size={12} />}
										{status.summary ?? status.error}
									</span>
								)}
							</span>
						</button>
					);
				})}
			</div>

			{probe?.monsters.ok && (
				<label className="mx-engine-pick">
					<span className="mx-engine-pick-label">Engine</span>
					<select
						value={paths.engine ?? probe.engine.best}
						onChange={e => setPaths(p => ({ ...p, engine: e.target.value }))}
					>
						{ENGINES.map(e => (
							<option key={e.key} value={e.key}>
								{e.label} — {e.blurb}
							</option>
						))}
					</select>
					{/* Say when the guess was a guess. Getting this wrong mislabels
					    every lint at once, so a close call is worth a sentence. */}
					<span className="mx-engine-pick-note" data-weak={probe.engine.confident ? undefined : 'true'}>
						{paths.engine
							? 'chosen'
							: probe.engine.confident
								? `detected from ${probe.engine.candidates.find(c => c.key === probe.engine.best)?.evidence[0] ?? 'the corpus'}`
								: 'could not tell confidently — check this'}
					</span>
				</label>
			)}

			{degraded && (
				<div className="mx-engine-pick-note" data-weak="true">
					No item database or client files — monsters open and save normally, but nothing is
					drawn and loot ids stay numbers.
				</div>
			)}

			<button className="ss-btn ss-btn-primary" disabled={!ready} onClick={() => onOpen(paths)}>
				{opening || probing ? <Loader2 size={15} className="ss-spin" /> : <FolderOpen size={15} />}
				{opening ? 'Opening…' : probing ? 'Checking…' : 'Open workspace'}
			</button>

			{recent.length > 0 && (
				<div className="ss-recent">
					<div className="ss-recent-label">Recent</div>
					{recent.map(entry => (
						<button
							key={entry.paths.monsters}
							className="ss-recent-row"
							onClick={() => onOpenRecent(entry)}
							disabled={opening}
						>
							<History size={14} />
							<span className="ss-recent-path">
								{entry.label} — {entry.paths.monsters}
							</span>
						</button>
					))}
				</div>
			)}
		</div>
	);
}
