// Effects a server has added that no shipped table could know about.
//
// The engine tables in `engine.ts` and `engine/tables.rs` are each read out of a real
// server's source, which is what makes them worth trusting — and exactly why
// they cannot cover the effect somebody added to their own fork last Tuesday.
// Without this, magic effect 105 on a modified Ironcore is invisible in the
// picker, indistinguishable from no effect at all, and linted as "dropped" by a
// loader that handles it perfectly well.
//
// So the catalogue the editor offers is the engine's table *plus* whatever the
// user declares here. Declarations never replace a stock entry: they are the
// user's word about their own server, which is why they live in settings rather
// than beside `ME_IRONCORE`.

import { invoke } from '@tauri-apps/api/core';
import type { EffectEntry } from './catalog';

export interface CustomEffect {
	/** The wire value, written verbatim — `CONST_ME_PRISMATICBLUE`, or `105`. */
	name: string;
	/** Client id to preview it with. 0 means "no sprite yet", which is allowed. */
	id: number;
	/** Picker label. Empty falls back to the name. */
	label: string;
}

export interface CustomEffects {
	magic: CustomEffect[];
	shoot: CustomEffect[];
}

/** Keyed by engine — effect ids are a property of a server, not of MONx. */
export type CustomEffectsByEngine = Record<string, CustomEffects>;

const KEY = 'monx.customEffects';

export const EMPTY: CustomEffects = { magic: [], shoot: [] };

function validEffect(v: unknown): v is CustomEffect {
	const e = v as CustomEffect | null;
	return !!e && typeof e.name === 'string' && typeof e.id === 'number';
}

function validList(v: unknown): CustomEffect[] {
	return Array.isArray(v)
		? v.filter(validEffect).map(e => ({ name: e.name, id: e.id, label: e.label ?? '' }))
		: [];
}

export function loadCustomEffects(): CustomEffectsByEngine {
	try {
		const raw = localStorage.getItem(KEY);
		const parsed = raw ? JSON.parse(raw) : {};
		if (!parsed || typeof parsed !== 'object') return {};
		const out: CustomEffectsByEngine = {};
		for (const [engine, value] of Object.entries(parsed as Record<string, unknown>)) {
			const v = value as { magic?: unknown; shoot?: unknown } | null;
			out[engine] = { magic: validList(v?.magic), shoot: validList(v?.shoot) };
		}
		return out;
	} catch {
		return {};
	}
}

export function saveCustomEffects(all: CustomEffectsByEngine): void {
	try {
		localStorage.setItem(KEY, JSON.stringify(all));
	} catch {
		// Private mode or quota. The in-memory copy still works for this session.
	}
}

/**
 * Hands the whole map to the backend, whose linter needs it to stop reporting a
 * declared effect as unknown. Fire-and-forget: a failure here costs a stale
 * warning, never a wrong save, so it must not block the UI.
 */
export function pushCustomEffects(all: CustomEffectsByEngine): void {
	invoke('set_custom_effects', { effects: all }).catch(() => undefined);
}

export function effectsFor(all: CustomEffectsByEngine, engine: string | null | undefined): CustomEffects {
	return all[engine ?? ''] ?? EMPTY;
}

/** A declaration as the picker's grid wants it. */
export function asEntries(list: CustomEffect[]): EffectEntry[] {
	return list.map(e => ({ name: e.name, id: e.id, label: e.label || e.name, custom: true }));
}

/**
 * The engine's own table with the declarations appended.
 *
 * A declaration that repeats a stock name is dropped rather than shadowing it:
 * the shipped table is read from the server's source and is the better
 * authority, and silently overriding one would make the picker lie about the
 * engine rather than extend it.
 */
export function mergeEffects(stock: EffectEntry[], custom: CustomEffect[]): EffectEntry[] {
	if (custom.length === 0) return stock;
	const known = new Set(stock.map(e => e.name));
	return [...stock, ...asEntries(custom.filter(e => !known.has(e.name)))];
}
