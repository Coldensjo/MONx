import { useTranslation } from 'react-i18next';
import { n } from '../i18n';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Crosshair, Pause, Play, RotateCcw, Zap } from 'lucide-react';
import { MAGIC_EFFECT_BY_NAME, SHOOT_EFFECT_BY_NAME } from '../catalog';
import { lookUrl, type Look, type SpellBlock } from '../monster';
import { castsPerMinute, spellDamageRange } from '../derive';
import {
	IGNORED_COOLDOWN_MS,
	EFFECT_FRAME_MS,
	facingFor,
	flightDuration,
	impactDuration,
	missilePattern,
	outputPerMinute,
	rollValue,
	spellShape,
	tileDistance,
	type Phase,
	type Tile
} from '../spellsim';
import { frameMs, usePreviewUrl, useThingAnim } from '../fields/preview';
import { useCompact } from '../fields/Field';

// A live re-enactment of one spell block: the caster waits out its cooldown,
// rolls `chance`, throws its projectile and lights up every tile the area
// covers, then does it again. Everything on screen is read from the block being
// edited, so changing `spread` or the impact effect changes the next cast.

/** A Tibia tile is 32 px, and every sprite is drawn at its own size against it —
 *  a 2×2 thing really is 64 px and overhangs its base tile, same as in game. */
const TILE = 32;
const MIN_COLS = 9;
const MAX_COLS = 21;
const MIN_ROWS = 7;
const MAX_ROWS = 13;
/** Long enough to read, short enough not to overlap the next cast. */
const FLOATER_MS = 1100;

type Speed = 0.5 | 1 | 2;

interface Cast {
	/** Monotonic id so a floater from the previous cast can be discarded. */
	id: number;
	value: number | null;
}

interface Props {
	block: SpellBlock;
	look: Look;
	/** Healing and haste read as gains; `<attacks>` values read as damage. */
	parent: 'attacks' | 'defenses';
}

function effectIds(block: SpellBlock): { shoot: number | null; area: number | null } {
	// A registered spell's effect attributes are never read by the loader (§8.1),
	// so the stage must not draw them either.
	if (block.kind === 'registered') return { shoot: null, area: null };
	const shoot = block.effects.shootEffect ? SHOOT_EFFECT_BY_NAME.get(block.effects.shootEffect)?.id ?? null : null;
	const area = block.effects.areaEffect ? MAGIC_EFFECT_BY_NAME.get(block.effects.areaEffect)?.id ?? null : null;
	return { shoot: shoot && shoot > 0 ? shoot : null, area: area && area > 0 ? area : null };
}

/** Where the victim starts: at the spell's own reach, or arm's length for melee.
 *  `range = 0` is line of sight (§8.2), which has no natural distance — pick one
 *  far enough out that a projectile is visible. */
function defaultDistance(block: SpellBlock): number {
	if (block.melee) return 1;
	return block.range > 0 ? Math.min(block.range, 6) : 4;
}

/** One area-effect animation, mounted for the length of the impact. */
const ImpactSprite = memo(function ImpactSprite({ id, frame }: { id: number; frame: number }) {
	const previewUrl = usePreviewUrl();
	const url = previewUrl?.('effect', id, { frame });
	if (!url) return null;
	return <img src={url} alt="" draggable={false} />;
});

