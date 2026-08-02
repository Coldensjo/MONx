// Reports drift between the Rust enum tables and their TypeScript mirrors.
//
// `catalog.rs` and `catalog.ts` carry the same facts for two different
// consumers: the linter decides what is a known value, the picker decides what
// the user can choose. They are hand-kept in sync and currently are. Nothing
// checked, which is the same shape of hole `check-i18n.mjs` exists to close —
// an effect added to the Rust side and not the TS side breaks no build and
// fails no probe. The linter quietly stops calling the value unknown while the
// picker still will not offer it, and AGENTS.md is explicit about where that
// ends up: "a value the editor renders as 'nothing' is a value the next click
// deletes."
//
//   bun run catalog
//
// Only wire-exact facts are compared — the names and numbers the server reads.
// Labels, colours, notes and group headings are UI-only and deliberately
// diverge. Three things are excluded on purpose, and each exclusion is a claim
// worth re-checking if this script ever starts lying:
//
//   * BUILTIN_SPELLS `usage` — corpus-frequency documentation on both sides,
//     already differing (melee: 335 vs 339). It steers nothing.
//   * DAMAGE_TYPES immunity/element keywords — genuinely not 1:1. Rust lists
//     `earth` and `poison` as separate immunity names; the TS groups poison
//     under earth because the resistance UI shows one row. Comparing them would
//     report a difference that is the design.
//   * MELEE_CONDITIONS is checked one-way (every condition the UI offers must
//     exist in Rust with the same tick). Rust also accepts `physical`, which
//     the UI folds into bleed.

import { readFileSync } from 'node:fs';

const RS = readFileSync('src-tauri/src/catalog.rs', 'utf8');
const TS = readFileSync('src/catalog.ts', 'utf8');
const ENGINE_RS = readFileSync('src-tauri/src/engine.rs', 'utf8');
const ENGINE_TS = readFileSync('src/engine.ts', 'utf8');

/** The body of a `pub const NAME: … = &[ … ];` table, on one line or many. */
function rustTable(name) {
	const m = RS.match(new RegExp(`pub const ${name}\\s*:[^=]*=\\s*&\\[([\\s\\S]*?)\\];`));
	if (!m) throw new Error(`catalog.rs: no table named ${name}`);
	return m[1];
}

/** `("name", 12)` and `("name", GROUP_CONST, 12)` rows, comments skipped. */
function rustPairs(name, valueIndex = 1) {
	const rows = [];
	for (const m of rustTable(name).matchAll(/\(\s*"((?:[^"\\]|\\.)*)"\s*,([^)]*)\)/g)) {
		const rest = m[2].split(',').map(s => s.trim()).filter(Boolean);
		rows.push([m[1], rest[valueIndex - 1]]);
	}
	return rows;
}

/** A `&[&str]` table: bare strings. */
function rustStrings(name) {
	return [...rustTable(name).matchAll(/"((?:[^"\\]|\\.)*)"/g)].map(m => m[1]);
}

/** The body of an `export const NAME… = [ … ];` array, on one line or many. */
function tsTable(name) {
	const m = TS.match(new RegExp(`export const ${name}\\s*(?::[^=]*)?=\\s*\\[([\\s\\S]*?)\\];`));
	if (!m) throw new Error(`catalog.ts: no table named ${name}`);
	return m[1];
}

/** Object rows, reduced to the fields asked for. */
function tsRows(name, fields) {
	const rows = [];
	for (const m of tsTable(name).matchAll(/\{([^{}]*)\}/g)) {
		const row = {};
		for (const f of fields) {
			const hit = m[1].match(new RegExp(`\\b${f}\\s*:\\s*(?:'((?:[^'\\\\]|\\\\.)*)'|\\[([^\\]]*)\\]|([-\\w.]+))`));
			if (!hit) continue;
			if (hit[2] !== undefined) row[f] = [...hit[2].matchAll(/'((?:[^'\\]|\\.)*)'/g)].map(x => x[1]);
			else row[f] = hit[1] ?? hit[3];
		}
		rows.push(row);
	}
	return rows;
}

/** A bare `export const NAME = ['a', 'b'];` list. */
function tsStrings(name) {
	return [...tsTable(name).matchAll(/'((?:[^'\\]|\\.)*)'/g)].map(m => m[1]);
}

const problems = [];
const report = (table, message) => problems.push(`${table}: ${message}`);

/** Both sides must hold the same name → value mapping. */
function compareMap(table, rust, ts) {
	const r = new Map(rust.map(([k, v]) => [k, String(v)]));
	const t = new Map(ts.map(([k, v]) => [k, String(v)]));
	for (const [k, v] of r) {
		if (!t.has(k)) report(table, `catalog.ts is missing ${JSON.stringify(k)} (Rust has it as ${v})`);
		else if (t.get(k) !== v) report(table, `${JSON.stringify(k)} is ${v} in Rust and ${t.get(k)} in TypeScript`);
	}
	for (const k of t.keys()) {
		if (!r.has(k)) report(table, `catalog.rs is missing ${JSON.stringify(k)} (TypeScript has it as ${t.get(k)})`);
	}
}

