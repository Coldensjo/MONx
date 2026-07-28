import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Crosshair, Pause, Play, RotateCcw, Zap } from 'lucide-react';
import { MAGIC_EFFECT_BY_NAME, SHOOT_EFFECT_BY_NAME } from '../catalog';
import { lookUrl, type Look, type SpellBlock } from '../monster';
import { castsPerMinute, spellDamageRange } from '../derive';
import {
	COMPRESSED_COOLDOWN_MS,
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
import { usePreviewUrl, useThingAnim } from '../fields/preview';

// A live re-enactment of one spell block: the caster waits out its cooldown,
// rolls `chance`, throws its projectile and lights up every tile the area
// covers, then does it again. Everything on screen is read from the block being
// edited, so changing `spread` or the impact effect changes the next cast.

const TILE = 22;
const MIN_COLS = 11;
const MAX_COLS = 21;
const MIN_ROWS = 9;
const MAX_ROWS = 13;
/** Long enough to read, short enough not to overlap the next cast. */
const FLOATER_MS = 1100;
/** How far behind the projectile head each ghost sits, as a fraction of the flight. */
const TRAIL_STEPS = [0.16, 0.32, 0.48];

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
	return <img className="mx-stage-effect" src={url} alt="" draggable={false} />;
});

export function SpellStage({ block, look, parent }: Props) {
	const [playing, setPlaying] = useState(true);
	const [speed, setSpeed] = useState<Speed>(1);
	const [realCooldown, setRealCooldown] = useState(false);
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

	const melee = block.melee !== null;
	const range = melee ? 1 : block.range;
	const distance = tileDistance(target.dx, target.dy);
	const facing = facingFor(target.dx, target.dy);
	// `range = 0` is "line of sight only" (§8.2) — nothing on the stage is out of it.
	const outOfRange = range > 0 && distance > range;

	const shape = useMemo(() => spellShape(block, facing), [block, facing]);
	const origin = shape.origin === 'target' ? target : { dx: 0, dy: 0 };
	const tiles = useMemo(
		() => shape.tiles.map(t => ({ dx: origin.dx + t.dx, dy: origin.dy + t.dy })),
		[shape, origin.dx, origin.dy]
	);
	const hitsTarget = tiles.some(t => t.dx === target.dx && t.dy === target.dy);

	const damage = useMemo(() => spellDamageRange(block), [block]);
	const gain = parent === 'defenses' || block.name === 'healing' || (block.min > 0 && block.max > 0);
	const perMinute = outputPerMinute(block, damage);
	const cpm = castsPerMinute(block.interval);

	// ---------- Grid extents ----------
	// Sized to whatever the spell actually reaches, so a 1-tile melee doesn't sit
	// in the middle of a 21-wide field and an 8-radius nova is never clipped.
	const bounds = useMemo(() => {
		let w = Math.max(3, Math.abs(target.dx) + 1);
		let h = Math.max(3, Math.abs(target.dy) + 1);
		for (const t of tiles) {
			w = Math.max(w, Math.abs(t.dx) + 1);
			h = Math.max(h, Math.abs(t.dy) + 1);
		}
		const cols = Math.min(MAX_COLS, Math.max(MIN_COLS, w * 2 + 1));
		const rows = Math.min(MAX_ROWS, Math.max(MIN_ROWS, h * 2 + 1));
		return { cols, rows, cx: (cols - 1) / 2, cy: (rows - 1) / 2 };
	}, [tiles, target.dx, target.dy]);

	const px = useCallback((t: Tile) => ({ left: (bounds.cx + t.dx) * TILE, top: (bounds.cy + t.dy) * TILE }), [bounds]);

	// ---------- The loop ----------
	// One rAF driver rather than a chain of timers: the projectile needs a
	// sub-frame position, and pausing has to freeze it exactly where it is.
	const timings = useRef({ cooldown: 0, flight: 0, impact: 0 });
	timings.current = {
		cooldown: realCooldown ? Math.max(1, block.interval) : Math.min(Math.max(1, block.interval), COMPRESSED_COOLDOWN_MS),
		flight: shoot === null ? 0 : flightDuration(distance),
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
	useEffect(() => {
		const t = setInterval(() => setFrame(f => f + 1), EFFECT_FRAME_MS / speed);
		return () => clearInterval(t);
	}, [speed]);

	// A floater outlives its cast phase, so it clears itself.
	useEffect(() => {
		if (!cast) return;
		const t = setTimeout(() => setCast(c => (c?.id === cast.id ? null : c)), FLOATER_MS / speed);
		return () => clearTimeout(t);
	}, [cast, speed]);

	// ---------- Dragging the victim ----------
	const gridRef = useRef<HTMLDivElement>(null);
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
	const casterUrl = lookUrl(look, { dir: facing as number, frame: 0, cell: TILE * 2 });

	/** Position along the caster→victim line at `p` of the way across. */
	const alongFlight = useCallback(
		(p: number) => ({ left: (bounds.cx + target.dx * p) * TILE, top: (bounds.cy + target.dy * p) * TILE }),
		[bounds, target]
	);

	// A few fading copies behind the head. The projectile crosses a handful of
	// tiles in a third of a second; without a trail it reads as a jump cut.
	const trail = useMemo(() => {
		const head = phase === 'flight' ? progress : 1;
		return TRAIL_STEPS.map(back => head - back).filter(p => p > 0);
	}, [phase, progress]);

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
					title={playing ? 'Pause' : 'Play'}
					aria-label={playing ? 'Pause' : 'Play'}
				>
					{playing ? <Pause size={13} /> : <Play size={13} />}
				</button>
				<button type="button" className="ss-btn mx-stage-btn" onClick={fire} title="Cast now" aria-label="Cast now">
					<Zap size={13} />
				</button>
				<button
					type="button"
					className="ss-btn mx-stage-btn"
					onClick={() => setTarget({ dx: defaultDistance(block), dy: 0 })}
					title="Reset the target"
					aria-label="Reset the target"
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
					<input type="checkbox" checked={realCooldown} onChange={e => setRealCooldown(e.target.checked)} />
					Real cooldown
				</label>
			</div>

			{/* Which sprites this spell throws, visible between casts too — the flight
			    lasts a third of a second and you should not have to catch it. */}
			<div className="mx-stage-fx">
				<span className="mx-stage-fx-slot">
					<span className="mx-stage-fx-key">Projectile</span>
					{shootUrl ? (
						<>
							<img className="mx-stage-fx-icon" src={shootUrl} alt="" draggable={false} />
							<span>{shootEntry?.label ?? block.effects.shootEffect}</span>
						</>
					) : (
						<span className="mx-stage-fx-none">
							{block.kind === 'registered' ? 'from spells.xml' : distance > 1 ? 'none — nothing travels' : 'none'}
						</span>
					)}
				</span>
				<span className="mx-stage-fx-slot">
					<span className="mx-stage-fx-key">Impact</span>
					{area !== null ? (
						<>
							<img
								className="mx-stage-fx-icon"
								src={previewUrl?.('effect', area, { frame: areaFrame }) ?? undefined}
								alt=""
								draggable={false}
							/>
							<span>{areaEntry?.label ?? block.effects.areaEffect}</span>
						</>
					) : (
						<span className="mx-stage-fx-none">
							{block.kind === 'registered' ? 'from spells.xml' : 'none — the hit is invisible'}
						</span>
					)}
				</span>
			</div>

			<div
				className="mx-stage-grid"
				ref={gridRef}
				style={{
					width: bounds.cols * TILE,
					height: bounds.rows * TILE,
					backgroundSize: `${TILE}px ${TILE}px`
				}}
				onPointerDown={e => {
					(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
					moveTarget(e);
				}}
				onPointerMove={e => {
					if (e.buttons === 1) moveTarget(e);
				}}
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

				<div
					className={outOfRange ? 'mx-stage-target mx-stage-target-far' : 'mx-stage-target'}
					style={{ ...px(target), width: TILE, height: TILE }}
					title={`${distance} ${distance === 1 ? 'tile' : 'tiles'} away — drag to move`}
				>
					<Crosshair size={TILE - 6} />
				</div>

				{phase === 'flight' &&
					shootUrl &&
					!aoeShoot &&
					trail.map((p, i) => (
						<div
							key={`trail${i}`}
							className="mx-stage-cell mx-stage-missile mx-stage-trail"
							style={{ ...alongFlight(p), width: TILE, height: TILE, opacity: 0.45 - i * 0.13 }}
						>
							<img className="mx-stage-effect" src={shootUrl} alt="" draggable={false} />
						</div>
					))}
				{phase === 'flight' && shootUrl && !aoeShoot && (
					<div
						className="mx-stage-cell mx-stage-missile"
						style={{ ...alongFlight(progress), width: TILE, height: TILE }}
					>
						<img className="mx-stage-effect" src={shootUrl} alt="" draggable={false} />
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
							<img className="mx-stage-effect" src={shootUrl} alt="" draggable={false} />
						</div>
					))}

				{cast && cast.value !== null && hitsTarget && !outOfRange && (
					<div
						key={cast.id}
						className={gain ? 'mx-stage-float mx-stage-float-gain' : 'mx-stage-float'}
						style={px(target)}
					>
						{gain ? '+' : '−'}
						{Math.abs(cast.value)}
					</div>
				)}

				{fizzled && phase === 'cooldown' && <div className="mx-stage-fizzle">chance failed</div>}
			</div>

			<div className="mx-stage-meter">
				<div
					className={`mx-stage-meter-fill mx-stage-meter-${phase}`}
					style={{ width: `${Math.round(progress * 100)}%` }}
				/>
				<span className="mx-stage-meter-label">
					{phase === 'cooldown'
						? `cooldown ${block.interval} ms${realCooldown ? '' : ' (compressed)'}`
						: phase === 'flight'
						? 'projectile'
						: 'impact'}
				</span>
			</div>

			<div className="mx-stage-legend">
				<span className="mono">
					{distance} {distance === 1 ? 'tile' : 'tiles'}
				</span>
				<span className="mono">
					{tiles.length} {tiles.length === 1 ? 'tile' : 'tiles'} hit
				</span>
				{cpm !== null && <span className="mono">{cpm.toFixed(1)}/min</span>}
				{perMinute !== null && (
					<span className="mono">
						≈{Math.round(Math.abs(perMinute)).toLocaleString()} {gain ? 'healed' : 'dmg'}/min
					</span>
				)}
			</div>

			{outOfRange && (
				<div className="ss-ed-field-note ss-ed-note-warn">
					The target is {distance} tiles away but <code>range</code> is {range} — the monster never casts this from here.
				</div>
			)}
			{!hitsTarget && !outOfRange && (
				<div className="ss-ed-field-note ss-ed-note-warn">
					The area does not cover the target. {shape.needsDirection ? 'A beam fires along the facing only.' : ''}
				</div>
			)}
			{block.kind !== 'builtin' && (
				<div className="ss-ed-field-note">
					{block.kind === 'registered'
						? 'Registered spell — only interval, chance and range are known here; the shape and effects come from spells.xml.'
						: 'Scripted spell — the Lua decides the shape and effects, so only the cadence is re-enacted.'}
				</div>
			)}
			<div className="ss-ed-field-note">
				Area shapes follow the engine's standard 13×13 distance table and wave build; the reference does not print them,
				so treat the outline as indicative.
			</div>
		</div>
	);
}
