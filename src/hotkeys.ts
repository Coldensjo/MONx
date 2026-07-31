import { useEffect, useRef } from 'react';
import { loadSetting, saveSetting } from './settings';

/**
 * The hotkey layer. Every action the shell can perform is a `Command` with a
 * stable id; a binding is a chord string, and each command carries two of them
 * so a user can keep the familiar key and add their own without giving one up.
 *
 * Chords are stored as text ("Ctrl+Shift+S") rather than as an object: it is
 * what the manager shows, what the menus print, and what a hand-edited
 * localStorage entry can be read as. Modifier order is fixed by
 * `chordFrom`/`chordOf`, so string equality is chord equality.
 */

export interface Binding {
	primary: string | null;
	secondary: string | null;
}

/** What the shell hands the manager and the dispatcher. */
export interface Command {
	id: string;
	label: string;
	/** Menu-ish heading, for grouping the manager's list. */
	group: string;
	run: () => void;
	/** False greys it in the menu and makes its hotkey a no-op. */
	enabled?: boolean;
	/**
	 * Never fires while a text field has focus, whatever it is bound to. Undo
	 * and redo want this: inside a field those keys belong to the field, and
	 * stealing them would undo the document instead of the word being typed.
	 */
	notWhileTyping?: boolean;
}

export type Bindings = Record<string, Binding>;

// ---------- Chords ----------

/** Modifier order is fixed so two spellings of one chord are the same string. */
function chordOf(key: string, mods: { ctrl: boolean; alt: boolean; shift: boolean; meta: boolean }): string {
	const parts: string[] = [];
	if (mods.ctrl) parts.push('Ctrl');
	if (mods.alt) parts.push('Alt');
	if (mods.shift) parts.push('Shift');
	if (mods.meta) parts.push('Meta');
	parts.push(key);
	return parts.join('+');
}

const PRINTABLE: Record<string, string> = {
	' ': 'Space',
	Escape: 'Esc'
};

/**
 * The chord a key event names, or null when the event is only a modifier being
 * held — capture has to ignore those or every binding would be "Ctrl".
 */
export function chordFrom(e: KeyboardEvent): string | null {
	const raw = e.key;
	if (raw === 'Control' || raw === 'Shift' || raw === 'Alt' || raw === 'Meta') return null;
	// `e.key` for a shifted digit is the symbol ("!"), which would make
	// Ctrl+Shift+1 unmatchable, so digits come from `e.code` — the physical key.
	//
	// Letters must NOT. `e.code` names the QWERTY position, so on AZERTY the key
	// labelled A reports `KeyQ`: the manager would record and display Ctrl+Q for
	// a key the user's keyboard calls A, and Ctrl+S would fire from wherever S
	// sits on a US board. `e.key` is the letter the layout actually produces,
	// which is the one printed on the keycap and the one to bind.
	let key = PRINTABLE[raw] ?? raw;
	if (/^Digit\d$/.test(e.code)) key = e.code.slice(5);
	else if (key.length === 1) key = key.toUpperCase();
	return chordOf(key, { ctrl: e.ctrlKey, alt: e.altKey, shift: e.shiftKey, meta: e.metaKey });
}

/** True when the chord carries a modifier that a text field would not consume. */
export function isGuarded(chord: string): boolean {
	return chord.startsWith('Ctrl+') || chord.startsWith('Alt+') || chord.startsWith('Meta+');
}

/** Display form. Stored form is already readable; Meta reads better as Cmd. */
export function formatChord(chord: string | null): string {
	return chord ? chord.replace('Meta+', 'Cmd+') : '';
}

// ---------- Defaults ----------

const bind = (primary: string | null, secondary: string | null = null): Binding => ({ primary, secondary });

/**
 * The bindings a fresh install has. Everything else is deliberately unbound —
 * the point of the manager is that the user decides, and a default for every
 * one of sixty commands would collide with whatever they wanted to type.
 */
