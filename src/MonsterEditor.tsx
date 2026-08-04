import { useTranslation } from 'react-i18next';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { type Lint, type MonsterDoc } from './monster';
import { loadSetting, saveSetting } from './settings';
import { SECTION_ENGINE_FLAG, SECTION_IDS, SECTION_LABEL, type SectionId } from './sections/section';
import { landingSection, visibleSectionIds } from './prefs';
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
import { useWorkspace } from './workspacectx';

const STATE_KEY = 'monx.editor';

/**
 * Where the editor was when it last went off screen.
 *
 * The centre column is one slot: opening the Items browser unmounts the editor
 * and coming back mounts a fresh one, which then lands on the default tab as if
 * the monster had just been opened. It had not — you left to fetch an item and
 * came straight back, and the whole point of the trip was the row you were
 * looking at.
 *
 * One slot, not a map, and matched on the file: the only thing worth restoring
 * is the monster you just left. Opening a *different* monster is a new start and
 * should land on the default tab, which is a setting somebody chose.
 *
 * Module scope rather than state, because the component holding it is the one
 * that unmounts.
 */
let lastScroll: { file: string; top: number } | null = null;

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

/**
 * What the editor is told about the monster in front of it. Everything that is
 * a fact about the *workspace* — the item database, the spell catalogue, the
 * scripts, the browsers, the preview URLs, the preferences — now comes from
 * `useWorkspace()`, which is why this is six props and not nineteen.
 */
export interface MonsterEditorProps {
	doc: MonsterDoc;
	/** Whole-doc immutable updates — the editor never mutates what it is given. */
	onChange: (doc: MonsterDoc) => void;
	lints: Lint[];
	readOnly: boolean;
	/** A tab the shell wants shown — the preview panel's Loot → Edit button. */
	jumpRequest?: SectionId | null;
	/** A `Lint.path` to land on inside that tab, from the lint drawer. The
	 *  section alone is often a screenful; the finding is one row of it. */
	jumpPath?: string | null;
	/** The file that request is about. A workspace finding on another monster
	 *  selects it first, and the selection outruns the read — without this the
	 *  request would be honoured against the document still on screen and
	 *  cleared before the right one arrived. */
	jumpFile?: string | null;
	/** Called once the request has been honoured, so the caller can clear it. A
	 *  request left standing would re-fire on every remount and beat the default
	 *  tab the next time a monster is opened. */
	onJumped?: () => void;
}

