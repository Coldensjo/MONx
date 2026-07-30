import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { tauriItemIndex, type ItemIndex, type Lint, type MonsterDoc, type SpellName } from './monster';
import { loadSetting, saveSetting } from './settings';
import { PreviewProvider, ThingAnimProvider, type PreviewUrl, type ThingAnimLookup } from './fields/preview';
import { SECTION_ENGINE_FLAG, SECTION_IDS, SECTION_LABEL, type SectionId } from './sections/section';
import { DEFAULT_PREFS, landingSection, visibleSectionIds, type Prefs } from './prefs';
import {
	applyBlock,
	BLOCK_LABEL,
	BlockContext,
	loadBlock,
	readBlock,
	saveBlock,
	type Block,
	type BlockControls
} from './blocks';
import { Identity } from './sections/Identity';
import { LookSection } from './sections/LookSection';
import { Combat } from './sections/Combat';
import { Spells } from './sections/Spells';
import { Resistances } from './sections/Resistances';
import { Loot } from './sections/Loot';
import { Summons } from './sections/Summons';
import { Voices } from './sections/Voices';
import { PacifistEvents } from './sections/PacifistEvents';
import { BestiarySection } from './sections/BestiarySection';
import { TargetStrategySection } from './sections/TargetStrategySection';
import { engineInfo } from './engine';

const STATE_KEY = 'monx.editor';

interface EditorState {
	collapsed: SectionId[];
}

function loadState(): EditorState {
	try {
		const raw = loadSetting(STATE_KEY, null);
		if (!raw) return { collapsed: [] };
		const parsed = JSON.parse(raw) as Partial<EditorState>;
		const valid = (parsed.collapsed ?? []).filter((id): id is SectionId =>
			(SECTION_IDS as readonly string[]).includes(id)
		);
		return { collapsed: valid };
	} catch {
		return { collapsed: [] };
	}
}

export interface MonsterEditorProps {
	doc: MonsterDoc;
	/** Whole-doc immutable updates — the editor never mutates what it is given. */
	onChange: (doc: MonsterDoc) => void;
	lints: Lint[];
	spells: SpellName[];
	readOnly: boolean;
	/** Defaults to the Tauri-backed index; injectable for fixture-only rendering. */
	items?: ItemIndex;
	/** `.lua` files in monster/scripts, for the Identity dropdown. */
	scripts?: string[];
	/** Registered monster names, for summon validation. */
	monsterNames?: string[];
	nextRaceid?: number | null;
	onBrowseOutfits?: () => void;
	/** Opens the Items browser pre-filtered to corpses. */
	onBrowseCorpses?: () => void;
	/** Opens the Items browser unfiltered, for the typeex picker. */
	onBrowseItems?: () => void;
	/** Resolves client things to protocol URLs; without it previews degrade to ids. */
	previewUrl?: PreviewUrl;
	/** Frame counts for animated things; without it the spell stage guesses a loop. */
	thingAnim?: ThingAnimLookup;
	/** Tab visibility and the tab a monster opens on (Preferences). */
	prefs?: Prefs;
	/** A tab the shell wants shown — the preview panel's Loot → Edit button. */
	jumpRequest?: SectionId | null;
	/** Called once the request has been honoured, so the caller can clear it. A
	 *  request left standing would re-fire on every remount and beat the default
	 *  tab the next time a monster is opened. */
	onJumped?: () => void;
	/** Feedback for the block clipboard; silent without it. */
	onToast?: (kind: 'ok' | 'error', message: string) => void;
}