export function SpellStage({ block, look, parent }: Props) {
	const { t } = useTranslation();
	const compact = useCompact();
	const [playing, setPlaying] = useState(true);
	const [speed, setSpeed] = useState<Speed>(1);
	// On by default: the stage is for reading a spell's shape and effects, and a
	// spell on a 30 s interval shows you one cast a minute. The real interval is
	// one click away and printed on the meter either way.
	const [ignoreCooldown, setIgnoreCooldown] = useState(true);
	// Where the victim stands, in tiles from the caster. Dragging it is the whole
	// point of the stage: range, facing and beam rotation all follow from it.
	const [target, setTarget] = useState<Tile>(() => ({ dx: defaultDistance(block), dy: 0 }));

	const [phase, setPhase] = useState<Phase>('cooldown');
	const [progress, setProgress] = useState(0);
	const [cast, setCast] = useState<Cast | null>(null);
	const [fizzled, setFizzled] = useState(false);
	const [frame, setFrame] = useState(0);

	const { shoot, area } = effectIds(block);
	const shootEntry = block.effects.shootEffect ? SHOOT_EFFECT_BY_NAME.get(block.effects.shootEffect) : undefined;
	const areaEntry = block.effects.areaEffect ? MAGIC_EFFECT_BY_NAME.get(block.effects.areaEffect) : undefined;
	const areaAnim = useThingAnim('effect', area);
	const shootAnim = useThingAnim('missile', shoot);

	// `<defenses>` are cast by the monster on itself, so there is no victim to
	// aim at, nothing for a projectile to cross, and `range` never applies.
	const selfCast = parent === 'defenses';
	const melee = block.melee !== null;
	const range = melee ? 1 : block.range;
	const distance = tileDistance(target.dx, target.dy);
	const facing = facingFor(target.dx, target.dy);
	// `range = 0` is "line of sight only" (§8.2) — nothing on the stage is out of it.
	const outOfRange = !selfCast && range > 0 && distance > range;

	const shape = useMemo(() => spellShape(block, facing, selfCast), [block, facing, selfCast]);
	/** Who the spell lands on: the monster for a defense, the dragged victim otherwise. */
	const victim = selfCast ? { dx: 0, dy: 0 } : target;
	const origin = shape.origin === 'target' ? target : { dx: 0, dy: 0 };
	const tiles = useMemo(
		() => shape.tiles.map(t => ({ dx: origin.dx + t.dx, dy: origin.dy + t.dy })),
		[shape, origin.dx, origin.dy]
	);
	const hitsTarget = tiles.some(t => t.dx === victim.dx && t.dy === victim.dy);

	const damage = useMemo(() => spellDamageRange(block), [block]);
	const gain = parent === 'defenses' || block.name === 'healing' || (block.min > 0 && block.max > 0);
	const perMinute = outputPerMinute(block, damage);
	const cpm = castsPerMinute(block.interval);

	// ---------- Grid extents ----------
	// Sized to whatever the spell actually reaches, so a 1-tile melee doesn't sit
	// in the middle of a 21-wide field and an 8-radius nova is never clipped.
	const bounds = useMemo(() => {
		let w = Math.max(3, Math.abs(victim.dx) + 1);
		let h = Math.max(3, Math.abs(victim.dy) + 1);
		for (const t of tiles) {
			w = Math.max(w, Math.abs(t.dx) + 1);
			h = Math.max(h, Math.abs(t.dy) + 1);
		}
		const cols = Math.min(MAX_COLS, Math.max(MIN_COLS, w * 2 + 1));
		const rows = Math.min(MAX_ROWS, Math.max(MIN_ROWS, h * 2 + 1));
		return { cols, rows, cx: (cols - 1) / 2, cy: (rows - 1) / 2 };
	}, [tiles, victim.dx, victim.dy]);

	const px = useCallback((t: Tile) => ({ left: (bounds.cx + t.dx) * TILE, top: (bounds.cy + t.dy) * TILE }), [bounds]);

	// ---------- The loop ----------
	// One rAF driver rather than a chain of timers: the projectile needs a
	// sub-frame position, and pausing has to freeze it exactly where it is.
	const timings = useRef({ cooldown: 0, flight: 0, impact: 0 });
	timings.current = {
		cooldown: ignoreCooldown ? IGNORED_COOLDOWN_MS : Math.max(1, block.interval),
		// Nothing travels when caster and victim are the same creature.
		flight: shoot === null || selfCast ? 0 : flightDuration(distance),
		impact: impactDuration(areaAnim?.frames ?? 1)
	};

	const phaseRef = useRef<Phase>('cooldown');
	/** Milliseconds into the current phase. Kept as elapsed rather than a start
	 *  stamp so pausing simply stops adding to it. */
	const elapsedRef = useRef(0);
	const castIdRef = useRef(0);
	const raf = useRef(0);

	const begin = useCallback((next: Phase) => {
		phaseRef.current = next;
		elapsedRef.current = 0;
		setPhase(next);
		setProgress(0);
	}, []);

	const fire = useCallback(() => {
		castIdRef.current += 1;
		setFizzled(false);
		setCast({ id: castIdRef.current, value: rollValue(damage) });
		begin(timings.current.flight > 0 ? 'flight' : 'impact');
	}, [begin, damage]);

	useEffect(() => {
		if (!playing) return;
		let last = performance.now();

		const step = (now: number) => {
			raf.current = requestAnimationFrame(step);
			// Speed scales the clock, not the durations, so switching mid-phase
			// never makes the animation jump.
			elapsedRef.current += (now - last) * speed;
			last = now;

			const total = timings.current[phaseRef.current];
			setProgress(total <= 0 ? 1 : Math.min(1, elapsedRef.current / total));
			if (elapsedRef.current < total) return;

			switch (phaseRef.current) {
				case 'cooldown':
					// `chance` is rolled once per cooldown, exactly as the engine does.
					if (Math.random() * 100 >= Math.min(100, Math.max(0, block.chance))) {
						setFizzled(true);
						begin('cooldown');
					} else {
						fire();
					}
					return;
				case 'flight':
					begin('impact');
					return;
				default:
					begin('cooldown');
			}
		};

		raf.current = requestAnimationFrame(step);
		return () => cancelAnimationFrame(raf.current);
	}, [playing, speed, block.chance, begin, fire]);

	// Effect sprites step on their own clock; the impact phase just gates them.
	// A modern bundle states how long each phase is held, so the area effect's
	// own timing drives the tick where it has one — the sim runs at the speed
	// the client would play it.
	useEffect(() => {
		let timer: ReturnType<typeof setTimeout>;
		const step = (f: number) => {
			timer = setTimeout(
				() => {
					setFrame(f + 1);
					step(f + 1);
				},
				frameMs(areaAnim, areaAnim ? f % Math.max(1, areaAnim.frames) : 0, EFFECT_FRAME_MS) / speed
			);
		};
		step(frame);
		return () => clearTimeout(timer);
		// `frame` is deliberately not a dependency: it is what this loop drives,
		// and restarting on every tick would reset the chain each time.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [speed, areaAnim]);

	// A floater outlives its cast phase, so it clears itself.
	useEffect(() => {
		if (!cast) return;
		const t = setTimeout(() => setCast(c => (c?.id === cast.id ? null : c)), FLOATER_MS / speed);
		return () => clearTimeout(t);
	}, [cast, speed]);

	// ---------- Dragging the victim ----------
	const gridRef = useRef<HTMLDivElement>(null);
	const viewportRef = useRef<HTMLDivElement>(null);

	// Keep the caster in view when the grid outgrows the column: the interesting
	// half of a long beam is the half next to the monster. Both axes, because a
	// caller that bounds the stage's height — the create wizard, fitting the
	// whole card on one page — would otherwise show the top of a nova and cut
	// the monster casting it. An `overflow: hidden` box still scrolls
	// programmatically, so this is what pans it there.
	useEffect(() => {
		const vp = viewportRef.current;
		if (!vp) return;
		vp.scrollLeft = Math.max(0, (bounds.cx + 0.5) * TILE - vp.clientWidth / 2);
		vp.scrollTop = Math.max(0, (bounds.cy + 0.5) * TILE - vp.clientHeight / 2);
	}, [bounds]);

	const moveTarget = useCallback(
		(e: React.PointerEvent) => {
			const rect = gridRef.current?.getBoundingClientRect();
			if (!rect) return;
			const dx = Math.round((e.clientX - rect.left) / TILE - 0.5 - bounds.cx);
			const dy = Math.round((e.clientY - rect.top) / TILE - 0.5 - bounds.cy);
			if (dx === 0 && dy === 0) return; // the caster's own tile
			setTarget({
				dx: Math.max(-MAX_COLS, Math.min(MAX_COLS, dx)),
				dy: Math.max(-MAX_ROWS, Math.min(MAX_ROWS, dy))
			});
		},
		[bounds]
	);

	const previewUrl = usePreviewUrl();
	// No `cell`: the route then returns the look at its composed size, so a
	// two-tile monster arrives as 64 px and is not scaled to fit one tile.
	const casterUrl = lookUrl(look, { dir: facing as number, frame: 0 });

	/** Position along the caster→victim line at `p` of the way across. */
	const alongFlight = useCallback(
		(p: number) => ({ left: (bounds.cx + target.dx * p) * TILE, top: (bounds.cy + target.dy * p) * TILE }),
		[bounds, target]
	);

	const shootPattern = missilePattern(target.dx, target.dy);
	const shootUrl =
		shoot === null
			? null
			: previewUrl?.('missile', shoot, {
					dir: shootAnim ? shootPattern.dir % Math.max(1, shootAnim.patternX) : shootPattern.dir,
					diry: shootAnim ? shootPattern.diry % Math.max(1, shootAnim.patternY) : shootPattern.diry
			  });

	const impacting = phase === 'impact';
	const areaFrame = areaAnim ? frame % Math.max(1, areaAnim.frames) : frame % 3;
	// With `aoeShootEffect` the client draws a projectile to every tile of the
	// area, not just the centre (§8.4) — a visibly different, and expensive, spell.
	const aoeShoot = block.effects.aoeShootEffect && shoot !== null && phase === 'flight';

	return (
		<div className="mx-stage">
			<div className="mx-stage-bar">
				<button
					type="button"
					className="ss-btn mx-stage-btn"
					onClick={() => setPlaying(p => !p)}
					title={playing ? t('Pause') : t('Play')}
					aria-label={playing ? t('Pause') : t('Play')}
				>
					{playing ? <Pause size={13} /> : <Play size={13} />}
				</button>
				<button type="button" className="ss-btn mx-stage-btn" onClick={fire} title={t('Cast now')} aria-label={t('Cast now')}>
					<Zap size={13} />
				</button>
				<button
					type="button"
					className="ss-btn mx-stage-btn"
					onClick={() => setTarget({ dx: defaultDistance(block), dy: 0 })}
					title={t('Reset the target')}
					aria-label={t('Reset the target')}
				>
					<RotateCcw size={13} />
				</button>
				<div className="mx-stage-speeds">
					{([0.5, 1, 2] as Speed[]).map(s => (
						<button
							key={s}
							type="button"
							className={s === speed ? 'mx-stage-speed mx-stage-speed-on' : 'mx-stage-speed'}
							onClick={() => setSpeed(s)}
						>
							{s}×
						</button>
					))}
				</div>
				<label className="mx-stage-toggle" title={`interval="${block.interval}"`}>
					<input type="checkbox" checked={ignoreCooldown} onChange={e => setIgnoreCooldown(e.target.checked)} />
					{t('Ignore cooldown')}
				</label>
			</div>

			{/* Which sprites this spell throws, visible between casts too — the flight
			    lasts a third of a second and you should not have to catch it. */}
			<div className="mx-stage-fx">
				<span className="mx-stage-fx-slot">
					<span className="mx-stage-fx-key">{t('Projectile')}</span>
					{shootUrl ? (
						<>
							<img className="mx-stage-fx-icon" src={shootUrl} alt="" draggable={false} />
							<span>{shootEntry ? t(shootEntry.label) : block.effects.shootEffect}</span>
						</>
					) : (
						<span className="mx-stage-fx-none">
							{block.kind === 'registered'
								? t('from spells.xml')
								: selfCast
								? t('not used — cast on itself')
								: distance > 1
								? t('none — nothing travels')
								: t('none')}
						</span>
					)}
				</span>
				<span className="mx-stage-fx-slot">
					<span className="mx-stage-fx-key">{t('Magic effect')}</span>
					{area !== null ? (
						<>
							<img
								className="mx-stage-fx-icon"
								src={previewUrl?.('effect', area, { frame: areaFrame }) ?? undefined}
								alt=""
								draggable={false}
							/>
							<span>{areaEntry ? t(areaEntry.label) : block.effects.areaEffect}</span>
						</>
					) : (
						<span className="mx-stage-fx-none">
							{block.kind === 'registered' ? t('from spells.xml') : t('none — the hit is invisible')}
						</span>
					)}
				</span>
			</div>

			{/* At true scale a long wave is wider than the editor column, so the grid
			    pans rather than shrinking the sprites to fit. */}
			<div className="mx-stage-viewport" ref={viewportRef}>
			<div
				className="mx-stage-grid"
				ref={gridRef}
				style={{
					width: bounds.cols * TILE,
					height: bounds.rows * TILE,
					backgroundSize: `${TILE}px ${TILE}px`
				}}
				onPointerDown={
					selfCast
						? undefined
						: e => {
								(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
								moveTarget(e);
						  }
				}
				onPointerMove={
					selfCast
						? undefined
						: e => {
								if (e.buttons === 1) moveTarget(e);
						  }
				}
			>
				{/* Every tile the spell covers, lit whether or not it is impacting. */}
				{tiles.map((t, i) => (
					<div
						key={`${t.dx},${t.dy},${i}`}
						className={impacting ? 'mx-stage-tile mx-stage-tile-hot' : 'mx-stage-tile'}
						style={{ ...px(t), width: TILE, height: TILE }}
					/>
				))}

				{impacting &&
					area !== null &&
					tiles.map((t, i) => (
						<div key={`fx${i}`} className="mx-stage-cell" style={{ ...px(t), width: TILE, height: TILE }}>
							<ImpactSprite id={area} frame={areaFrame} />
						</div>
					))}

				<div className="mx-stage-caster" style={{ ...px({ dx: 0, dy: 0 }), width: TILE, height: TILE }}>
					<img src={casterUrl} alt="" draggable={false} />
				</div>

				{!selfCast && (
					<div
						className={outOfRange ? 'mx-stage-target mx-stage-target-far' : 'mx-stage-target'}
						style={{ ...px(target), width: TILE, height: TILE }}
						title={t('{{count}} tile away — drag to move', { count: distance })}
					>
						<Crosshair size={TILE - 6} />
					</div>
				)}

				{phase === 'flight' && shootUrl && !aoeShoot && (
					<div
						className="mx-stage-cell mx-stage-missile"
						style={{ ...alongFlight(progress), width: TILE, height: TILE }}
					>
						<img src={shootUrl} alt="" draggable={false} />
					</div>
				)}
				{aoeShoot &&
					shootUrl &&
					tiles.map((t, i) => (
						<div
							key={`aoe${i}`}
							className="mx-stage-cell mx-stage-missile"
							style={{
								left: (bounds.cx + t.dx * progress) * TILE,
								top: (bounds.cy + t.dy * progress) * TILE,
								width: TILE,
								height: TILE
							}}
						>
							<img src={shootUrl} alt="" draggable={false} />
						</div>
					))}

				{cast && cast.value !== null && hitsTarget && !outOfRange && (
					<div
						key={cast.id}
						className={gain ? 'mx-stage-float mx-stage-float-gain' : 'mx-stage-float'}
						style={px(victim)}
					>
						{gain ? '+' : '−'}
						{Math.abs(cast.value)}
					</div>
				)}

				{fizzled && phase === 'cooldown' && <div className="mx-stage-fizzle">{t('chance failed')}</div>}
			</div>
			</div>

			<div className="mx-stage-meter">
				<div
					className={`mx-stage-meter-fill mx-stage-meter-${phase}`}
					style={{ width: `${Math.round(progress * 100)}%` }}
				/>
				<span className="mx-stage-meter-label">
					{/* The real interval stays on the label while it is being ignored:
					    the stage is where a spell's cadence is judged, and hiding the
					    number the server actually reads would be the wrong economy. */}
					{phase === 'cooldown'
						? ignoreCooldown
							? t('every {{ms}} ms · interval is {{real}} ms', {
									ms: IGNORED_COOLDOWN_MS,
									real: block.interval
								})
							: t('cooldown {{ms}} ms', { ms: block.interval })
						: phase === 'flight'
						? t('projectile')
						: t('impact')}
				</span>
			</div>

			{/* The caveat about the shapes is a property of the whole re-enactment,
			    so compact hangs it off the legend rather than spending two lines of
			    a one-page card on it. */}
			<div className="mx-stage-legend" title={compact ? SHAPE_CAVEAT : undefined}>
				{selfCast ? (
					<span>{t('on itself')}</span>
				) : (
					<span className="mono">
						{t('{{count}} tile', { count: distance })}
					</span>
				)}
				<span className="mono">
					{t('{{count}} tile hit', { count: tiles.length })}
				</span>
				{cpm !== null && <span className="mono">{t('{{rate}}/min', { rate: cpm.toFixed(1) })}</span>}
				{perMinute !== null && (
					<span className="mono">
						{gain ? t('≈{{amount}} healed/min', { amount: n(Math.round(Math.abs(perMinute))) }) : t('≈{{amount}} dmg/min', { amount: n(Math.round(Math.abs(perMinute))) })}
					</span>
				)}
			</div>

			{outOfRange && (
				<div className="ss-ed-field-note ss-ed-note-warn">
					{t('The target is {{distance}} tiles away but {{attr}} is {{range}} — the monster never casts this from here.', {
							distance,
							attr: 'range',
							range
						})}
				</div>
			)}
			{!hitsTarget && !outOfRange && (
				<div className="ss-ed-field-note ss-ed-note-warn">
					{selfCast ? t('The area does not cover the monster itself.') : t('The area does not cover the target.')}{' '}
					{shape.needsDirection ? t('A beam fires along the facing only.') : ''}
				</div>
			)}
			{selfCast && (
				<div className="ss-ed-field-note">
					{t('A {{node}} rolls in {{callback}} with the monster as both caster and target, so it lands on itself — {{range}} and {{target}} have nothing to act on.', {
							node: '<defense>',
							callback: 'onThinkDefense',
							range: 'range',
							target: 'target'
						})}
				</div>
			)}
			{block.kind !== 'builtin' && (
				<div className="ss-ed-field-note">
					{block.kind === 'registered'
						? t('Registered spell — only interval, chance and range are known here; the shape and effects come from spells.xml.')
						: t('Scripted spell — the Lua decides the shape and effects, so only the cadence is re-enacted.')}
				</div>
			)}
			{!compact && <div className="ss-ed-field-note">{SHAPE_CAVEAT}</div>}
		</div>
	);
}

const SHAPE_CAVEAT =
	"Area shapes follow the engine's standard 13×13 distance table and wave build; the reference does not print them, so treat the outline as indicative.";
