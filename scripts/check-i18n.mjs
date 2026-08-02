// Reports the strings the UI asks for and the locale files do not carry.
//
// The rule in AGENTS.md — every user-facing string lands in `pl.ts` and `pt.ts`
// in the same commit — used to be honour-system, and it failed twice: three
// whole dialogs shipped English-only, and nobody noticed because the key *is*
// the English source, so a missing entry renders as perfectly good English.
// That is the whole problem with this particular rule. Nothing is broken, so
// nothing complains. This is what complains.
//
//   bun run i18n
//
// Exits non-zero when `pl.ts` or `pt.ts` is missing a key. The plural advisory
// below never fails the run: plenty of count-bearing sentences read correctly
// in English at any count ("Pin {{count}}", "{{count}} selected"), so a missing
// `en.ts` form there is the right answer rather than an omission.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SRC = 'src';
const LOCALES = join(SRC, 'locales');

/** i18next's categories across the three languages we ship. */
const SUFFIXES = ['', '_one', '_two', '_few', '_many', '_other'];

function sources(dir) {
	const out = [];
	for (const name of readdirSync(dir)) {
		const path = join(dir, name);
		if (statSync(path).isDirectory()) {
			if (path !== LOCALES) out.push(...sources(path));
		} else if (/\.tsx?$/.test(path)) out.push(path);
	}
	return out;
}

/** `t('…')` and `t("…")`. Anything built at runtime is invisible here and has
 *  to be caught by reading the call — the alternative is evaluating the app. */
function usedKeys() {
	const used = new Map();
	for (const file of sources(SRC)) {
		const text = readFileSync(file, 'utf8');
		for (const m of text.matchAll(/\bt\(\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")/g)) {
			const key = (m[1] ?? m[2]).replace(/\\(['"\\])/g, '$1');
			if (!used.has(key)) used.set(key, file);
		}
	}
	return used;
}

/** The locale files are plain object literals, so the keys are read off the
 *  source rather than imported — this runs under node, not Vite, and a `.ts`
 *  import would need a whole toolchain to answer a question this simple.
 *  Three spellings appear: 'quoted', "double-quoted" (the key has an
 *  apostrophe in it) and bare (the key is a lone identifier). */
function localeKeys(file) {
	const text = readFileSync(join(LOCALES, file), 'utf8');
	const keys = new Set();
	const pattern = /^\t+(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"|([A-Za-z_$][\w$ ]*?))\s*:/gm;
	for (const m of text.matchAll(pattern)) {
		keys.add((m[1] ?? m[2] ?? m[3]).replace(/\\(['"\\])/g, '$1'));
	}
	return keys;
}

const used = usedKeys();
const locales = { en: localeKeys('en.ts'), pl: localeKeys('pl.ts'), pt: localeKeys('pt.ts') };
const carries = (set, key) => SUFFIXES.some(s => set.has(key + s));

let failed = false;
for (const lang of ['pl', 'pt']) {
	const missing = [...used].filter(([key]) => !carries(locales[lang], key));
	if (!missing.length) continue;
	failed = true;
	console.error(`\n${missing.length} string${missing.length === 1 ? '' : 's'} missing from ${lang}.ts:\n`);
	for (const [key, file] of missing) console.error(`  ${file}\n    ${JSON.stringify(key)}`);
}

// Advisory: English renders the bare key, so a count-bearing sentence with no
// `_one`/`_other` in en.ts says "Saved 3 file". Many are fine as they stand,
// which is why this reports and does not fail.
const bare = [...used].filter(([key]) => key.includes('{{count}}') && !carries(locales.en, key));
if (bare.length) {
	console.log(`\n${bare.length} {{count}} string${bare.length === 1 ? '' : 's'} with no en.ts plural form.`);
	console.log('Fine when the English reads correctly at any count — check, do not bulk-add:\n');
	for (const [key, file] of bare) console.log(`  ${file}\n    ${JSON.stringify(key)}`);
}

if (failed) {
	console.error('\nSee AGENTS.md → "Text the user reads".');
	process.exit(1);
}
console.log(`\n${used.size} strings, all carried by pl.ts and pt.ts.`);
