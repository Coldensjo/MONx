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
}

/** How long frame `i` should be held, given a thing's durations and the fixed
 *  tick to fall back on. A zero or missing entry means the thing animates but
 *  never said how fast. */
export function frameMs(anim: ThingAnim | null, i: number, fallback: number): number {
	return anim?.durations?.[i] || fallback;
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
