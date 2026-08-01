import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { confirm, save as saveDialog } from '@tauri-apps/plugin-dialog';
import { Bookmark, Package, Percent, PersonStanding, Plus, Save, Skull, Sparkles, Star, Trash2, Users, Wand2, X } from 'lucide-react';
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
	lookUrl,
	reloadCorpus,
	revealMonster,
	saveMonster,
	scanExternalChanges,
	searchItems,
	tauriItemIndex,
	thingsRowUrlFor,
	thingUrlFor,
	type SpellName,
	type ItemInfo,
	type ItemUsage,
	type Lint,
	type LintSeverity,
	type MonsterDoc,
	type MonsterSummary,
	type WorkspaceInfo
} from './monster';
import { engineInfo } from './engine';
import Menubar, { type Menu, type MenuItem } from './Menubar';
import { newLootEntry } from './sections/Loot';
import { SECTION_IDS, SECTION_LABEL, type SectionId } from './sections/section';
import HotkeysDialog from './HotkeysDialog';
import {
	loadBindings,
	saveBindings,
	shortcutFor,
	useHotkeys,
	type Bindings,
	type Command
} from './hotkeys';
import { MAGIC_EFFECTS, SHOOT_EFFECTS, type EffectEntry } from './catalog';
import { applyLintFix } from './lintfix';
import PinLootDialog, { type PinScope } from './PinLootDialog';
import PreferencesDialog from './PreferencesDialog';
import CustomEffectsDialog from './CustomEffectsDialog';
import {
	effectsFor,
	loadCustomEffects,
	pushCustomEffects,
	saveCustomEffects,
	type CustomEffects,
	type CustomEffectsByEngine
} from './customeffects';
import { CustomEffectsProvider } from './fields/customctx';
import {
	LINT_SEVERITIES,
	lintShown,
	loadLintPrefs,
	loadPrefs,
	saveLintPrefs,
	savePrefs,
	type LintPrefs,
	type Prefs
} from './prefs';
import ScaleLootDialog from './ScaleLootDialog';
import BatchEditDialog from './BatchEditDialog';
import QuickOpenDialog from './QuickOpenDialog';
import CompareDialog from './CompareDialog';
import BalanceDialog from './BalanceDialog';
import ExternalChangesDialog from './ExternalChangesDialog';
import PatchNotesDialog from './PatchNotesDialog';
import { loadCutoff, patchMarks, relativeWhen, saveCutoff } from './patchnotes';
import { loadFavourites, saveFavourites } from './favourites';
import { loadPresets, savePresets, upsertPreset, type LootPreset } from './lootpresets';
import { getThings, type ThingSummary } from './spr';
import { loadSetting, saveSetting } from './settings';
import { n } from './i18n';
import { workspaceLabel, type Toast } from './App';

/** How often the corpus is statted for changes made outside MONx, while this is
 *  the focused window.
 *
 *  Measured: about 40 ms for Canary's 1,656 monsters and 7 ms for Ironcore's
 *  382, nearly all of it the per-file stat. That is cheap for something the user
 *  asked for and far too expensive to run every second, so the timer is only the
 *  backstop — regaining focus scans immediately, and that is the path an edit in
 *  another editor actually takes. */
const EXTERNAL_POLL_MS = 10000;

/** Scoped to the corpus, like the patch-notes cut-off. */
const lastMonsterKey = (monstersPath: string) => `monx.lastMonster.${monstersPath}`;
import MonsterList, { type ListActions } from './MonsterList';
import CreateWizard from './CreateWizard';
import PreviewPanel from './PreviewPanel';
import LintPanel, { LintStatus } from './LintPanel';
import ThingBrowser from './ThingBrowser';
import { MonsterEditor } from './MonsterEditor';
import { PreviewProvider, ThingAnimProvider, commonest, idleCycleMs, walkFrameMs, type PreviewUrl, type ThingAnimLookup } from './fields/preview';

/** The speed the Outfits grid animates at, having no creature to read one from.
 *  Ordinary monsters run 100–300 and the foot-delay clamp puts all of them on
 *  the same cap, so the exact value only matters for the very fastest. */
const NOMINAL_SPEED = 100;

/** The centre column's content. `monsters` is the editor; the rest are the
 *  reference browsers, kept beside the editor rather than in a separate mode. */
type View = 'monsters' | 'items' | 'outfits' | 'effects' | 'missiles';

/** What the create wizard can ask a browser to answer, and which browser
 *  answers it. Every one of them is a picture, which is the whole reason the
 *  wizard hands them over rather than drawing a grid of its own. */
type WizardPickKind = 'outfit' | 'corpse' | 'effect' | 'missile';

const PICK_VIEW: Record<WizardPickKind, View> = {
	outfit: 'outfits',
	corpse: 'items',
	effect: 'effects',
	missile: 'missiles'
};

const PICK_PROMPT: Record<WizardPickKind, string> = {
	outfit: 'Double-click an outfit to give it to the new monster',
	corpse: 'Double-click an item to make it the new monster’s corpse',
	effect: 'Double-click a magic effect to give it to the ability being designed',
	missile: 'Double-click a projectile to give it to the ability being designed'
};

/** The three nav entries backed by a dat category, and that category's own name. */
type ThingView = 'outfits' | 'effects' | 'missiles';

/** How many strip frames are the walk cycle — what an outfit cell loops. Zero
 *  when the outfit has no walk group at all: a one-frame outfit, or one of the
 *  `animateAlways` torches that burns in place and never takes a step. Those
 *  loop their whole strip instead, on their own declared durations. */
function walkCells(t: ThingSummary): number {
	if (!t.walkFrames) return 0;
	return Math.max(0, t.frames - (t.idleFrames ?? 1));
}

/** Values are i18n keys — translated at the render site with t(). Lower-case
 *  because they appear mid-sentence ("Show errors"), which is a fact about
 *  English; a translation is free to capitalise as its own language requires. */
const LINT_SEVERITY_LABEL: Record<LintSeverity, string> = {
	error: 'errors',
	warning: 'warnings',
	silent: 'silent findings'
};

const THING_CAT: Record<ThingView, 'outfit' | 'effect' | 'missile'> = {
	outfits: 'outfit',
	effects: 'effect',
	missiles: 'missile'
};

/**
 * A corpus-wide write that did not finish. Says how much landed and names the
 * first file that would not — "one error toast and no indication that a partial
 * write happened" is the state this exists to prevent.
 */
