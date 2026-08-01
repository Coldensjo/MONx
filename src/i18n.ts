// The translation layer. Three languages ship today; adding a fourth is one
// entry in LOCALES and one file in src/locales/.
//
// Keys are the English source strings themselves — `t('Open workspace')`. That
// choice is what lets the module-scope label tables scattered through the app
// (SECTION_LABEL, SLOTS, TARGETS, ENGINES, BLOCK_LABEL …) stay exactly as they
// are: their English literals already *are* the keys, so only the render site
// changes, from `TABLE[k]` to `t(TABLE[k])`. It also means a key missing from a
// dictionary degrades to English rather than to a raw identifier.

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { loadSetting, saveSetting } from './settings';
import en from './locales/en';
import pl from './locales/pl';
import pt from './locales/pt';

export type Locale = 'en' | 'pl' | 'pt';

/** `label` is the endonym and is never translated — a picker that renames the
 *  languages into the language you cannot read is useless. */
export const LOCALES: { key: Locale; label: string }[] = [
	{ key: 'en', label: 'English' },
	{ key: 'pl', label: 'Polski' },
	{ key: 'pt', label: 'Português (Brasil)' }
];

const LOCALE_KEY = 'monx.locale';

function isLocale(v: unknown): v is Locale {
	return typeof v === 'string' && LOCALES.some(l => l.key === v);
}

/**
 * The locale to start in: the stored choice, else the primary subtag of the
 * OS/browser language so `pt-BR` and `pt-PT` both land on `pt`, else English.
 * Nothing is written until the user picks explicitly — a machine whose language
 * changes should be followed, not overridden by a value we wrote for it.
 */
function detect(): Locale {
	const stored = loadSetting(LOCALE_KEY, null);
	if (isLocale(stored)) return stored;
	for (const tag of navigator.languages ?? [navigator.language]) {
		const primary = tag.toLowerCase().split('-')[0];
		if (isLocale(primary)) return primary;
	}
	return 'en';
}

const initial = detect();

void i18n.use(initReactI18next).init({
	lng: initial,
	fallbackLng: 'en',
	resources: {
		// `en` carries only the plural entries: for everything else the key is
		// already the English text, and i18next returns the key when it misses.
		en: { translation: en },
		pl: { translation: pl },
		pt: { translation: pt }
	},
	// Both are required. Keys are English sentences, which contain '.' and ':' —
	// left on, i18next would read those as namespace and object-path separators
	// and every key with punctuation would silently resolve to nothing.
	keySeparator: false,
	nsSeparator: false,
	interpolation: { escapeValue: false }, // React escapes on render already
	// Dev-only: report a key the active dictionary has no entry for. This is the
	// translation-coverage report, and it costs nothing in a release build.
	saveMissing: import.meta.env.DEV,
	missingKeyHandler: import.meta.env.DEV
		? (lngs, _ns, key) => {
				if (lngs[0] !== 'en') console.warn(`[i18n] ${lngs[0]} is missing: ${key}`);
			}
		: undefined
});

document.documentElement.lang = initial;

export function getLocale(): Locale {
	return isLocale(i18n.language) ? i18n.language : 'en';
}

export function setLocale(next: Locale): void {
	if (next === getLocale()) return;
	void i18n.changeLanguage(next);
	saveSetting(LOCALE_KEY, next);
	document.documentElement.lang = next;
}

/** Digit grouping follows the locale — Polish writes `1 234` where English
 *  writes `1,234`. Every `.toLocaleString()` on a user-visible count goes
 *  through here so the two can never drift. */
export function n(value: number): string {
	return value.toLocaleString(getLocale());
}

export default i18n;

// ---------------------------------------------------------------------------
// Never translate these. Each is a wire value, a persisted key, or document
// data, and wrapping one in t() breaks behaviour without throwing:
//
//   · every filter `key` and every `Command.id` — the latter are the map keys
//     in `monx.hotkeys`, so translating one orphans the user's binding
//   · SPELL_GROUP_ORDER (catalog.ts) — display strings used as lookup keys,
//     matched against REGISTERED_GROUP in SpellCard.tsx; translating it empties
//     the spell groups and nothing throws
//   · DIFFICULTIES (BestiarySection.tsx) — wire values rendered as their own labels
//   · the '(absent)' sentinel compared in BatchEditDialog, and the 'true'/'false'
//     <option value>s there, which are written into the XML
//   · `${name} copy` in MonsterList — becomes a monster name on disk
//   · the `a ${name}` description default in Identity.tsx — server data, not UI
//   · catalog.ts wire fields (CONST_ME_*, flag keys, RACES[].value, SKULLS[].value,
//     BUILTIN_SPELLS[].name), item names, species, and lint codes
// ---------------------------------------------------------------------------
