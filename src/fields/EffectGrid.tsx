import { useTranslation } from 'react-i18next';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Ban, ChevronDown, Search } from 'lucide-react';
import type { EffectEntry } from '../catalog';
import { ANIM_INTERVAL_MS } from '../ThingBrowser';
import { commonest, usePreviewUrl, useThingAnimLookup } from './preview';

/** Search row + grid at its tallest, matching the CSS below. */
const GRID_HEIGHT = 290;

/** The thing category behind a picker: an impact is an effect, a projectile a
 *  missile. The grid is one component serving both. */
const thingKind = (kind: 'area' | 'shoot') => (kind === 'area' ? 'effect' : 'missile');

/** What one cell needs to animate: how many phases, and how long each is held
 *  where the client's format says so. */
interface CellAnim {
	frames: number;
	ms: number;
}

interface Props {
	entries: EffectEntry[];
	kind: 'area' | 'shoot';
	value: string | null;
	onChange: (v: string | null) => void;
	disabled?: boolean;
	noneLabel?: string;
}

/** One effect's sprite, or its bare id when nothing can render it. Exported for
 *  the custom-effect dialog, where seeing the sprite is how you know the id is
 *  the one you meant. */
export function Sprite({ id, kind }: { id: number; kind: 'area' | 'shoot' }) {
	const previewUrl = usePreviewUrl();
	const url = id > 0 ? previewUrl?.(thingKind(kind), id) : null;
	if (!url) return <span className="ss-ed-effect-chip">{id}</span>;
	return (
		<img
			className="ss-ed-effect-sprite"
			src={url}
			width={32}
			height={32}
			alt=""
			draggable={false}
			onError={e => (e.currentTarget.style.visibility = 'hidden')}
		/>
	);
}

/**
 * The same sprite, playing.
 *
 * Every phase is mounted once and switched with `display`, which is the browser
 * grid's trick (`AnimatedCell` in ThingBrowser.tsx) and for the same reason:
 * swapping one `<img>`'s `src` re-requests each phase the first time round, so
 * the first cycle of eighty cells blinks its way through the whole catalogue.
 * Mounted this way it is one request per phase, ever, and stepping the
 * animation touches nothing but a style.
 */
function AnimatedSprite({ id, kind, frames, frame }: { id: number; kind: 'area' | 'shoot'; frames: number; frame: number }) {
	const previewUrl = usePreviewUrl();
	const shown = frame % frames;
	return (
		<span className="ss-ed-effect-sprite-anim">
			{Array.from({ length: frames }, (_, f) => (
				<img
					key={f}
					className="ss-ed-effect-sprite"
					src={previewUrl?.(thingKind(kind), id, { frame: f }) ?? ''}
					width={32}
					height={32}
					alt=""
					draggable={false}
					style={{ display: f === shown ? 'block' : 'none' }}
					onError={e => (e.currentTarget.style.visibility = 'hidden')}
				/>
			))}
		</span>
	);
}

/**
 * Phase counts for the whole catalogue, resolved in one pass when the grid
 * opens.
 *
 * `useThingAnim` is the per-thing hook, and eighty cells each holding their own
 * would be eighty promises and eighty renders on open. This asks once, keyed on
 * the catalogue rather than on the filtered list, so typing in the search box
 * re-filters without re-resolving anything.
 *
 * Only things with more than one phase are entered: absence from the map is how
 * a cell knows it is a still.
 */
function useGridAnim(entries: EffectEntry[], kind: 'area' | 'shoot', open: boolean): Map<number, CellAnim> {
	const lookup = useThingAnimLookup();
	const [anim, setAnim] = useState<Map<number, CellAnim>>(() => new Map());

	useEffect(() => {
		if (!open || !lookup) return;
		let live = true;
		const ids = [...new Set(entries.map(e => e.id).filter(id => id > 0))];
		Promise.all(
			ids.map(id =>
				lookup(thingKind(kind), id)
					.then(a => [id, a] as const)
					.catch(() => [id, null] as const)
			)
		).then(pairs => {
			if (!live) return;
			const next = new Map<number, CellAnim>();
			for (const [id, a] of pairs) {
				if (!a || a.frames < 2) continue;
				// A `.spr`/`.dat` client declares no durations at all — those cells
				// take the grid's fixed tick, exactly as the browser gives them.
				next.set(id, { frames: a.frames, ms: commonest(a.durations) ?? 0 });
			}
			setAnim(next);
		});
		return () => {
			live = false;
		};
	}, [entries, kind, open, lookup]);

	return anim;
}

