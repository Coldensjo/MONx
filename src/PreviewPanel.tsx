import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Package, Pause, Play } from 'lucide-react';
import {
	balanceBands,
	itemUrl,
	lookUrl,
	tauriItemIndex,
	type BalanceBand,
	type ItemInfo,
	type LootEntry,
	type MonsterDoc
} from './monster';
import { newLootEntry, percentText } from './sections/Loot';
import { ItemSprite, useItemInfo } from './fields/ItemPicker';
import { ANIM_INTERVAL_MS } from './ThingBrowser';
import {
	DAMAGE_TYPE_LABEL,
	armorMitigation,
	balanceHint,
	defenseMitigation,
	effectiveHealth,
	expectedLootValue,
	monsterMaxMelee,
	summonTotals,
	type BalanceVerdict
} from './derive';
import { useDropTarget } from './dnd';
import { frameMs, useThingAnim } from './fields/preview';

// The right-hand column: the monster's look rendered live, the numbers the XML
// never states, and an advisory balance hint (DESIGN §14).

// Outfit direction order in the .dat is N, E, S, W.
const DIRECTIONS = [
	{ dir: 0, label: 'North', Icon: ChevronUp },
	{ dir: 1, label: 'East', Icon: ChevronRight },
	{ dir: 2, label: 'South', Icon: ChevronDown },
	{ dir: 3, label: 'West', Icon: ChevronLeft }
];

const PREVIEW_CELL = 96;
/** Frames to assume while the dat lookup is still in flight — the old fixed
 *  count, which is what most outfits have. */
const FALLBACK_FRAMES = 3;

interface Props {
	doc: MonsterDoc;
	/** Items already resolved for this monster's loot and corpse, keyed by server id. */
	items: Map<number, ItemInfo>;
	lintCount: number;
	onOpenLints?: () => void;
	/** Set `look.type` when an outfit is dropped on the preview (DESIGN §13). */
	onLookType?: (type: number) => void;
	/** Replace the loot list when an item is dropped here. The panel stays visible
	 *  while the Items browser fills the centre column, so this is what makes the
	 *  §13 "item cell → loot list" drag possible at all. */
	onLootChange?: (loot: LootEntry[]) => void;
	/** Shows the Loot heading's Edit button: back to the editor, on the Loot tab. */
	onGoToLoot?: () => void;
}

function fmt(n: number): string {
	return n.toLocaleString();
}

function verdictClass(v: BalanceVerdict): string {
	return `ss-balance-${v}`;
}

interface LootRowProps {
	entry: LootEntry;
	depth: number;
	onChange?: (e: LootEntry) => void;
}

/** A read-mostly loot row: sprite, name, chance. Container rows accept an item
 *  drop and nest it, same as the editor's loot list (§13). */
function PreviewLootRow({ entry, depth, onChange }: LootRowProps) {
	const info = useItemInfo(tauriItemIndex, entry.id, entry.name);
	const serverId = entry.id ?? info?.serverId ?? null;
	const container = info?.container ?? entry.children.length > 0;

	const drop = useDropTarget(container && onChange ? ['item'] : [], p => {
		if (p.kind === 'item') onChange?.({ ...entry, children: [...entry.children, newLootEntry(p)] });
	});

	return (
		<>
			<div className="ss-loot-mini-row" style={depth ? { paddingLeft: 6 + depth * 16 } : undefined} {...drop}>
				<ItemSprite serverId={serverId} size={32} />
				<span className="ss-loot-mini-name">
					{info?.name ?? entry.name ?? (entry.id !== null ? `id ${entry.id}` : 'unresolved')}
					{container && <Package size={11} className="ss-loot-mini-container" />}
				</span>
				<span className="ss-loot-mini-pct mono" title={`chance="${entry.chance}" of 100,000`}>
					{percentText(entry.chance)}
				</span>
			</div>
			{entry.children.map((child, i) => (
				<PreviewLootRow
					key={i}
					entry={child}
					depth={depth + 1}
					onChange={
						onChange &&
						(next => onChange({ ...entry, children: entry.children.map((c, j) => (j === i ? next : c)) }))
					}
				/>
			))}
		</>
	);
}

