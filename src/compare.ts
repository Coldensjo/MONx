import type { LootEntry, MonsterDoc, SpellBlock } from './monster';
import { percentText } from './sections/Loot';
import { BOOLEAN_FLAGS, NUMERIC_FLAGS } from './catalog';

/**
 * Two monsters, field by field. The balance question is almost always relative
 * — "is this in line with the other level-40 spawns?" — so what matters is the
 * delta, not either column on its own.
 *
 * Everything is rendered to text first and compared as text. A row is the same
 * when both sides read the same, which is exactly what the eye would conclude
 * from the two columns.
 */

export interface CompareRow {
	label: string;
	a: string;
	b: string;
	same: boolean;
	/** Signed percentage change, when both sides are numbers and A is non-zero. */
	delta: number | null;
}

export interface CompareGroup {
	title: string;
	rows: CompareRow[];
}

const ABSENT = '—';

function row(label: string, a: string, b: string): CompareRow {
	const na = Number(a.replace(/[,%]/g, ''));
	const nb = Number(b.replace(/[,%]/g, ''));
	const delta =
		Number.isFinite(na) && Number.isFinite(nb) && na !== 0 && a !== ABSENT && b !== ABSENT
			? ((nb - na) / Math.abs(na)) * 100
			: null;
	return { label, a, b, same: a === b, delta };
}

const num = (n: number) => n.toLocaleString();
const text = (v: string | null | undefined) => (v === null || v === undefined || v === '' ? ABSENT : v);

