import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { confirm, save as saveDialog } from '@tauri-apps/plugin-dialog';
import { Package, PersonStanding, Plus, Save, Skull, Sparkles, Trash2, Users, Wand2, X } from 'lucide-react';
import {
	getItem,
	allLints as fetchAllLints,
	getMonster,
	droppedItemIds,
	itemsRowUrl,
	itemUrl,
	itemUsage,
	writeTextFile,
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
	type ItemUsage,
	type Lint,
	type MonsterDoc,
	type MonsterSummary,
	type WorkspaceInfo
} from './monster';
import Menubar, { type Menu } from './Menubar';
import { newLootEntry } from './sections/Loot';
import { SECTION_IDS, type SectionId } from './sections/section';
import { MAGIC_EFFECTS, SHOOT_EFFECTS, type EffectEntry } from './catalog';
import { applyLintFix } from './lintfix';
import PinLootDialog, { type PinScope } from './PinLootDialog';
import PreferencesDialog from './PreferencesDialog';
import { loadPrefs, savePrefs, type Prefs } from './prefs';
import ScaleLootDialog from './ScaleLootDialog';
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
	/** Editor tab preferences; the dialog writes them straight through to storage. */
	const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
	const [prefsOpen, setPrefsOpen] = useState(false);
	/** A tab the editor should show, set from outside it (Loot → Edit). Cleared as
	 *  soon as the editor honours it. */
	const [jumpRequest, setJumpRequest] = useState<SectionId | null>(null);
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
	/** Frame counts per client id from the .dat, for animating item cells. */
	const [itemFrames, setItemFrames] = useState<Map<number, number>>(new Map());
	/** Server ids the saved corpus drops, for the "not dropped by any monster"
	 *  filter. Re-read after anything that rewrites loot on disk. */
	const [dropped, setDropped] = useState<Set<number>>(new Set());
	/** Filter keys the Items browser opens with. Pickupable is the standing default
	 *  (the view exists to feed loot); Select corpse / Select item override it. */
	const [itemsInitialFilters, setItemsInitialFilters] = useState<string[]>(['pickupable']);
	/** `item` is the cell under the cursor (for single-item actions like the corpse);
	 *  `items` is the whole effective selection. */
	const [itemMenu, setItemMenu] = useState<{ x: number; y: number; item: ItemInfo; items: ItemInfo[] } | null>(
		null
	);
	/** Right-clicked effect/missile: `entry` is its catalogue row (the XML name), null
	 *  when the client id has no usable CONST_ME_* / CONST_ANI_* name. */
	const [thingMenu, setThingMenu] = useState<{
		x: number;
		y: number;
		kind: 'effect' | 'missile';
		label: string;
		entry: EffectEntry | null;
	} | null>(null);
	const label = workspaceLabel(info.paths.monsters);

	// Fall back to the first monster when the remembered one is gone.
	useEffect(() => {
		if (monsters.length === 0) return;
		if (!selected || !monsters.some(m => m.file === selected)) {
			setSelected(monsters[0].file);
		}
	}, [monsters, selected]);

	// ---- Editor tabs ----
	// Every monster ever activated this session keeps its buffer in memory, so
	// switching tabs never discards edits and never re-reads a dirty file.
	interface TabBuffer {
		doc: MonsterDoc;
		lints: Lint[];
	}
	const [tabs, setTabs] = useState<string[]>([]);
	const buffersRef = useRef(new Map<string, TabBuffer>());
	const [dirtyFiles, setDirtyFiles] = useState<Set<string>>(new Set());
	const reloadKeyRef = useRef(reloadKey);
	// Single-clicking the list opens a *preview* tab: the next selection replaces
	// it instead of piling up tabs. Double-clicking (list or tab) or editing the
	// monster pins it. Refs mirror state for the load effect.
	const [previewTab, setPreviewTab] = useState<string | null>(null);
	const tabsRef = useRef(tabs);
	tabsRef.current = tabs;
	const previewRef = useRef(previewTab);
	previewRef.current = previewTab;
	const dirtyFilesRef = useRef(dirtyFiles);
	dirtyFilesRef.current = dirtyFiles;

	const pinTab = useCallback((file: string) => {
		setPreviewTab(prev => (prev === file ? null : prev));
	}, []);

	const activeDirty = selected !== null && dirtyFiles.has(selected);

	// App-level dirty covers every tab — the close guards protect all of them.
	useEffect(() => {
		onDirtyChange(dirtyFiles.size > 0);
	}, [dirtyFiles, onDirtyChange]);

	// Renames and deletes invalidate buffers for files that no longer exist.
	useEffect(() => {
		if (monsters.length === 0) return;
		const files = new Set(monsters.map(m => m.file));
		setTabs(prev => (prev.every(f => files.has(f)) ? prev : prev.filter(f => files.has(f))));
		for (const k of [...buffersRef.current.keys()]) if (!files.has(k)) buffersRef.current.delete(k);
		setDirtyFiles(prev => {
			const next = new Set([...prev].filter(f => files.has(f)));
			return next.size === prev.size ? prev : next;
		});
	}, [monsters]);

	useEffect(() => {
		if (!selected) return;
		saveSetting('monx.lastMonster', selected);
		onOpenFile(selected);
		// A fresh buffer starts a fresh history — undo must never cross files.
		undoRef.current = [];
		redoRef.current = [];
		if (!tabsRef.current.includes(selected)) {
			// A clean preview tab gives way to the new one; anything pinned or
			// dirty stays and the new tab appends.
			const preview = previewRef.current;
			if (
				preview !== null &&
				preview !== selected &&
				tabsRef.current.includes(preview) &&
				!dirtyFilesRef.current.has(preview)
			) {
				buffersRef.current.delete(preview);
				setTabs(prev => prev.map(f => (f === preview ? selected : f)));
			} else {
				setTabs(prev => [...prev, selected]);
			}
			setPreviewTab(selected);
		}
		// A corpus tool rewrote files on disk: every buffer is stale. Tools are
		// blocked while anything is dirty, so nothing is lost by dropping them.
		if (reloadKeyRef.current !== reloadKey) {
			reloadKeyRef.current = reloadKey;
			buffersRef.current.clear();
		}
		const buffered = buffersRef.current.get(selected);
		if (buffered) {
			setDoc(buffered.doc);
			setMonsterLints(buffered.lints);
			return;
		}
		let cancelled = false;
		getMonster(selected)
			.then(d => {
				if (cancelled) return;
				buffersRef.current.set(selected, { doc: d, lints: [] });
				setDoc(d);
				setMonsterLints([]);
				return lintMonster(d).then(l => {
					if (cancelled) return;
					setMonsterLints(l);
					const buf = buffersRef.current.get(selected);
					if (buf && buf.doc === d) buf.lints = l;
				});
			})
			.catch(e => showToast('error', String(e)));
		return () => {
			cancelled = true;
		};
	}, [selected, reloadKey, onOpenFile, showToast]);

	const closeTabs = useCallback(
		async (files: string[]) => {
			if (files.length === 0) return;
			const dirtyClosing = files.filter(f => dirtyFiles.has(f));
			if (dirtyClosing.length > 0) {
				const msg =
					dirtyClosing.length === 1
						? `${dirtyClosing[0]} has unsaved changes. Close and discard them?`
						: `${dirtyClosing.length} tabs have unsaved changes. Close and discard them?`;
				if (!(await confirm(msg))) return;
			}
			const closing = new Set(files);
			for (const f of files) buffersRef.current.delete(f);
			setPreviewTab(prev => (prev !== null && closing.has(prev) ? null : prev));
			setDirtyFiles(prev => new Set([...prev].filter(f => !closing.has(f))));
			setTabs(prev => {
				const next = prev.filter(f => !closing.has(f));
				if (selected && closing.has(selected)) {
					// The nearest survivor takes over; with no tabs left the list's
					// own fallback reopens the first monster.
					const idx = prev.indexOf(selected);
					let fallback: string | null = null;
					for (let d = 1; d < prev.length && fallback === null; d++) {
						const right = prev[idx + d];
						const left = prev[idx - d];
						if (right !== undefined && !closing.has(right)) fallback = right;
						else if (left !== undefined && !closing.has(left)) fallback = left;
					}
					setSelected(fallback ?? next[0] ?? null);
				}
				return next;
			});
		},
		[dirtyFiles, selected]
	);

	const closeTab = useCallback((file: string) => closeTabs([file]), [closeTabs]);

	/** Right-clicked tab, for the Close-others / left / right menu. */
	const [tabMenu, setTabMenu] = useState<{ x: number; y: number; file: string } | null>(null);

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

	// Baseline for patch notes: the corpus as it stood when the workspace opened.
	const baselineRef = useRef<Map<string, MonsterSummary> | null>(null);
	useEffect(() => {
		if (!baselineRef.current && monsters.length > 0) {
			baselineRef.current = new Map(monsters.map(m => [m.file, m]));
		}
	}, [monsters]);

	const [scaling, setScaling] = useState(false);

	const exportLints = useCallback(async () => {
		try {
			const lints = await fetchAllLints();
			const path = await saveDialog({ defaultPath: 'monx-lint-report.txt' });
			if (!path) return;
			const sorted = [...lints].sort((a, b) => (a.file ?? '').localeCompare(b.file ?? '') || a.code.localeCompare(b.code));
			const lines = sorted.map(
				l => `${l.severity.toUpperCase().padEnd(8)}${l.code.padEnd(36)}${(l.file ?? '(workspace)').padEnd(28)}${l.message}`
			);
			await writeTextFile(
				path,
				`MONx lint report — ${label}\n${lines.length} findings\n\n${lines.join('\n')}\n`
			);
			showToast('ok', `Exported ${lines.length} lints`);
		} catch (e) {
			showToast('error', String(e));
		}
	}, [label, showToast]);

	// Patch notes: the current summaries diffed against the workspace-open
	// baseline — "Updated the health of Demon from 8200 to 9000".
	const exportPatchNotes = useCallback(async () => {
		const baseline = baselineRef.current;
		if (!baseline) return;
		try {
			const notes: string[] = [];
			const seen = new Set<string>();
			const fields: { key: 'health' | 'experience' | 'speed'; label: string }[] = [
				{ key: 'health', label: 'health' },
				{ key: 'experience', label: 'experience' },
				{ key: 'speed', label: 'speed' }
			];
			for (const m of monsters) {
				seen.add(m.file);
				const was = baseline.get(m.file);
				if (!was) {
					notes.push(`- Added new monster ${m.name}.`);
					continue;
				}
				if (was.name !== m.name) notes.push(`- Renamed ${was.name} to ${m.name}.`);
				for (const f of fields) {
					if (was[f.key] !== m[f.key]) {
						notes.push(
							`- Updated the ${f.label} of ${m.name} from ${was[f.key].toLocaleString()} to ${m[f.key].toLocaleString()}.`
						);
					}
				}
				if (was.raceid !== m.raceid) notes.push(`- Updated the raceid of ${m.name} from ${was.raceid ?? 'none'} to ${m.raceid ?? 'none'}.`);
			}
			for (const [file, was] of baseline) {
				if (!seen.has(file)) notes.push(`- Removed ${was.name}.`);
			}
			if (notes.length === 0) {
				showToast('ok', 'No changes since the workspace was opened');
				return;
			}
			const path = await saveDialog({ defaultPath: 'monx-patch-notes.md' });
			if (!path) return;
			await writeTextFile(path, `# Patch notes — ${label}\n\n${notes.join('\n')}\n`);
			showToast('ok', `Exported ${notes.length} ${notes.length === 1 ? 'change' : 'changes'}`);
		} catch (e) {
			showToast('error', String(e));
		}
	}, [monsters, label, showToast]);

	const reveal = useCallback(
		(file: string) => {
			revealMonster(file).catch(e => showToast('error', String(e)));
		},
		[showToast]
	);

	// ---- Undo / redo ----
	// The editor already works in whole-doc immutable updates, so history is a
	// stack of previous docs. Cleared whenever a monster is (re)loaded.
	const docRef = useRef<MonsterDoc | null>(doc);
	docRef.current = doc;
	const undoRef = useRef<MonsterDoc[]>([]);
	const redoRef = useRef<MonsterDoc[]>([]);
	const HISTORY_CAP = 100;

	/** Puts `next` in the active buffer, marks it dirty and re-lints it. */
	const commitDoc = useCallback((next: MonsterDoc) => {
		buffersRef.current.set(next.file, { doc: next, lints: buffersRef.current.get(next.file)?.lints ?? [] });
		setDirtyFiles(prev => (prev.has(next.file) ? prev : new Set(prev).add(next.file)));
		// An edited monster is no longer a throwaway preview.
		pinTab(next.file);
		setDoc(next);
		lintMonster(next)
			.then(l => {
				setMonsterLints(l);
				const buf = buffersRef.current.get(next.file);
				if (buf && buf.doc === next) buf.lints = l;
			})
			.catch(() => {});
	}, [pinTab]);

	const editDoc = useCallback(
		(next: MonsterDoc) => {
			if (docRef.current) {
				undoRef.current.push(docRef.current);
				if (undoRef.current.length > HISTORY_CAP) undoRef.current.shift();
				redoRef.current = [];
			}
			commitDoc(next);
		},
		[commitDoc]
	);

	const applyHistory = useCallback(
		(from: MonsterDoc[], to: MonsterDoc[]) => {
			const target = from.pop();
			if (!target || !docRef.current) return;
			to.push(docRef.current);
			commitDoc(target);
		},
		[commitDoc]
	);
	const undoEdit = useCallback(() => applyHistory(undoRef.current, redoRef.current), [applyHistory]);
	const redoEdit = useCallback(() => applyHistory(redoRef.current, undoRef.current), [applyHistory]);

	/** Loads `file`, applies every fix it can, saves it. Returns the ones that stuck. */
	const fixInFile = useCallback(
		async (file: string, lints: Lint[]): Promise<Lint[]> => {
			let d = await getMonster(file);
			const applied: Lint[] = [];
			for (const l of lints) {
				const next = applyLintFix(d, l, { nextRaceid });
				if (next) {
					d = next;
					applied.push(l);
				}
			}
			if (applied.length > 0) await saveMonster(d);
			return applied;
		},
		[nextRaceid]
	);

	// The Workspace tab lists lints from every file, so a Fix there must not land
	// on whatever the editor happens to have open. Lints for the open monster go
	// through the buffer (undoable, saved on Ctrl+S); the rest are loaded, fixed
	// and written straight out, which is why a dirty buffer blocks them.
	const fixLint = useCallback(
		async (lint: Lint) => {
			const target = lint.file ?? doc?.file ?? null;
			if (doc && (target === null || target === doc.file)) {
				const next = applyLintFix(doc, lint, { nextRaceid });
				if (next) editDoc(next);
				else showToast('error', `${lint.code} needs a manual fix`);
				return;
			}
			if (!target) return;
			if (dirtyFiles.has(target)) {
				showToast('error', `${target} has unsaved changes — save it first`);
				return;
			}
			try {
				if ((await fixInFile(target, [lint])).length === 0) {
					showToast('error', `${lint.code} needs a manual fix`);
					return;
				}
				// Source lints are only computed when the workspace opens, so there
				// is nothing to re-fetch — drop the row that was just repaired.
				setWorkspaceLints(prev => prev.filter(l => l !== lint));
				onMonstersChanged(null);
				showToast('ok', `Fixed ${lint.code} in ${target}`);
			} catch (e) {
				showToast('error', String(e));
			}
		},
		[doc, dirtyFiles, editDoc, fixInFile, nextRaceid, onMonstersChanged, showToast]
	);

	/** Fix all, for the Workspace tab: every fixable lint, grouped by its file. */
	const fixAllWorkspaceLints = useCallback(async () => {
		if (dirtyFiles.size > 0) {
			showToast('error', 'Save your open changes first — these fixes write files directly');
			return;
		}
		const byFile = new Map<string, Lint[]>();
		for (const l of workspaceLints) {
			if (!l.fixable || !l.file) continue;
			const list = byFile.get(l.file);
			if (list) list.push(l);
			else byFile.set(l.file, [l]);
		}
		const applied = new Set<Lint>();
		const files: string[] = [];
		try {
			for (const [file, lints] of byFile) {
				const done = await fixInFile(file, lints);
				if (done.length > 0) {
					done.forEach(l => applied.add(l));
					files.push(file);
				}
			}
		} catch (e) {
			showToast('error', String(e));
			return;
		}
		if (applied.size === 0) {
			showToast('ok', 'Nothing here has an automatic fix');
			return;
		}
		// Source lints are only computed at open, so the panel is corrected in
		// place rather than re-fetched.
		setWorkspaceLints(prev => prev.filter(l => !applied.has(l)));
		onMonstersChanged(null);
		setReloadKey(k => k + 1);
		showToast(
			'ok',
			`Fixed ${applied.size} ${applied.size === 1 ? 'lint' : 'lints'} across ${files.length} ${files.length === 1 ? 'file' : 'files'}`
		);
	}, [dirtyFiles, fixInFile, onMonstersChanged, showToast, workspaceLints]);

	const fixAllLints = useCallback(() => {
		if (!doc) return;
		let d = doc;
		let fixed = 0;
		let manual = 0;
		for (const l of monsterLints.filter(l => l.fixable)) {
			const next = applyLintFix(d, l, { nextRaceid });
			if (next) {
				d = next;
				fixed++;
			} else manual++;
		}
		if (fixed > 0) editDoc(d);
		showToast('ok', `Fixed ${fixed} ${fixed === 1 ? 'lint' : 'lints'}${manual > 0 ? ` — ${manual} need a manual fix` : ''}`);
	}, [doc, monsterLints, editDoc, nextRaceid, showToast]);

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z' && e.key.toLowerCase() !== 'y') return;
			// Text fields keep their native undo; the doc stack takes over elsewhere.
			const tag = (document.activeElement?.tagName || '').toLowerCase();
			if (tag === 'input' || tag === 'textarea') return;
			e.preventDefault();
			if (e.key.toLowerCase() === 'y' || e.shiftKey) redoEdit();
			else undoEdit();
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, [undoEdit, redoEdit]);

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

	// The item browser gets the whole database — the grid virtualizes rows, so
	// the full list costs no more than a page of it. It has to be everything:
	// loot wants pickupables, but the corpse and typeex pickers live here too,
	// and corpses, statues or fires are none of them carryable. The Pickupable
	// filter narrows back down for loot browsing.
	useEffect(() => {
		searchItems('', Number.MAX_SAFE_INTEGER).then(setItemList).catch(() => setItemList([]));
	}, []);

	// The dropped-id set comes from the backend's copy of the corpus, so it is
	// what is on disk — an unsaved buffer does not move an item in or out of the
	// filter until Ctrl+S. `reloadKey` bumps for the corpus tools; saves refresh
	// it directly.
	const refreshDropped = useCallback(() => {
		droppedItemIds()
			.then(ids => setDropped(new Set(ids)))
			.catch(() => {});
	}, []);
	useEffect(refreshDropped, [refreshDropped, reloadKey]);

	// The outfit / effect / missile lists come straight from the dat, through the
	// inherited `get_things`. Loaded once; the client files never change while a
	// workspace is open.
	useEffect(() => {
		let cancelled = false;
		Promise.all([
			getThings(info.datPath, 'outfit').catch(() => []),
			getThings(info.datPath, 'effect').catch(() => []),
			getThings(info.datPath, 'missile').catch(() => []),
			getThings(info.datPath, 'item').catch(() => [])
		]).then(([outfit, effect, missile, item]) => {
			if (cancelled) return;
			setThings({ outfit, effect, missile });
			// Frame counts by client id, so the Items grid can animate and filter
			// on animation — ItemInfo itself knows nothing about the .dat side.
			setItemFrames(new Map(item.map(t => [t.id, t.frames])));
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
			buffersRef.current.set(doc.file, { doc, lints });
			setDirtyFiles(prev => {
				const next = new Set(prev);
				next.delete(doc.file);
				return next;
			});
			showToast('ok', `Saved ${doc.file}`);
			setWorkspaceLints(await lintWorkspace());
			refreshDropped();
		} catch (e) {
			showToast('error', String(e));
		} finally {
			setSaving(false);
		}
	}, [doc, showToast, refreshDropped]);

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

	const updatePrefs = (next: Prefs) => {
		setPrefs(next);
		savePrefs(next);
	};
	const menus: Menu[] = [
		{
			label: 'File',
			items: [
				{ label: 'Save monster', shortcut: 'Ctrl+S', disabled: !doc || saving, onSelect: () => void save() },
				{ label: 'Close workspace', shortcut: 'Ctrl+O', separated: true, onSelect: onCloseWorkspace }
			]
		},
		{
			label: 'Edit',
			items: [
				{ label: 'Undo', shortcut: 'Ctrl+Z', disabled: undoRef.current.length === 0, onSelect: undoEdit },
				{ label: 'Redo', shortcut: 'Ctrl+Shift+Z', disabled: redoRef.current.length === 0, onSelect: redoEdit }
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
				},
				{
					label: `Scale all loot chances…${toolsBlocked}`,
					disabled: dirty,
					onSelect: () => setScaling(true)
				},
				{
					label: 'Export lint report…',
					separated: true,
					onSelect: () => void exportLints()
				},
				{
					label: 'Export patch notes…',
					onSelect: () => void exportPatchNotes()
				}
			]
		},
		{
			label: 'Preferences',
			items: [
				{ label: 'Editor tabs…', onSelect: () => setPrefsOpen(true) },
				{
					label: 'Show every tab',
					separated: true,
					disabled: prefs.visibleSections.length === SECTION_IDS.length,
					onSelect: () => updatePrefs({ ...prefs, visibleSections: [...SECTION_IDS] })
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
	// Multi-line tooltip from the raw items.xml attributes — weight is in
	// hundredths of an oz, as the client displays it.
	const itemCellTitle = useCallback((i: ItemInfo) => {
		const a = i.attributes;
		const lines = [`${i.name || `#${i.serverId}`}  (#${i.serverId})`];
		const combat: string[] = [];
		if (a.attack) combat.push(`atk ${a.attack}`);
		if (a.defense) combat.push(`def ${a.defense}${a.extradef ? ` ${Number(a.extradef) >= 0 ? '+' : ''}${a.extradef}` : ''}`);
		if (a.armor) combat.push(`arm ${a.armor}`);
		if (a.weaponType) combat.push(a.weaponType);
		if (a.slotType) combat.push(a.slotType);
		if (combat.length > 0) lines.push(combat.join(' · '));
		const misc: string[] = [];
		if (a.weight) misc.push(`${(Number(a.weight) / 100).toLocaleString()} oz`);
		if (a.worth) misc.push(`worth ${Number(a.worth).toLocaleString()} gp`);
		if (a.charges) misc.push(`${a.charges} charges`);
		if (a.containerSize) misc.push(`${a.containerSize} slots`);
		if (a.duration) misc.push(`decays in ${a.duration}s`);
		if (misc.length > 0) lines.push(misc.join(' · '));
		if (a.description) lines.push(a.description);
		return lines.join('\n');
	}, []);
	const itemCellFrames = useCallback((i: ItemInfo) => itemFrames.get(i.clientId) ?? 1, [itemFrames]);
	const itemCellUrl = useCallback(
		(i: ItemInfo, frame: number) =>
			thingUrlFor(info.sprPath, info.datPath, 'item', i.clientId, info.transparent, { frame }),
		[info.sprPath, info.datPath, info.transparent]
	);
	// Predicates over the raw items.xml attributes (`corpseType` is what the
	// backend's own corpses_only filter keys on). Filters AND together, as in
	// SPRx — vocabulary from the corpus: weaponType sword/club/axe/distance/
	// wand/shield/ammunition, slotType head/body/legs/feet/ring/necklace/
	// backpack/rune/trinket/two-handed.
	const itemFilters = useMemo(() => {
		const attr = (key: string) => (i: ItemInfo) => key in i.attributes;
		const attrIs = (key: string, value: string) => (i: ItemInfo) => i.attributes[key] === value;
		const special = 'Special';
		const kind = 'Kind';
		const weapons = 'Weapons';
		const slot = 'Slot';
		const props = 'Properties';
		return [
			{ key: 'pickupable', label: 'Pickupable', section: special, test: (i: ItemInfo) => i.pickupable },
			{ key: 'corpses', label: 'Show corpses', section: special, test: attr('corpseType') },
			{
				// Loot only — an item used as a corpse or worn as a typeex look still
				// counts as undropped, which is the question being asked.
				key: 'undropped',
				label: 'Not dropped by any monster',
				section: special,
				test: (i: ItemInfo) => !dropped.has(i.serverId)
			},

			{ key: 'stackable', label: 'Stackable', section: kind, test: (i: ItemInfo) => i.stackable },
			{ key: 'container', label: 'Container', section: kind, test: (i: ItemInfo) => i.container },
			{
				key: 'weapon',
				label: 'Weapon (any)',
				section: kind,
				test: (i: ItemInfo) =>
					['sword', 'club', 'axe', 'distance', 'wand', 'fist'].includes(i.attributes.weaponType ?? '')
			},
			{ key: 'shield', label: 'Shield', section: kind, test: attrIs('weaponType', 'shield') },
			{ key: 'ammunition', label: 'Ammunition', section: kind, test: attrIs('weaponType', 'ammunition') },
			{ key: 'rune', label: 'Rune', section: kind, test: attrIs('slotType', 'rune') },
			{ key: 'fluid', label: 'Fluid container', section: kind, test: attr('fluidSource') },

			{ key: 'sword', label: 'Sword', section: weapons, test: attrIs('weaponType', 'sword') },
			{ key: 'club', label: 'Club', section: weapons, test: attrIs('weaponType', 'club') },
			{ key: 'axe', label: 'Axe', section: weapons, test: attrIs('weaponType', 'axe') },
			{ key: 'distance', label: 'Distance', section: weapons, test: attrIs('weaponType', 'distance') },
			{ key: 'wand', label: 'Wand', section: weapons, test: attrIs('weaponType', 'wand') },

			{ key: 'slot-head', label: 'Helmet', section: slot, test: attrIs('slotType', 'head') },
			{ key: 'slot-body', label: 'Armor (body)', section: slot, test: attrIs('slotType', 'body') },
			{ key: 'slot-legs', label: 'Legs', section: slot, test: attrIs('slotType', 'legs') },
			{ key: 'slot-feet', label: 'Boots', section: slot, test: attrIs('slotType', 'feet') },
			{ key: 'slot-ring', label: 'Ring', section: slot, test: attrIs('slotType', 'ring') },
			{ key: 'slot-necklace', label: 'Necklace', section: slot, test: attrIs('slotType', 'necklace') },
			{ key: 'slot-trinket', label: 'Trinket', section: slot, test: attrIs('slotType', 'trinket') },
			{ key: 'slot-backpack', label: 'Backpack slot', section: slot, test: attrIs('slotType', 'backpack') },
			{ key: 'two-handed', label: 'Two-handed', section: slot, test: attrIs('slotType', 'two-handed') },

			{ key: 'has-attack', label: 'Has attack', section: props, test: attr('attack') },
			{ key: 'has-defense', label: 'Has defense', section: props, test: attr('defense') },
			{ key: 'has-armor', label: 'Has armor', section: props, test: attr('armor') },
			{ key: 'speed', label: 'Speed bonus', section: props, test: attr('speed') },
			{ key: 'charged', label: 'Has charges', section: props, test: attr('charges') },
			{ key: 'decays', label: 'Decays', section: props, test: (i: ItemInfo) => 'duration' in i.attributes || 'decayTo' in i.attributes },
			{ key: 'writeable', label: 'Writable', section: props, test: (i: ItemInfo) => 'writeable' in i.attributes || 'maxTextLen' in i.attributes },
			{ key: 'blocks', label: 'Blocks projectiles', section: props, test: attr('blockprojectile') },
			{ key: 'field', label: 'Field (fire/energy/…)', section: props, test: attr('field') },
			{ key: 'worth', label: 'Has worth', section: props, test: attr('worth') },
			{ key: 'described', label: 'Has description', section: props, test: attr('description') },
			{ key: 'ambiguous', label: 'Ambiguous name', section: props, test: (i: ItemInfo) => i.ambiguousName },
			{ key: 'animated', label: 'Animated', section: props, test: (i: ItemInfo) => (itemFrames.get(i.clientId) ?? 1) > 1 }
		];
	}, [itemFrames, dropped]);

	const thingContextMenu = useCallback((t: ThingSummary, e: React.MouseEvent, kind: 'effect' | 'missile') => {
		const table = kind === 'effect' ? MAGIC_EFFECTS : SHOOT_EFFECTS;
		// The XML wants the CONST_* name, so the client id must resolve to a usable
		// catalogue row — unreachable names (§21) can never be written.
		const entry = table.find(en => en.id === t.id && !en.unreachable) ?? null;
		setThingMenu({ x: e.clientX, y: e.clientY, kind, label: t.name ?? `#${t.id}`, entry });
	}, []);

	/** The open monster's spell blocks that can carry effect attributes — registered
	 *  (###) spells are skipped because the loader never reads theirs (§8.1). */
	const spellTargets = useMemo(() => {
		if (!doc) return [];
		const label = (b: (typeof doc.attacks)[number]) => b.name ?? b.script ?? 'unnamed';
		return [
			...doc.attacks.map((b, i) => ({ list: 'attacks' as const, i, b, label: `${label(b)} (attack)` })),
			...doc.defenses.map((b, i) => ({ list: 'defenses' as const, i, b, label: `${label(b)} (defense)` }))
		].filter(t => t.b.kind !== 'registered');
	}, [doc]);

	const setSpellEffect = useCallback(
		(list: 'attacks' | 'defenses', index: number, kind: 'effect' | 'missile', entry: EffectEntry) => {
			if (!doc) return;
			const field = kind === 'effect' ? 'areaEffect' : 'shootEffect';
			const blocks = doc[list].map((b, i) =>
				i === index ? { ...b, effects: { ...b.effects, [field]: entry.name } } : b
			);
			editDoc({ ...doc, [list]: blocks });
			const spell = doc[list][index];
			showToast(
				'ok',
				`${kind === 'effect' ? 'Effect' : 'Missile'} of ${spell.name ?? spell.script ?? 'spell'} set to ${entry.label}`
			);
		},
		[doc, editDoc, showToast]
	);

	// Outfit filters read the .dat geometry: width/height are in 32px tiles,
	// patternX is directions, patternY addons, patternZ the mount variant, and
	// a second layer is the colour template an outfit needs to be dyeable.
	const outfitFilters = useMemo(() => {
		const size = 'Size';
		const features = 'Features';
		return [
			{ key: 'size-32', label: '32×32', section: size, test: (t: ThingSummary) => t.width === 1 && t.height === 1 },
			{ key: 'size-64', label: '64×64', section: size, test: (t: ThingSummary) => t.width === 2 && t.height === 2 },
			{
				key: 'size-mixed',
				label: '64×32 / 32×64',
				section: size,
				test: (t: ThingSummary) => t.width + t.height === 3
			},
			{ key: 'animated', label: 'Animated', section: features, test: (t: ThingSummary) => t.frames > 1 },
			{ key: 'directional', label: 'Directional', section: features, test: (t: ThingSummary) => t.patternX >= 4 },
			{ key: 'fixed', label: 'Single direction', section: features, test: (t: ThingSummary) => t.patternX === 1 },
			{ key: 'addons', label: 'Has addons', section: features, test: (t: ThingSummary) => t.patternY > 1 },
			{ key: 'mount', label: 'Has mount variant', section: features, test: (t: ThingSummary) => t.patternZ > 1 },
			{ key: 'colourable', label: 'Colourable', section: features, test: (t: ThingSummary) => t.layers > 1 }
		];
	}, []);

	const browseCorpses = useCallback(() => {
		setItemsInitialFilters(['corpses']);
		setView('items');
	}, []);

	const browseItems = useCallback(() => {
		setItemsInitialFilters([]);
		setView('items');
	}, []);

	// The same mutation as dropping the item on the typeex field: setting the
	// item also switches the mode, since typeex has no effect otherwise.
	const setAsTypeex = useCallback(
		(item: ItemInfo) => {
			if (!doc) return;
			editDoc({ ...doc, look: { ...doc.look, mode: 'typeex', typeex: item.serverId } });
			showToast('ok', `Outfit (typeex) of ${doc.name} set to ${item.name || `#${item.serverId}`}`);
		},
		[doc, editDoc, showToast]
	);

	const itemContextMenu = useCallback((item: ItemInfo, e: React.MouseEvent, selected: ItemInfo[]) => {
		setItemMenu({ x: e.clientX, y: e.clientY, item, items: selected });
	}, []);

	/** Reverse-lookup dialog: `usage` is null while the backend walk runs. */
	const [usageDialog, setUsageDialog] = useState<{ item: ItemInfo; usage: ItemUsage | null } | null>(null);

	const openUsage = useCallback(
		async (item: ItemInfo) => {
			setUsageDialog({ item, usage: null });
			try {
				setUsageDialog({ item, usage: await itemUsage(item.serverId) });
			} catch (e) {
				showToast('error', String(e));
				setUsageDialog(null);
			}
		},
		[showToast]
	);

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

	// Dismiss the context menus on any outside press or Escape, as MonsterList does.
	useEffect(() => {
		if (!itemMenu && !thingMenu && !tabMenu) return;
		const onDown = () => {
			setItemMenu(null);
			setThingMenu(null);
			setTabMenu(null);
		};
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				setItemMenu(null);
				setThingMenu(null);
				setTabMenu(null);
			}
		};
		window.addEventListener('mousedown', onDown);
		window.addEventListener('keydown', onKey);
		return () => {
			window.removeEventListener('mousedown', onDown);
			window.removeEventListener('keydown', onKey);
		};
	}, [itemMenu, thingMenu, tabMenu]);

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
								onClick={() => {
									// Plain navigation never inherits a picker preset.
									setItemsInitialFilters(['pickupable']);
									setView(n.key);
								}}
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
						onOpen={file => {
							setSelected(file);
							setView('monsters');
							// Double-click pins: this tab survives further selections.
							pinTab(file);
						}}
						onMutated={refreshMonsters}
						showToast={showToast}
						groups={groups}
						onReveal={reveal}
					/>
				</aside>

				<main className="ss-main">
					{tabs.length > 0 && (
						<div className="ss-ed-tabs">
							{tabs.map(f => {
								const m = monsters.find(mm => mm.file === f);
								return (
									<div
										key={f}
										className={`ss-ed-tabitem${f === selected ? ' ss-ed-tabitem-active' : ''}${
											f === previewTab ? ' ss-ed-tabitem-preview' : ''
										}`}
										title={f === previewTab ? `${f} — preview; double-click to keep open` : f}
										onDoubleClick={() => pinTab(f)}
										onMouseDown={e => {
											// Activating a tab from a browser view also returns to the editor.
											if (e.button === 0) {
												setSelected(f);
												setView('monsters');
											}
											// Middle-click closes; preventDefault stops autoscroll.
											if (e.button === 1) {
												e.preventDefault();
												void closeTab(f);
											}
										}}
										onAuxClick={e => e.preventDefault()}
										onContextMenu={e => {
											e.preventDefault();
											setTabMenu({ x: e.clientX, y: e.clientY, file: f });
										}}
									>
										<span className="ss-ed-tabname">{m?.name ?? f}</span>
										{dirtyFiles.has(f) && <span className="ss-ed-tabdirty">•</span>}
										<button
											className="ss-ed-tabclose"
											aria-label={`Close ${f}`}
											onMouseDown={e => e.stopPropagation()}
											onClick={() => void closeTab(f)}
										>
											<X size={11} />
										</button>
									</div>
								);
							})}
						</div>
					)}
					{tabMenu && (
						<div
							className="ss-context-menu"
							style={{ left: tabMenu.x, top: tabMenu.y }}
							onMouseDown={e => e.stopPropagation()}
						>
							<button
								className="ss-menu-item"
								onClick={() => {
									setTabMenu(null);
									void closeTab(tabMenu.file);
								}}
							>
								Close
							</button>
							<button
								className="ss-menu-item"
								disabled={tabs.length < 2}
								onClick={() => {
									setTabMenu(null);
									void closeTabs(tabs.filter(f => f !== tabMenu.file));
								}}
							>
								Close all except this one
							</button>
							<button
								className="ss-menu-item"
								disabled={tabs.indexOf(tabMenu.file) === 0}
								onClick={() => {
									setTabMenu(null);
									void closeTabs(tabs.slice(0, tabs.indexOf(tabMenu.file)));
								}}
							>
								Close all to the left
							</button>
							<button
								className="ss-menu-item"
								disabled={tabs.indexOf(tabMenu.file) === tabs.length - 1}
								onClick={() => {
									setTabMenu(null);
									void closeTabs(tabs.slice(tabs.indexOf(tabMenu.file) + 1));
								}}
							>
								Close all to the right
							</button>
							<div className="ss-menu-sep" />
							<button
								className="ss-menu-item"
								onClick={() => {
									setTabMenu(null);
									void closeTabs([...tabs]);
								}}
							>
								Close all
							</button>
						</div>
					)}
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
								onBrowseCorpses={browseCorpses}
								onBrowseItems={browseItems}
								previewUrl={previewUrl}
								thingAnim={thingAnim}
								prefs={prefs}
								jumpRequest={jumpRequest}
								onJumped={() => setJumpRequest(null)}
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
								cellTitle={itemCellTitle}
								cellFrames={itemCellFrames}
								cellUrl={itemCellUrl}
								filters={itemFilters}
								initialFilters={itemsInitialFilters}
								searchMode="filter"
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
								onPick={i => addToTray([i])}
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
									<button
										className="ss-menu-item"
										onClick={() => {
											setItemMenu(null);
											void openUsage(itemMenu.item);
										}}
									>
										<Users size={14} />
										Used by…
									</button>
									<button
										className="ss-menu-item"
										onClick={() => {
											setItemMenu(null);
											void navigator.clipboard.writeText(String(itemMenu.item.serverId));
											showToast('ok', `Copied ${itemMenu.item.serverId}`);
										}}
									>
										Copy id {itemMenu.item.serverId}
									</button>
									<button
										className="ss-menu-item"
										disabled={!itemMenu.item.name}
										onClick={() => {
											setItemMenu(null);
											void navigator.clipboard.writeText(itemMenu.item.name);
											showToast('ok', `Copied "${itemMenu.item.name}"`);
										}}
									>
										Copy name
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
											<button
												className="ss-menu-item"
												onClick={() => {
													setItemMenu(null);
													setAsTypeex(itemMenu.item);
												}}
											>
												<PersonStanding size={14} />
												Set as outfit (typeex) for {doc.name}
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
							filters={view === 'outfits' ? outfitFilters : undefined}
							selectionMode="single"
							view={view}
							draggable={view === 'outfits'}
							dragPayload={t => (view === 'outfits' ? { kind: 'outfit', type: t.id } : null)}
							onPick={view === 'outfits' && doc ? t => void pickOutfit(t) : undefined}
							onContextMenu={
								view === 'effects' || view === 'missiles'
									? (t, e) => thingContextMenu(t, e, view === 'effects' ? 'effect' : 'missile')
									: undefined
							}
							searchPlaceholder="Search client id or name"
						/>
					)}
					{thingMenu && (
						<div
							className="ss-context-menu ss-spell-menu"
							style={{ left: thingMenu.x, top: thingMenu.y }}
							onMouseDown={e => e.stopPropagation()}
						>
							<div className="ss-menu-head">
								Set {thingMenu.entry?.label ?? thingMenu.label} as {thingMenu.kind} for…
							</div>
							{!thingMenu.entry ? (
								<div className="ss-menu-note">This {thingMenu.kind} has no XML name — it cannot be used from a monster file.</div>
							) : !doc ? (
								<div className="ss-menu-note">No monster open.</div>
							) : spellTargets.length === 0 ? (
								<div className="ss-menu-note">{doc.name} has no spells that take effects.</div>
							) : (
								spellTargets.map(t => (
									<button
										key={`${t.list}-${t.i}`}
										className="ss-menu-item"
										onClick={() => {
											setThingMenu(null);
											setSpellEffect(t.list, t.i, thingMenu.kind, thingMenu.entry!);
										}}
									>
										{t.label}
									</button>
								))
							)}
						</div>
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
						// Only offered when the Loot tab exists to jump to.
						onGoToLoot={
							prefs.visibleSections.includes('loot')
								? () => {
										setView('monsters');
										setJumpRequest('loot');
								  }
								: undefined
						}
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
					{saving ? 'Saving…' : activeDirty ? 'Save •' : 'Save'}
				</button>
			</div>

			{usageDialog && (
				<div className="ss-backdrop" onMouseDown={() => setUsageDialog(null)}>
					<div className="ss-modal ss-usage-modal" onMouseDown={e => e.stopPropagation()}>
						<div className="ss-modal-title">
							<img src={itemUrl(usageDialog.item.serverId, 32)} width={32} height={32} alt="" />
							Used by — {usageDialog.item.name || `#${usageDialog.item.serverId}`}
						</div>
						{!usageDialog.usage ? (
							<div className="ss-modal-desc">Scanning the corpus…</div>
						) : usageDialog.usage.loot.length + usageDialog.usage.corpse.length + usageDialog.usage.typeex.length === 0 ? (
							<div className="ss-modal-desc">No monster references this item.</div>
						) : (
							(
								[
									['Dropped as loot', usageDialog.usage.loot],
									['Corpse of', usageDialog.usage.corpse],
									['Worn as typeex', usageDialog.usage.typeex]
								] as const
							).map(
								([title, refs]) =>
									refs.length > 0 && (
										<div key={title} className="ss-usage-group">
											<div className="ss-usage-title">
												{title} · {refs.length}
											</div>
											<div className="ss-usage-list">
												{refs.map(r => (
													<button
														key={r.file}
														className="ss-usage-row"
														title={r.file}
														onClick={() => {
															setUsageDialog(null);
															setSelected(r.file);
															setView('monsters');
														}}
													>
														{r.name}
														<span className="ss-usage-file mono">{r.file}</span>
													</button>
												))}
											</div>
										</div>
									)
							)
						)}
						<div className="ss-modal-buttons">
							<button className="ss-btn ss-btn-ghost" onClick={() => setUsageDialog(null)}>
								Close
							</button>
						</div>
					</div>
				</div>
			)}

			{scaling && (
				<ScaleLootDialog
					onClose={() => setScaling(false)}
					onError={m => showToast('error', m)}
					onApplied={report => {
						onMonstersChanged(null);
						lintWorkspace().then(setWorkspaceLints).catch(() => {});
						setReloadKey(k => k + 1);
						showToast(
							'ok',
							`Scaled ${report.entries.toLocaleString()} loot ${report.entries === 1 ? 'chance' : 'chances'} across ${
								report.files
							} ${report.files === 1 ? 'file' : 'files'}`
						);
					}}
				/>
			)}

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

			{prefsOpen && (
				<PreferencesDialog prefs={prefs} onChange={updatePrefs} onClose={() => setPrefsOpen(false)} />
			)}

			<LintPanel
				open={lintsOpen}
				onClose={() => setLintsOpen(false)}
				monsterLints={monsterLints}
				workspaceLints={workspaceLints}
				onFix={lint => void fixLint(lint)}
				onFixAll={fixAllLints}
				onFixAllWorkspace={() => void fixAllWorkspaceLints()}
				file={doc?.file ?? null}
				onJump={lint => {
					if (lint.file && lint.file !== selected) setSelected(lint.file);
					setView('monsters');
				}}
			/>
		</>
	);
}
