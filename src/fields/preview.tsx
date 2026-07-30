import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

/**
 * Renders one client thing to a URL. The editor never owns the .spr/.dat
 * handles `/thing.png` needs, so the shell injects this; without it the
 * controls fall back to plain labels rather than broken images.
 *
 * `id` is the raw enum value — `CONST_ME_FIREAREA` passes 7 — so the mapping
 * from effect id to dat entry stays in one place outside the editor.
 *
 * `opts` selects one cell of an animated or patterned thing: `frame` steps the
 * animation, `dir`/`diry` index the pattern grid (a missile's travel angle).
 */
export type PreviewUrl = (
	kind: 'effect' | 'missile' | 'outfit' | 'item',
	id: number,
	opts?: { frame?: number; dir?: number; diry?: number }
) => string | null;

const PreviewContext = createContext<PreviewUrl | null>(null);

export function PreviewProvider({ value, children }: { value: PreviewUrl | null; children: ReactNode }) {
	return <PreviewContext.Provider value={value}>{children}</PreviewContext.Provider>;
}

export function usePreviewUrl(): PreviewUrl | null {
	return useContext(PreviewContext);
}

// ---------- Thing animation metadata ----------

/** How many frames and pattern cells a thing has — what an animation loop needs. */
export interface ThingAnim {
	frames: number;
	patternX: number;
	patternY: number;
	/** The dat's animateAlways flag. On an outfit it means frame 0 is part of the
	 *  animation rather than a standing pose — a fire elemental burns while it
	 *  stands still, so skipping frame 0 leaves it frozen. */
	animateAlways: boolean;
	/** Milliseconds each frame is held, in frame order. Empty when the client's
	 *  format carries no durations — the `.spr`/`.dat` engines held every thing
	 *  at one fixed tick, and a modern bundle states a duration per phase. */
	durations: number[];
	/** How many leading frames are the idle animation; the rest are the walk. */
	idleFrames: number;
	/** otclient's `footAnimPhases` — what a step duration is divided by. Not
	 *  always `frames - idleFrames`: a `.dat` outfit counts its standing frame
	 *  in, a bundle outfit's walk animator does not. */
	walkFrames: number;
}

/** How long frame `i` should be held, given a thing's durations and the fixed
 *  tick to fall back on. A zero or missing entry means the thing animates but
 *  never said how fast. */
export function frameMs(anim: ThingAnim | null, i: number, fallback: number): number {
	return anim?.durations?.[i] || fallback;
}

/** Ground speed of an ordinary tile. The client reads it off whatever the
 *  creature is standing on; a preview has no floor, and 150 is the default it
 *  falls back to. */
const GROUND_SPEED = 150;
/** The server's tick, which the client rounds a step up to from 8.6 onwards. */
const SERVER_BEAT = 50;

/**
 * How long one walking frame is held, in milliseconds.
 *
 * A walk cycle is **not** timed by the sprite's own phase durations — the
 * client derives it from how fast the creature moves, so the feet keep pace
 * with the ground. This is otclient's `Creature::updateWalkAnimation` and
 * `getStepDuration`, which between them clamp the result hard: with enhanced
 * animations a walk frame is never slower than 80 ms however sluggish the
 * monster, and never faster than 30 ms.
 *
 * That clamp is the whole point. Canary's outfits *declare* 300 ms per walk
 * phase, but the client never reads it and plays them at 80.
 */
/**
 * How long an outfit that never walks holds one frame, when its format states
 * no durations.
 *
 * These are the `animateAlways` things — braziers, torches, anything that burns
 * in place — and pre-10.50 clients carry no timing for them at all. otclient
 * does not invent a per-frame constant: it spreads **the whole cycle over
 * exactly one second**, so a two-phase brazier holds 500 ms and a six-phase one
 * 167. Driving them at the walk rate instead is what made them race.
 */
export function idleCycleMs(phases: number): number {
	return phases > 0 ? Math.max(1, Math.round(1000 / phases)) : 0;
}

export function walkFrameMs(speed: number, walkPhases: number, enhanced: boolean): number {
	if (speed < 1 || walkPhases < 1) return 0;
	let stepDuration = Math.floor((1000 * GROUND_SPEED) / speed);
	stepDuration = Math.ceil(stepDuration / SERVER_BEAT) * SERVER_BEAT;

	let phases = walkPhases;
	// Without enhanced animations the client drops one phase from the count it
	// divides by, having already dropped the standing frame from the cycle.
	if (!enhanced && phases > 2) phases -= 1;

	let minDelay = 20;
	let divisor = phases;
	if (enhanced && phases > 2) {
		minDelay += 10;
		// Integer division, as in the C++ — 8 phases divide by 5, not 5.33.
		divisor = Math.trunc(divisor / 1.5);
	}
	const maxDelay = phases > 2 ? 80 : 205;
	return Math.min(Math.max(Math.floor(stepDuration / Math.max(1, divisor)), minDelay), maxDelay);
}

export type ThingAnimLookup = (kind: 'effect' | 'missile' | 'outfit' | 'item', id: number) => Promise<ThingAnim | null>;

const ThingAnimContext = createContext<ThingAnimLookup | null>(null);

export function ThingAnimProvider({ value, children }: { value: ThingAnimLookup | null; children: ReactNode }) {
	return <ThingAnimContext.Provider value={value}>{children}</ThingAnimContext.Provider>;
}

/**
 * Frame count for one thing, or null while it loads or when nothing can resolve
 * it. Callers must cope with null — a stage that waits for this would never
 * start in fixture-only rendering, where no lookup is provided.
 */
export function useThingAnim(kind: 'effect' | 'missile' | 'outfit' | 'item', id: number | null): ThingAnim | null {
	const lookup = useContext(ThingAnimContext);
	const [anim, setAnim] = useState<ThingAnim | null>(null);

	useEffect(() => {
		setAnim(null);
		if (!lookup || id === null || id <= 0) return;
		let cancelled = false;
		lookup(kind, id)
			.then(a => {
				if (!cancelled) setAnim(a);
			})
			.catch(() => undefined);
		return () => {
			cancelled = true;
		};
	}, [lookup, kind, id]);

	return anim;
}