function partialWrite(t: TFunction, written: number, failed: string[]): string {
	const first = failed[0] ?? '';
	return failed.length === 1
		? t('Wrote {{count}} file, then failed on {{error}}', { count: written, error: first })
		: t('Wrote {{count}} file, then failed on {{failures}} more (first: {{error}})', {
				count: written,
				failures: failed.length,
				error: first
			});
}

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
	const { t } = useTranslation();
	const [view, setView] = useState<View>('monsters');
	const [tool, setTool] = useState<PinScope | null>(null);
	/** Editor tab preferences; the dialog writes them straight through to storage. */
	const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
	const [prefsOpen, setPrefsOpen] = useState(false);
	/** A tab the editor should show, set from outside it (Loot → Edit). Cleared as
	 *  soon as the editor honours it. */
	const [jumpRequest, setJumpRequest] = useState<SectionId | null>(null);
	/** Which severities the drawer shows, and which lint codes are ignored. */
	const [lintPrefs, setLintPrefs] = useState<LintPrefs>(loadLintPrefs);
	/** Command id → chords. Defaults merged with the user's overrides. */
	const [bindings, setBindings] = useState<Bindings>(loadBindings);
	const [hotkeysOpen, setHotkeysOpen] = useState(false);
	/** Declared effects for every engine, and the dialog over them. Kept whole
	 *  rather than per-engine so switching workspaces never loses another
	 *  server's declarations. */
	const [customFx, setCustomFx] = useState<CustomEffectsByEngine>(loadCustomEffects);
	const [customFxOpen, setCustomFxOpen] = useState(false);
	const engineFx = effectsFor(customFx, info.engine);
	/** The monster list's own actions, so a hotkey can reach its dialogs. */
	const listActions = useRef<ListActions | null>(null);
	// Per workspace. A single global key restored one corpus's file into
	// another, which used to be a harmless miss and is now an error toast: the
	// file key carries a subfolder on the nested corpora, so "monsters/amazon.xml"
	// is a real path in one workspace and nonsense in the next.
	const [selected, setSelected] = useState<string | null>(() => {
		const last = loadSetting(lastMonsterKey(info.paths.monsters), null);
		return last && info.monsterCount > 0 ? last : null;
	});
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
	/** Starred items, by server id. Persisted in `monx.favourites`. */
	const [favourites, setFavourites] = useState<Set<number>>(loadFavourites);
	/** Named loot sets (`monx.lootPresets`), and the two little dialogs over them:
	 *  a name being typed, and the delete list. */
	const [presets, setPresets] = useState<LootPreset[]>(loadPresets);
	const [presetName, setPresetName] = useState<string | null>(null);
	const [presetManage, setPresetManage] = useState(false);
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
	/** Right-clicked outfit cell, for "Set as outfit for …". */
	const [outfitMenu, setOutfitMenu] = useState<{ x: number; y: number; thing: ThingSummary } | null>(null);
	const label = workspaceLabel(info.paths.monsters);

	// The remembered monster opens once, on the first list the workspace hands
	// over; after that an empty selection is a state of its own. Closing the last
	// tab has to leave the editor blank — re-opening the first monster from here
	// was what made that tab impossible to close.
	const openedFirstRef = useRef(false);
	// The files of the last list seen. "Vanished" means *was here and is not* —
	// a file merely absent from this list is not the same thing, because the
	// selection moves before the list does: creating a monster selects it and
	// then asks the backend for a new list, so for one render the selection is a
	// file the list has never heard of. Clearing on absence alone deselected
	// every monster the wizard made, a keystroke after making it.
	const seenFilesRef = useRef<Set<string>>(new Set());
	useEffect(() => {
		if (monsters.length === 0) return;
		const files = new Set(monsters.map(m => m.file));
		const seen = seenFilesRef.current;
		seenFilesRef.current = files;
		const exists = selected !== null && files.has(selected);
		if (openedFirstRef.current) {
			// A selection that vanished (renamed or deleted elsewhere) clears rather
			// than jumping to an unrelated monster.
			if (selected !== null && !exists && seen.has(selected)) setSelected(null);
			return;
		}
		openedFirstRef.current = true;
		if (!exists) setSelected(monsters[0].file);
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
		if (!selected) {
			// Nothing open: the editor shows its empty state, and the preview panel
			// with it. The remembered file is left alone so a restart still lands
			// where the work was.
			setDoc(null);
			setMonsterLints([]);
			onOpenFile(null);
			undoRef.current = [];
			redoRef.current = [];
			return;
		}
		saveSetting(lastMonsterKey(info.paths.monsters), selected);
		onOpenFile(selected);
		// A fresh buffer starts a fresh history — undo must never cross files.
		undoRef.current = [];
		redoRef.current = [];
		if (!tabsRef.current.includes(selected)) {
			// A clean preview tab gives way to the new one; anything pinned or
			// dirty stays and the new tab appends.
			const preview = previewRef.current;
			const replaces =
				preview !== null &&
				preview !== selected &&
				tabsRef.current.includes(preview) &&
				!dirtyFilesRef.current.has(preview);
			if (replaces) buffersRef.current.delete(preview);
			const next = replaces
				? tabsRef.current.map(f => (f === preview ? selected : f))
				: [...tabsRef.current, selected];
			// The ref is written through rather than left to the next render: this
			// effect can run twice for one selection (StrictMode double-invokes it,
			// and so does a dev reload), and a stale tabsRef made the second run
			// append the same file again — the duplicate tabs.
			tabsRef.current = next;
			previewRef.current = selected;
			// Still an updater, so a close that landed in the same batch is not
			// clobbered, and still idempotent, so a repeated run is a no-op.
			setTabs(prev =>
				prev.includes(selected)
					? prev
					: replaces && prev.includes(preview)
						? prev.map(f => (f === preview ? selected : f))
						: [...prev, selected]
			);
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
						? t('{{file}} has unsaved changes. Close and discard them?', { file: dirtyClosing[0] })
						: t('{{count}} tab has unsaved changes. Close and discard them?', {
								count: dirtyClosing.length
							});
				if (!(await confirm(msg))) return;
			}
			const closing = new Set(files);
			for (const f of files) buffersRef.current.delete(f);
			setPreviewTab(prev => (prev !== null && closing.has(prev) ? null : prev));
			setDirtyFiles(prev => new Set([...prev].filter(f => !closing.has(f))));
			setTabs(prev => {
				const next = prev.filter(f => !closing.has(f));
				if (selected && closing.has(selected)) {
					// The nearest survivor takes over; closing the last tab leaves
					// nothing open, which is a legitimate place to be.
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
		[dirtyFiles, selected, t]
	);

	const closeTab = useCallback((file: string) => closeTabs([file]), [closeTabs]);

	/** Cycles the open tabs, wrapping at both ends. */
	const stepTab = useCallback(
		(delta: number) => {
			if (tabs.length === 0) return;
			const at = selected ? tabs.indexOf(selected) : -1;
			const from = at === -1 ? 0 : at;
			setSelected(tabs[(((from + delta) % tabs.length) + tabs.length) % tabs.length]);
		},
		[tabs, selected]
	);

	/** Right-clicked tab, for the Close-others / left / right menu. */
	const [tabMenu, setTabMenu] = useState<{ x: number; y: number; file: string } | null>(null);

	useEffect(() => {
		listMonsterGroups().then(setGroups).catch(() => setGroups([]));
		listSpellNames().then(setSpells).catch(() => setSpells([]));
		listMonsterScripts().then(setScripts).catch(() => setScripts([]));
	}, []);

	// The lowest unused raceid, shown beside the field and behind its "Use n"
	// button. Derived here rather than asked of the backend (`next_free_raceid`)
	// because the backend only knows what is on disk: taking the suggestion in
	// one monster has to move it for the next one, before either is saved. A
	// dirty buffer therefore overrides its summary, and the open document
	// overrides its own buffer, which lags a keystroke behind.
	const nextRaceid = useMemo(() => {
		const used = new Set<number>();
		const add = (id: number | null | undefined) => {
			if (id !== null && id !== undefined) used.add(id);
		};
		for (const m of monsters) {
			if (doc && doc.file === m.file) add(doc.raceid);
			else if (dirtyFiles.has(m.file)) add(buffersRef.current.get(m.file)?.doc.raceid ?? m.raceid);
			else add(m.raceid);
		}
		let id = 1;
		while (used.has(id)) id++;
		return id;
	}, [monsters, dirtyFiles, doc]);

	// The list draws its sprites from `/monsters.png`, which renders the backend's
	// corpus — so a look only reaches it on save. Every file with unsaved edits
	// therefore hands the list a `lookUrl` built from its own buffer instead, and
	// the open document overrides its buffer, which lags a keystroke behind.
	const listLooks = useMemo(() => {
		const out = new Map<string, string>();
		for (const file of dirtyFiles) {
			const d = doc && doc.file === file ? doc : buffersRef.current.get(file)?.doc;
			if (d) out.set(file, lookUrl(d.look, { cell: 32 }));
		}
		return out;
	}, [dirtyFiles, doc]);

	/** Client things for the editor's effect, missile and outfit previews. */
	const previewUrl = useCallback<PreviewUrl>(
		(kind, id, opts) => {
			if (kind === 'item') return itemUrl(id);
			return thingUrlFor(info.sprPath, info.datPath, kind, id, info.transparent, opts);
		},
		[info.sprPath, info.datPath, info.transparent]
	);

	/** Frame and pattern counts, so the spell stage animates the real cycle length. */
	// Answered from the lists already loaded rather than from the `.dat`: a
	// bundle workspace has no `.dat` to ask, and the round-trip failed silently
	// there, leaving every Canary monster on the fallback three-frame loop.
	const thingIndex = useMemo(() => {
		const byId = (list: ThingSummary[]) => new Map(list.map(t => [t.id, t]));
		return {
			outfit: byId(things.outfit),
			effect: byId(things.effect),
			missile: byId(things.missile)
		};
	}, [things]);

	// How long one cell holds a frame. This is per thing, not per category: two
	// Canary outfits genuinely want different rates, because the foot delay is
	// derived from the phase count and 158 of them walk in two phases against
	// 1,232 in eight.
	//
	// Effects and missiles are phase-timed, so they use their own declared
	// duration. **Outfit cells are not**: they animate the walk cycle, which the
	// client times from the creature's speed and never from the phases. The
	// browser has no creature to read a speed from, hence a nominal one; the
	// clamp swallows the choice for anything below about speed 375.
	const cellIntervalFor = useCallback(
		(view: ThingView, t: ThingSummary) => {
			// An outfit with a walk cycle is timed by the foot delay. One without
			// — the `animateAlways` torches and braziers, which burn in place and
			// never take a step — falls back to its declared durations, and to
			// the client's one-second cycle where the format states none.
			// Running either at the walk rate is what made them race.
			if (view === 'outfits') {
				const walk = walkFrameMs(NOMINAL_SPEED, t.walkFrames ?? 0, info.enhancedAnimations);
				if (walk > 0) return walk;
				return commonest(t.frameDurations ?? []) ?? idleCycleMs(t.frames);
			}
			return commonest(t.frameDurations ?? []) ?? 0;
		},
		[info.enhancedAnimations]
	);

	// The timer runs at the shortest interval any cell in the category needs;
	// everything slower counts ticks. Undefined leaves the fixed tick in place,
	// which is what the `.spr`/`.dat` engines get — they declare no durations.
	const thingIntervals = useMemo(() => {
		const base = (view: ThingView, list: ThingSummary[]) => {
			let min = Infinity;
			for (const t of list) {
				const ms = cellIntervalFor(view, t);
				if (ms > 0 && ms < min) min = ms;
			}
			return Number.isFinite(min) ? min : undefined;
		};
		return {
			outfits: base('outfits', things.outfit),
			effects: base('effects', things.effect),
			missiles: base('missiles', things.missile)
		};
	}, [things, cellIntervalFor]);

	const thingAnim = useCallback<ThingAnimLookup>(
		async (kind, id) => {
			if (kind === 'item') return null;
			const t = thingIndex[kind].get(id);
			// An unknown id is a lint elsewhere; here it just means "don't animate".
			if (!t) return null;
			return {
				frames: t.frames,
				patternX: t.patternX,
				patternY: t.patternY,
				animateAlways: t.animateAlways,
				durations: t.frameDurations ?? [],
				idleFrames: t.idleFrames ?? 1,
				walkFrames: t.walkFrames ?? Math.max(0, t.frames - (t.idleFrames ?? 1))
			};
		},
		[thingIndex]
	);

	const monsterNames = useMemo(() => monsters.map(m => m.name), [monsters]);

	// Patch notes run from a cut-off point the user sets, stored per workspace.
	// A workspace that has never had one gets it at open, which is where the old
	// baseline lived — the difference is that this one survives the session.
	const [patchOpen, setPatchOpen] = useState(false);

	// The create wizard. The list owns the entry point — its context menu and
	// `ListActions.newMonster` both go through it — but the wizard itself lives
	// here, because it needs the engine profile, the client's outfits and the
	// item index, and the list has none of the three.
	const [wizardOpen, setWizardOpen] = useState(false);
	useEffect(() => {
		if (loadCutoff(info.paths.monsters)) return;
		patchMarks()
			.then(marks => saveCutoff(info.paths.monsters, marks))
			.catch(() => {
				// No cut-off point yet is a state the dialog handles; failing to set
				// one at open is not worth a toast.
			});
	}, [info.paths.monsters]);

	/** The loot-chance scaler: null when closed, else the item it opens on
	 *  (`null` item id = the whole corpus, as the Tools menu opens it). */
	const [scaling, setScaling] = useState<{ itemId: number | null } | null>(null);
	const [batchOpen, setBatchOpen] = useState(false);
	const [quickOpen, setQuickOpen] = useState(false);
	const [compareOpen, setCompareOpen] = useState(false);
	const [balanceOpen, setBalanceOpen] = useState(false);
	/** Species the corpus actually uses, for the batch filter's dropdown. */
	const speciesList = useMemo(
		() => [...new Set(monsters.map(m => m.species).filter((s): s is string => !!s))].sort(),
		[monsters]
	);

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
			showToast('ok', t('Exported {{count}} lint', { count: lines.length }));
		} catch (e) {
			showToast('error', String(e));
		}
	}, [label, showToast, t]);

	// Moves the cut-off point to now without going through the dialog, for a user
	// who knows they are starting a span rather than ending one.
	const setPatchCutoff = useCallback(async () => {
		try {
			const marks = await patchMarks();
			if (!saveCutoff(info.paths.monsters, marks)) {
				showToast('error', t('Could not store the cut-off point'));
				return;
			}
			showToast('ok', t('Cut-off point set — {{count}} monster marked', { count: marks.length }));
		} catch (e) {
			showToast('error', String(e));
		}
	}, [info.paths.monsters, showToast, t]);

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

	// The backend linter needs the declarations too, or the drawer keeps
	// reporting an effect the picker has just started showing. Pushed on mount
	// as well as on change: the map outlives any one workspace, and this is the
	// first point after an open where the engine in force is known.
	useEffect(() => {
		pushCustomEffects(customFx);
	}, [customFx]);

	/** Saves the declarations, pushes them, and re-lints what is on screen so
	 *  the answer is visible without reopening the monster. */
	const updateCustomFx = useCallback(
		(next: CustomEffects) => {
			const all = { ...customFx, [info.engine]: next };
			saveCustomEffects(all);
			setCustomFx(all);
			pushCustomEffects(all);
			const current = docRef.current;
			if (current) {
				// Ordered after the push on purpose — the invoke queue is FIFO, so
				// the re-lint sees the declarations that were just sent.
				lintMonster(current)
					.then(l => {
						setMonsterLints(l);
						const buf = buffersRef.current.get(current.file);
						if (buf && buf.doc === current) buf.lints = l;
					})
					.catch(() => {});
			}
			onMonstersChanged(current?.file ?? null);
		},
		[customFx, info.engine, onMonstersChanged]
	);

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
				else showToast('error', t('{{code}} needs a manual fix', { code: lint.code }));
				return;
			}
			if (!target) return;
			if (dirtyFiles.has(target)) {
				showToast('error', t('{{file}} has unsaved changes — save it first', { file: target }));
				return;
			}
			try {
				if ((await fixInFile(target, [lint])).length === 0) {
					showToast('error', t('{{code}} needs a manual fix', { code: lint.code }));
					return;
				}
				// Source lints are only computed when the workspace opens, so there
				// is nothing to re-fetch — drop the row that was just repaired.
				setWorkspaceLints(prev => prev.filter(l => l !== lint));
				onMonstersChanged(null);
				showToast('ok', t('Fixed {{code}} in {{file}}', { code: lint.code, file: target }));
			} catch (e) {
				showToast('error', String(e));
			}
		},
		[doc, dirtyFiles, editDoc, fixInFile, nextRaceid, onMonstersChanged, showToast, t]
	);

	// An ignored code is gone from everything downstream — the drawer, the status
	// bar, the editor's field markers and the Fix-all passes. Ignoring is a
	// statement about the rule, not about one finding, so a rule that is off does
	// not get quietly fixed either.
	const visibleMonsterLints = useMemo(() => monsterLints.filter(l => lintShown(lintPrefs, l)), [monsterLints, lintPrefs]);
	const visibleWorkspaceLints = useMemo(
		() => workspaceLints.filter(l => lintShown(lintPrefs, l)),
		[workspaceLints, lintPrefs]
	);

	const updateLintPrefs = useCallback((next: LintPrefs) => {
		setLintPrefs(next);
		saveLintPrefs(next);
	}, []);

	const toggleLintSeverity = useCallback(
		(s: LintSeverity) => {
			const on = lintPrefs.severities.includes(s);
			const next = on ? lintPrefs.severities.filter(x => x !== s) : [...lintPrefs.severities, s];
			// Never leave every severity off — an empty drawer reads as "no problems".
			if (next.length === 0) return;
			updateLintPrefs({ ...lintPrefs, severities: next });
		},
		[lintPrefs, updateLintPrefs]
	);

	const ignoreLintCode = useCallback(
		(code: string) => {
			if (lintPrefs.muted.includes(code)) return;
			updateLintPrefs({ ...lintPrefs, muted: [...lintPrefs.muted, code].sort() });
			showToast('ok', t('Ignoring {{code}} — restore it from the Linter menu', { code }));
		},
		[lintPrefs, updateLintPrefs, showToast, t]
	);

	/** Fix all, for the Workspace tab: every fixable lint, grouped by its file. */
	const fixAllWorkspaceLints = useCallback(async () => {
		if (dirtyFiles.size > 0) {
			showToast('error', t('Save your open changes first — these fixes write files directly'));
			return;
		}
		const byFile = new Map<string, Lint[]>();
		for (const l of visibleWorkspaceLints) {
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
			showToast('ok', t('Nothing here has an automatic fix'));
			return;
		}
		// Source lints are only computed at open, so the panel is corrected in
		// place rather than re-fetched.
		setWorkspaceLints(prev => prev.filter(l => !applied.has(l)));
		onMonstersChanged(null);
		setReloadKey(k => k + 1);
		// Two counts in one sentence, so the inner noun phrase is translated on its
		// own and passed in — i18next carries one `count` per message.
		showToast(
			'ok',
			t('Fixed {{count}} lint across {{files}}', {
				count: applied.size,
				files: t('{{count}} file', { count: files.length })
			})
		);
	}, [dirtyFiles, fixInFile, onMonstersChanged, showToast, visibleWorkspaceLints, t]);

	const fixAllLints = useCallback(() => {
		if (!doc) return;
		let d = doc;
		let fixed = 0;
		let manual = 0;
		for (const l of visibleMonsterLints.filter(l => l.fixable)) {
			const next = applyLintFix(d, l, { nextRaceid });
			if (next) {
				d = next;
				fixed++;
			} else manual++;
		}
		if (fixed > 0) editDoc(d);
		showToast(
			'ok',
			manual > 0
				? t('Fixed {{count}} lint, {{manual}} need a manual fix', { count: fixed, manual })
				: t('Fixed {{count}} lint', { count: fixed })
		);
	}, [doc, visibleMonsterLints, editDoc, nextRaceid, showToast, t]);

	// Undo/redo used to have their own listener here. They are commands now, like
	// everything else — see the command table below — and they carry
	// `notWhileTyping`, which is what used to be the tag check: inside a text
	// field Ctrl+Z is the field's, not the document's.

	// Right-clicking an outfit adopts it as the monster's look — the same mutation
	// as dropping it on the Look section. Asked for explicitly from a menu, so
	// there is no confirm on top of it.
	const pickOutfit = useCallback(
		(thing: ThingSummary) => {
			if (!doc) return;
			const label = thing.name ? `${thing.name} (${thing.id})` : `#${thing.id}`;
			editDoc({ ...doc, look: { ...doc.look, mode: 'type', type: thing.id } });
			setView('monsters');
			showToast('ok', t('Outfit of {{monster}} set to {{outfit}}', { monster: doc.name, outfit: label }));
		},
		[doc, editDoc, showToast, t]
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
			showToast('ok', t('Saved {{file}}', { file: doc.file }));
			setWorkspaceLints(await lintWorkspace());
			refreshDropped();
		} catch (e) {
			showToast('error', String(e));
		} finally {
			setSaving(false);
		}
	}, [doc, showToast, refreshDropped, t]);

	/**
	 * Every dirty buffer, one after another.
	 *
	 * Sequential rather than concurrent: each `save_monster` re-reads the whole
	 * corpus behind the write lock, so firing twenty at once would queue on that
	 * lock anyway and the failures would come back interleaved. A file that will
	 * not write stops nothing — the rest still save, and the toast names what
	 * did not.
	 */
	const saveAll = useCallback(async () => {
		const files = [...dirtyFilesRef.current];
		if (files.length === 0) return;
		setSaving(true);
		const failed: string[] = [];
		let saved = 0;
		try {
			for (const file of files) {
				const buffered = buffersRef.current.get(file);
				if (!buffered) continue;
				try {
					const lints = await saveMonster(buffered.doc);
					buffersRef.current.set(file, { doc: buffered.doc, lints });
					if (file === docRef.current?.file) setMonsterLints(lints);
					setDirtyFiles(prev => {
						const next = new Set(prev);
						next.delete(file);
						return next;
					});
					saved++;
				} catch (e) {
					failed.push(`${file}: ${e}`);
				}
			}
		} finally {
			setSaving(false);
		}
		if (failed.length > 0) showToast('error', failed.join('\n'));
		else showToast('ok', t('Saved {{count}} file', { count: saved }));
		setWorkspaceLints(await lintWorkspace().catch(() => []));
		refreshDropped();
		onMonstersChanged(null);
	}, [onMonstersChanged, refreshDropped, showToast, t]);

	const refreshMonsters = useCallback(
		(focusFile: string | null) => {
			onMonstersChanged(focusFile);
			if (focusFile) setSelected(focusFile);
			void listMonsters().catch(() => {});
			lintWorkspace().then(setWorkspaceLints).catch(() => {});
		},
		[onMonstersChanged]
	);

	// ---- Files changed outside MONx ----

	/** Contested files, until the user says which version wins. */
	const [conflicts, setConflicts] = useState<string[]>([]);
	const scanningRef = useRef(false);

	/**
	 * Takes what is on disk.
	 *
	 * The backend reload is unconditional — its copy of the corpus should mirror
	 * the folder whatever the user decides about their own buffers, or every
	 * cross-file lint is computed against a file that no longer exists in that
	 * form. `files` are only the buffers to drop.
	 *
	 * Deletions need nothing beyond the list refresh: it drives the effect that
	 * prunes tabs, buffers and the selection, which is the same path a delete
	 * made inside MONx already takes.
	 */
	const adopt = useCallback(
		async (files: string[]) => {
			await reloadCorpus();
			for (const file of files) buffersRef.current.delete(file);
			setDirtyFiles(prev => {
				if (!files.some(f => prev.has(f))) return prev;
				const next = new Set(prev);
				for (const file of files) next.delete(file);
				return next;
			});
			refreshMonsters(null);
			refreshDropped();
			const active = docRef.current?.file ?? null;
			if (!active || !files.includes(active)) return;
			// Nothing re-runs the load effect — `selected` has not moved and
			// `reloadKey` would throw away every other buffer with it — so the
			// active file is re-read here. A document replaced wholesale from disk
			// starts a fresh history, for the same reason opening one does.
			const fresh = await getMonster(active);
			undoRef.current = [];
			redoRef.current = [];
			buffersRef.current.set(active, { doc: fresh, lints: [] });
			setDoc(fresh);
			const lints = await lintMonster(fresh).catch(() => []);
			setMonsterLints(lints);
			const buffered = buffersRef.current.get(active);
			if (buffered && buffered.doc === fresh) buffered.lints = lints;
		},
		[refreshDropped, refreshMonsters]
	);

	const syncExternal = useCallback(async () => {
		// Scans are serialised: one that overran the interval would otherwise
		// have a second reload racing it, and both would refresh the list.
		if (scanningRef.current) return;
		scanningRef.current = true;
		try {
			const changes = await scanExternalChanges();
			if (changes.length === 0) return;
			// The only thing worth asking about is a file that moved on disk while
			// this session holds unsaved edits to it, because one of the two
			// versions is going to be lost. Everything else costs nothing to take.
			const contested = new Set(
				changes.filter(c => c.kind === 'modified' && dirtyFilesRef.current.has(c.file)).map(c => c.file)
			);
			// A deletion cannot be contested. Holding a buffer for a file that is
			// not there means a tab that cannot be closed and a save that recreates
			// it behind the user's back, so the edits go and the toast says so —
			// which is more than a silent loss, and less than a lie.
			const deleted = changes.filter(c => c.kind === 'removed' && dirtyFilesRef.current.has(c.file));
			await adopt(changes.filter(c => !contested.has(c.file)).map(c => c.file));
			for (const c of deleted) {
				showToast('error', t('{{file}} was deleted outside MONx — unsaved changes to it are gone', { file: c.file }));
			}
			if (contested.size > 0) setConflicts(prev => [...new Set([...prev, ...contested])]);
		} catch {
			// A workspace closing mid-scan, or a folder that has gone away under
			// it. Either the next tick succeeds or there is no workspace to warn
			// about, and a toast every three seconds would be the worse failure.
		} finally {
			scanningRef.current = false;
		}
	}, [adopt, showToast, t]);

	// Polled rather than watched. A filesystem watcher is a dependency and a
	// per-platform surface of its own; this is one stat per monster and needs
	// neither. Regaining focus is the moment that matters, because the edit was
	// made in the window you just came back from — the timer only covers what
	// happens while MONx *is* the focused window, like a `git pull` in a terminal
	// beside it, and is slow accordingly.
	//
	// Nothing is scanned while the window is unfocused: the focus handler catches
	// up in one sweep, so ticking in the background would be work nobody is
	// waiting on.
	useEffect(() => {
		const tick = () => {
			if (document.hasFocus()) void syncExternal();
		};
		const timer = window.setInterval(tick, EXTERNAL_POLL_MS);
		window.addEventListener('focus', tick);
		return () => {
			window.clearInterval(timer);
			window.removeEventListener('focus', tick);
		};
	}, [syncExternal]);

	const resolveConflict = useCallback(
		(file: string, action: 'keep' | 'load') => {
			setConflicts(prev => prev.filter(f => f !== file));
			// "Keep mine" has nothing to do: the buffer stays dirty and the stamp
			// has already moved, so the same edit is never asked about twice. The
			// next save writes over what is on disk, which is what was chosen.
			if (action === 'load') void adopt([file]).catch(e => showToast('error', String(e)));
		},
		[adopt, showToast]
	);

	// The corpus tools rewrite files straight from the on-disk corpus, so an
	// unsaved editor buffer would be silently overwritten by the next save.
	// Blocked rather than merged: the fix is one Ctrl+S away.
	// A whole sentence rather than a suffix spliced onto four labels: word order
	// after "save first" is not English's to decide.
	const blocked = (label: string) => (dirty ? t('{{action}} — save first', { action: label }) : label);

	const updatePrefs = (next: Prefs) => {
		setPrefs(next);
		savePrefs(next);
	};

	// How old the patch-notes cut-off point is, in the menu label. Re-read when
	// the dialog closes, because that is where it usually moves.
	const patchCutoffLabel = useMemo(() => {
		const c = loadCutoff(info.paths.monsters);
		return c
			? t('Set patch notes cut-off point — last set {{when}}', { when: relativeWhen(c.at) })
			: t('Set patch notes cut-off point');
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [info.paths.monsters, patchOpen, t]);
	const nav: { key: View; label: string; icon: JSX.Element; count: number }[] = [
		{ key: 'monsters', label: t('Monsters'), icon: <Skull size={16} />, count: info.monsterCount },
		{ key: 'items', label: t('Items'), icon: <Package size={16} />, count: itemList.length },
		{
			key: 'outfits',
			label: t('Outfits'),
			icon: <PersonStanding size={16} />,
			count: things.outfit.length
		},
		{ key: 'effects', label: t('Effects'), icon: <Sparkles size={16} />, count: things.effect.length },
		{ key: 'missiles', label: t('Missiles'), icon: <Wand2 size={16} />, count: things.missile.length }
	];

	const itemRowUrl = useCallback(
		(visible: ItemInfo[], cell: number) => itemsRowUrl(visible.map(i => i.serverId), cell),
		[]
	);
	const itemKey = useCallback((i: ItemInfo) => i.serverId, []);
	const itemIsFavourite = useCallback((i: ItemInfo) => favourites.has(i.serverId), [favourites]);
	const itemLabel = useCallback((i: ItemInfo) => i.name || `#${i.serverId}`, []);
	const itemSearchText = useCallback((i: ItemInfo) => i.name, []);
	const itemSearchId = useCallback((i: ItemInfo) => i.serverId, []);
	// Multi-line tooltip from the raw items.xml attributes — weight is in
	// hundredths of an oz, as the client displays it.
	// `atk`/`def`/`arm` and the weaponType/slotType words are the items.xml
	// vocabulary itself, so they stay as the file spells them; only the prose
	// around them is translated.
	const itemCellTitle = useCallback(
		(i: ItemInfo) => {
			const a = i.attributes;
			const lines = [`${i.name || `#${i.serverId}`}  (#${i.serverId})`];
			const combat: string[] = [];
			if (a.attack) combat.push(`atk ${a.attack}`);
			if (a.defense)
				combat.push(`def ${a.defense}${a.extradef ? ` ${Number(a.extradef) >= 0 ? '+' : ''}${a.extradef}` : ''}`);
			if (a.armor) combat.push(`arm ${a.armor}`);
			if (a.weaponType) combat.push(a.weaponType);
			if (a.slotType) combat.push(a.slotType);
			if (combat.length > 0) lines.push(combat.join(' · '));
			const misc: string[] = [];
			if (a.weight) misc.push(t('{{weight}} oz', { weight: n(Number(a.weight) / 100) }));
			if (a.worth) misc.push(t('worth {{worth}} gp', { worth: n(Number(a.worth)) }));
			if (a.charges) misc.push(t('{{count}} charge', { count: Number(a.charges) }));
			if (a.containerSize) misc.push(t('{{count}} slot', { count: Number(a.containerSize) }));
			if (a.duration) misc.push(t('decays in {{seconds}}s', { seconds: a.duration }));
			if (misc.length > 0) lines.push(misc.join(' · '));
			if (a.description) lines.push(a.description);
			return lines.join('\n');
		},
		[t]
	);
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
	// `label` and `section` are i18n keys; ThingBrowser translates them where it
	// renders the popover, so this table stays a plain list of predicates. The
	// `key`s are storage and never translated.
	const itemFilters = useMemo(() => {
		const attr = (key: string) => (i: ItemInfo) => key in i.attributes;
		const attrIs = (key: string, value: string) => (i: ItemInfo) => i.attributes[key] === value;
		const special = 'Special';
		const kind = 'Kind';
		const weapons = 'Weapons';
		const slot = 'Slot';
		const props = 'Properties';
		return [
			{
				key: 'favourite',
				label: 'Favourites',
				section: special,
				test: (i: ItemInfo) => favourites.has(i.serverId)
			},
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
	}, [itemFrames, dropped, favourites]);

	/** Stars or unstars a whole selection: the menu acts on what is selected,
	 *  and unstars only when every one of them is already a favourite. */
	const toggleFavourites = useCallback(
		(picked: ItemInfo[]) => {
			if (picked.length === 0) return;
			setFavourites(prev => {
				const next = new Set(prev);
				const allStarred = picked.every(i => next.has(i.serverId));
				for (const i of picked) {
					if (allStarred) next.delete(i.serverId);
					else next.add(i.serverId);
				}
				saveFavourites(next);
				// Two whole sentences rather than one assembled from "Removed"/"Added"
				// and "from"/"to" — those fragments only compose in English.
				showToast(
					'ok',
					allStarred
						? t('Removed {{count}} item from favourites', { count: picked.length })
						: t('Added {{count}} item to favourites', { count: picked.length })
				);
				return next;
			});
		},
		[showToast, t]
	);

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
		const label = (b: (typeof doc.attacks)[number]) => b.name ?? b.script ?? t('unnamed');
		return [
			...doc.attacks.map((b, i) => ({
				list: 'attacks' as const,
				i,
				b,
				label: t('{{spell}} (attack)', { spell: label(b) })
			})),
			...doc.defenses.map((b, i) => ({
				list: 'defenses' as const,
				i,
				b,
				label: t('{{spell}} (defense)', { spell: label(b) })
			}))
		].filter(target => target.b.kind !== 'registered');
	}, [doc, t]);

	const setSpellEffect = useCallback(
		(list: 'attacks' | 'defenses', index: number, kind: 'effect' | 'missile', entry: EffectEntry) => {
			if (!doc) return;
			const field = kind === 'effect' ? 'areaEffect' : 'shootEffect';
			const blocks = doc[list].map((b, i) =>
				i === index ? { ...b, effects: { ...b.effects, [field]: entry.name } } : b
			);
			editDoc({ ...doc, [list]: blocks });
			const spell = doc[list][index];
			// `kind` is a wire value, so it selects between two whole messages rather
			// than being interpolated as an English word.
			showToast(
				'ok',
				kind === 'effect'
					? t('Effect of {{spell}} set to {{effect}}', {
							spell: spell.name ?? spell.script ?? t('spell'),
							effect: t(entry.label)
						})
					: t('Missile of {{spell}} set to {{effect}}', {
							spell: spell.name ?? spell.script ?? t('spell'),
							effect: t(entry.label)
						})
			);
		},
		[doc, editDoc, showToast, t]
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

	// The create wizard borrows the browsers rather than carrying its own grids:
	// asked for an outfit or a corpse it steps aside, the browser it sends you to
	// is the same one the sidebar opens — every filter, every search, the real
	// animation — and the cell you click comes back as the answer. `wizardPick`
	// is what that round trip is made of: which answer is outstanding, and which
	// view to put back when it arrives.
	const [wizardPick, setWizardPick] = useState<{ kind: WizardPickKind; from: View } | null>(null);
	const [wizardPicked, setWizardPicked] = useState<{ kind: WizardPickKind; id: number } | null>(null);

	const startWizardPick = useCallback(
		(kind: WizardPickKind) => {
			setWizardPick({ kind, from: view });
			if (kind === 'corpse') {
				setItemsInitialFilters(['corpses']);
				setView('items');
			} else {
				setView(PICK_VIEW[kind]);
			}
		},
		[view]
	);

	const finishWizardPick = useCallback(
		(id: number) => {
			setWizardPick(pick => {
				if (!pick) return null;
				setWizardPicked({ kind: pick.kind, id });
				setView(pick.from);
				return null;
			});
		},
		[]
	);

	const cancelWizardPick = useCallback(() => {
		setWizardPick(pick => {
			if (pick) setView(pick.from);
			return null;
		});
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
			showToast(
				'ok',
				t('Outfit (typeex) of {{monster}} set to {{item}}', {
					monster: doc.name,
					item: item.name || `#${item.serverId}`
				})
			);
		},
		[doc, editDoc, showToast, t]
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
			showToast('ok', t('Added {{count}} item to Loot', { count: picked.length }));
		},
		[showToast, t]
	);

	const clearTray = useCallback(async () => {
		const ok = await confirm(t('Clear {{count}} item from Loot?', { count: lootTray.length }), {
			title: t('Clear loot')
		});
		if (ok) setLootTray([]);
	}, [lootTray.length, t]);

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
				t('Added {{count}} loot entry to {{monster}}', { count: picked.length, monster: doc.name })
			);
		},
		[doc, editDoc, showToast, t]
	);

	// The same mutation as dropping the item on the Look section's corpse field.
	const setAsCorpse = useCallback(
		(item: ItemInfo) => {
			if (!doc) return;
			editDoc({ ...doc, look: { ...doc.look, corpse: item.serverId } });
			showToast(
				'ok',
				t('Corpse of {{monster}} set to {{item}}', {
					monster: doc.name,
					item: item.name || `#${item.serverId}`
				})
			);
		},
		[doc, editDoc, showToast, t]
	);

	/** Saves the tray under a name, replacing a preset of the same name. */
	const savePreset = useCallback(
		(name: string) => {
			const trimmed = name.trim();
			if (!trimmed || lootTray.length === 0) return;
			const next = upsertPreset(presets, { name: trimmed, ids: lootTray.map(i => i.serverId) });
			setPresets(next);
			savePresets(next);
			setPresetName(null);
			showToast(
				'ok',
				t('Saved “{{name}}” — {{items}}', {
					name: trimmed,
					items: t('{{count}} item', { count: lootTray.length })
				})
			);
		},
		[lootTray, presets, showToast, t]
	);

	/** A preset back into the tray. Ids are resolved against the item index now,
	 *  not when it was saved, so an id the workspace no longer knows is dropped
	 *  rather than carried as a phantom — MONx never invents item ids (§24). */
	const loadPresetToTray = useCallback(
		(preset: LootPreset) => {
			const byId = new Map(itemList.map(i => [i.serverId, i]));
			const found = preset.ids.map(id => byId.get(id)).filter((i): i is ItemInfo => !!i);
			setLootTray(found);
			const missing = preset.ids.length - found.length;
			showToast(
				'ok',
				missing > 0
					? t('Loaded “{{name}}” — {{count}} item, {{missing}} not in this workspace', {
							name: preset.name,
							count: found.length,
							missing
						})
					: t('Loaded “{{name}}” — {{count}} item', { name: preset.name, count: found.length })
			);
		},
		[itemList, showToast, t]
	);

	const deletePreset = useCallback(
		(name: string) => {
			const next = presets.filter(p => p.name !== name);
			setPresets(next);
			savePresets(next);
		},
		[presets]
	);

	const addTrayToMonster = useCallback(() => {
		if (!doc || lootTray.length === 0) return;
		editDoc({
			...doc,
			loot: [...doc.loot, ...lootTray.map(i => newLootEntry({ serverId: i.serverId, name: i.name }))]
		});
		showToast(
			'ok',
			t('Added {{count}} loot entry to {{monster}}', { count: lootTray.length, monster: doc.name })
		);
	}, [doc, lootTray, editDoc, showToast, t]);

	// ---- Commands ----
	// One table of everything the shell can do. The menus are built from it and
	// the keyboard dispatches through it, so a command cannot exist in one place
	// and be missing from the other, and the manager lists them all by
	// construction.
	const commands: Command[] = [
		{ id: 'save-monster', label: t('Save monster'), group: t('Monsters'), enabled: !!doc && !saving, run: () => void save() },
		{
			id: 'save-all',
			label: t('Save all'),
			group: t('Monsters'),
			enabled: dirtyFiles.size > 0 && !saving,
			run: () => void saveAll()
		},
		{ id: 'quick-open', label: t('Go to monster…'), group: t('Monsters'), run: () => setQuickOpen(true) },
		{ id: 'new-monster', label: t('New monster…'), group: t('Monsters'), run: () => listActions.current?.newMonster() },
		{
			id: 'duplicate-monster',
			label: t('Duplicate monster'),
			group: t('Monsters'),
			enabled: !!selected,
			run: () => listActions.current?.duplicateSelected()
		},
		{
			id: 'rename-monster',
			label: t('Rename monster…'),
			group: t('Monsters'),
			enabled: !!selected,
			run: () => listActions.current?.renameSelected()
		},
		{
			id: 'delete-monster',
			label: t('Delete monster…'),
			group: t('Monsters'),
			enabled: !!selected,
			run: () => listActions.current?.deleteSelected()
		},
		{
			id: 'reveal-monster',
			label: t('Show monster in folder'),
			group: t('Monsters'),
			enabled: !!selected,
			run: () => selected && reveal(selected)
		},
		{ id: 'close-workspace', label: t('Close workspace'), group: t('Monsters'), run: onCloseWorkspace },

		{
			id: 'undo',
			label: t('Undo'),
			group: t('Edit'),
			enabled: undoRef.current.length > 0,
			notWhileTyping: true,
			run: undoEdit
		},
		{
			id: 'redo',
			label: t('Redo'),
			group: t('Edit'),
			enabled: redoRef.current.length > 0,
			notWhileTyping: true,
			run: redoEdit
		},
		{
			id: 'fix-all-lints',
			label: t('Fix every fixable lint'),
			group: t('Edit'),
			enabled: !!doc,
			run: fixAllLints
		},
		{
			id: 'add-tray-loot',
			label: t('Add the loot tray to this monster'),
			group: t('Edit'),
			enabled: !!doc && lootTray.length > 0,
			run: addTrayToMonster
		},

		{ id: 'view-monsters', label: t('Go to Monsters'), group: t('View'), run: () => setView('monsters') },
		{ id: 'view-items', label: t('Go to Items'), group: t('View'), run: () => setView('items') },
		{ id: 'view-outfits', label: t('Go to Outfits'), group: t('View'), run: () => setView('outfits') },
		{ id: 'view-effects', label: t('Go to Effects'), group: t('View'), run: () => setView('effects') },
		{ id: 'view-missiles', label: t('Go to Missiles'), group: t('View'), run: () => setView('missiles') },
		{
			id: 'focus-search',
			label: t('Search monsters'),
			group: t('View'),
			run: () => {
				setView('monsters');
				listActions.current?.focusSearch();
			}
		},
		{ id: 'toggle-lints', label: t('Toggle the lint drawer'), group: t('View'), run: () => setLintsOpen(o => !o) },
		{
			id: 'next-monster',
			label: t('Next monster in the list'),
			group: t('View'),
			run: () => listActions.current?.step(1)
		},
		{
			id: 'prev-monster',
			label: t('Previous monster in the list'),
			group: t('View'),
			run: () => listActions.current?.step(-1)
		},
		{ id: 'next-tab', label: t('Next editor tab'), group: t('View'), enabled: tabs.length > 1, run: () => stepTab(1) },
		{ id: 'prev-tab', label: t('Previous editor tab'), group: t('View'), enabled: tabs.length > 1, run: () => stepTab(-1) },
		{
			id: 'close-tab',
			label: t('Close editor tab'),
			group: t('View'),
			enabled: !!selected,
			run: () => selected && void closeTab(selected)
		},

		...SECTION_IDS.map(id => ({
			id: `goto-${id}`,
			label: t('Jump to {{tab}}', { tab: t(SECTION_LABEL[id]) }),
			group: t('Editor tabs'),
			enabled: !!doc && prefs.visibleSections.includes(id),
			run: () => {
				setView('monsters');
				setJumpRequest(id);
			}
		})),

		{
			id: 'pin-ambiguous',
			label: t('Pin ambiguous loot ids…'),
			group: t('Tools'),
			enabled: !dirty,
			run: () => setTool('ambiguous')
		},
		{ id: 'pin-all', label: t('Pin all loot ids…'), group: t('Tools'), enabled: !dirty, run: () => setTool('all') },
		{
			id: 'scale-loot',
			label: t('Scale loot chances…'),
			group: t('Tools'),
			enabled: !dirty,
			run: () => setScaling({ itemId: null })
		},
		{
			id: 'batch-edit',
			label: t('Batch edit fields…'),
			group: t('Tools'),
			enabled: !dirty,
			run: () => setBatchOpen(true)
		},
		{
			id: 'compare-monsters',
			label: t('Compare monsters…'),
			group: t('Tools'),
			enabled: monsters.length > 1,
			run: () => setCompareOpen(true)
		},
		{
			id: 'balance-overview',
			label: t('Balance overview…'),
			group: t('Tools'),
			enabled: monsters.length > 0,
			run: () => setBalanceOpen(true)
		},
		{ id: 'export-lints', label: t('Export lint report…'), group: t('Tools'), run: () => void exportLints() },
		{ id: 'export-patch-notes', label: t('Export patch notes…'), group: t('Tools'), run: () => setPatchOpen(true) },
		{
			id: 'set-patch-cutoff',
			label: t('Set patch notes cut-off point'),
			group: t('Tools'),
			run: () => void setPatchCutoff()
		},

		...LINT_SEVERITIES.map(s => ({
			id: `toggle-severity-${s}`,
			label: t('Show {{severity}} lints', { severity: t(LINT_SEVERITY_LABEL[s]) }),
			group: t('Linter'),
			run: () => toggleLintSeverity(s)
		})),

		{ id: 'open-prefs', label: t('Editor tabs…'), group: t('Preferences'), run: () => setPrefsOpen(true) },
		{ id: 'open-hotkeys', label: t('Hotkeys…'), group: t('Preferences'), run: () => setHotkeysOpen(true) },
		{
			id: 'open-custom-effects',
			label: t('Custom effects…'),
			group: t('Preferences'),
			run: () => setCustomFxOpen(true)
		},
		{
			id: 'show-all-tabs',
			label: t('Show every editor tab'),
			group: t('Preferences'),
			enabled: prefs.visibleSections.length !== SECTION_IDS.length,
			run: () => updatePrefs({ ...prefs, visibleSections: [...SECTION_IDS] })
		}
	];

	useHotkeys(commands, bindings);

	/** A command as a menu row: one label, one binding, one enabled state. */
	const item = (id: string, extra?: Partial<MenuItem>): MenuItem => {
		const c = commands.find(x => x.id === id);
		return {
			label: c?.label ?? id,
			shortcut: shortcutFor(bindings, id),
			disabled: c?.enabled === false,
			onSelect: c?.run ?? (() => undefined),
			...extra
		};
	};

	const menus: Menu[] = [
		{
			label: t('File'),
			items: [
				item('save-monster'),
				item('save-all'),
				item('quick-open', { separated: true }),
				item('new-monster'),
				item('duplicate-monster'),
				item('rename-monster'),
				item('delete-monster'),
				item('reveal-monster'),
				item('close-workspace', { separated: true })
			]
		},
		{
			label: t('Edit'),
			items: [item('undo'), item('redo'), item('fix-all-lints', { separated: true }), item('add-tray-loot')]
		},
		{
			label: t('Tools'),
			items: [
				item('pin-ambiguous', { label: blocked(t('Pin ambiguous loot ids…')) }),
				item('pin-all', { label: blocked(t('Pin all loot ids…')) }),
				item('scale-loot', { label: blocked(t('Scale loot chances…')) }),
				item('batch-edit', { label: blocked(t('Batch edit fields…')) }),
				item('compare-monsters', { separated: true }),
				item('balance-overview'),
				item('export-lints'),
				item('export-patch-notes'),
				item('set-patch-cutoff', { label: patchCutoffLabel })
			]
		},
		{
			// Severities first (what the drawer shows at all), then the ignore list,
			// which is where a right-clicked lint ends up and the only place it can be
			// taken back.
			label: t('Linter'),
			items: [
				...LINT_SEVERITIES.map(s =>
					item(`toggle-severity-${s}`, {
						label: `${lintPrefs.severities.includes(s) ? '✓' : '　'} ${t('Show {{severity}}', {
							severity: t(LINT_SEVERITY_LABEL[s])
						})}`
					})
				),
				...(lintPrefs.muted.length === 0
					? [{ label: t('Nothing ignored'), separated: true, disabled: true, onSelect: () => undefined }]
					: [
							{
								label: t('Ignored ({{count}}) — pick one to restore', {
									count: lintPrefs.muted.length
								}),
								separated: true,
								disabled: true,
								onSelect: () => undefined
							},
							...lintPrefs.muted.map(code => ({
								label: `✕ ${code}`,
								onSelect: () =>
									updateLintPrefs({ ...lintPrefs, muted: lintPrefs.muted.filter(c => c !== code) })
							})),
							{
								label: t('Stop ignoring everything'),
								separated: true,
								onSelect: () => updateLintPrefs({ ...lintPrefs, muted: [] })
							}
						])
			]
		},
		{
			label: t('Preferences'),
			items: [
				item('open-prefs'),
				item('open-hotkeys'),
				item('open-custom-effects'),
				item('show-all-tabs', { separated: true })
			]
		}
	];

	// Dismiss the context menus on any outside press or Escape, as MonsterList does.
	useEffect(() => {
		if (!itemMenu && !thingMenu && !tabMenu && !outfitMenu) return;
		const onDown = () => {
			setItemMenu(null);
			setThingMenu(null);
			setTabMenu(null);
			setOutfitMenu(null);
		};
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				setItemMenu(null);
				setThingMenu(null);
				setTabMenu(null);
				setOutfitMenu(null);
			}
		};
		window.addEventListener('mousedown', onDown);
		window.addEventListener('keydown', onKey);
		return () => {
			window.removeEventListener('mousedown', onDown);
			window.removeEventListener('keydown', onKey);
		};
	}, [itemMenu, thingMenu, tabMenu, outfitMenu]);

	const allLints = useMemo(
		() => [...visibleMonsterLints, ...visibleWorkspaceLints],
		[visibleMonsterLints, visibleWorkspaceLints]
	);

	// The provider wraps the whole shell, not just the editor: the preview panel
	// is a sibling of MonsterEditor, and without the lookup in scope it fell back
	// to assuming three outfit frames.
	return (
		<ThingAnimProvider value={thingAnim}>
			<CustomEffectsProvider value={engineFx}>
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
									// Navigating away from a borrowed browser ends the loan. Without
									// this the wizard stays hidden with nothing left that reopens it.
									setWizardPick(null);
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
						actionsRef={listActions}
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
						onNewMonster={() => setWizardOpen(true)}
						lookOverrides={listLooks}
					/>
				</aside>

				<main className="ss-main">
					{/* The wizard is still open behind this, holding everything answered
					    so far — the browser is on loan, and this says so. */}
					{wizardPick && (
						<div className="mx-pickbar">
							<span>
								{t(PICK_PROMPT[wizardPick.kind])}
							</span>
							<button className="ss-btn ss-btn-ghost ss-ed-mini" onClick={cancelWizardPick}>
								{t('Cancel')}
							</button>
						</div>
					)}
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
										title={f === previewTab ? t('{{file}} — preview; double-click to keep open', { file: f }) : f}
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
											aria-label={t('Close {{file}}', { file: f })}
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
								{t('Close')}
							</button>
							<button
								className="ss-menu-item"
								disabled={tabs.length < 2}
								onClick={() => {
									setTabMenu(null);
									void closeTabs(tabs.filter(f => f !== tabMenu.file));
								}}
							>
								{t('Close all except this one')}
							</button>
							<button
								className="ss-menu-item"
								disabled={tabs.indexOf(tabMenu.file) === 0}
								onClick={() => {
									setTabMenu(null);
									void closeTabs(tabs.slice(0, tabs.indexOf(tabMenu.file)));
								}}
							>
								{t('Close all to the left')}
							</button>
							<button
								className="ss-menu-item"
								disabled={tabs.indexOf(tabMenu.file) === tabs.length - 1}
								onClick={() => {
									setTabMenu(null);
									void closeTabs(tabs.slice(tabs.indexOf(tabMenu.file) + 1));
								}}
							>
								{t('Close all to the right')}
							</button>
							<div className="ss-menu-sep" />
							<button
								className="ss-menu-item"
								onClick={() => {
									setTabMenu(null);
									void closeTabs([...tabs]);
								}}
							>
								{t('Close all')}
							</button>
						</div>
					)}
					{view === 'monsters' ? (
						doc ? (
							// Deliberately *not* keyed on doc.file. A key here threw the whole
							// editor away on every monster switch — every DOM node and every
							// sprite image rebuilt from nothing, which is what made the column
							// flicker. Reconciling in place keeps the old sprite on screen until
							// the new one has decoded; the handful of section-local things that
							// really are per-monster re-seed through useMonsterState instead.
							<MonsterEditor
								doc={doc}
								onChange={editDoc}
								lints={visibleMonsterLints}
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
								onToast={showToast}
							/>
						) : (
							<div className="mx-empty">{t('Select a monster')}</div>
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
								cellMark={itemIsFavourite}
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
								onContextMenu={wizardPick ? undefined : itemContextMenu}
								onPick={i => (wizardPick?.kind === 'corpse' ? finishWizardPick(i.serverId) : addToTray([i]))}
								searchPlaceholder={t('Search server id or name')}
							/>
							<div className="ss-loot-tray">
								<div className="ss-loot-tray-head">
									{t('Loot')}
									{lootTray.length > 0 && <span className="ss-nav-meta">{lootTray.length}</span>}
								</div>
								<div className="ss-loot-tray-items">
									{lootTray.length === 0 ? (
										<span className="ss-loot-tray-empty">
											{t('Right-click selected items above to add them here.')}
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
										{doc ? t('Add loot to {{monster}}', { monster: doc.name }) : t('Add loot')}
									</button>
									<button
										className="ss-btn"
										disabled={lootTray.length === 0}
										onClick={() => void clearTray()}
										title={t('Clear the Loot section')}
									>
										<Trash2 size={14} />
										{t('Clear')}
									</button>
									{/* Presets sit beside the tray because they are the tray:
									    saving one is naming what is already collected. */}
									<button
										className="ss-btn"
										disabled={lootTray.length === 0}
										title={t('Save this tray under a name')}
										onClick={() => setPresetName(`Preset ${presets.length + 1}`)}
									>
										<Bookmark size={14} />
										{t('Save preset')}
									</button>
									<select
										className="ss-ed-input mx-preset-pick"
										value=""
										disabled={presets.length === 0}
										title={presets.length === 0 ? t('No presets saved yet') : t('Load a preset into the tray')}
										onChange={e => {
											const p = presets.find(x => x.name === e.target.value);
											if (p) loadPresetToTray(p);
										}}
									>
										<option value="">
											{presets.length === 0 ? t('No presets') : t('Presets ({{count}})', { count: presets.length })}
										</option>
										{presets.map(p => (
											<option key={p.name} value={p.name}>
												{p.name} · {p.ids.length}
											</option>
										))}
									</select>
									{presets.length > 0 && (
										<button
											className="ss-btn ss-btn-ghost"
											title={t('Delete a preset')}
											onClick={() => setPresetManage(true)}
										>
											<Trash2 size={14} />
										</button>
									)}
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
										{t('Add {{count}} item to Loot', { count: itemMenu.items.length })}
									</button>
									<button
										className="ss-menu-item"
										onClick={() => {
											setItemMenu(null);
											void openUsage(itemMenu.item);
										}}
									>
										<Users size={14} />
										{t('Used by…')}
									</button>
									<button
										className="ss-menu-item"
										onClick={() => {
											setItemMenu(null);
											toggleFavourites(itemMenu.items);
										}}
									>
										<Star size={14} />
										{itemMenu.items.every(i => favourites.has(i.serverId))
											? t('Remove {{count}} item from favourites', { count: itemMenu.items.length })
											: t('Add {{count}} item to favourites', { count: itemMenu.items.length })}
									</button>
									<button
										className="ss-menu-item"
										// Same gate as the Tools menu: the scaler rewrites files from
										// what is on disk, so an unsaved buffer would be overwritten.
										disabled={dirty}
										title={dirty ? t('Save the open monster first') : undefined}
										onClick={() => {
											setItemMenu(null);
											setScaling({ itemId: itemMenu.item.serverId });
										}}
									>
										<Percent size={14} />
										{t('Scale drop chance…')}
									</button>
									<button
										className="ss-menu-item"
										onClick={() => {
											setItemMenu(null);
											void navigator.clipboard.writeText(String(itemMenu.item.serverId));
											showToast('ok', t('Copied {{value}}', { value: itemMenu.item.serverId }));
										}}
									>
										{t('Copy id {{id}}', { id: itemMenu.item.serverId })}
									</button>
									<button
										className="ss-menu-item"
										disabled={!itemMenu.item.name}
										onClick={() => {
											setItemMenu(null);
											void navigator.clipboard.writeText(itemMenu.item.name);
											showToast('ok', t('Copied “{{value}}”', { value: itemMenu.item.name }));
										}}
									>
										{t('Copy name')}
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
												{t('Add {{count}} item to loot for {{monster}}', {
													count: itemMenu.items.length,
													monster: doc.name
												})}
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
												{t('Set as corpse for {{monster}}', { monster: doc.name })}
											</button>
											<button
												className="ss-menu-item"
												onClick={() => {
													setItemMenu(null);
													setAsTypeex(itemMenu.item);
												}}
											>
												<PersonStanding size={14} />
												{t('Set as outfit (typeex) for {{monster}}', { monster: doc.name })}
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
							// Outfits loop their walk cycle, which sits after the idle run in
							// the strip — usually one standing frame, but eight for the outfits
							// that idle on their own. Skipping exactly the idle run keeps a
							// fire elemental burning (it is all idle, so all of it plays) and
							// stops a two-group outfit playing half an idle before its walk.
							cellFrames={t => (view === 'outfits' && walkCells(t) > 0 ? walkCells(t) : t.frames)}
							cellUrl={(t, frame) =>
								thingUrlFor(info.sprPath, info.datPath, THING_CAT[view as ThingView], t.id, info.transparent, {
									frame: view === 'outfits' && walkCells(t) > 0 ? frame + (t.idleFrames ?? 1) : frame
								})
							}
							searchId={t => t.id}
							searchText={t => t.name ?? ''}
							frameInterval={thingIntervals[view as ThingView]}
							cellInterval={t => cellIntervalFor(view as ThingView, t)}
							filters={view === 'outfits' ? outfitFilters : undefined}
							selectionMode="single"
							view={view}
							onPick={wizardPick && view === PICK_VIEW[wizardPick.kind] ? t => finishWizardPick(t.id) : undefined}
							draggable={view === 'outfits'}
							dragPayload={t => (view === 'outfits' ? { kind: 'outfit', type: t.id } : null)}
							onContextMenu={
								view === 'outfits'
									? (t, e) => setOutfitMenu({ x: e.clientX, y: e.clientY, thing: t })
									: view === 'effects' || view === 'missiles'
										? (t, e) => thingContextMenu(t, e, view === 'effects' ? 'effect' : 'missile')
										: undefined
							}
							searchPlaceholder={t('Search client id or name')}
						/>
					)}
					{outfitMenu && (
						<div
							className="ss-context-menu"
							style={{ left: outfitMenu.x, top: outfitMenu.y }}
							onMouseDown={e => e.stopPropagation()}
						>
							{doc && (
								<button
									className="ss-menu-item"
									onClick={() => {
										setOutfitMenu(null);
										pickOutfit(outfitMenu.thing);
									}}
								>
									<PersonStanding size={14} />
									{t('Set as outfit for {{monster}}', { monster: doc.name })}
								</button>
							)}
							<button
								className="ss-menu-item"
								onClick={() => {
									setOutfitMenu(null);
									void navigator.clipboard.writeText(String(outfitMenu.thing.id));
									showToast('ok', t('Copied {{value}}', { value: outfitMenu.thing.id }));
								}}
							>
								{t('Copy id {{id}}', { id: outfitMenu.thing.id })}
							</button>
						</div>
					)}
					{thingMenu && (
						<div
							className="ss-context-menu ss-spell-menu"
							style={{ left: thingMenu.x, top: thingMenu.y }}
							onMouseDown={e => e.stopPropagation()}
						>
							{/* `kind` is a wire value, so it picks between two whole messages
							    rather than being dropped into one as an English noun. */}
							<div className="ss-menu-head">
								{thingMenu.kind === 'effect'
									? t('Set {{thing}} as the effect for…', {
											thing: thingMenu.entry ? t(thingMenu.entry.label) : thingMenu.label
										})
									: t('Set {{thing}} as the missile for…', {
											thing: thingMenu.entry ? t(thingMenu.entry.label) : thingMenu.label
										})}
							</div>
							{!thingMenu.entry ? (
								<div className="ss-menu-note">
									{thingMenu.kind === 'effect'
										? t('This effect has no XML name — it cannot be used from a monster file.')
										: t('This missile has no XML name — it cannot be used from a monster file.')}
								</div>
							) : !doc ? (
								<div className="ss-menu-note">{t('No monster open.')}</div>
							) : spellTargets.length === 0 ? (
								<div className="ss-menu-note">
									{t('{{monster}} has no spells that take effects.', { monster: doc.name })}
								</div>
							) : (
								spellTargets.map(target => (
									<button
										key={`${target.list}-${target.i}`}
										className="ss-menu-item"
										onClick={() => {
											setThingMenu(null);
											setSpellEffect(target.list, target.i, thingMenu.kind, thingMenu.entry!);
										}}
									>
										{target.label}
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
						lintCount={visibleMonsterLints.length}
						enhancedAnimations={info.enhancedAnimations}
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
					{saving ? t('Saving…') : activeDirty ? `${t('Save')} •` : t('Save')}
				</button>
			</div>

			{usageDialog && (
				<div className="ss-backdrop" onMouseDown={() => setUsageDialog(null)}>
					<div className="ss-modal ss-usage-modal" onMouseDown={e => e.stopPropagation()}>
						<div className="ss-modal-title">
							<img src={itemUrl(usageDialog.item.serverId, 32)} width={32} height={32} alt="" />
							{t('Used by — {{item}}', {
								item: usageDialog.item.name || `#${usageDialog.item.serverId}`
							})}
						</div>
						{!usageDialog.usage ? (
							<div className="ss-modal-desc">{t('Scanning the corpus…')}</div>
						) : usageDialog.usage.loot.length + usageDialog.usage.corpse.length + usageDialog.usage.typeex.length === 0 ? (
							<div className="ss-modal-desc">{t('No monster references this item.')}</div>
						) : (
							// The English title doubles as the React key; only the display
							// goes through t().
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
												{t(title)} · {refs.length}
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
								{t('Close')}
							</button>
						</div>
					</div>
				</div>
			)}

			{presetName !== null && (
				<div className="ss-backdrop" onMouseDown={() => setPresetName(null)}>
					<div className="ss-modal" onMouseDown={e => e.stopPropagation()}>
						<div className="ss-modal-title">{t('Save loot preset')}</div>
						<div className="ss-modal-desc">
							{t('{{count}} item in the tray.', { count: lootTray.length })}{' '}
							{t('An existing name is overwritten.')}
						</div>
						<div className="ss-field-row">
							<label className="ss-field-label">{t('Name')}</label>
							<input
								className="ss-field"
								autoFocus
								value={presetName}
								spellCheck={false}
								onChange={e => setPresetName(e.target.value)}
								onKeyDown={e => {
									if (e.key === 'Enter') savePreset(presetName);
									if (e.key === 'Escape') setPresetName(null);
								}}
							/>
						</div>
						<div className="ss-modal-buttons">
							<button className="ss-btn ss-btn-ghost" onClick={() => setPresetName(null)}>
								{t('Cancel')}
							</button>
							<div className="ss-modal-buttons-spacer" />
							<button
								className="ss-btn ss-btn-primary"
								disabled={!presetName.trim()}
								onClick={() => savePreset(presetName)}
							>
								{t('Save')}
							</button>
						</div>
					</div>
				</div>
			)}

			{presetManage && (
				<div className="ss-backdrop" onMouseDown={() => setPresetManage(false)}>
					<div className="ss-modal mx-pin-modal" onMouseDown={e => e.stopPropagation()}>
						<div className="ss-modal-title">{t('Loot presets')}</div>
						<div className="mx-pin-list">
							{presets.map(p => (
								<div className="mx-preset-row" key={p.name}>
									<span className="mx-preset-name">{p.name}</span>
									<span className="ss-ed-field-note">
										{t('{{count}} item', { count: p.ids.length })}
									</span>
									<button
										className="ss-btn ss-btn-ghost ss-ed-mini"
										title={t('Load into the tray')}
										onClick={() => {
											loadPresetToTray(p);
											setPresetManage(false);
										}}
									>
										{t('Load')}
									</button>
									<button
										className="ss-btn ss-btn-ghost ss-ed-mini"
										title={t('Delete “{{name}}”', { name: p.name })}
										onClick={() => deletePreset(p.name)}
									>
										<Trash2 size={13} />
									</button>
								</div>
							))}
							{presets.length === 0 && <div className="ss-ed-empty">{t('No presets left.')}</div>}
						</div>
						<div className="ss-modal-buttons">
							<div className="ss-modal-buttons-spacer" />
							<button className="ss-btn ss-btn-primary" onClick={() => setPresetManage(false)}>
								{t('Done')}
							</button>
						</div>
					</div>
				</div>
			)}

			{balanceOpen && (
				<BalanceDialog
					monsters={monsters}
					onOpen={file => {
						setBalanceOpen(false);
						setView('monsters');
						setSelected(file);
					}}
					onClose={() => setBalanceOpen(false)}
				/>
			)}

			{wizardOpen && (
				/* The wizard's spell step picks effects by sprite, and the grid that
				   draws them reads its client through this context — the editor's own
				   provider is inside MonsterEditor, which is not mounted here. */
				<PreviewProvider value={previewUrl}>
				<CreateWizard
					hidden={wizardPick !== null}
					onBrowse={startWizardPick}
					picked={wizardPicked}
					onPickUsed={() => setWizardPicked(null)}
					monsters={monsters}
					groups={groups}
					engine={engineInfo(info.engine)}
					outfitIds={things.outfit.map(o => o.id)}
					itemIndex={tauriItemIndex}
					spellNames={spells}
					onCreated={file => {
						setWizardOpen(false);
						setView('monsters');
						refreshMonsters(file);
					}}
					onClose={() => setWizardOpen(false)}
					showToast={showToast}
				/>
				</PreviewProvider>
			)}

			{conflicts.length > 0 && (
				<ExternalChangesDialog
					files={conflicts}
					onResolve={resolveConflict}
					onClose={() => setConflicts([])}
				/>
			)}

			{compareOpen && (
				<CompareDialog
					monsters={monsters}
					initialFile={selected}
					onClose={() => setCompareOpen(false)}
					onError={m => showToast('error', m)}
				/>
			)}

			{quickOpen && (
				<QuickOpenDialog
					monsters={monsters}
					dirtyFiles={dirtyFiles}
					onClose={() => setQuickOpen(false)}
					onPick={file => {
						setSelected(file);
						setView('monsters');
						// Opened deliberately by name, so the tab is pinned rather than
						// left as a preview the next selection would replace.
						pinTab(file);
					}}
				/>
			)}

			{hotkeysOpen && (
				<HotkeysDialog
					commands={commands}
					bindings={bindings}
					onChange={next => {
						setBindings(next);
						saveBindings(next);
					}}
					onClose={() => setHotkeysOpen(false)}
				/>
			)}

			{patchOpen && (
				<PatchNotesDialog
					label={label}
					monstersPath={info.paths.monsters}
					dirty={dirty}
					onClose={() => setPatchOpen(false)}
					onToast={showToast}
				/>
			)}

			{batchOpen && (
				<BatchEditDialog
					species={speciesList}
					onClose={() => setBatchOpen(false)}
					onError={m => showToast('error', m)}
					onApplied={report => {
						onMonstersChanged(null);
						lintWorkspace().then(setWorkspaceLints).catch(() => {});
						setReloadKey(k => k + 1);
						if (report.failed.length > 0) {
							showToast('error', partialWrite(t, report.files, report.failed));
						} else {
							showToast('ok', t('Changed {{count}} monster', { count: report.changed }));
						}
					}}
				/>
			)}

			{scaling && (
				<ScaleLootDialog
					initialItemId={scaling.itemId}
					onClose={() => setScaling(null)}
					onError={m => showToast('error', m)}
					onApplied={report => {
						onMonstersChanged(null);
						lintWorkspace().then(setWorkspaceLints).catch(() => {});
						setReloadKey(k => k + 1);
						showToast(
							report.failed.length > 0 ? 'error' : 'ok',
							report.failed.length > 0
								? partialWrite(t, report.files, report.failed)
								: t('Scaled {{count}} loot chance across {{files}}', {
										count: report.entries,
										files: t('{{count}} file', { count: report.files })
									})
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
						showToast(
							report.failed.length > 0 ? 'error' : 'ok',
							report.failed.length > 0
								? partialWrite(t, report.files, report.failed)
								: t('Pinned {{count}} loot entry across {{files}}', {
										count: report.pinned.length + report.named.length,
										files: t('{{count}} file', { count: report.files })
									})
						);
					}}
				/>
			)}

			{prefsOpen && (
				<PreferencesDialog prefs={prefs} onChange={updatePrefs} onClose={() => setPrefsOpen(false)} />
			)}

			{customFxOpen && (
				<CustomEffectsDialog
					engine={info.engine}
					effects={engineFx}
					onChange={updateCustomFx}
					onClose={() => setCustomFxOpen(false)}
				/>
			)}

			<LintPanel
				open={lintsOpen}
				onClose={() => setLintsOpen(false)}
				monsterLints={visibleMonsterLints}
				workspaceLints={visibleWorkspaceLints}
				onFix={lint => void fixLint(lint)}
				onFixAll={fixAllLints}
				onFixAllWorkspace={() => void fixAllWorkspaceLints()}
				file={doc?.file ?? null}
				onJump={lint => {
					if (lint.file && lint.file !== selected) setSelected(lint.file);
					setView('monsters');
				}}
				severities={lintPrefs.severities}
				onToggleSeverity={toggleLintSeverity}
				onIgnoreCode={ignoreLintCode}
			/>
			</CustomEffectsProvider>
		</ThingAnimProvider>
	);
}
