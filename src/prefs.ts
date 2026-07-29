// User preferences for the editor's tab strip: which tabs exist, and which one
// a freshly opened monster lands on. Persisted under `monx.prefs`, read through
// settings.ts like every other `monx.*` key.

import { loadSetting, saveSetting } from './settings';
import { SECTION_IDS, type SectionId } from './sections/section';

const PREFS_KEY = 'monx.prefs';

export interface Prefs {
	/** The tab a monster opens on. Scrolled to without animation — this is where
	 *  the work starts, not somewhere the user asked to be taken. */
	defaultSection: SectionId;
	/** Tabs shown in the editor. Rendered in SECTION_IDS order, not this one. */
	visibleSections: SectionId[];
}

/** Pacifist & Events: two Ironcore strings and the creaturescript list, both
 *  empty on most monsters, so the tab stays out of the way until asked for. */
const HIDDEN_BY_DEFAULT: readonly SectionId[] = ['events'];

export const DEFAULT_PREFS: Prefs = {
	defaultSection: 'identity',
	visibleSections: SECTION_IDS.filter(id => !HIDDEN_BY_DEFAULT.includes(id))
};

const isSection = (id: unknown): id is SectionId =>
	typeof id === 'string' && (SECTION_IDS as readonly string[]).includes(id);

/**
 * Unknown or dropped section ids are discarded rather than carried, so a prefs
 * blob written by an older build cannot hide a tab that no longer exists or
 * point the default at one. An empty visible list falls back to the defaults —
 * an editor with no tabs at all is never what was meant.
 */
export function loadPrefs(): Prefs {
	try {
		const raw = loadSetting(PREFS_KEY, null);
		if (!raw) return DEFAULT_PREFS;
		const parsed = JSON.parse(raw) as Partial<Prefs>;
		const visible = (parsed.visibleSections ?? []).filter(isSection);
		return {
			defaultSection: isSection(parsed.defaultSection) ? parsed.defaultSection : DEFAULT_PREFS.defaultSection,
			visibleSections: visible.length > 0 ? visible : DEFAULT_PREFS.visibleSections
		};
	} catch {
		return DEFAULT_PREFS;
	}
}

export function savePrefs(prefs: Prefs): void {
	saveSetting(PREFS_KEY, JSON.stringify(prefs));
}

/** The tabs to render, in the editor's own order. */
export function visibleSectionIds(prefs: Prefs): SectionId[] {
	return SECTION_IDS.filter(id => prefs.visibleSections.includes(id));
}

/** Where a newly opened monster lands: the default tab, or the first visible one
 *  when the default has since been hidden. */
export function landingSection(prefs: Prefs): SectionId | null {
	const visible = visibleSectionIds(prefs);
	if (visible.length === 0) return null;
	return visible.includes(prefs.defaultSection) ? prefs.defaultSection : visible[0];
}
