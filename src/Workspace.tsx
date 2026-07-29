import { useCallback, useEffect, useMemo, useState } from 'react';
import { confirm } from '@tauri-apps/plugin-dialog';
import { Package, PersonStanding, Plus, Save, Skull, Sparkles, Trash2, Wand2 } from 'lucide-react';
import {
	getItem,
	getMonster,
	itemsRowUrl,
	itemUrl,
	lintMonster,
	lintWorkspace,
	listMonsterGroups,
	listMonsterScripts,
	listMonsters,
	listSpellNames,
	nextFreeRaceid,
	revealMonster,
	saveMonster,
	searchItems,
	thingsRowUrlFor,
	thingUrlFor,
	type SpellName,
	type ItemInfo,
	type Lint,
	type MonsterDoc,
	type MonsterSummary,
	type WorkspaceInfo
} from './monster';
import Menubar, { type Menu } from './Menubar';
import { newLootEntry } from './sections/Loot';
import PinLootDialog, { type PinScope } from './PinLootDialog';
import { getThing, getThings, type ThingSummary } from './spr';
import { loadSetting, saveSetting } from './settings';
import { workspaceLabel, type Toast } from './App';
import MonsterList from './MonsterList';
import PreviewPanel from './PreviewPanel';
import LintPanel, { LintStatus } from './LintPanel';
import ThingBrowser from './ThingBrowser';
import { MonsterEditor } from './MonsterEditor';
import type { PreviewUrl, ThingAnimLookup } from './fields/preview';

/** The centre column's content. `monsters` is the editor; the rest are the
 *  reference browsers, kept beside the editor rather than in a separate mode. */
type View = 'monsters' | 'items' | 'outfits' | 'effects' | 'missiles';

/** The three nav entries backed by a dat category, and that category's own name. */
type ThingView = 'outfits' | 'effects' | 'missiles';

const THING_CAT: Record<ThingView, 'outfit' | 'effect' | 'missile'> = {
	outfits: 'outfit',
	effects: 'effect',
	missiles: 'missile'
};

interface Props {
	info: WorkspaceInfo;
	monsters: MonsterSummary[];
	onMonstersChanged: (focusFile: string | null) => void;
	dirty: boolean;
	onDirtyChange: (dirty: boolean) => void;
	onOpenFile: (file: string | null) => void;
	showToast: (kind: Toast['kind'], msg: string) => void;
	onCloseWorkspace: () => void;
}