export default function PreviewPanel({
	doc,
	items,
	lintCount,
	onOpenLints,
	onLookType,
	onLootChange,
	onGoToLoot
}: Props) {
	const [dir, setDir] = useState(2);
	const [frame, setFrame] = useState(0);
	const [playing, setPlaying] = useState(true);
	const [bands, setBands] = useState<BalanceBand[]>([]);

	const typeex = doc.look.mode === 'typeex';

	useEffect(() => {
		let cancelled = false;
		balanceBands()
			.then(b => {
				if (!cancelled) setBands(b);
			})
			// Balance hints are advisory (§14.3) — a failure here must not surface
			// as an error next to the monster's real stats.
			.catch(() => undefined);
		return () => {
			cancelled = true;
		};
	}, []);

	// The outfit's own frame count, so a Beholder's nine frames all play instead
	// of the three every outfit used to be assumed to have.
	const outfitAnim = useThingAnim('outfit', typeex ? null : doc.look.type);
	const frames = Math.max(1, outfitAnim?.frames ?? FALLBACK_FRAMES);
	// Frame 0 is the standing pose and the walk cycle is 1..n-1 — except under
	// animateAlways, where the whole strip is the animation (a fire elemental
	// burns standing still, and skipping frame 0 is what left it frozen).
	const firstFrame = outfitAnim?.animateAlways || frames < 2 ? 0 : 1;

	// `typeex` renders an item, which has nothing to animate.
	//
	// Each frame is held for as long as the client's own data says, which is a
	// chained timeout rather than one interval — a modern bundle gives every
	// phase its own duration, and they differ within a single outfit. The
	// `.spr`/`.dat` engines state none, so those fall back to the fixed tick
	// their client used for everything.
	useEffect(() => {
		if (!playing || typeex || frames <= firstFrame + 1) {
			setFrame(firstFrame);
			return;
		}
		setFrame(firstFrame);
		let timer: ReturnType<typeof setTimeout>;
		const step = (current: number) => {
			timer = setTimeout(() => {
				const next = current + 1 < frames ? current + 1 : firstFrame;
				setFrame(next);
				step(next);
			}, frameMs(outfitAnim, current, ANIM_INTERVAL_MS));
		};
		step(firstFrame);
		return () => clearTimeout(timer);
	}, [playing, typeex, frames, firstFrame, outfitAnim]);

	const drop = useDropTarget(['outfit'], p => {
		if (p.kind === 'outfit') onLookType?.(p.type);
	});

	// Dropping anywhere on the list (or the hint underneath it) appends; a drop
	// on a container row is consumed by the row first and nests instead.
	const lootDrop = useDropTarget(onLootChange ? ['item'] : [], p => {
		if (p.kind === 'item') onLootChange?.([...doc.loot, newLootEntry(p)]);
	});

	// Every frame is mounted once and toggled with `display`, so stepping the
	// animation never issues a request — the same trick ThingsView uses.
	const frameUrls = useMemo(
		() =>
			Array.from({ length: typeex ? 1 : frames }, (_, f) =>
				lookUrl(doc.look, { dir, frame: f, cell: PREVIEW_CELL })
			),
		[doc.look, dir, typeex, frames]
	);

	const maxMelee = monsterMaxMelee(doc);
	const ehp = useMemo(() => effectiveHealth(doc), [doc]);
	const loot = useMemo(() => expectedLootValue(doc.loot, items), [doc.loot, items]);
	const summons = useMemo(() => summonTotals(doc), [doc]);
	const hint = useMemo(() => balanceHint(doc, bands), [doc, bands]);
	const armor = armorMitigation(doc.defenseStats.armor);
	const defense = defenseMitigation(doc.defenseStats.defense);

	// Only the types that actually deviate are worth the space; the rest are
	// plain `health.max` and say nothing.
	const notableEhp = ehp.filter(e => e.immune || e.percent !== 0);

	return (
		<div className="ss-details">
			<div className="ss-details-header">
				<span>{doc.name}</span>
				{!typeex && (
					<button
						className="ss-search-clear"
						onClick={() => setPlaying(p => !p)}
						aria-label={playing ? 'Pause animation' : 'Play animation'}
					>
						{playing ? <Pause size={13} /> : <Play size={13} />}
					</button>
				)}
			</div>

			<div className="ss-details-top">
				<div className="ss-details-preview ss-preview-drop" {...drop}>
					<div className="ss-cell-sprite" style={{ width: PREVIEW_CELL, height: PREVIEW_CELL }}>
						{frameUrls.map((url, f) => (
							<img
								key={f}
								src={url}
								style={{ display: f === (typeex ? 0 : frame) ? 'block' : 'none' }}
								width={PREVIEW_CELL}
								height={PREVIEW_CELL}
								draggable={false}
								alt=""
							/>
						))}
					</div>
				</div>
				<div className="ss-preview-caption">
					{typeex ? `typeex ${doc.look.typeex ?? 0}` : `type ${doc.look.type ?? 0}`}
					{doc.raceid !== null && <span className="mono"> · raceid {doc.raceid}</span>}
				</div>
				{!typeex && (
					<div className="ss-details-dirs">
						{DIRECTIONS.map(({ dir: d, label, Icon }) => (
							<button
								key={d}
								className={`ss-dir-btn${dir === d ? ' ss-dir-btn-active' : ''}`}
								onClick={() => setDir(d)}
								title={label}
								aria-label={label}
							>
								<Icon size={13} />
							</button>
						))}
					</div>
				)}
			</div>

			<div className="ss-details-scroll">
				<div className="ss-details-section">Derived</div>
				<dl className="ss-details-stats">
					<div className="ss-details-prop">
						<dt>Max melee</dt>
						<dd className="mono">{maxMelee === null ? '—' : fmt(maxMelee)}</dd>
					</div>
					<div className="ss-details-prop">
						<dt>Health</dt>
						<dd className="mono">{fmt(doc.health.max)}</dd>
					</div>
					<div className="ss-details-prop" title="Melee and physical hits only (§23)">
						<dt>Armor</dt>
						<dd className="mono">
							{doc.defenseStats.armor}
							{armor.max > 0 && <span className="ss-derived-note"> −{armor.min}…{armor.max}</span>}
						</dd>
					</div>
					<div className="ss-details-prop" title="Melee hits only (§23)">
						<dt>Defense</dt>
						<dd className="mono">
							{doc.defenseStats.defense}
							{defense.max > 0 && <span className="ss-derived-note"> −{defense.min}…{defense.max}</span>}
						</dd>
					</div>
					<div className="ss-details-prop">
						<dt>Experience</dt>
						<dd className="mono">{fmt(doc.experience)}</dd>
					</div>
					<div className="ss-details-prop">
						<dt>Speed</dt>
						<dd className="mono">{fmt(doc.speed)}</dd>
					</div>
					{loot.valued > 0 && (
						<div className="ss-details-prop" title="Expected value per kill, where item worth is known">
							<dt>Loot value</dt>
							<dd className="mono">
								{fmt(Math.round(loot.expected))}
								{loot.unknown > 0 && <span className="ss-derived-note"> +{loot.unknown} unpriced</span>}
							</dd>
						</div>
					)}
					{summons.entries > 0 && (
						<div className="ss-details-prop">
							<dt>Summons</dt>
							<dd className="mono">
								{summons.declared} / {summons.maxSummons}
								{summons.neverSummons && <span className="ss-derived-warn"> never summons</span>}
								{summons.overCap && !summons.neverSummons && <span className="ss-derived-note"> capped</span>}
							</dd>
						</div>
					)}
				</dl>

				{notableEhp.length > 0 && (
					<>
						<div className="ss-details-section">Effective HP</div>
						<dl className="ss-details-stats">
							{notableEhp.map(e => (
								<div key={e.type} className="ss-details-prop">
									<dt>{DAMAGE_TYPE_LABEL[e.type]}</dt>
									<dd className="mono">
										{e.immune ? (
											<span className="ss-ehp-immune">immune</span>
										) : e.effective === null ? (
											// 100 % resistance takes zero damage but reads to the client as a
											// block, not an absorb (§11) — worth distinguishing from immunity.
											<span className="ss-ehp-immune">blocked 100%</span>
										) : (
											<>
												{fmt(e.effective)}
												<span className={e.percent > 0 ? 'ss-ehp-resist' : 'ss-ehp-weak'}>
													{' '}
													{e.percent > 0 ? '+' : ''}
													{e.percent}%
												</span>
											</>
										)}
									</dd>
								</div>
							))}
						</dl>
					</>
				)}

				{doc.look.corpse > 0 && (
					<>
						<div className="ss-details-section">Corpse</div>
						<div className="ss-corpse">
							<img src={itemUrl(doc.look.corpse, 32)} width={32} height={32} draggable={false} alt="" />
							<span className="mono">{doc.look.corpse}</span>
							<span className="ss-corpse-name">{items.get(doc.look.corpse)?.name ?? ''}</span>
						</div>
					</>
				)}

				{onLootChange && (
					<>
						<div className="ss-details-section mx-details-head">
							Loot
							{onGoToLoot && (
								<button
									type="button"
									className="ss-btn ss-btn-ghost mx-details-jump"
									title="Edit in the Loot tab"
									onClick={onGoToLoot}
								>
									Edit
								</button>
							)}
						</div>
						<div className="ss-loot-mini" {...lootDrop}>
							{doc.loot.map((entry, i) => (
								<PreviewLootRow
									key={i}
									entry={entry}
									depth={0}
									onChange={next => onLootChange(doc.loot.map((e, j) => (j === i ? next : e)))}
								/>
							))}
							<div className="ss-loot-mini-hint">Drag items from the Items browser to add loot</div>
						</div>
					</>
				)}

				{hint && (
					<>
						<div className="ss-details-section">Balance</div>
						<div className="ss-balance">
							<div className="ss-balance-band">
								XP {fmt(doc.experience)} → band {hint.band.label}{' '}
								<span className="ss-derived-note">n={hint.band.count}</span>
							</div>
							{/* Advisory only, never a blocker and never auto-applied (§14.3). */}
							<div className="ss-balance-rows">
								<div className={`ss-balance-row ${verdictClass(hint.health.verdict)}`}>
									HP <span className="mono">{fmt(hint.health.value)}</span> vs median{' '}
									<span className="mono">{fmt(hint.health.median)}</span>
								</div>
								<div className={`ss-balance-row ${verdictClass(hint.speed.verdict)}`}>
									Speed <span className="mono">{fmt(hint.speed.value)}</span> vs median{' '}
									<span className="mono">{fmt(hint.speed.median)}</span>
								</div>
								<div className={`ss-balance-row ${verdictClass(hint.armor.verdict)}`}>
									Armor <span className="mono">{fmt(hint.armor.value)}</span> vs median{' '}
									<span className="mono">{fmt(hint.armor.median)}</span>
								</div>
							</div>
						</div>
					</>
				)}

				{lintCount > 0 && (
					<button className="ss-preview-lints" onClick={onOpenLints}>
						{lintCount} {lintCount === 1 ? 'lint' : 'lints'}
					</button>
				)}
			</div>
		</div>
	);
}
