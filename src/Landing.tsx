import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import {
	AlertCircle,
	Bookmark,
	Check,
	Cpu,
	FolderOpen,
	History,
	Image,
	Loader2,
	Package,
	Pencil,
	Skull,
	Sparkles,
	Star,
	Trash2
} from 'lucide-react';
import { ENGINES } from './engine';
import { probeWorkspace, type SlotStatus, type WorkspacePaths, type WorkspaceProbe } from './monster';
import {
	loadSavedWorkspaces,
	newWorkspaceId,
	removeSavedWorkspace,
	saveSavedWorkspace,
	type RecentWorkspace,
	type SavedWorkspace
} from './settings';
import { workspaceLabel } from './App';

/** The four folder rows. `engine` is on `WorkspacePaths` too, but it is a
 *  choice rather than a path and gets its own control below the rows.
 *
 *  `label` and `hint` are i18n keys — translated at the render site, so the
 *  table can keep its JSX icons and stay a module constant. The hints that are
 *  bare paths ("data/monster") simply have no dictionary entry and fall through. */
type SlotKey = 'monsters' | 'items' | 'client' | 'spells';

const SLOTS: { key: SlotKey; label: string; hint: string; icon: JSX.Element; optional?: boolean }[] = [
	{ key: 'monsters', label: 'Monsters folder', hint: 'data/monster', icon: <Skull size={16} /> },
	{
		key: 'items',
		label: 'Items folder',
		hint: 'data/items — items.otb + items.xml|toml|srv',
		icon: <Package size={16} />
	},
	{ key: 'client', label: 'Client folder', hint: 'Tibia.dat + Tibia.spr', icon: <Image size={16} /> },
	{
		key: 'spells',
		label: 'Spells folder',
		hint: 'data/spells',
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
	const { t } = useTranslation();
	const [paths, setPaths] = useState<WorkspacePaths>(EMPTY);
	const [probe, setProbe] = useState<WorkspaceProbe | null>(null);
	const [probing, setProbing] = useState(false);
	const [hoverSlot, setHoverSlot] = useState<SlotKey | null>(null);
	const [saved, setSaved] = useState<SavedWorkspace[]>(loadSavedWorkspaces);
	// The name editor is one input serving two jobs: naming the workspace that is
	// currently in the rows, and renaming one already in the list. `naming` holds
	// the id being renamed, or 'new' while saving what is on screen.
	const [naming, setNaming] = useState<string | null>(null);
	const [nameDraft, setNameDraft] = useState('');

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

	// Saving keeps the engine as it will be opened — the picked one, or the
	// sniffed guess — so a saved workspace never has to be sniffed again.
	const commitName = useCallback(() => {
		const name = nameDraft.trim();
		if (!naming || !name) {
			setNaming(null);
			return;
		}
		if (naming === 'new') {
			if (!probe?.monsters.ok) {
				setNaming(null);
				return;
			}
			setSaved(
				saveSavedWorkspace({
					id: newWorkspaceId(),
					name,
					paths: { ...paths, engine: paths.engine ?? probe.engine.best }
				})
			);
		} else {
			const entry = saved.find(w => w.id === naming);
			if (entry) setSaved(saveSavedWorkspace({ ...entry, name }));
		}
		setNaming(null);
	}, [naming, nameDraft, paths, probe, saved]);

	const engineLabel = useCallback(
		(key: string | null) => t(ENGINES.find(e => e.key === key)?.label ?? 'auto-detect'),
		[t]
	);

	return (
		<div className="ss-landing">
			<img src="/icon.png" alt="" className="ss-landing-icon" width={40} height={40} />

			{/* No language picker here: the titlebar's flags are on screen directly
			    above this, in every state the app has. Two pickers a few pixels
			    apart would only make the choice look like two different settings. */}
			{error && <div className="ss-landing-error">{error}</div>}

			{/* Two columns: picking folders on the left, workspaces you already have
			    on the right. The right one is only there when there is something in
			    it, so a first run is the single centred column it always was. */}
			<div className="mx-landing-cols" data-side={saved.length || recent.length ? 'true' : undefined}>
				<div className="mx-landing-col">
					<div className="mx-landing-group">
						<div className="mx-saved-label">{t('Folders')}</div>
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
												{t(slot.label)}
												{slot.optional && <span className="mx-slot-optional">{t('optional')}</span>}
											</span>
											<span className="mx-slot-path mono">{path || t(slot.hint)}</span>
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
					</div>
		
					{/* The engine is one word once it is known, so it reads as one: a chip
					    the width of its own name. The select is the chip — no label, no
					    blurb on screen (it lives in each option's tooltip), and the note
					    beside it says only whether the word was guessed or picked. */}
					{probe?.monsters.ok && (
						<div className="mx-engine-chip">
							<Cpu size={13} />
							<select
								value={paths.engine ?? probe.engine.best}
								onChange={e => setPaths(p => ({ ...p, engine: e.target.value }))}
							>
								{ENGINES.map(e => (
									<option key={e.key} value={e.key} title={t(e.blurb)}>
										{t(e.label)}
									</option>
								))}
							</select>
							{/* Say when the guess was a guess. Getting this wrong mislabels
							    every lint at once, so a close call is worth flagging. */}
							<span
								className="mx-engine-chip-note"
								data-weak={paths.engine || probe.engine.confident ? undefined : 'true'}
								title={
									paths.engine
										? undefined
										: t('detected from {{evidence}}', {
												evidence:
													probe.engine.candidates.find(c => c.key === probe.engine.best)?.evidence[0] ??
													t('the corpus')
											})
								}
							>
								{paths.engine
									? t('chosen')
									: probe.engine.confident
										? t('detected')
										: t('uncertain — check this')}
							</span>
							{degraded && (
								<span
									className="mx-engine-chip-note"
									data-weak="true"
									title={t(
										'No item database or client files — monsters open and save normally, but nothing is drawn and loot ids stay numbers.'
									)}
								>
									{t('no previews')}
								</span>
							)}
						</div>
					)}
		
					<div className="mx-landing-actions">
						<button className="ss-btn ss-btn-primary" disabled={!ready} onClick={() => onOpen(paths)}>
							{opening || probing ? <Loader2 size={15} className="ss-spin" /> : <FolderOpen size={15} />}
							{opening ? t('Opening…') : probing ? t('Checking…') : t('Open workspace')}
						</button>
						{naming === 'new' ? (
							<input
								className="mx-saved-input"
								autoFocus
								placeholder={t('Workspace name')}
								value={nameDraft}
								onChange={e => setNameDraft(e.target.value)}
								onBlur={commitName}
								onKeyDown={e => {
									if (e.key === 'Enter') commitName();
									if (e.key === 'Escape') setNaming(null);
								}}
							/>
						) : (
							<button
								className="ss-btn"
								disabled={!ready}
								title={t('Save these folders under a name, to open in one click')}
								onClick={() => {
									setNameDraft(workspaceLabel(paths.monsters));
									setNaming('new');
								}}
							>
								<Bookmark size={15} />
								{t('Save workspace')}
							</button>
						)}
					</div>
				</div>

				{(saved.length > 0 || recent.length > 0) && (
					<div className="mx-landing-side">
						{saved.length > 0 && (
							<div className="mx-saved">
								<div className="mx-saved-label">{t('Saved workspaces')}</div>
								{saved.map(entry => (
									<div key={entry.id} className="mx-saved-row">
										{naming === entry.id ? (
											<input
												className="mx-saved-input"
												autoFocus
												value={nameDraft}
												onChange={e => setNameDraft(e.target.value)}
												onBlur={commitName}
												onKeyDown={e => {
													if (e.key === 'Enter') commitName();
													if (e.key === 'Escape') setNaming(null);
												}}
											/>
										) : (
											<button
												className="mx-saved-open"
												disabled={opening}
												onClick={() => onOpen(entry.paths)}
												title={entry.paths.monsters}
											>
												<Star size={14} />
												<span className="mx-saved-body">
													<span className="mx-saved-name">{entry.name}</span>
													<span className="mx-saved-path mono">{entry.paths.monsters}</span>
												</span>
												<span className="mx-saved-engine">{engineLabel(entry.paths.engine)}</span>
											</button>
										)}
										<button
											className="mx-saved-act"
											title={t('Rename')}
											onClick={() => {
												setNameDraft(entry.name);
												setNaming(entry.id);
											}}
										>
											<Pencil size={13} />
										</button>
										<button
											className="mx-saved-act"
											title={t('Forget this workspace')}
											onClick={() => setSaved(removeSavedWorkspace(entry.id))}
										>
											<Trash2 size={13} />
										</button>
									</div>
								))}
							</div>
						)}
			
						{recent.length > 0 && (
							<div className="ss-recent">
								<div className="ss-recent-label">{t('Recent')}</div>
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
				)}
			</div>

			{/* The only place the app states its own version. `open_external` hands
			    the URL to the OS browser — the webview will not navigate away from
			    the app, so a plain href here does nothing. */}
			<div className="mx-credit">
				MONx {__APP_VERSION__} — {t('by')}{' '}
				<button
					className="mx-credit-link"
					onClick={() => {
						// No browser, or the shell refused: not worth a toast on the
						// landing screen, where there is nothing to interrupt.
						invoke('open_external', { url: 'https://github.com/Coldensjo' }).catch(() => {});
					}}
				>
					Siz
				</button>
				, {t('built with Claude')}
			</div>
		</div>
	);
}
