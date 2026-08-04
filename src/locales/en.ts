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
	// --- Not English text, so they need a real entry ------------------------
	// Compass initials for the outfit preview. The letter is language-specific
	// (Polish ends on Z for zachód, Portuguese on O for oeste), so the key is a
	// name rather than the letter itself.
	'compass-N': 'N',
	'compass-E': 'E',
	'compass-S': 'S',
	'compass-W': 'W',

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

	// --- Fix preview -------------------------------------------------------
	'{{count}} fix_one': '{{count}} fix',
	'{{count}} fix_other': '{{count}} fixes',
	'Apply {{count}} fix_one': 'Apply {{count}} fix',
	'Apply {{count}} fix_other': 'Apply {{count}} fixes',
	'{{count}} fix in {{files}} — expand a file to see exactly what changes._one':
		'{{count}} fix in {{files}} — expand a file to see exactly what changes.',
	'{{count}} fix in {{files}} — expand a file to see exactly what changes._other':
		'{{count}} fixes in {{files}} — expand a file to see exactly what changes.',
	'{{count}} needs a manual fix and is left alone._one': '{{count}} needs a manual fix and is left alone.',
	'{{count}} needs a manual fix and is left alone._other': '{{count}} need a manual fix and are left alone.',
	'{{count}} file has unsaved changes and is left out — save it first. First: {{list}}._one':
		'{{count}} file has unsaved changes and is left out — save it first. First: {{list}}.',
	'{{count}} file has unsaved changes and is left out — save it first. First: {{list}}._other':
		'{{count}} files have unsaved changes and are left out — save them first. First: {{list}}.',
	'{{count}} unchanged line_one': '{{count}} unchanged line',
	'{{count}} unchanged line_other': '{{count}} unchanged lines',

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
	'Remove all {{count}} loot entry from {{monster}}?_one': 'Remove the only loot entry from {{monster}}?',
	'Remove all {{count}} loot entry from {{monster}}?_other':
		'Remove all {{count}} loot entries from {{monster}}?',
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
		'Loaded “{{name}}” — {{count}} items, {{missing}} not in this workspace',

	// --- Create wizard -----------------------------------------------------
	'Everything from here is drawn from these {{count}}._one': 'Everything from here is drawn from this one.',
	'Everything from here is drawn from these {{count}}._other':
		'Everything from here is drawn from these {{count}}.',
	'{{count}} monsters — too few to draw a norm from_one':
		'{{count}} monster — too few to draw a norm from',
	'{{count}} monsters — too few to draw a norm from_other':
		'{{count}} monsters — too few to draw a norm from',
	'The band, the resistances, the melee and the drops come off all {{count}}; the outfit, corpse and race come off {{lead}}._one':
		'Everything comes off {{lead}}.',
	'The band, the resistances, the melee and the drops come off all {{count}}; the outfit, corpse and race come off {{lead}}._other':
		'The band, the resistances, the melee and the drops come off all {{count}}; the outfit, corpse and race come off {{lead}}.',
	'{{count}} monster summons it_one': '{{count}} monster summons it',
	'{{count}} monster summons it_other': '{{count}} monsters summon it',
	'{{count}} of them say it_one': '{{count}} of them says it',
	'{{count}} of them say it_other': '{{count}} of them say it',
	'The middle of what {{count}} named monsters resist. 100 is immunity; negative takes extra._one':
		'What {{count}} named monster resists. 100 is immunity; negative takes extra.',
	'The middle of what {{count}} named monsters resist. 100 is immunity; negative takes extra._other':
		'The middle of what {{count}} named monsters resist. 100 is immunity; negative takes extra.',

	// --- Balance overview --------------------------------------------------
	'{{count}} monster with experience above zero, grouped by what a kill is worth. Medians are this corpus’s own — nothing here is compared against another server._one':
		'{{count}} monster with experience above zero, grouped by what a kill is worth. Medians are this corpus’s own — nothing here is compared against another server.',
	'{{count}} monster with experience above zero, grouped by what a kill is worth. Medians are this corpus’s own — nothing here is compared against another server._other':
		'{{count}} monsters with experience above zero, grouped by what a kill is worth. Medians are this corpus’s own — nothing here is compared against another server.',
	'{{count}} monster left out_one': '{{count}} monster left out',
	'{{count}} monster left out_other': '{{count}} monsters left out',

	// --- Filtered monsters -------------------------------------------------
	'{{count}} monster is filtered out of this corpus everywhere in the app, and stays that way after a restart._one':
		'{{count}} monster is filtered out of this corpus everywhere in the app, and stays that way after a restart.',
	'{{count}} monster is filtered out of this corpus everywhere in the app, and stays that way after a restart._other':
		'{{count}} monsters are filtered out of this corpus everywhere in the app, and stay that way after a restart.',

	// --- Saving ------------------------------------------------------------
	'Saved {{count}} file_one': 'Saved {{count}} file',
	'Saved {{count}} file_other': 'Saved {{count}} files',
	'Wrote {{count}} file, then failed on {{error}}_one': 'Wrote {{count}} file, then failed on {{error}}',
	'Wrote {{count}} file, then failed on {{error}}_other': 'Wrote {{count}} files, then failed on {{error}}',
	'Wrote {{count}} file, then failed on {{failures}} more (first: {{error}})_one':
		'Wrote {{count}} file, then failed on {{failures}} more (first: {{error}})',
	'Wrote {{count}} file, then failed on {{failures}} more (first: {{error}})_other':
		'Wrote {{count}} files, then failed on {{failures}} more (first: {{error}})',
	'{{count}} file has been changed by another program and also has unsaved changes here. Loading discards your edits; keeping them means the next save overwrites what is on disk._one':
		'{{count}} file has been changed by another program and also has unsaved changes here. Loading discards your edits; keeping them means the next save overwrites what is on disk.',
	'{{count}} file has been changed by another program and also has unsaved changes here. Loading discards your edits; keeping them means the next save overwrites what is on disk._other':
		'{{count}} files have been changed by another program and also have unsaved changes here. Loading discards your edits; keeping them means the next save overwrites what is on disk.',

	// --- Items and loot ----------------------------------------------------
	'{{count}} charge_one': '{{count}} charge',
	'{{count}} charge_other': '{{count}} charges',
	'{{count}} slot_one': '{{count}} slot',
	'{{count}} slot_other': '{{count}} slots',
	'Added {{count}} item to Loot_one': 'Added {{count}} item to Loot',
	'Added {{count}} item to Loot_other': 'Added {{count}} items to Loot',
	'Added {{count}} loot entry to {{monster}}_one': 'Added {{count}} loot entry to {{monster}}',
	'Added {{count}} loot entry to {{monster}}_other': 'Added {{count}} loot entries to {{monster}}',
	'Add {{count}} item to favourites_one': 'Add {{count}} item to favourites',
	'Add {{count}} item to favourites_other': 'Add {{count}} items to favourites',
	'Remove {{count}} item from favourites_one': 'Remove {{count}} item from favourites',
	'Remove {{count}} item from favourites_other': 'Remove {{count}} items from favourites',
	'Add {{count}} item to loot for {{monster}}_one': 'Add {{count}} item to loot for {{monster}}',
	'Add {{count}} item to loot for {{monster}}_other': 'Add {{count}} items to loot for {{monster}}',
	'Add {{count}} item to the new monster_one': 'Add {{count}} item to the new monster',
	'Add {{count}} item to the new monster_other': 'Add {{count}} items to the new monster',

	// --- Tools -------------------------------------------------------------
	'{{count}} monster matches — none of them change at these settings._one':
		'{{count}} monster matches — it does not change at these settings.',
	'{{count}} monster matches — none of them change at these settings._other':
		'{{count}} monsters match — none of them change at these settings.',
	'Exported {{count}} change — cut-off point moved to now_one': 'Exported {{count}} change — cut-off point moved to now',
	'Exported {{count}} change — cut-off point moved to now_other': 'Exported {{count}} changes — cut-off point moved to now',
	'{{count}} of them are ambiguous names the server drops today._one':
		'{{count}} of them is an ambiguous name the server drops today.',
	'{{count}} of them are ambiguous names the server drops today._other':
		'{{count}} of them are ambiguous names the server drops today.',
	'{{count}} tile away — drag to move_one': '{{count}} tile away — drag to move',
	'{{count}} tile away — drag to move_other': '{{count}} tiles away — drag to move',
	'Across {{count}} runs, min / median / max_one': 'Across {{count}} run, min / median / max',
	'Across {{count}} runs, min / median / max_other': 'Across {{count}} runs, min / median / max',
	'Across {{count}} sessions, min / median / max_one': 'Across {{count}} session, min / median / max',
	'Across {{count}} sessions, min / median / max_other': 'Across {{count}} sessions, min / median / max',
	'Log capped at the first {{count}} kills._one': 'Log capped at the first kill.',
	'Log capped at the first {{count}} kills._other': 'Log capped at the first {{count}} kills.',

	// --- Balance and custom effects ----------------------------------------
	'Only {{count}} monster in this band — too few for a median to mean anything, so nothing is called unusual._one':
		'Only {{count}} monster in this band — too few for a median to mean anything, so nothing is called unusual.',
	'Only {{count}} monster in this band — too few for a median to mean anything, so nothing is called unusual._other':
		'Only {{count}} monsters in this band — too few for a median to mean anything, so nothing is called unusual.',
	'Nothing declared yet. {{engine}} ships {{count}} of these on its own._one':
		'Nothing declared yet. {{engine}} ships {{count}} of these on its own.',
	'Nothing declared yet. {{engine}} ships {{count}} of these on its own._other':
		'Nothing declared yet. {{engine}} ships {{count}} of these on its own.'
};

export default en;