/**
 * A value the catalogue has no entry for, made visible.
 *
 * Without this the trigger falls through to `(none)` — a custom effect looks
 * exactly like no effect at all, survives on disk only until somebody opens the
 * picker, and is then silently destroyed by the first click. So an unrecognised
 * value becomes an entry of its own instead: a bare number is used as the
 * sprite id and really does render, because the preview route reads the client
 * directly and never consults a name table.
 */
function offCatalogue(value: string): EffectEntry {
	return {
		name: value,
		id: /^\d+$/.test(value) ? Number(value) : 0,
		label: value,
		offCatalogue: true
	};
}

function Cell({
	entry,
	kind,
	active,
	disabled,
	onPick,
	anim,
	frame
}: {
	entry: EffectEntry;
	kind: 'area' | 'shoot';
	active: boolean;
	disabled?: boolean;
	onPick: () => void;
	/** Absent for a thing with one phase, or before the lookup has answered. */
	anim?: CellAnim;
	frame: number;
}) {
	const title = [entry.label, entry.name, entry.unreachable ?? entry.mislabeled].filter(Boolean).join(' — ');
	const cls = ['ss-ed-effect-cell'];
	if (active) cls.push('ss-ed-effect-cell-active');
	// Anything not read out of an engine's source is marked, so a declaration
	// and a shipped entry are never mistaken for one another.
	if (entry.custom) cls.push('ss-ed-effect-cell-custom');
	if (entry.offCatalogue) cls.push('ss-ed-effect-cell-off');
	return (
		<button
			type="button"
			className={cls.join(' ')}
			title={title}
			disabled={disabled}
			onClick={onPick}
		>
			{entry.id <= 0 ? (
				<span className="ss-ed-effect-chip">?</span>
			) : anim ? (
				<AnimatedSprite id={entry.id} kind={kind} frames={anim.frames} frame={frame} />
			) : (
				<Sprite id={entry.id} kind={kind} />
			)}
		</button>
	);
}

/**
 * The effect catalogue laid out as sprites. Picking an effect is a visual
 * choice — one glance at the grid beats reading eighty `CONST_*` names in a
 * list. Values are still the exact wire spelling (§20).
 *
 * The grid stays behind the trigger until it is asked for: a spell is read far
 * more often than it is re-pointed, and eight rows of sprites per field buried
 * the rest of the card.
 */
