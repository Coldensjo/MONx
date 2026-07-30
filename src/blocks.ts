import { createContext, useContext } from 'react';
import type { MonsterDoc } from './monster';
import type { SectionId } from './sections/section';
import { loadSetting, saveSetting } from './settings';

/**
 * Copying a block of one monster onto another. The doc model makes the payload
 * trivial — it is the section's own slice of the document as JSON — so the
 * clipboard is that slice plus enough provenance to say what is on it.
 *
 * It lives in `localStorage`, not in React state: a copy is worth keeping
 * across a restart, and the pair of monsters is often opened in two sittings.
 */

/** Section ids that own a slice worth copying. */
export const BLOCK_KINDS = [
	'attacks',
	'defenses',
	'resistances',
	'loot',
	'summons',
	'voices'
] as const;

export type BlockKind = (typeof BLOCK_KINDS)[number];

export function isBlockKind(id: SectionId): id is BlockKind {
	return (BLOCK_KINDS as readonly string[]).includes(id);
}

export interface Block {
	kind: BlockKind;
	/** The monster it came from, for the paste button's tooltip. */
	from: string;
	/** How many rows it carries — spells, drops, lines. */
	count: number;
	/** The section's slice of the document, verbatim. */
	data: unknown;
}

const KEY = 'monx.blockClipboard';

export function loadBlock(): Block | null {
	try {
		const raw = loadSetting(KEY, null);
		if (!raw) return null;
		const b = JSON.parse(raw) as Block;
		if (!b || !(BLOCK_KINDS as readonly string[]).includes(b.kind) || b.data === undefined) return null;
		return b;
	} catch {
		return null;
	}
}

export function saveBlock(block: Block): void {
	saveSetting(KEY, JSON.stringify(block));
}

/** What the label says the block is, in the buttons and the toast. */
export const BLOCK_LABEL: Record<BlockKind, string> = {
	attacks: 'attacks',
	defenses: 'defenses',
	resistances: 'resistances',
	loot: 'loot',
	summons: 'summons',
	voices: 'voices'
};

/** The clipboard payload for one section of a document. */
export function readBlock(doc: MonsterDoc, kind: BlockKind): Block {
	const slice = (): { data: unknown; count: number } => {
		switch (kind) {
			case 'attacks':
				return { data: doc.attacks, count: doc.attacks.length };
			// Armor and defense ride with the defensive spells: they are the same
			// `<defenses>` node in the file, and copying the spells without the
			// numbers would land a caster's defenses on a melee monster's stats.
			case 'defenses':
				return {
					data: { defenses: doc.defenses, defenseStats: doc.defenseStats },
					count: doc.defenses.length
				};
			case 'resistances':
				return {
					data: { immunities: doc.immunities, elements: doc.elements },
					count: Object.keys(doc.immunities).length + Object.keys(doc.elements).length
				};
			case 'loot':
				return { data: doc.loot, count: doc.loot.length };
			case 'summons':
				return { data: doc.summons, count: doc.summons.entries.length };
			case 'voices':
				return { data: doc.voices, count: doc.voices.lines.length };
		}
	};
	const { data, count } = slice();
	// Structured-cloned through JSON so the clipboard can never alias the
	// document it came from — a later edit must not reach back into the copy.
	return { kind, from: doc.name, count, data: JSON.parse(JSON.stringify(data)) };
}

export type PasteMode = 'replace' | 'merge';

/**
 * The document patch a paste produces. `merge` appends rows (and, for the maps
 * in resistances, lets the block win key by key) so a block can be layered onto
 * a monster that already has its own; `replace` swaps the section wholesale.
 *
 * Returns null when the block does not fit the section, which is the only
 * failure mode — the payload is the model's own shape, so nothing else can go
 * wrong at paste time.
 */
export function applyBlock(doc: MonsterDoc, block: Block, mode: PasteMode): Partial<MonsterDoc> | null {
	const d = block.data as never;
	try {
		switch (block.kind) {
			case 'attacks': {
				const rows = d as MonsterDoc['attacks'];
				return { attacks: mode === 'replace' ? rows : [...doc.attacks, ...rows] };
			}
			case 'defenses': {
				const { defenses, defenseStats } = d as Pick<MonsterDoc, 'defenses' | 'defenseStats'>;
				return mode === 'replace'
					? { defenses, defenseStats }
					: // Merging keeps the target's own armor and defense: those are its
						// balance, and the spells are what was asked for.
						{ defenses: [...doc.defenses, ...defenses] };
			}
			case 'resistances': {
				const { immunities, elements } = d as Pick<MonsterDoc, 'immunities' | 'elements'>;
				return mode === 'replace'
					? { immunities, elements }
					: {
							immunities: { ...doc.immunities, ...immunities },
							elements: { ...doc.elements, ...elements }
						};
			}
			case 'loot': {
				const rows = d as MonsterDoc['loot'];
				return { loot: mode === 'replace' ? rows : [...doc.loot, ...rows] };
			}
			case 'summons': {
				const s = d as MonsterDoc['summons'];
				return mode === 'replace'
					? { summons: s }
					: {
							summons: {
								// The higher cap wins — merging two summon lists under the
								// lower one would silently disable half of them (§14).
								maxSummons: Math.max(doc.summons.maxSummons, s.maxSummons),
								entries: [...doc.summons.entries, ...s.entries]
							}
						};
			}
			case 'voices': {
				const v = d as MonsterDoc['voices'];
				return mode === 'replace'
					? { voices: v }
					: {
							voices: {
								...doc.voices,
								lines: [...doc.voices.lines, ...v.lines],
								// A pacifist line the target lacks is worth carrying over;
								// one it already has is its own (§5.1).
								pacifist: doc.voices.pacifist ?? v.pacifist,
								leash: doc.voices.leash ?? v.leash
							}
						};
			}
		}
	} catch {
		return null;
	}
}

/** What a section header needs to offer copy and paste. */
export interface BlockControls {
	clipboard: Block | null;
	copy: (kind: BlockKind) => void;
	paste: (kind: BlockKind, mode: PasteMode) => void;
	readOnly: boolean;
}

/** Null outside the editor — fixtures and tests render sections without it. */
export const BlockContext = createContext<BlockControls | null>(null);

export function useBlocks(): BlockControls | null {
	return useContext(BlockContext);
}