/** Same membership, values not compared. */
function compareSet(table, rust, ts, rustLabel = 'catalog.rs', tsLabel = 'catalog.ts') {
	const r = new Set(rust);
	const t = new Set(ts);
	for (const k of r) if (!t.has(k)) report(table, `${tsLabel} is missing ${JSON.stringify(k)}`);
	for (const k of t) if (!r.has(k)) report(table, `${rustLabel} is missing ${JSON.stringify(k)}`);
}

// --- Effects: the table the Custom effects feature exists because of --------
compareMap('MAGIC_EFFECTS', rustPairs('MAGIC_EFFECTS'), tsRows('MAGIC_EFFECTS', ['name', 'id']).map(r => [r.name, r.id]));

// The two sides model the unreachable shoot effects differently and both are
// right: Rust keeps CONST_ANI_FROSTARROW and CONST_ANI_MAGMASTAR out of
// SHOOT_EFFECTS entirely so `is_shoot_effect` rejects them exactly as the
// engine does, while the TS keeps them in the list carrying an `unreachable`
// note so the picker can grey them out instead of hiding them. So the id map is
// compared against the union, and the grey-out list against the Rust exclusion.
const tsShoot = tsRows('SHOOT_EFFECTS', ['name', 'id', 'unreachable']);
compareMap(
	'SHOOT_EFFECTS',
	[...rustPairs('SHOOT_EFFECTS'), ...rustStrings('SHOOT_EFFECTS_UNREACHABLE').map(n => [n, null])],
	tsShoot.map(r => [r.name, r.unreachable === undefined ? r.id : null])
);
compareSet(
	'SHOOT_EFFECTS_UNREACHABLE',
	rustStrings('SHOOT_EFFECTS_UNREACHABLE'),
	tsShoot.filter(r => r.unreachable !== undefined).map(r => r.name)
);

// --- Races and skulls: the numeric spelling is what the server writes -------
compareMap('RACES', rustPairs('RACES'), tsRows('RACES', ['value', 'numeric']).map(r => [r.value, r.numeric]));
compareMap('SKULLS', rustPairs('SKULLS'), tsRows('SKULLS', ['value', 'id']).map(r => [r.value, r.id]));

// --- Flags -----------------------------------------------------------------
compareSet('BOOL_FLAGS', rustStrings('BOOL_FLAGS'), tsRows('BOOLEAN_FLAGS', ['key']).map(r => r.key));
compareSet('NUM_FLAGS', rustStrings('NUM_FLAGS'), tsRows('NUMERIC_FLAGS', ['key']).map(r => r.key));

// --- Built-in spell names --------------------------------------------------
// Names only. The group headings are not shared vocabulary: Rust files these
// under four coarse groups that nothing but documentation reads — lint.rs never
// looks at them — while the TS splits the same spells across seven picker
// headings (Fields and Cosmetic are its own). Comparing them would report a
// difference that is the design.
compareSet('BUILTIN_SPELLS', rustPairs('BUILTIN_SPELLS').map(([n]) => n), tsRows('BUILTIN_SPELLS', ['name']).map(r => r.name));

// --- Condition ticks -------------------------------------------------------
// Every condition spell name in the TS carries its table's spellTick; the Rust
// keys the tick by the spell name directly. Flattened, they must agree.
const tsConditions = tsRows('CONDITION_TYPES', ['meleeAttr', 'spellNames', 'meleeTick', 'spellTick']);
compareMap(
	'CONDITION_SPELL_TICKS',
	rustPairs('CONDITION_SPELL_TICKS'),
	tsConditions.flatMap(r => (r.spellNames ?? []).map(n => [n, r.spellTick]))
);

const rsMelee = new Map(rustPairs('MELEE_CONDITIONS').map(([k, v]) => [k, String(v)]));
for (const r of tsConditions) {
	if (!rsMelee.has(r.meleeAttr)) report('MELEE_CONDITIONS', `catalog.rs has no melee condition ${JSON.stringify(r.meleeAttr)}`);
	else if (rsMelee.get(r.meleeAttr) !== String(r.meleeTick))
		report('MELEE_CONDITIONS', `${JSON.stringify(r.meleeAttr)} ticks ${rsMelee.get(r.meleeAttr)} in Rust and ${r.meleeTick} in TypeScript`);
}
compareSet('MELEE_CONDITION_ORDER', tsConditions.map(r => r.meleeAttr), tsStrings('MELEE_CONDITION_ORDER'),
	'CONDITION_TYPES', 'MELEE_CONDITION_ORDER');

// --- Engine profiles -------------------------------------------------------
// engine.rs is the authority on which engines exist; engine.ts decides which
// sections render for them. A profile in one and not the other is a view that
// cannot open or an engine that cannot be picked.
compareSet(
	'ENGINES',
	[...ENGINE_RS.matchAll(/\bkey:\s*"(\w+)"/g)].map(m => m[1]),
	[...ENGINE_TS.matchAll(/\bkey:\s*'(\w+)'/g)].map(m => m[1]),
	'engine.rs',
	'engine.ts'
);

if (problems.length) {
	console.error(`\n${problems.length} catalogue difference${problems.length === 1 ? '' : 's'}:\n`);
	for (const p of problems) console.error(`  ${p}`);
	console.error('\nSee AGENTS.md → Domain knowledge. Fix the side that is wrong — they are not ranked.');
	process.exit(1);
}
console.log('catalog.rs and catalog.ts agree; engine.rs and engine.ts offer the same engines.');