export function EffectGrid({ entries, kind, value, onChange, disabled, noneLabel = '(none)' }: Props) {
	const { t } = useTranslation();
	const [open, setOpen] = useState(false);
	const [up, setUp] = useState(false);
	const [query, setQuery] = useState('');
	const wrapRef = useRef<HTMLDivElement>(null);

	// The grid is tall enough that a field low in the card would drop it off the
	// bottom of the window, so it flips above the trigger when it has to.
	useLayoutEffect(() => {
		if (!open) return;
		const rect = wrapRef.current?.getBoundingClientRect();
		if (!rect) return;
		const below = window.innerHeight - rect.bottom;
		setUp(below < GRID_HEIGHT && rect.top > below);
	}, [open]);

	useEffect(() => {
		if (!open) return;
		const onDown = (e: MouseEvent) => {
			if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
		};
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') setOpen(false);
		};
		document.addEventListener('mousedown', onDown);
		document.addEventListener('keydown', onKey);
		return () => {
			document.removeEventListener('mousedown', onDown);
			document.removeEventListener('keydown', onKey);
		};
	}, [open]);

	// An unrecognised value joins the list rather than vanishing from it, so the
	// grid shows what this monster actually carries and the cell reads as active.
	const all = useMemo(
		() => (value && !entries.some(e => e.name === value) ? [...entries, offCatalogue(value)] : entries),
		[entries, value]
	);

	const shown = useMemo(() => {
		const q = query.trim().toLowerCase();
		return all.filter(e => {
			// The NONE sentinel is the dedicated first cell. An off-catalogue value
			// can legitimately have no sprite id, and must still be shown.
			if (e.id === 0 && !e.offCatalogue) return false;
			// Unusable names resolve to NONE and log an error (§21) — hidden unless
			// this monster already carries one, where it must stay visible to fix.
			if (e.unreachable && e.name !== value) return false;
			if (!q) return true;
			return e.label.toLowerCase().includes(q) || e.name.toLowerCase().includes(q);
		});
	}, [all, query, value]);

	const anim = useGridAnim(all, kind, open);

	// One timer for the whole grid, not one per cell — the browser's reasoning,
	// and a catalogue is a contact sheet of the same size. It runs at the
	// shortest hold anything declares, and a slower cell counts ticks rather
	// than asking for a timer of its own, so a three-phase impact beside a
	// nine-phase one plays at its own rate instead of racing.
	const tickMs = useMemo(() => {
		let min = Infinity;
		for (const a of anim.values()) if (a.ms > 0 && a.ms < min) min = a.ms;
		return Number.isFinite(min) ? min : ANIM_INTERVAL_MS;
	}, [anim]);

	const [tick, setTick] = useState(0);
	useEffect(() => {
		// The grid only exists while open, and the timer goes with it — a picker
		// closed in a card the user is not looking at must not keep ticking.
		if (!open || anim.size === 0) {
			setTick(0);
			return;
		}
		const timer = setInterval(() => setTick(f => f + 1), tickMs);
		return () => clearInterval(timer);
	}, [open, anim, tickMs]);

	// The browser's arithmetic: elapsed milliseconds divided by the cell's own
	// hold. A cell whose format declares nothing falls through to the bare tick
	// count, which is the fixed rate.
	const elapsed = tick * tickMs;
	const frameOf = (a: CellAnim | undefined) => (!a ? 0 : a.ms > 0 ? Math.floor(elapsed / a.ms) : tick);

	const current = all.find(e => e.name === value);

	const pick = (name: string | null) => {
		onChange(name);
		setOpen(false);
	};

	return (
		<div className="ss-ed-effect ss-ed-combo" ref={wrapRef}>
			<button
				type="button"
				className="ss-ed-input ss-ed-combo-trigger"
				disabled={disabled}
				onClick={() => {
					setQuery('');
					setOpen(o => !o);
				}}
			>
				{current && current.id > 0 ? (
					<Sprite id={current.id} kind={kind} />
				) : (
					<span className="ss-ed-effect-none">
						<Ban size={14} />
					</span>
				)}
				<span className="ss-ed-combo-value">{current ? current.label : noneLabel}</span>
				<ChevronDown size={14} />
			</button>
			{open && (
				<div className={up ? 'ss-ed-popover ss-ed-popover-up ss-ed-effect-popover' : 'ss-ed-popover ss-ed-effect-popover'}>
					<div className="ss-ed-popover-search">
						<Search size={13} />
						<input
							autoFocus
							value={query}
							placeholder={t('Search…')}
							onChange={e => setQuery(e.target.value)}
						/>
					</div>
					<div className="ss-ed-effect-grid">
						<button
							type="button"
							className={value ? 'ss-ed-effect-cell' : 'ss-ed-effect-cell ss-ed-effect-cell-active'}
							title={t(noneLabel)}
							onClick={() => pick(null)}
						>
							<span className="ss-ed-effect-none">
								<Ban size={14} />
							</span>
						</button>
						{shown.map(e => (
							<Cell
								key={e.name}
								entry={e}
								kind={kind}
								active={e.name === value}
								disabled={!!e.unreachable}
								onPick={() => pick(e.name)}
								anim={anim.get(e.id)}
								frame={frameOf(anim.get(e.id))}
							/>
						))}
					</div>
				</div>
			)}
			{current?.unreachable && <div className="ss-ed-field-note ss-ed-note-warn">{current.unreachable}</div>}
			{current?.mislabeled && <div className="ss-ed-field-note ss-ed-note-warn">{current.mislabeled}</div>}
			{current?.offCatalogue && (
				<div className="ss-ed-field-note ss-ed-note-warn">
					{t('Not in this engine\'s catalogue — kept exactly as written. Declare it under Preferences → Custom effects to name it and stop the warning.')}
				</div>
			)}
			{current?.custom && <div className="ss-ed-field-note">{t('A custom effect you declared, not one this engine ships.')}</div>}
			{current?.ironcore && (
				<div className="ss-ed-field-note">{t('Ironcore-only effect — a stock client renders nothing.')}</div>
			)}
		</div>
	);
}
