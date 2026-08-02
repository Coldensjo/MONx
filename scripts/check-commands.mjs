// Reports drift between the shell's command table and the hotkey defaults.
//
// AGENTS.md: "Every shell action is a `Command`" — an id, a label, a group, a
// `run` and an `enabled`, in one table at the bottom of `Workspace.tsx`. The
// menus are built from it, `useHotkeys` dispatches through it, and the hotkey
// manager lists it. Three consumers, one table, and nothing checked.
//
//   bun run commands
//
// The hole this closes is the same shape as the other two gates': a command
// added without a `DEFAULT_BINDINGS` row compiles, renders, and works. It just
// arrives with no default chord and no way to notice — `HotkeysDialog` reads
// `bindings[id] ?? EMPTY`, so the row appears blank rather than breaking, and
// 33 of the other commands carry an explicit `bind(null)` precisely to say "no
// chord on purpose". A missing row and a deliberate `bind(null)` look identical
// to a user and mean different things to a reader.
//
// It matters more than it used to. MODULARITY.md §4.3 splits `Workspace.tsx`
// into hooks, and the command table is the most delicate thing in it: a command
// lost in that move breaks no build and fails no type check. It disappears from
// a menu, and the keystroke that used to work stops working.
//
// Parsed rather than imported, deliberately. The table is built inside the
// component, over closures that need a live workspace — there is nothing to
// import without rendering the app. Text is what is available, so the checks
// are the ones text can answer honestly: which ids exist on each side, and
// which chords collide.

import { readFileSync } from 'node:fs';

const WS = readFileSync('src/Workspace.tsx', 'utf8');
const HK = readFileSync('src/hotkeys.ts', 'utf8');

const problems = [];
const report = m => problems.push(m);

// --- The command table -----------------------------------------------------
// From `const commands: Command[] = [` to its matching bracket. The scan starts
// after the `= [`, not at the first `[` found, because `Command[]` in the type
// annotation would otherwise close the span before it opened.
function commandIds() {
	const start = WS.indexOf('const commands: Command[] = [');
	if (start < 0) {
		report('Workspace.tsx: no `const commands: Command[] = [` — has the table moved or been renamed?');
		return [];
	}
	let depth = 0;
	let end = -1;
	for (let i = WS.indexOf('= [', start) + 2; i < WS.length; i++) {
		if (WS[i] === '[') depth++;
		else if (WS[i] === ']' && --depth === 0) {
			end = i;
			break;
		}
	}
	if (end < 0) {
		report('Workspace.tsx: the command table has no closing bracket');
		return [];
	}
	return [...WS.slice(start, end).matchAll(/\bid:\s*'([a-z0-9-]+)'/g)].map(m => m[1]);
}

// --- DEFAULT_BINDINGS ------------------------------------------------------
function bindingRows() {
	const start = HK.indexOf('export const DEFAULT_BINDINGS');
	const end = HK.indexOf('};', start);
	if (start < 0 || end < 0) {
		report('hotkeys.ts: no `export const DEFAULT_BINDINGS` object');
		return [];
	}
	return [...HK.slice(start, end).matchAll(/^\t'([a-z0-9-]+)':\s*bind\(([^)]*)\)/gm)].map(m => ({
		id: m[1],
		chords: m[2]
			.split(',')
			.map(s => s.trim().replace(/^'|'$/g, ''))
			.filter(c => c && c !== 'null')
	}));
}

const ids = commandIds();
const rows = bindingRows();
const bound = new Set(rows.map(r => r.id));
const commands = new Set(ids);

// A duplicate id is worse than a missing one: both rows dispatch, the menus
// show two entries, and which `run` a keystroke reaches is whichever the
// lookup happens to find first.
const seen = new Set();
for (const id of ids) {
	if (seen.has(id)) report(`Workspace.tsx: duplicate command id '${id}'`);
	seen.add(id);
}

for (const id of ids) {
	if (!bound.has(id)) report(`hotkeys.ts: no DEFAULT_BINDINGS row for command '${id}' — add \`bind(null)\` if it is meant to ship unbound`);
}

for (const { id } of rows) {
	if (!commands.has(id)) report(`hotkeys.ts: DEFAULT_BINDINGS names '${id}', which is not a command in Workspace.tsx`);
}

// Two commands on one chord: `useHotkeys` dispatches the first match, so the
// other silently never fires. The hotkey manager reports conflicts for what the
// *user* binds; nothing was checking what ships.
const byChord = new Map();
for (const { id, chords } of rows) {
	for (const c of chords) {
		if (!byChord.has(c)) byChord.set(c, []);
		byChord.get(c).push(id);
	}
}
for (const [chord, owners] of byChord) {
	if (owners.length > 1) report(`hotkeys.ts: ${chord} is bound to ${owners.length} commands by default — ${owners.join(', ')}`);
}

// A table that parses to nothing passes every check above. Silent agreement is
// the failure this file exists to prevent, so it must not be able to fail that
// way itself — the same reason check-catalog.mjs reads the whole engine/ dir.
if (!problems.length && (ids.length === 0 || rows.length === 0)) {
	report(`parsed ${ids.length} commands and ${rows.length} binding rows — one side came back empty, so nothing was really compared`);
}

if (problems.length) {
	console.error(`\n${problems.length} command difference${problems.length === 1 ? '' : 's'}:\n`);
	for (const p of problems) console.error(`  ${p}`);
	console.error('\nSee AGENTS.md → UI notes. Every shell action is a Command, and every Command has a binding row.');
	process.exit(1);
}
console.log(`${ids.length} commands, each with a DEFAULT_BINDINGS row; no duplicate ids, no chord bound twice.`);
