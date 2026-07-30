// English carries only the entries i18next cannot derive from the key itself:
// the plural forms. Every other English string is its own key, so a plain
// `t('Open workspace')` resolves to "Open workspace" with no entry here.
//
// Suffixes are i18next's, selected through Intl.PluralRules: English uses
// `_one` and `_other`.
//
// The whole sentence is the plural unit, never a fragment. Several of these read
// oddly split apart ("{{count}} entry stops dropping entirely") precisely because
// the verb has to agree with the noun — languages with more than two forms
// cannot be served by gluing an "s" onto a word.

const en: Record<string, string> = {
	// --- Lints -------------------------------------------------------------
	'{{count}} error_one': '{{count}} error',
	'{{count}} error_other': '{{count}} errors',
	'{{count}} warning_one': '{{count}} warning',
	'{{count}} warning_other': '{{count}} warnings',
	'{{count}} silent-data-loss issue_one': '{{count}} silent-data-loss issue',
	'{{count}} silent-data-loss issue_other': '{{count}} silent-data-loss issues',
	'{{count}} lint_one': '{{count}} lint',
	'{{count}} lint_other': '{{count}} lints',
	'Fix all ({{count}})_one': 'Fix all ({{count}})',
	'Fix all ({{count}})_other': 'Fix all ({{count}})',
	'Fixed {{count}} lint_one': 'Fixed {{count}} lint',
	'Fixed {{count}} lint_other': 'Fixed {{count}} lints',
	'Fixed {{count}} lint across {{files}}_one': 'Fixed {{count}} lint across {{files}}',
	'Fixed {{count}} lint across {{files}}_other': 'Fixed {{count}} lints across {{files}}',
	'Fixed {{count}} lint, {{manual}} need a manual fix_one':
		'Fixed {{count}} lint, {{manual}} need a manual fix',
	'Fixed {{count}} lint, {{manual}} need a manual fix_other':
		'Fixed {{count}} lints, {{manual}} need a manual fix',
	'Exported {{count}} lint_one': 'Exported {{count}} lint',
	'Exported {{count}} lint_other': 'Exported {{count}} lints',

	// --- Generic units -----------------------------------------------------
	'{{count}} file_one': '{{count}} file',
	'{{count}} file_other': '{{count}} files',
	'{{count}} monster_one': '{{count}} monster',
	'{{count}} monster_other': '{{count}} monsters',
	'{{count}} item_one': '{{count}} item',
	'{{count}} item_other': '{{count}} items',
	'{{count}} entry_one': '{{count}} entry',
	'{{count}} entry_other': '{{count}} entries',
	'{{count}} tile_one': '{{count}} tile',
	'{{count}} tile_other': '{{count}} tiles',
	'{{count}} change_one': '{{count}} change',
	'{{count}} change_other': '{{count}} changes',
	'{{count}} spell_one': '{{count}} spell',
	'{{count}} spell_other': '{{count}} spells',
	'{{count}} drop_one': '{{count}} drop',
	'{{count}} drop_other': '{{count}} drops',
	'{{count}} line_one': '{{count}} line',
	'{{count}} line_other': '{{count}} lines',
	'{{count}} soul_one': '{{count}} soul',
	'{{count}} soul_other': '{{count}} souls',

	// --- Relative time -----------------------------------------------------
	'{{count}} minute ago_one': '{{count}} minute ago',
	'{{count}} minute ago_other': '{{count}} minutes ago',
	'{{count}} hour ago_one': '{{count}} hour ago',
	'{{count}} hour ago_other': '{{count}} hours ago',
	'{{count}} day ago_one': '{{count}} day ago',
	'{{count}} day ago_other': '{{count}} days ago',

	// --- Whole sentences whose verb agrees with the count ------------------
	'{{count}} field differs._one': '{{count}} field differs.',
	'{{count}} field differs._other': '{{count}} fields differ.',
	'{{count}} entry across {{files}} change._one': '{{count}} entry across {{files}} changes.',
	'{{count}} entry across {{files}} change._other': '{{count}} entries across {{files}} change.',
	'{{count}} entry stops dropping entirely._one': '{{count}} entry stops dropping entirely.',
	'{{count}} entry stops dropping entirely._other': '{{count}} entries stop dropping entirely.',
	'{{count}} entry never drops — see lints._one': '{{count}} entry never drops — see lints.',
	'{{count}} entry never drops — see lints._other': '{{count}} entries never drop — see lints.',
	'{{count}} item is unpriced and excluded from gp totals._one':
		'{{count}} item is unpriced and excluded from gp totals.',
	'{{count}} item is unpriced and excluded from gp totals._other':
		'{{count}} items are unpriced and excluded from gp totals.',
	'{{count}} monster matches, {{changed}}._one': '{{count}} monster matches, {{changed}}.',
	'{{count}} monster matches, {{changed}}._other': '{{count}} monsters match, {{changed}}.',
	'{{count}} of them adds or removes a node rather than changing one in place, so those files shift every line below the edit._one':
		'{{count}} of them adds or removes a node rather than changing one in place, so that file shifts every line below the edit.',
	'{{count}} of them adds or removes a node rather than changing one in place, so those files shift every line below the edit._other':
		'{{count}} of them add or remove a node rather than changing one in place, so those files shift every line below the edit.',
	'{{count}} was already an id with nothing saying what it is; it gains only the comment._one':
		'{{count}} was already an id with nothing saying what it is; it gains only the comment.',
	'{{count}} was already an id with nothing saying what it is; it gains only the comment._other':
		'{{count}} were already an id with nothing saying what it is; they gain only the comment.',
	'{{count}} name matches no items.xml entry and is left untouched — MONx never invents an item id. First: {{list}}._one':
		'{{count}} name matches no items.xml entry and is left untouched — MONx never invents an item id. First: {{list}}.',
	'{{count}} name matches no items.xml entry and is left untouched — MONx never invents an item id. First: {{list}}._other':
		'{{count}} names match no items.xml entry and are left untouched — MONx never invents an item id. First: {{list}}.',
	'{{count}} loot entry in {{files}} becomes id + a trailing comment naming the item._one':
		'{{count}} loot entry in {{files}} becomes id + a trailing comment naming the item.',
	'{{count}} loot entry in {{files}} becomes id + a trailing comment naming the item._other':
		'{{count}} loot entries in {{files}} become id + a trailing comment naming the item.',
	'{{count}} item in the tray._one': '{{count}} item in the tray.',
	'{{count}} item in the tray._other': '{{count}} items in the tray.',
	'Clear {{count}} item from Loot?_one': 'Clear {{count}} item from Loot?',
	'Clear {{count}} item from Loot?_other': 'Clear {{count}} items from Loot?',
	'Add {{count}} item to Loot_one': 'Add item to Loot',
	'Add {{count}} item to Loot_other': 'Add {{count}} items to Loot',
	'Added {{count}} item to favourites_one': 'Added {{count}} item to favourites',
	'Added {{count}} item to favourites_other': 'Added {{count}} items to favourites',
	'Removed {{count}} item from favourites_one': 'Removed {{count}} item from favourites',
	'Removed {{count}} item from favourites_other': 'Removed {{count}} items from favourites',
	'{{count}} tab has unsaved changes. Close and discard them?_one':
		'{{count}} tab has unsaved changes. Close and discard them?',
	'{{count}} tab has unsaved changes. Close and discard them?_other':
		'{{count}} tabs have unsaved changes. Close and discard them?',
	'Cut-off point set — {{count}} monster marked_one': 'Cut-off point set — {{count}} monster marked',
	'Cut-off point set — {{count}} monster marked_other': 'Cut-off point set — {{count}} monsters marked',
	'Exported {{count}} change_one': 'Exported {{count}} change',
	'Exported {{count}} change_other': 'Exported {{count}} changes',
	'{{count}} change across {{monsters}}._one': '{{count}} change across {{monsters}}.',
	'{{count}} change across {{monsters}}._other': '{{count}} changes across {{monsters}}.',
	'and {{count}} more not listed — they change too_one': 'and 1 more not listed — it changes too',
	'and {{count}} more not listed — they change too_other':
		'and {{count}} more not listed — they change too',
	'and {{count}} more entries not listed — they are scaled too_one':
		'and 1 more entry not listed — it is scaled too',
	'and {{count}} more entries not listed — they are scaled too_other':
		'and {{count}} more entries not listed — they are scaled too',
	'{{count}} tile hit_one': '{{count}} tile hit',
	'{{count}} tile hit_other': '{{count}} tiles hit',
	'Changed {{count}} monster_one': 'Changed {{count}} monster',
	'Changed {{count}} monster_other': 'Changed {{count}} monsters',
	'Scaled {{count}} loot chance across {{files}}_one': 'Scaled {{count}} loot chance across {{files}}',
	'Scaled {{count}} loot chance across {{files}}_other':
		'Scaled {{count}} loot chances across {{files}}',
	'Pinned {{count}} loot entry across {{files}}_one': 'Pinned {{count}} loot entry across {{files}}',
	'Pinned {{count}} loot entry across {{files}}_other': 'Pinned {{count}} loot entries across {{files}}',
	'Loaded “{{name}}” — {{count}} item_one': 'Loaded “{{name}}” — {{count}} item',
	'Loaded “{{name}}” — {{count}} item_other': 'Loaded “{{name}}” — {{count}} items',
	'Loaded “{{name}}” — {{count}} item, {{missing}} not in this workspace_one':
		'Loaded “{{name}}” — {{count}} item, {{missing}} not in this workspace',
	'Loaded “{{name}}” — {{count}} item, {{missing}} not in this workspace_other':
		'Loaded “{{name}}” — {{count}} items, {{missing}} not in this workspace'
};

export default en;
