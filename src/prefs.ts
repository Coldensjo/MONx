// User preferences for the editor's tab strip: which tabs exist, and which one
// a freshly opened monster lands on. Persisted under `monx.prefs`, read through
// settings.ts like every other `monx.*` key.

import { loadSetting, saveSetting } from './settings';
import { SECTION_IDS, type SectionId } from './sections/section';
import type { Lint, LintSeverity } from './monster';

const PREFS_KEY = 'monx.prefs';
const LINT_PREFS_KEY = 'monx.lint';

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

// ---------- Linter ----------

export const LINT_SEVERITIES: readonly LintSeverity[] = ['error', 'warning', 'silent'];

export interface LintPrefs {
	/** Severities the drawer shows. The Linter menu and the drawer's own chips are
	 *  two views of this one list. */
	severities: LintSeverity[];
	/** Lint codes ignored everywhere: the drawer, the status bar and the editor's
	 *  own field markers. Codes, never messages — the message text is not stable. */
	muted: string[];
}

export const DEFAULT_LINT_PREFS: LintPrefs = {
	severities: [...LINT_SEVERITIES],
	muted: []
};

export function loadLintPrefs(): LintPrefs {
	try {
		const raw = loadSetting(LINT_PREFS_KEY, null);
		if (!raw) return DEFAULT_LINT_PREFS;
		const parsed = JSON.parse(raw) as Partial<LintPrefs>;
		const severities = (parsed.severities ?? []).filter((s): s is LintSeverity =>
			(LINT_SEVERITIES as readonly string[]).includes(s)
		);
		const muted = (parsed.muted ?? []).filter((c): c is string => typeof c === 'string' && c.length > 0);
		return {
			// Every severity off would read as "no problems found", which is a lie.
			severities: severities.length > 0 ? severities : DEFAULT_LINT_PREFS.severities,
			muted: [...new Set(muted)].sort()
		};
	} catch {
		return DEFAULT_LINT_PREFS;
	}
}

export function saveLintPrefs(prefs: LintPrefs): void {
	saveSetting(LINT_PREFS_KEY, JSON.stringify(prefs));
}

/** False for a lint whose code the user has chosen to ignore. Severity is a
 *  display filter and is applied by the drawer, not here — the status bar still
 *  counts what it is not showing. */
export function lintShown(prefs: LintPrefs, lint: Lint): boolean {
	return !prefs.muted.includes(lint.code);
}