export const DEFAULT_BINDINGS: Bindings = {
	'save-monster': bind('Ctrl+S'),
	'save-all': bind('Ctrl+Shift+S'),
	'quick-open': bind('Ctrl+P'),
	'close-workspace': bind('Ctrl+O'),
	'new-monster': bind('Ctrl+N'),
	'duplicate-monster': bind('Ctrl+D'),
	'rename-monster': bind('Ctrl+Shift+R'),
	'delete-monster': bind(null),
	'reveal-monster': bind(null),

	'undo': bind('Ctrl+Z'),
	// The two spellings every editor accepts, which is exactly what a secondary
	// binding is for.
	'redo': bind('Ctrl+Shift+Z', 'Ctrl+Y'),
	'fix-all-lints': bind('Ctrl+.'),
	'add-tray-loot': bind(null),

	'view-monsters': bind('Ctrl+1'),
	'view-items': bind('Ctrl+2'),
	'view-outfits': bind('Ctrl+3'),
	'view-effects': bind('Ctrl+4'),
	'view-missiles': bind('Ctrl+5'),
	'focus-search': bind('Ctrl+F'),
	'toggle-lints': bind('Ctrl+L'),
	'next-monster': bind('Alt+ArrowDown'),
	'prev-monster': bind('Alt+ArrowUp'),
	'next-tab': bind('Ctrl+Tab', 'Ctrl+PageDown'),
	'prev-tab': bind('Ctrl+Shift+Tab', 'Ctrl+PageUp'),
	'close-tab': bind('Ctrl+W'),

	'pin-ambiguous': bind(null),
	'pin-all': bind(null),
	'scale-loot': bind(null),
	'batch-edit': bind(null),
	'compare-monsters': bind(null),
	'export-lints': bind(null),
	'export-patch-notes': bind(null),
	'set-patch-cutoff': bind(null),

	'open-prefs': bind('Ctrl+,'),
	'open-hotkeys': bind('Ctrl+Shift+K'),
	'open-custom-effects': bind(null),
	'show-all-tabs': bind(null)
};

// ---------- Storage ----------

const KEY = 'monx.hotkeys';

/**
 * Only overrides are stored. A command left alone follows its default for good,
 * so a default that changes in a later version reaches users who never touched
 * that row — and a row the user cleared on purpose is stored as an explicit
 * null rather than falling back.
 */
export function loadBindings(): Bindings {
	const merged: Bindings = { ...DEFAULT_BINDINGS };
	try {
		const raw = loadSetting(KEY, null);
		if (!raw) return merged;
		const stored = JSON.parse(raw);
		for (const [id, b] of Object.entries(stored ?? {})) {
			const v = b as Partial<Binding>;
			merged[id] = {
				primary: typeof v?.primary === 'string' ? v.primary : null,
				secondary: typeof v?.secondary === 'string' ? v.secondary : null
			};
		}
	} catch {
		// A corrupt entry falls back to defaults rather than leaving the app
		// with no keys at all.
	}
	return merged;
}

export function saveBindings(bindings: Bindings): void {
	const overrides: Bindings = {};
	for (const [id, b] of Object.entries(bindings)) {
		const d = DEFAULT_BINDINGS[id];
		if (!d || d.primary !== b.primary || d.secondary !== b.secondary) overrides[id] = b;
	}
	saveSetting(KEY, JSON.stringify(overrides));
}

// ---------- Lookup ----------

export function shortcutFor(bindings: Bindings, id: string): string | undefined {
	const chord = bindings[id]?.primary;
	return chord ? formatChord(chord) : undefined;
}

/** Every command id a chord is bound to — one entry means no conflict. */
export function conflicts(bindings: Bindings): Map<string, string[]> {
	const map = new Map<string, string[]>();
	for (const [id, b] of Object.entries(bindings)) {
		for (const chord of [b.primary, b.secondary]) {
			if (!chord) continue;
			const list = map.get(chord);
			if (list) {
				if (!list.includes(id)) list.push(id);
			} else map.set(chord, [id]);
		}
	}
	return map;
}

// ---------- Dispatch ----------

function inTextEntry(el: Element | null): boolean {
	if (!el) return false;
	const tag = el.tagName.toLowerCase();
	return tag === 'input' || tag === 'textarea' || tag === 'select' || (el as HTMLElement).isContentEditable;
}

/**
 * One listener for the whole shell. A chord bound to a bare key is ignored
 * while a text field has focus — typing "n" into the search box must not create
 * a monster — and everything is ignored while a modal is up, because a modal
 * owns the keyboard until it is dismissed.
 */
export function useHotkeys(commands: Command[], bindings: Bindings, enabled = true): void {
	const ref = useRef({ commands, bindings });
	ref.current = { commands, bindings };

	useEffect(() => {
		if (!enabled) return;
		const onKey = (e: KeyboardEvent) => {
			const chord = chordFrom(e);
			if (!chord) return;
			// Every dialog in MONx renders a `.ss-backdrop`; while one is open the
			// shell's keys are not the ones in play.
			if (document.querySelector('.ss-backdrop')) return;
			const typing = inTextEntry(document.activeElement);
			if (typing && !isGuarded(chord)) return;
			const { commands: cmds, bindings: binds } = ref.current;
			const hit = cmds.find(c => {
				const b = binds[c.id];
				return b && (b.primary === chord || b.secondary === chord);
			});
			if (!hit || hit.enabled === false) return;
			if (typing && hit.notWhileTyping) return;
			e.preventDefault();
			hit.run();
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, [enabled]);
}