/** Union of two records' keys, in a stable order. */
function keys(a: object, b: object): string[] {
	return [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
}

/** A spell as one line: what it throws, how often, and how hard. */
function spellText(s: SpellBlock): string {
	const bits = [s.name ?? s.script ?? s.kind];
	bits.push(`${s.interval}ms`, `${s.chance}%`);
	if (s.min !== 0 || s.max !== 0) bits.push(`${num(s.min)}–${num(s.max)}`);
	if (s.range) bits.push(`range ${s.range}`);
	return bits.join(' · ');
}

function spellRows(title: string, a: SpellBlock[], b: SpellBlock[]): CompareGroup {
	// Keyed by name and occurrence, so a monster with two "melee" blocks lines
	// its second one up against the other's second, not against nothing.
	const key = (s: SpellBlock, seen: Map<string, number>) => {
		const base = s.name ?? s.script ?? s.kind;
		const n = (seen.get(base) ?? 0) + 1;
		seen.set(base, n);
		return n === 1 ? base : `${base} (${n})`;
	};
	const index = (list: SpellBlock[]) => {
		const seen = new Map<string, number>();
		return new Map(list.map(s => [key(s, seen), spellText(s)]));
	};
	const ia = index(a);
	const ib = index(b);
	return {
		title,
		rows: keys(Object.fromEntries(ia), Object.fromEntries(ib)).map(k =>
			row(k, ia.get(k) ?? ABSENT, ib.get(k) ?? ABSENT)
		)
	};
}

/** Loot flattened to `label → chance ×count`, containers included. */
function lootIndex(entries: LootEntry[], out = new Map<string, string>()): Map<string, string> {
	for (const e of entries) {
		const label = e.comment || e.name || (e.id !== null ? `id ${e.id}` : 'entry');
		out.set(label, `${percentText(e.chance)}${e.countmax > 1 ? ` ×${e.countmax}` : ''}`);
		lootIndex(e.children, out);
	}
	return out;
}

export function compareDocs(a: MonsterDoc, b: MonsterDoc): CompareGroup[] {
	const flagText = (d: MonsterDoc, key: string): string => {
		const v = d.flags[key];
		if (v === undefined) return ABSENT;
		return typeof v === 'boolean' ? (v ? 'yes' : 'no') : String(v);
	};

	const lootA = lootIndex(a.loot);
	const lootB = lootIndex(b.loot);

	const groups: CompareGroup[] = [
		{
			title: 'Identity',
			rows: [
				row('File', a.file, b.file),
				row('Race id', text(a.raceid?.toString()), text(b.raceid?.toString())),
				row('Registered', a.registered ? 'yes' : 'no', b.registered ? 'yes' : 'no'),
				row('Blood', text(a.race), text(b.race)),
				row('Species', text(a.species), text(b.species)),
				row('Skull', a.skull, b.skull),
				row('Script', text(a.script), text(b.script))
			]
		},
		{
			title: 'Combat',
			rows: [
				row('Experience', num(a.experience), num(b.experience)),
				row('Health', num(a.health.max), num(b.health.max)),
				row('Speed', num(a.speed), num(b.speed)),
				row('Armor', num(a.defenseStats.armor), num(b.defenseStats.armor)),
				row('Defense', num(a.defenseStats.defense), num(b.defenseStats.defense)),
				row('Mana cost', num(a.manacost), num(b.manacost)),
				row('Target change', `${a.targetchange.interval}ms · ${a.targetchange.chance}%`, `${b.targetchange.interval}ms · ${b.targetchange.chance}%`)
			]
		},
		{
			title: 'Flags',
			rows: [...BOOLEAN_FLAGS, ...NUMERIC_FLAGS]
				.map(f => row(f.label, flagText(a, f.key), flagText(b, f.key)))
				// A flag neither monster declares is not a difference, and listing
				// thirty of those would bury the ones that are.
				.filter(r => r.a !== ABSENT || r.b !== ABSENT)
		},
		{
			title: 'Immunities',
			rows: keys(a.immunities, b.immunities).map(k =>
				row(k, a.immunities[k] === undefined ? ABSENT : a.immunities[k] ? 'yes' : 'no', b.immunities[k] === undefined ? ABSENT : b.immunities[k] ? 'yes' : 'no')
			)
		},
		{
			title: 'Elements',
			rows: keys(a.elements, b.elements).map(k =>
				row(k, a.elements[k] === undefined ? ABSENT : `${a.elements[k]}%`, b.elements[k] === undefined ? ABSENT : `${b.elements[k]}%`)
			)
		},
		spellRows('Attacks', a.attacks, b.attacks),
		spellRows('Defenses', a.defenses, b.defenses),
		{
			title: 'Loot',
			rows: keys(Object.fromEntries(lootA), Object.fromEntries(lootB)).map(k =>
				row(k, lootA.get(k) ?? ABSENT, lootB.get(k) ?? ABSENT)
			)
		},
		{
			title: 'Summons',
			rows: [
				row('Max summons', num(a.summons.maxSummons), num(b.summons.maxSummons)),
				...keys(
					Object.fromEntries(a.summons.entries.map(s => [s.name, s])),
					Object.fromEntries(b.summons.entries.map(s => [s.name, s]))
				).map(name => {
					const sa = a.summons.entries.find(s => s.name === name);
					const sb = b.summons.entries.find(s => s.name === name);
					const show = (s: typeof sa) => (s ? `${s.interval}ms · ${s.chance}% · max ${s.max}` : ABSENT);
					return row(name, show(sa), show(sb));
				})
			]
		},
		{
			title: 'Voices',
			rows: [
				row('Interval', `${a.voices.interval}ms`, `${b.voices.interval}ms`),
				row('Chance', `${a.voices.chance}%`, `${b.voices.chance}%`),
				row('Lines', num(a.voices.lines.length), num(b.voices.lines.length)),
				row('Pacifist line', text(a.voices.pacifist), text(b.voices.pacifist)),
				row('Leash line', text(a.voices.leash), text(b.voices.leash))
			]
		}
	];

	return groups.filter(g => g.rows.length > 0);
}

export function countDifferences(groups: CompareGroup[]): number {
	return groups.reduce((n, g) => n + g.rows.filter(r => !r.same).length, 0);
}
