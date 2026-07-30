import { invoke } from '@tauri-apps/api/core';
import { t } from 'i18next';
import { loadSetting } from './settings';
import { percentText } from './sections/Loot';

/** One loot row as a mark records it. */
export interface LootMark {
	label: string;
	chance: number;
}

/**
 * A monster reduced to what patch notes need. The digests are what make an edit
 * to loot, spells or flags visible at all — a summary carries none of that,
 * which is why the old export reported "no changes" after real work.
 */
export interface PatchMark {
	file: string;
	name: string;
	registered: boolean;
	raceid: number | null;
	experience: number;
	health: number;
	speed: number;
	digests: Record<string, string>;
	loot: Record<string, LootMark>;
}

/** The user's cut-off point: the corpus as it stood when they set it. */
export interface PatchCutoff {
	/** ISO timestamp of when it was set. */
	at: string;
	marks: PatchMark[];
}

/** Every monster as it stands on disk right now. */
export function patchMarks(): Promise<PatchMark[]> {
	return invoke<PatchMark[]>('patch_marks', {});
}

// ---------- Storage ----------

// Per workspace, and persisted: a cut-off that died with the process would put
// us back where we started — reopen the app, and the afternoon's edits are
// suddenly "no changes".
const key = (monstersPath: string) => `monx.patchCutoff.${monstersPath}`;

export function loadCutoff(monstersPath: string): PatchCutoff | null {
	try {
		const raw = loadSetting(key(monstersPath), null);
		if (!raw) return null;
		const c = JSON.parse(raw);
		if (typeof c?.at !== 'string' || !Array.isArray(c.marks)) return null;
		return c as PatchCutoff;
	} catch {
		return null;
	}
}

/**
 * Stamps `marks` as the new cut-off point. Returns null when storage refuses
 * it (quota, private mode) — a cut-off that silently failed to move would have
 * the user export the same notes twice, so the caller says so out loud.
 */
export function saveCutoff(monstersPath: string, marks: PatchMark[]): PatchCutoff | null {
	const cutoff: PatchCutoff = { at: new Date().toISOString(), marks };
	try {
		localStorage.setItem(key(monstersPath), JSON.stringify(cutoff));
		return cutoff;
	} catch {
		return null;
	}
}

// ---------- Diff ----------

export type ChangeKind = 'added' | 'updated' | 'removed';

export interface PatchChange {
	file: string;
	monster: string;
	kind: ChangeKind;
	/** One sentence per thing that changed, already naming the monster. */
	lines: string[];
}

/** Section digest → how a note names it. `loot` is handled on its own. */
const SECTIONS: [string, string][] = [
	['attacks', 'attacks'],
	['defenses', 'defenses'],
	['flags', 'flags'],
	['immunities', 'immunities'],
	['elements', 'elemental modifiers'],
	['defenseStats', 'armor and defense'],
	['look', 'look'],
	['voices', 'voices'],
	['summons', 'summons'],
	['misc', 'details']
];

const num = (n: number) => n.toLocaleString();

function lootLines(name: string, was: PatchMark, now: PatchMark): string[] {
	const lines: string[] = [];
	for (const [k, v] of Object.entries(now.loot)) {
		const before = was.loot[k];
		if (!before) lines.push(`- ${name} now drops ${v.label} (${percentText(v.chance)}).`);
		else if (before.chance !== v.chance) {
			lines.push(
				`- ${name}'s ${v.label} drop chance changed from ${percentText(before.chance)} to ${percentText(v.chance)}.`
			);
		}
	}
	for (const [k, v] of Object.entries(was.loot)) {
		if (!now.loot[k]) lines.push(`- ${name} no longer drops ${v.label}.`);
	}
	// The map is keyed by item, so a change to countmax, subtype, nesting or a
	// comment moves the digest without moving a single row. Say something rather
	// than nothing.
	if (lines.length === 0 && was.digests.loot !== now.digests.loot) {
		lines.push(`- Updated the loot of ${name}.`);
	}
	return lines;
}