export function MonsterEditor({
	doc,
	onChange,
	lints,
	readOnly,
	jumpRequest = null,
	jumpPath = null,
	jumpFile = null,
	onJumped
}: MonsterEditorProps) {
	const { t } = useTranslation();
	const { prefs, onToast } = useWorkspace();
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
				onToast?.(
					'ok',
					t('Copied {{count}} {{block}} from {{monster}}', {
						count: block.count,
						block: t(BLOCK_LABEL[kind]),
						monster: doc.name
					})
				);
			},
			paste: (kind, mode) => {
				if (readOnly || !clipboard || clipboard.kind !== kind) return;
				const p = applyBlock(doc, clipboard, mode);
				if (!p) {
					onToast?.('error', t('That {{block}} block could not be read', { block: t(BLOCK_LABEL[kind]) }));
					return;
				}
				patch(p);
				// Replace and merge are separate messages: "Replaced"/"Added" is not a
				// word that can be swapped into one sentence in every language.
				onToast?.(
					'ok',
					mode === 'replace'
						? t('Replaced with {{count}} {{block}} from {{monster}}', {
								count: clipboard.count,
								block: t(BLOCK_LABEL[kind]),
								monster: clipboard.from
							})
						: t('Added {{count}} {{block}} from {{monster}}', {
								count: clipboard.count,
								block: t(BLOCK_LABEL[kind]),
								monster: clipboard.from
							})
				);
			}
		}),
		[clipboard, doc, patch, readOnly, onToast, t]
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
		// The container is scrolled directly rather than by scrollIntoView, which
		// walks *every* scrollable ancestor and nudges the shell around the editor
		// as well. Subtracting the column's own top padding means landing on the
		// first section is a scroll to 0 — no movement at all, rather than a 20px
		// twitch every time a monster is opened.
		const box = scrollRef.current;
		const el = document.getElementById(`ss-ed-${id}`);
		if (!box || !el) return;
		const pad = parseFloat(getComputedStyle(box).paddingTop) || 0;
		const top = box.scrollTop + el.getBoundingClientRect().top - box.getBoundingClientRect().top - pad;
		box.scrollTo({ top: Math.max(0, top), behavior });
	}, []);

	/**
	 * Scrolls the field a lint names into view and flashes it.
	 *
	 * Runs after the section jump rather than instead of it: the section has to
	 * be uncollapsed and mounted before its fields can be found, and a collapsed
	 * one has no row to scroll to at all. The flash is removed on a timer rather
	 * than on animation end — a class that outlives its animation cannot be
	 * re-added to flash the same field twice, which is exactly what clicking the
	 * same lint again asks for.
	 *
	 * Centred rather than scrolled to the top edge: a finding usually needs the
	 * fields around it to make sense, and a row pinned to the top of the pane
	 * looks like the section starts there.
	 */
	const landOn = useCallback((path: string, attempt = 0) => {
		const box = scrollRef.current;
		if (!box) return;
		const el = box.querySelector<HTMLElement>(`[data-lint-path="${CSS.escape(path)}"]`);
		if (!el) {
			// The section jump above uncollapses by setting state, so on the frame
			// this first runs the fields of a folded section are not mounted yet.
			// Wait for that render rather than racing it. Bounded, because a path
			// no field claims — a whole-file finding, or a section the engine does
			// not have — must not retry forever; the tab jump already happened and
			// is the honest answer there.
			if (attempt < 4) requestAnimationFrame(() => landOn(path, attempt + 1));
			return;
		}
		const boxBox = box.getBoundingClientRect();
		const elBox = el.getBoundingClientRect();
		const top = box.scrollTop + elBox.top - boxBox.top - (boxBox.height - elBox.height) / 2;
		box.scrollTo({ top: Math.max(0, top), behavior: 'auto' });
		el.classList.remove('ss-ed-field-found');
		// Reading offsetWidth restarts the animation: without it the class goes
		// straight back on in the same frame and nothing replays.
		void el.offsetWidth;
		el.classList.add('ss-ed-field-found');
		window.setTimeout(() => el.classList.remove('ss-ed-field-found'), 1600);
	}, []);

	/** True for the mount that restored a position, so the landing effect below
	 *  stands down for it and only for it. */
	const restored = useRef<string | null>(null);

	// Runs before the landing effect, which is what lets it win: both fire on the
	// same mount and the last write to scrollTop would otherwise be the default
	// tab's. Reading and clearing in one go — a restore is spent once, so opening
	// the same monster again later starts fresh.
	useLayoutEffect(() => {
		const box = scrollRef.current;
		if (!box || lastScroll?.file !== doc.file) return;
		box.scrollTop = lastScroll.top;
		restored.current = doc.file;
		lastScroll = null;
	}, [doc.file]);

	// Remembers on the way out. Empty deps and a ref for the file, so this runs
	// when the editor really unmounts rather than every time the document
	// changes — switching monsters is not leaving.
	const fileRef = useRef(doc.file);
	fileRef.current = doc.file;
	useEffect(
		() => () => {
			const box = scrollRef.current;
			if (box) lastScroll = { file: fileRef.current, top: box.scrollTop };
		},
		[]
	);

	// Opening a monster lands on the default tab, instantly: this is where the
	// work starts, so animating there would only be a delay. Keyed on the file,
	// so switching tabs or reloading a monster re-lands but editing does not.
	//
	// A *layout* effect, and no requestAnimationFrame: the new document's sections
	// are already in the DOM by the time this runs, so waiting a frame only bought
	// one painted frame at the old scroll position — the flicker you saw switching
	// monsters. Scrolling here happens before the browser paints at all.
	useLayoutEffect(() => {
		// Consumed, not just read: the guard is for the mount that restored, and
		// a later prefs change on the same monster should still land.
		if (restored.current === doc.file) {
			restored.current = null;
			return;
		}
		const id = landingSection(prefs);
		if (!id) return;
		jump(id, 'auto');
	}, [doc.file, prefs, jump]);

	// A jump asked for from outside the editor. Declared after the landing effect
	// so that when both fire — clicking Loot → Edit while a browser held the centre
	// column remounts the editor — the request is the one that sticks.
	useLayoutEffect(() => {
		if (!jumpRequest) return;
		// Left standing, not dropped: the document it is for is still loading.
		if (jumpFile && jumpFile !== doc.file) return;
		if (visible.includes(jumpRequest)) jump(jumpRequest, 'auto');
		if (jumpPath) landOn(jumpPath);
		onJumped?.();
	}, [jumpRequest, jumpPath, jumpFile, doc.file, visible, jump, landOn, onJumped]);

	const lintCounts = useMemo(() => {
		let error = 0;
		let warning = 0;
		for (const l of lints) {
			if (l.severity === 'error') error++;
			else if (l.severity === 'warning') warning++;
		}
		return { error, warning };
	}, [lints]);

	// Four things, all about the document in hand. The workspace facts the
	// sections need reach them through `useWorkspace()` rather than being
	// spread into twelve components that mostly did not ask for them.
	const common = { doc, patch, lintAt, readOnly };

	return (
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
							{t(SECTION_LABEL[id])}
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
								{t('Read-only — this file cannot be written back without losing something. Fix the reported problems to enable editing.')}
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
	);
}
