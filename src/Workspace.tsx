import { useCallback, useEffect, useMemo, useState } from 'react';
import { Grid3X3, Package, PersonStanding, Save, Skull, Sparkles, Wand2 } from 'lucide-react';
import {
	getItem,
	getMonster,
	itemsRowUrl,
	lintMonster,
	lintWorkspace,
	listMonsterGroups,
	listMonsters,
	saveMonster,
	searchItems,
	type ItemInfo,
	type Lint,
	type MonsterDoc,
	type MonsterSummary,
	type WorkspaceInfo
} from './monster';
import { loadSetting, saveSetting } from './settings';
import { workspaceLabel, type Toast } from './App';
import MonsterList from './MonsterList';
import PreviewPanel from './PreviewPanel';
import LintPanel, { LintStatus } from './LintPanel';
import ThingBrowser from './ThingBrowser';

/** The centre column's content. `monsters` is the editor; the rest are the
 *  reference browsers, kept beside the editor rather than in a separate mode. */
type View = 'monsters' | 'items' | 'outfits' | 'effects' | 'missiles' | 'sprites';

interface Props {
	info: WorkspaceInfo;
	monsters: MonsterSummary[];
	onMonstersChanged: (focusFile: string | null) => void;
	dirty: boolean;
	onDirtyChange: (dirty: boolean) => void;
	onOpenFile: (file: string | null) => void;
	showToast: (kind: Toast['kind'], msg: string) => void;
}

export default function Workspace({
	info,
	monsters,
	onMonstersChanged,
	dirty,
	onDirtyChange,
	onOpenFile,
	showToast
}: Props) {
	const [view, setView] = useState<View>('monsters');
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
	}, [selected, onOpenFile, onDirtyChange, showToast]);

	useEffect(() => {
		listMonsterGroups().then(setGroups).catch(() => setGroups([]));
	}, []);

	// The item browser is fed by a search rather than the whole 11k-row index —
	// `search_items` with an empty query returns the head of the table.
	useEffect(() => {
		searchItems('', 500).then(setItemList).catch(() => setItemList([]));
	}, []);

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

	const nav: { key: View; label: string; icon: JSX.Element; count: number }[] = [
		{ key: 'monsters', label: 'Monsters', icon: <Skull size={16} />, count: info.monsterCount },
		{ key: 'items', label: 'Items', icon: <Package size={16} />, count: info.itemCount },
		{ key: 'outfits', label: 'Outfits', icon: <PersonStanding size={16} />, count: 0 },
		{ key: 'effects', label: 'Effects', icon: <Sparkles size={16} />, count: 0 },
		{ key: 'missiles', label: 'Missiles', icon: <Wand2 size={16} />, count: 0 },
		{ key: 'sprites', label: 'Sprites', icon: <Grid3X3 size={16} />, count: info.spriteCount }
	];

	const itemRowUrl = useCallback(
		(visible: ItemInfo[], cell: number) => itemsRowUrl(visible.map(i => i.serverId), cell),
		[]
	);
	const itemKey = useCallback((i: ItemInfo) => i.serverId, []);
	const itemLabel = useCallback((i: ItemInfo) => i.name, []);
	const itemSearchText = useCallback((i: ItemInfo) => i.name, []);
	const itemSearchId = useCallback((i: ItemInfo) => i.serverId, []);

	const allLints = useMemo(
		() => [...monsterLints, ...workspaceLints],
		[monsterLints, workspaceLints]
	);

	return (
		<>
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
						onSelect={file => {
							setSelected(file);
							setView('monsters');
						}}
						onMutated={refreshMonsters}
						showToast={showToast}
						groups={groups}
					/>
				</aside>

				<main className="ss-main">
					{view === 'monsters' ? (
						doc ? (
							// Agent 3's MonsterEditor mounts here. Until it lands, the
							// document is shown read-only so the rest of the shell —
							// selection, preview, lints, save — is exercisable end to end.
							<div className="mx-editor-placeholder">
								<div className="mx-editor-bar">
									{['Identity', 'Look', 'Combat', 'Attacks', 'Defenses', 'Immunities', 'Voices', 'Summons', 'Loot'].map(
										s => (
											<span key={s} className="mx-editor-tab">
												{s}
											</span>
										)
									)}
								</div>
								<pre className="mono mx-editor-json">{JSON.stringify(doc, null, 2)}</pre>
							</div>
						) : (
							<div className="mx-empty">Select a monster</div>
						)
					) : view === 'items' ? (
						<ThingBrowser<ItemInfo>
							items={itemList}
							rowAtlasUrl={itemRowUrl}
							cellKey={itemKey}
							cellLabel={itemLabel}
							searchText={itemSearchText}
							searchId={itemSearchId}
							selectionMode="single"
							view="items"
							draggable
							dragPayload={i => ({ kind: 'item', serverId: i.serverId, name: i.name })}
							searchPlaceholder="Search server id or name"
						/>
					) : (
						<div className="mx-empty">
							{nav.find(n => n.key === view)?.label} browser — wiring pending
						</div>
					)}
				</main>

				<aside className="ss-details">
					{doc ? (
						<PreviewPanel
							doc={doc}
							items={items}
							lintCount={monsterLints.length}
							onOpenLints={() => setLintsOpen(true)}
						/>
					) : null}
				</aside>
			</div>

			<div className="ss-statusbar mx-statusbar">
				<LintStatus lints={allLints} onOpen={() => setLintsOpen(o => !o)} open={lintsOpen} />
				<span className="mx-status-file mono">{doc?.file ?? ''}</span>
				<button className="ss-btn ss-btn-primary" disabled={!doc || saving} onClick={() => void save()}>
					<Save size={14} />
					{saving ? 'Saving…' : dirty ? 'Save •' : 'Save'}
				</button>
			</div>

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