/**
 * What changed between the cut-off point and now, grouped by monster. Files are
 * matched by path, so a rename shows up as a rename rather than as an add and a
 * remove.
 */
export function diffMarks(from: PatchMark[], to: PatchMark[]): PatchChange[] {
	const was = new Map(from.map(m => [m.file, m]));
	const changes: PatchChange[] = [];

	for (const m of to) {
		const b = was.get(m.file);
		if (!b) {
			changes.push({
				file: m.file,
				monster: m.name,
				kind: 'added',
				lines: [`- Added ${m.name} — ${num(m.health)} health, ${num(m.experience)} experience.`]
			});
			continue;
		}
		const lines: string[] = [];
		const name = m.name;
		if (b.name !== m.name) lines.push(`- Renamed ${b.name} to ${m.name}.`);
		if (b.health !== m.health) lines.push(`- ${name}'s health changed from ${num(b.health)} to ${num(m.health)}.`);
		if (b.experience !== m.experience)
			lines.push(`- ${name}'s experience changed from ${num(b.experience)} to ${num(m.experience)}.`);
		if (b.speed !== m.speed) lines.push(`- ${name}'s speed changed from ${num(b.speed)} to ${num(m.speed)}.`);
		if (b.raceid !== m.raceid)
			lines.push(`- Updated the raceid of ${name} from ${b.raceid ?? 'none'} to ${m.raceid ?? 'none'}.`);
		if (b.registered !== m.registered)
			lines.push(`- ${name} is ${m.registered ? 'now registered in' : 'no longer registered in'} monsters.xml.`);
		lines.push(...lootLines(name, b, m));
		for (const [k, sectionLabel] of SECTIONS) {
			if (b.digests[k] !== m.digests[k]) lines.push(`- Updated the ${sectionLabel} of ${name}.`);
		}
		if (lines.length > 0) changes.push({ file: m.file, monster: name, kind: 'updated', lines });
	}

	const seen = new Set(to.map(m => m.file));
	for (const b of from) {
		if (!seen.has(b.file)) {
			changes.push({ file: b.file, monster: b.name, kind: 'removed', lines: [`- Removed ${b.name}.`] });
		}
	}

	return changes.sort((a, b) => a.monster.localeCompare(b.monster));
}

export function countLines(changes: PatchChange[]): number {
	return changes.reduce((n, c) => n + c.lines.length, 0);
}

// ---------- Formatting ----------

export function formatWhen(iso: string): string {
	const d = new Date(iso);
	return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

/** "3 days ago" — how a cut-off point is worth reading at a glance.
 *
 *  Not a component, so it uses i18next's module-level `t`. Every caller renders
 *  inside a tree that subscribes with useTranslation(), so switching language
 *  re-runs this rather than leaving a stale phrase behind. */
export function relativeWhen(iso: string): string {
	const then = new Date(iso).getTime();
	if (Number.isNaN(then)) return '';
	const mins = Math.floor((Date.now() - then) / 60000);
	if (mins < 1) return t('just now');
	if (mins < 60) return t('{{count}} minute ago', { count: mins });
	const hours = Math.floor(mins / 60);
	if (hours < 24) return t('{{count}} hour ago', { count: hours });
	const days = Math.floor(hours / 24);
	return t('{{count}} day ago', { count: days });
}

const HEADINGS: Record<ChangeKind, string> = {
	added: 'New monsters',
	updated: 'Changes',
	removed: 'Removed'
};

export function toMarkdown(label: string, since: string, changes: PatchChange[]): string {
	const out = [`# Patch notes — ${label}`, '', `Changes since ${formatWhen(since)}.`, ''];
	for (const kind of ['added', 'updated', 'removed'] as ChangeKind[]) {
		const group = changes.filter(c => c.kind === kind);
		if (group.length === 0) continue;
		out.push(`## ${HEADINGS[kind]}`, '');
		for (const c of group) out.push(...c.lines);
		out.push('');
	}
	return `${out.join('\n')}\n`;
}