export function MonsterEditor({
	doc,
	onChange,
	lints,
	spells,
	readOnly,
	items = tauriItemIndex,
	scripts = [],
	monsterNames = [],
	nextRaceid = null,
	onBrowseOutfits,
	onBrowseCorpses,
	onBrowseItems,
	previewUrl,
	thingAnim,
	prefs = DEFAULT_PREFS,
	jumpRequest = null,
	onJumped,
	onToast
}: MonsterEditorProps) {
	const [collapsed, setCollapsed] = useState<Set<SectionId>>(() => new Set(loadState().collapsed));
	const [active, setActive] = useState<SectionId>(() => landingSection(prefs) ?? 'identity');
	const scrollRef = useRef<HTMLDivElement>(null);
	const engine = useMemo(() => engineInfo(doc.engine), [doc.engine]);
	// Preference order, then engine reality. A tab the server has never heard of
	// is not shown even if an older preference still lists it.
	const visible = useMemo(
		() => visibleSectionIds(prefs).filter(id => {
			const flag = SECTION_ENGINE_FLAG[id];
			return flag ? engine[flag] : true;
		}),
		[prefs, engine]
	);
	const shown = useCallback((id: SectionId) => visible.includes(id), [visible]);

	useEffect(() => {
		saveSetting(STATE_KEY, JSON.stringify({ collapsed: [...collapsed] } satisfies EditorState));
	}, [collapsed]);

	// Save had a listener of its own here, which fired alongside the shell's and
	// saved twice. It is the `save-monster` command now — bound wherever the user
	// wants it, dispatched by the shell.

	// Lints arrive as a flat list keyed by dot path; every field asks for its own.
	const byPath = useMemo(() => {
		const map = new Map<string, Lint[]>();
		for (const l of lints) {
			if (!l.path) continue;
			const list = map.get(l.path);
			if (list) list.push(l);
			else map.set(l.path, [l]);
		}
		return map;
	}, [lints]);

	const lintAt = useCallback((path: string) => byPath.get(path) ?? [], [byPath]);

	const patch = useCallback(
		(p: Partial<MonsterDoc>) => {
			// unknownAttributes and comments are never in `p` — they are carried
			// through by the spread, which is what keeps round-trip intact.
			onChange({ ...doc, ...p });
		},
		[doc, onChange]
	);

	// ---- Block clipboard ----
	// Held in state so the paste buttons light up the moment something is
	// copied; localStorage is the durable copy, read once on mount.
	const [clipboard, setClipboard] = useState<Block | null>(loadBlock);
	const blocks = useMemo<BlockControls>(
		() => ({
			clipboard,
			readOnly,
			copy: kind => {
				const block = readBlock(doc, kind);
				saveBlock(block);
				setClipboard(block);
				onToast?.('ok', `Copied ${block.count} ${BLOCK_LABEL[kind]} from ${doc.name}`);
			},
			paste: (kind, mode) => {
				if (readOnly || !clipboard || clipboard.kind !== kind) return;
				const p = applyBlock(doc, clipboard, mode);
				if (!p) {
					onToast?.('error', `That ${BLOCK_LABEL[kind]} block could not be read`);
					return;
				}
				patch(p);
				onToast?.(
					'ok',
					`${mode === 'replace' ? 'Replaced' : 'Added'} ${clipboard.count} ${BLOCK_LABEL[kind]} from ${
						clipboard.from
					}`
				);
			}
		}),
		[clipboard, doc, patch, readOnly, onToast]
	);

	const toggle = useCallback((id: SectionId) => {
		setCollapsed(prev => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	}, []);

	const jump = useCallback((id: SectionId, behavior: ScrollBehavior = 'smooth') => {
		setActive(id);
		setCollapsed(prev => {
			if (!prev.has(id)) return prev;
			const next = new Set(prev);
			next.delete(id);
			return next;
		});
		document.getElementById(`ss-ed-${id}`)?.scrollIntoView({ behavior, block: 'start' });
	}, []);

	// Opening a monster lands on the default tab, instantly: this is where the
	// work starts, so animating there would only be a delay. Keyed on the file,
	// so switching tabs or reloading a monster re-lands but editing does not.
	useEffect(() => {
		const id = landingSection(prefs);
		if (!id) return;
		// One frame late, so the sections the new doc renders exist to scroll to.
		const frame = requestAnimationFrame(() => jump(id, 'auto'));
		return () => cancelAnimationFrame(frame);
	}, [doc.file, prefs, jump]);

	// A jump asked for from outside the editor. Declared after the landing effect
	// so that when both fire — clicking Loot → Edit while a browser held the centre
	// column remounts the editor — the request is the one that sticks.
	useEffect(() => {
		if (!jumpRequest) return;
		const frame = requestAnimationFrame(() => {
			if (visible.includes(jumpRequest)) jump(jumpRequest, 'auto');
			onJumped?.();
		});
		return () => cancelAnimationFrame(frame);
	}, [jumpRequest, visible, jump, onJumped]);

	const lintCounts = useMemo(() => {
		let error = 0;
		let warning = 0;
		for (const l of lints) {
			if (l.severity === 'error') error++;
			else if (l.severity === 'warning') warning++;
		}
		return { error, warning };
	}, [lints]);

	const common = {
		doc,
		patch,
		lintAt,
		items,
		spells,
		scripts,
		monsterNames,
		nextRaceid,
		readOnly,
		onBrowseOutfits,
		onBrowseCorpses,
		onBrowseItems
	};

	return (
		<PreviewProvider value={previewUrl ?? null}>
			<ThingAnimProvider value={thingAnim ?? null}>
			<BlockContext.Provider value={blocks}>
			<div className="ss-ed">
				<nav className="ss-ed-bar">
					{visible.map(id => (
						<button
							key={id}
							type="button"
							className={id === active ? 'ss-ed-tab ss-ed-tab-active' : 'ss-ed-tab'}
							onClick={() => jump(id)}
						>
							{SECTION_LABEL[id]}
						</button>
					))}
					{(lintCounts.error > 0 || lintCounts.warning > 0) && (
						<span className="ss-ed-bar-lints">
							{lintCounts.error > 0 && <span className="ss-ed-lint ss-ed-lint-error">{lintCounts.error}</span>}
							{lintCounts.warning > 0 && <span className="ss-ed-lint ss-ed-lint-warning">{lintCounts.warning}</span>}
						</span>
					)}
				</nav>

				<div className="ss-ed-scroll" ref={scrollRef}>
					<div className="ss-ed-column">
						{readOnly && (
							<div className="ss-ed-banner ss-ed-banner-warn ss-ed-readonly">
								<AlertTriangle size={14} />
								Read-only — this file cannot be written back without losing something. Fix the reported problems to
								enable editing.
							</div>
						)}

						{/* A hidden tab renders nothing at all — its data still round-trips,
						    because the document is written whole from the model either way. */}
						{shown('identity') && <Identity {...common} collapsed={collapsed.has('identity')} onToggle={toggle} />}
						{shown('look') && <LookSection {...common} collapsed={collapsed.has('look')} onToggle={toggle} />}
						{shown('bestiary') && (
							<BestiarySection {...common} collapsed={collapsed.has('bestiary')} onToggle={toggle} />
						)}
						{shown('combat') && <Combat {...common} collapsed={collapsed.has('combat')} onToggle={toggle} />}
						{shown('strategy') && (
							<TargetStrategySection {...common} collapsed={collapsed.has('strategy')} onToggle={toggle} />
						)}
						{shown('attacks') && (
							<Spells {...common} which="attacks" collapsed={collapsed.has('attacks')} onToggle={toggle} />
						)}
						{shown('defenses') && (
							<Spells {...common} which="defenses" collapsed={collapsed.has('defenses')} onToggle={toggle} />
						)}
						{shown('resistances') && (
							<Resistances {...common} collapsed={collapsed.has('resistances')} onToggle={toggle} />
						)}
						{shown('loot') && <Loot {...common} collapsed={collapsed.has('loot')} onToggle={toggle} />}
						{shown('summons') && <Summons {...common} collapsed={collapsed.has('summons')} onToggle={toggle} />}
						{shown('voices') && <Voices {...common} collapsed={collapsed.has('voices')} onToggle={toggle} />}
						{shown('events') && (
							<PacifistEvents {...common} collapsed={collapsed.has('events')} onToggle={toggle} />
						)}
					</div>
				</div>
			</div>
			</BlockContext.Provider>
			</ThingAnimProvider>
		</PreviewProvider>
	);
}
