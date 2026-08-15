// Item-browsing support logic shared by more than one item UI (the reference
// grid, the sidebar list, the detail panel) — kept out of `monster.ts`, which
// is types and thin invoke/URL wrappers only.

import type { TFunction } from 'i18next';
import { n } from './i18n';
import { corpseDecays, isCorpse, type ItemInfo } from './monster';
import type { Filter } from './ThingBrowser';

/** Multi-line summary from the raw items.xml attributes — weight is in
 *  hundredths of an oz, as the client displays it.
 *  `atk`/`def`/`arm` and the weaponType/slotType words are the items.xml
 *  vocabulary itself, so they stay as the file spells them; only the prose
 *  around them is translated. */
export function itemSummaryLines(t: TFunction, i: ItemInfo): string[] {
	const a = i.attributes;
	const lines = [`${i.name || `#${i.serverId}`}  (#${i.serverId})`];
	const combat: string[] = [];
	if (a.attack) combat.push(`atk ${a.attack}`);
	if (a.defense)
		combat.push(`def ${a.defense}${a.extradef ? ` ${Number(a.extradef) >= 0 ? '+' : ''}${a.extradef}` : ''}`);
	if (a.armor) combat.push(`arm ${a.armor}`);
	if (a.weaponType) combat.push(a.weaponType);
	if (a.slotType) combat.push(a.slotType);
	if (combat.length > 0) lines.push(combat.join(' · '));
	const misc: string[] = [];
	if (a.weight) misc.push(t('{{weight}} oz', { weight: n(Number(a.weight) / 100) }));
	if (a.worth) misc.push(t('worth {{worth}} gp', { worth: n(Number(a.worth)) }));
	if (a.charges) misc.push(t('{{count}} charge', { count: Number(a.charges) }));
	if (a.containerSize) misc.push(t('{{count}} slot', { count: Number(a.containerSize) }));
	if (a.duration) misc.push(t('decays in {{seconds}}s', { seconds: a.duration }));
	if (misc.length > 0) lines.push(misc.join(' · '));
	if (a.description) lines.push(a.description);
	return lines;
}

/** Predicates over the raw items.xml attributes (`corpseType` is what the
 *  backend's own corpses_only filter keys on). Filters AND together, as in
 *  SPRx — vocabulary from the corpus: weaponType sword/club/axe/distance/
 *  wand/shield/ammunition, slotType head/body/legs/feet/ring/necklace/
 *  backpack/rune/trinket/two-handed.
 *  `label` and `section` are i18n keys; the caller translates them where it
 *  renders the popover, so this table stays a plain list of predicates. The
 *  `key`s are storage and never translated. */
export function buildItemFilters(
	favourites: Set<number>,
	dropped: Set<number>,
	itemFrames: Map<number, number>
): Filter<ItemInfo>[] {
	const attr = (key: string) => (i: ItemInfo) => key in i.attributes;
	const attrIs = (key: string, value: string) => (i: ItemInfo) => i.attributes[key] === value;
	const special = 'Special';
	const kind = 'Kind';
	const weapons = 'Weapons';
	const slot = 'Slot';
	const props = 'Properties';
	return [
		{
			key: 'favourite',
			label: 'Favourites',
			section: special,
			test: (i: ItemInfo) => favourites.has(i.serverId)
		},
		{ key: 'pickupable', label: 'Pickupable', section: special, test: (i: ItemInfo) => i.pickupable },
		{ key: 'corpses', label: 'Show corpses', section: special, test: isCorpse },
		{
			// The corpses that actually rot, which is what a monster's <look
			// corpse=""> almost always wants. The rule itself is `corpseDecays` in
			// monster.ts, because the create wizard's drawn corpse obeys it too and
			// a default that disagrees with the filter it opens on is a default
			// nobody can explain. This is the filter both corpse pickers open on;
			// the plain one above is still there for the static corpses, which do
			// exist and are occasionally what you want.
			key: 'corpses-decay',
			label: 'Show corpses with decay',
			section: special,
			test: corpseDecays
		},
		{
			// Loot only — an item used as a corpse or worn as a typeex look still
			// counts as undropped, which is the question being asked.
			key: 'undropped',
			label: 'Not dropped by any monster',
			section: special,
			test: (i: ItemInfo) => !dropped.has(i.serverId)
		},

		{ key: 'stackable', label: 'Stackable', section: kind, test: (i: ItemInfo) => i.stackable },
		{ key: 'container', label: 'Container', section: kind, test: (i: ItemInfo) => i.container },
		{
			key: 'weapon',
			label: 'Weapon (any)',
			section: kind,
			test: (i: ItemInfo) =>
				['sword', 'club', 'axe', 'distance', 'wand', 'fist'].includes(i.attributes.weaponType ?? '')
		},
		{ key: 'shield', label: 'Shield', section: kind, test: attrIs('weaponType', 'shield') },
		{ key: 'ammunition', label: 'Ammunition', section: kind, test: attrIs('weaponType', 'ammunition') },
		{ key: 'rune', label: 'Rune', section: kind, test: attrIs('slotType', 'rune') },
		{ key: 'fluid', label: 'Fluid container', section: kind, test: attr('fluidSource') },

		{ key: 'sword', label: 'Sword', section: weapons, test: attrIs('weaponType', 'sword') },
		{ key: 'club', label: 'Club', section: weapons, test: attrIs('weaponType', 'club') },
		{ key: 'axe', label: 'Axe', section: weapons, test: attrIs('weaponType', 'axe') },
		{ key: 'distance', label: 'Distance', section: weapons, test: attrIs('weaponType', 'distance') },
		{ key: 'wand', label: 'Wand', section: weapons, test: attrIs('weaponType', 'wand') },

		{ key: 'slot-head', label: 'Helmet', section: slot, test: attrIs('slotType', 'head') },
		{ key: 'slot-body', label: 'Armor (body)', section: slot, test: attrIs('slotType', 'body') },
		{ key: 'slot-legs', label: 'Legs', section: slot, test: attrIs('slotType', 'legs') },
		{ key: 'slot-feet', label: 'Boots', section: slot, test: attrIs('slotType', 'feet') },
		{ key: 'slot-ring', label: 'Ring', section: slot, test: attrIs('slotType', 'ring') },
		{ key: 'slot-necklace', label: 'Necklace', section: slot, test: attrIs('slotType', 'necklace') },
		{ key: 'slot-trinket', label: 'Trinket', section: slot, test: attrIs('slotType', 'trinket') },
		{ key: 'slot-backpack', label: 'Backpack slot', section: slot, test: attrIs('slotType', 'backpack') },
		{ key: 'two-handed', label: 'Two-handed', section: slot, test: attrIs('slotType', 'two-handed') },

		{ key: 'has-attack', label: 'Has attack', section: props, test: attr('attack') },
		{ key: 'has-defense', label: 'Has defense', section: props, test: attr('defense') },
		{ key: 'has-armor', label: 'Has armor', section: props, test: attr('armor') },
		{ key: 'speed', label: 'Speed bonus', section: props, test: attr('speed') },
		{ key: 'charged', label: 'Has charges', section: props, test: attr('charges') },
		{
			key: 'decays',
			label: 'Decays',
			section: props,
			test: (i: ItemInfo) => 'duration' in i.attributes || 'decayTo' in i.attributes
		},
		{
			key: 'writeable',
			label: 'Writable',
			section: props,
			test: (i: ItemInfo) => 'writeable' in i.attributes || 'maxTextLen' in i.attributes
		},
		{ key: 'blocks', label: 'Blocks projectiles', section: props, test: attr('blockprojectile') },
		{ key: 'field', label: 'Field (fire/energy/…)', section: props, test: attr('field') },
		{ key: 'worth', label: 'Has worth', section: props, test: attr('worth') },
		{ key: 'described', label: 'Has description', section: props, test: attr('description') },
		{ key: 'ambiguous', label: 'Ambiguous name', section: props, test: (i: ItemInfo) => i.ambiguousName },
		{
			key: 'animated',
			label: 'Animated',
			section: props,
			test: (i: ItemInfo) => (itemFrames.get(i.clientId) ?? 1) > 1
		}
	];
}