export default function Workspace({
	info,
	monsters,
	onMonstersChanged,
	dirty,
	onDirtyChange,
	onOpenFile,
	showToast,
	onCloseWorkspace
}: Props) {
	const [view, setView] = useState<View>('monsters');
	const [tool, setTool] = useState<PinScope | null>(null);
	const [selected, setSelected] = useState<string | null>(() =>
		loadSetting('monx.lastMonster', null)
	);
	const [doc, setDoc] = useState<MonsterDoc | null>(null);
	const [monsterLints, setMonsterLints] = useState<Lint[]>([]);
	const [workspaceLints, setWorkspaceLints] = useState<Lint[]>(info.lints);
	const [lintsOpen, setLintsOpen] = useState(false);
	const [groups, setGroups] = useState<string[]>([]);
	const [items, setItems] = useState<Map<number, ItemInfo>>(new Map());
	const [itemList, setItemList] = useState<ItemInfo[]>([]);
	const [saving, setSaving] = useState(false);
	/** Bumped to re-read the open monster from disk after a corpus-wide tool ran. */
	const [reloadKey, setReloadKey] = useState(0);
	const [spells, setSpells] = useState<SpellName[]>([]);
	const [scripts, setScripts] = useState<string[]>([]);
	const [nextRaceid, setNextRaceid] = useState<number | null>(null);
	const [things, setThings] = useState<Record<'outfit' | 'effect' | 'missile', ThingSummary[]>>({
		outfit: [],
		effect: [],
		missile: []
	});
	/** The Loot staging tray under the Items browser — collected via right-click,
	 *  appended to the open monster in one go. Session-scoped, deduped by server id. */
	const [lootTray, setLootTray] = useState<ItemInfo[]>([]);
	/** `item` is the cell under the cursor (for single-item actions like the corpse);
	 *  `items` is the whole effective selection. */
	const [itemMenu, setItemMenu] = useState<{ x: number; y: number; item: ItemInfo; items: ItemInfo[] } | null>(
		null
	);
	const label = workspaceLabel(info.paths.monsters);

	// Fall back to the first monster when the remembered one is gone.
	useEffect(() => {
		if (monsters.length === 0) return;
		if (!selected || !monsters.some(m => m.file === selected)) {
			setSelected(monsters[0].file);
		}
	}, [monsters, selected]);

	useEffect(() => {
		if (!selected) return;
		saveSetting('monx.lastMonster', selected);
		onOpenFile(selected);
		let cancelled = false;
		getMonster(selected)
			.then(d => {
				if (cancelled) return;
				setDoc(d);
				onDirtyChange(false);
				return lintMonster(d).then(l => !cancelled && setMonsterLints(l));
			})
			.catch(e => showToast('error', String(e)));
		return () => {
			cancelled = true;
		};
	}, [selected, reloadKey, onOpenFile, onDirtyChange, showToast]);

	useEffect(() => {
		listMonsterGroups().then(setGroups).catch(() => setGroups([]));
		listSpellNames().then(setSpells).catch(() => setSpells([]));
		listMonsterScripts().then(setScripts).catch(() => setScripts([]));
	}, []);

	// Recomputed per selection: creating or deleting a monster moves the next
	// free id, and the Identity section shows it beside the raceid field.
	useEffect(() => {
		nextFreeRaceid()
			.then(setNextRaceid)
			.catch(() => setNextRaceid(null));
	}, [monsters]);

	/** Client things for the editor's effect, missile and outfit previews. */
	const previewUrl = useCallback<PreviewUrl>(
		(kind, id, opts) => {
			if (kind === 'item') return itemUrl(id);
			return thingUrlFor(info.sprPath, info.datPath, kind, id, info.transparent, opts);
		},
		[info.sprPath, info.datPath, info.transparent]
	);

	/** Frame and pattern counts, so the spell stage animates the real cycle length. */
	const thingAnim = useCallback<ThingAnimLookup>(
		async (kind, id) => {
			if (kind === 'item') return null;
			try {
				const t = await getThing(info.datPath, kind, id);
				return { frames: t.frames, patternX: t.patternX, patternY: t.patternY };
			} catch {
				// An unknown id is a lint elsewhere; here it just means "don't animate".
				return null;
			}
		},
		[info.datPath]
	);

	const monsterNames = useMemo(() => monsters.map(m => m.name), [monsters]);

	const reveal = useCallback(
		(file: string) => {
			revealMonster(file).catch(e => showToast('error', String(e)));
		},
		[showToast]
	);

	const editDoc = useCallback(
		(next: MonsterDoc) => {
			setDoc(next);
			onDirtyChange(true);
			lintMonster(next)
				.then(setMonsterLints)
				.catch(() => {});
		},
		[onDirtyChange]
	);

	// Double-clicking an outfit in the browser adopts it as the monster's look,
	// after a confirmation — same mutation as dropping it on the Look section.
	const pickOutfit = useCallback(
		async (t: ThingSummary) => {
			if (!doc) return;
			const label = t.name ? `${t.name} (${t.id})` : `#${t.id}`;
			const ok = await confirm(`Set ${doc.name}'s outfit to ${label}?`, { title: 'Change outfit' });
			if (!ok) return;
			editDoc({ ...doc, look: { ...doc.look, mode: 'type', type: t.id } });
			setView('monsters');
			showToast('ok', `Outfit set to ${label}`);
		},
		[doc, editDoc, showToast]
	);

	// The item browser gets every pickupable item — the grid virtualizes rows,
	// so the full list costs no more than a page of it. Only pickupable items:
	// the browser exists to feed loot, and walls or ground tiles can never be
	// carried. The corpse/typeex pickers search unfiltered.
	useEffect(() => {
		searchItems('', Number.MAX_SAFE_INTEGER, true).then(setItemList).catch(() => setItemList([]));
	}, []);

	// The outfit / effect / missile lists come straight from the dat, through the
	// inherited `get_things`. Loaded once; the client files never change while a
	// workspace is open.
	useEffect(() => {
		let cancelled = false;
		Promise.all([
			getThings(info.datPath, 'outfit').catch(() => []),
			getThings(info.datPath, 'effect').catch(() => []),
			getThings(info.datPath, 'missile').catch(() => [])
		]).then(([outfit, effect, missile]) => {
			if (!cancelled) setThings({ outfit, effect, missile });
		});
		return () => {
			cancelled = true;
		};
	}, [info.datPath]);

	// Resolve just the items this monster references, for the preview panel.
	useEffect(() => {
		if (!doc) return;
		const ids = new Set<number>();
		const walk = (entries: MonsterDoc['loot']) =>
			entries.forEach(e => {
				if (e.id) ids.add(e.id);
				walk(e.children);
			});
		walk(doc.loot);
		if (doc.look.corpse) ids.add(doc.look.corpse);
		if (doc.look.typeex) ids.add(doc.look.typeex);
		if (ids.size === 0) {
			setItems(new Map());
			return;
		}
		let cancelled = false;
		Promise.all([...ids].map(id => getItem(id).catch(() => null))).then(resolved => {
			if (cancelled) return;
			setItems(new Map(resolved.filter((i): i is ItemInfo => !!i).map(i => [i.serverId, i])));
		});
		return () => {
			cancelled = true;
		};
	}, [doc]);

	const save = useCallback(async () => {
		if (!doc) return;
		setSaving(true);
		try {
			const lints = await saveMonster(doc);
			setMonsterLints(lints);
			onDirtyChange(false);
			showToast('ok', `Saved ${doc.file}`);
			setWorkspaceLints(await lintWorkspace());
		} catch (e) {
			showToast('error', String(e));
		} finally {
			setSaving(false);
		}
	}, [doc, onDirtyChange, showToast]);

	useEffect(() => {
		const handler = (e: KeyboardEvent) => {
			if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
				e.preventDefault();
				void save();
			}
		};
		window.addEventListener('keydown', handler);
		return () => window.removeEventListener('keydown', handler);
	}, [save]);

	const refreshMonsters = useCallback(
		(focusFile: string | null) => {
			onMonstersChanged(focusFile);
			if (focusFile) setSelected(focusFile);
			void listMonsters().catch(() => {});
			lintWorkspace().then(setWorkspaceLints).catch(() => {});
		},
		[onMonstersChanged]
	);

	// The corpus tools rewrite files straight from the on-disk corpus, so an
	// unsaved editor buffer would be silently overwritten by the next save.
	// Blocked rather than merged: the fix is one Ctrl+S away.
	const toolsBlocked = dirty ? ' — save first' : '';
	const menus: Menu[] = [
		{
			label: 'File',
			items: [
				{ label: 'Save monster', shortcut: 'Ctrl+S', disabled: !doc || saving, onSelect: () => void save() },
				{ label: 'Close workspace', shortcut: 'Ctrl+O', separated: true, onSelect: onCloseWorkspace }
			]
		},
		{
			label: 'Tools',
			items: [
				{
					label: `Pin ambiguous loot ids…${toolsBlocked}`,
					disabled: dirty,
					onSelect: () => setTool('ambiguous')
				},
				{
					label: `Pin all loot ids…${toolsBlocked}`,
					disabled: dirty,
					onSelect: () => setTool('all')
				}
			]
		}
	];

	const nav: { key: View; label: string; icon: JSX.Element; count: number }[] = [
		{ key: 'monsters', label: 'Monsters', icon: <Skull size={16} />, count: info.monsterCount },
		{ key: 'items', label: 'Items', icon: <Package size={16} />, count: itemList.length },
		{
			key: 'outfits',
			label: 'Outfits',
			icon: <PersonStanding size={16} />,
			count: things.outfit.length
		},
		{ key: 'effects', label: 'Effects', icon: <Sparkles size={16} />, count: things.effect.length },
		{ key: 'missiles', label: 'Missiles', icon: <Wand2 size={16} />, count: things.missile.length }
	];

	const itemRowUrl = useCallback(
		(visible: ItemInfo[], cell: number) => itemsRowUrl(visible.map(i => i.serverId), cell),
		[]
	);
	const itemKey = useCallback((i: ItemInfo) => i.serverId, []);
	const itemLabel = useCallback((i: ItemInfo) => i.name || `#${i.serverId}`, []);
	const itemSearchText = useCallback((i: ItemInfo) => i.name, []);
	const itemSearchId = useCallback((i: ItemInfo) => i.serverId, []);

	const itemContextMenu = useCallback((item: ItemInfo, e: React.MouseEvent, selected: ItemInfo[]) => {
		setItemMenu({ x: e.clientX, y: e.clientY, item, items: selected });
	}, []);

	const addToTray = useCallback(
		(picked: ItemInfo[]) => {
			setLootTray(prev => {
				const have = new Set(prev.map(i => i.serverId));
				const fresh = picked.filter(i => !have.has(i.serverId));
				return fresh.length > 0 ? [...prev, ...fresh] : prev;
			});
			showToast('ok', `Added ${picked.length} ${picked.length === 1 ? 'item' : 'items'} to Loot`);
		},
		[showToast]
	);

	const clearTray = useCallback(async () => {
		const n = lootTray.length;
		const ok = await confirm(`Clear ${n} ${n === 1 ? 'item' : 'items'} from Loot?`, { title: 'Clear loot' });
		if (ok) setLootTray([]);
	}, [lootTray.length]);

	/** Straight onto the open monster, skipping the tray — same entries the tray would make. */
	const addToMonsterLoot = useCallback(
		(picked: ItemInfo[]) => {
			if (!doc || picked.length === 0) return;
			editDoc({
				...doc,
				loot: [...doc.loot, ...picked.map(i => newLootEntry({ serverId: i.serverId, name: i.name }))]
			});
			showToast(
				'ok',
				`Added ${picked.length} loot ${picked.length === 1 ? 'entry' : 'entries'} to ${doc.name}`
			);
		},
		[doc, editDoc, showToast]
	);

	// The same mutation as dropping the item on the Look section's corpse field.
	const setAsCorpse = useCallback(
		(item: ItemInfo) => {
			if (!doc) return;
			editDoc({ ...doc, look: { ...doc.look, corpse: item.serverId } });
			showToast('ok', `Corpse of ${doc.name} set to ${item.name || `#${item.serverId}`}`);
		},
		[doc, editDoc, showToast]
	);

	const addTrayToMonster = useCallback(() => {
		if (!doc || lootTray.length === 0) return;
		editDoc({
			...doc,
			loot: [...doc.loot, ...lootTray.map(i => newLootEntry({ serverId: i.serverId, name: i.name }))]
		});
		const n = lootTray.length;
		showToast('ok', `Added ${n} loot ${n === 1 ? 'entry' : 'entries'} to ${doc.name}`);
	}, [doc, lootTray, editDoc, showToast]);

	// Dismiss the item context menu on any outside press or Escape, as MonsterList does.
	useEffect(() => {
		if (!itemMenu) return;
		const onDown = () => setItemMenu(null);
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') setItemMenu(null);
		};
		window.addEventListener('mousedown', onDown);
		window.addEventListener('keydown', onKey);
		return () => {
			window.removeEventListener('mousedown', onDown);
			window.removeEventListener('keydown', onKey);
		};
	}, [itemMenu]);

	const allLints = useMemo(
		() => [...monsterLints, ...workspaceLints],
		[monsterLints, workspaceLints]
	);

	return (
		<>
			<Menubar menus={menus} />

			<div className="ss-body">
				<aside className="ss-sidebar">
					<div className="ss-sidebar-file" title={info.paths.monsters}>
						{label}
					</div>
					<nav className="ss-sidebar-nav">
						{nav.map(n => (
							<button
								key={n.key}
								className={`ss-nav-item ${view === n.key ? 'ss-nav-item-active' : ''}`}
								onClick={() => setView(n.key)}
							>
								{n.icon}
								<span className="ss-nav-label">{n.label}</span>
								{n.count > 0 && <span className="ss-nav-meta">{n.count.toLocaleString()}</span>}
							</button>
						))}
					</nav>
					<MonsterList
						monsters={monsters}
						selectedFile={selected}
						onSelect={setSelected}
						onMutated={refreshMonsters}
						showToast={showToast}
						groups={groups}
						onReveal={reveal}
					/>
				</aside>

				<main className="ss-main">
					{view === 'monsters' ? (
						doc ? (
							<MonsterEditor
								key={doc.file}
								doc={doc}
								onChange={editDoc}
								lints={monsterLints}
								spells={spells}
								readOnly={false}
								scripts={scripts}
								monsterNames={monsterNames}
								nextRaceid={nextRaceid}
								onBrowseOutfits={() => setView('outfits')}
								previewUrl={previewUrl}
								thingAnim={thingAnim}
							/>
						) : (
							<div className="mx-empty">Select a monster</div>
						)
					) : view === 'items' ? (
						<>
							<ThingBrowser<ItemInfo>
								items={itemList}
								rowAtlasUrl={itemRowUrl}
								cellKey={itemKey}
								cellLabel={itemLabel}
								searchText={itemSearchText}
								searchId={itemSearchId}
								selectionMode="multi"
								view="items"
								draggable
								dragPayload={i => ({
									kind: 'item',
									serverId: i.serverId,
									name: i.name,
									container: i.container
								})}
								onContextMenu={itemContextMenu}
								searchPlaceholder="Search server id or name"
							/>
							<div className="ss-loot-tray">
								<div className="ss-loot-tray-head">
									Loot
									{lootTray.length > 0 && <span className="ss-nav-meta">{lootTray.length}</span>}
								</div>
								<div className="ss-loot-tray-items">
									{lootTray.length === 0 ? (
										<span className="ss-loot-tray-empty">
											Right-click selected items above to add them here.
										</span>
									) : (
										lootTray.map(i => (
											<span
												key={i.serverId}
												className="ss-loot-tray-chip"
												title={i.name ? `${i.name} (#${i.serverId})` : `#${i.serverId}`}
											>
												<img src={itemUrl(i.serverId, 32)} width={32} height={32} alt="" />
											</span>
										))
									)}
								</div>
								<div className="ss-loot-tray-actions">
									<button
										className="ss-btn ss-btn-primary"
										disabled={!doc || lootTray.length === 0}
										onClick={addTrayToMonster}
									>
										<Plus size={14} />
										{doc ? `Add loot to ${doc.name}` : 'Add loot'}
									</button>
									<button
										className="ss-btn"
										disabled={lootTray.length === 0}
										onClick={() => void clearTray()}
										title="Clear the Loot section"
									>
										<Trash2 size={14} />
										Clear
									</button>
								</div>
							</div>
							{itemMenu && (
								<div
									className="ss-context-menu"
									style={{ left: itemMenu.x, top: itemMenu.y }}
									onMouseDown={e => e.stopPropagation()}
								>
									<button
										className="ss-menu-item"
										onClick={() => {
											setItemMenu(null);
											addToTray(itemMenu.items);
										}}
									>
										<Package size={14} />
										Add {itemMenu.items.length === 1 ? 'item' : `${itemMenu.items.length} items`} to Loot
									</button>
									{doc && (
										<>
											<button
												className="ss-menu-item"
												onClick={() => {
													setItemMenu(null);
													addToMonsterLoot(itemMenu.items);
												}}
											>
												<Plus size={14} />
												Add {itemMenu.items.length === 1 ? 'item' : `${itemMenu.items.length} items`} to
												loot for {doc.name}
											</button>
											<div className="ss-menu-sep" />
											<button
												className="ss-menu-item"
												onClick={() => {
													setItemMenu(null);
													setAsCorpse(itemMenu.item);
												}}
											>
												<Skull size={14} />
												Set as corpse for {doc.name}
											</button>
										</>
									)}
								</div>
							)}
						</>
					) : (
						<ThingBrowser<ThingSummary>
							key={view}
							items={things[THING_CAT[view as ThingView]]}
							rowAtlasUrl={(visible, cell) =>
								thingsRowUrlFor(
									info.sprPath,
									info.datPath,
									THING_CAT[view as ThingView],
									visible.map(t => t.id),
									cell,
									info.transparent
								)
							}
							cellKey={t => t.id}
							cellLabel={t => t.name ?? String(t.id)}
							// Outfits: frame 0 is the standing pose, so loop the walking
							// frames (1..n-1), exactly as SPRx does.
							cellFrames={t => (view === 'outfits' && t.frames > 1 ? t.frames - 1 : t.frames)}
							cellUrl={(t, frame) =>
								thingUrlFor(info.sprPath, info.datPath, THING_CAT[view as ThingView], t.id, info.transparent, {
									frame: view === 'outfits' && t.frames > 1 ? frame + 1 : frame
								})
							}
							searchId={t => t.id}
							searchText={t => t.name ?? ''}
							selectionMode="single"
							view={view}
							draggable={view === 'outfits'}
							dragPayload={t => (view === 'outfits' ? { kind: 'outfit', type: t.id } : null)}
							onPick={view === 'outfits' && doc ? t => void pickOutfit(t) : undefined}
							searchPlaceholder="Search client id or name"
						/>
					)}
				</main>

				{/* PreviewPanel's root is itself the `.ss-details` column — never wrap
				    it in another one, or the panel becomes a column inside a column
				    and its scroll area collapses. */}
				{doc ? (
					<PreviewPanel
						doc={doc}
						items={items}
						lintCount={monsterLints.length}
						onOpenLints={() => setLintsOpen(true)}
						onLookType={type => editDoc({ ...doc, look: { ...doc.look, mode: 'type', type } })}
						onLootChange={loot => editDoc({ ...doc, loot })}
					/>
				) : (
					<aside className="ss-details" />
				)}
			</div>

			<div className="ss-statusbar mx-statusbar">
				<LintStatus lints={allLints} onOpen={() => setLintsOpen(o => !o)} open={lintsOpen} />
				<span className="mx-status-file mono">{doc?.file ?? ''}</span>
				<button className="ss-btn ss-btn-primary" disabled={!doc || saving} onClick={() => void save()}>
					<Save size={14} />
					{saving ? 'Saving…' : dirty ? 'Save •' : 'Save'}
				</button>
			</div>

			{tool && (
				<PinLootDialog
					scope={tool}
					onClose={() => setTool(null)}
					onError={m => showToast('error', m)}
					onApplied={report => {
						onMonstersChanged(null);
						lintWorkspace().then(setWorkspaceLints).catch(() => {});
						setReloadKey(k => k + 1);
						const n = report.pinned.length + report.named.length;
						showToast(
							'ok',
							`Pinned ${n} loot ${n === 1 ? 'entry' : 'entries'} across ${report.files} ${
								report.files === 1 ? 'file' : 'files'
							}`
						);
					}}
				/>
			)}

			<LintPanel
				open={lintsOpen}
				onClose={() => setLintsOpen(false)}
				monsterLints={monsterLints}
				workspaceLints={workspaceLints}
				file={doc?.file ?? null}
				onJump={lint => {
					if (lint.file && lint.file !== selected) setSelected(lint.file);
					setView('monsters');
				}}
			/>
		</>
	);
}
