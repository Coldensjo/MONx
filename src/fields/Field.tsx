import { createContext, useContext, type ReactNode } from 'react';
import { Info } from 'lucide-react';
import type { Lint, LintSeverity } from '../monster';

/**
 * Compact mode: the same fields with every explanation folded into a hover.
 *
 * The editor's notes are the reason its cards are as tall as they are, and they
 * earn that height — the editor is where a monster is understood. The create
 * wizard is where one is made, and there the same paragraphs are a wall between
 * the user and six numbers. Compact keeps every word, on the ⓘ beside the label,
 * and gets the card onto one page.
 *
 * A context rather than a prop because it applies to a whole subtree: `Field`,
 * `SubGroup` and `Banner` all read it, and threading a flag through every one
 * of the editor's call sites to serve one caller is how a second spell editor
 * gets born.
 */
const CompactContext = createContext(false);

export function CompactProvider({ children }: { children: ReactNode }) {
	return <CompactContext.Provider value={true}>{children}</CompactContext.Provider>;
}

export function useCompact(): boolean {
	return useContext(CompactContext);
}

/** A note as a tooltip, when it is plain enough to be one. Anything richer than
 *  a string keeps its own line — a JSX note has structure worth seeing.
 *
 *  A note assembled from a sentence and a conditional second sentence arrives as
 *  an array, and is still just as foldable while every part that renders is a
 *  string. The moment one of them is an element it goes back to being a
 *  paragraph, which is what the caveat tacked onto a banner usually is. */
export function asTitle(note: ReactNode): string | null {
	if (typeof note === 'string') return note;
	if (Array.isArray(note)) {
		const parts = note.filter(n => n !== null && n !== undefined && n !== false && n !== '');
		if (parts.length > 0 && parts.every(n => typeof n === 'string')) return parts.join('');
	}
	return null;
}

/** The ⓘ that carries a folded-away note. */
export function NoteTip({ note }: { note: string }) {
	return (
		<span className="ss-ed-tip" title={note}>
			<Info size={11} />
		</span>
	);
}

/** Resolves the lints attached to one dot path (`loot[3].countmax`). */
export type LintAt = (path: string) => Lint[];

const SEVERITY_RANK: Record<LintSeverity, number> = { error: 3, warning: 2, silent: 1 };

/** The loudest severity in a set — a field shows one badge, not three. */
export function worstSeverity(lints: Lint[]): LintSeverity | null {
	let worst: LintSeverity | null = null;
	for (const l of lints) {
		if (!worst || SEVERITY_RANK[l.severity] > SEVERITY_RANK[worst]) worst = l.severity;
	}
	return worst;
}

export function FieldLint({ lints }: { lints: Lint[] }) {
	const severity = worstSeverity(lints);
	if (!severity) return null;
	const title = lints.map(l => `${l.severity}: ${l.message}`).join('\n');
	return (
		<span className={`ss-ed-lint ss-ed-lint-${severity}`} title={title}>
			{severity === 'error' ? '!' : severity === 'warning' ? '▲' : '•'}
		</span>
	);
}

interface FieldProps {
	label: string;
	/** Right-hand annotation: units, corpus default, derived value. */
	hint?: ReactNode;
	lints?: Lint[];
	/** Explanation of a non-obvious engine behaviour, shown under the control. */
	note?: ReactNode;
	/** Greys the row out — used for fields the engine ignores in the current mode. */
	ignored?: boolean;
	children: ReactNode;
}

/** One labelled row in the editor column: label, control, lint badge, note. */
export function Field({ label, hint, lints, note, ignored, children }: FieldProps) {
	const compact = useCompact();
	const tip = compact ? asTitle(note) : null;
	// What the lint drawer scrolls to. Taken from the lints the field was handed
	// rather than from a prop every call site would have to pass and keep in step:
	// a field is only ever a jump target when it has a finding on it, and when it
	// does, the path it was looked up by is right there on the finding.
	return (
		<div
			className={ignored ? 'ss-ed-field ss-ed-field-ignored' : 'ss-ed-field'}
			data-lint-path={lints?.[0]?.path ?? undefined}
		>
			<label className="ss-ed-field-label">
				{label}
				{tip && <NoteTip note={tip} />}
				{lints && lints.length > 0 && <FieldLint lints={lints} />}
			</label>
			<div className="ss-ed-field-control">
				{children}
				{hint !== undefined && <span className="ss-ed-field-hint">{hint}</span>}
			</div>
			{note && !tip && <div className="ss-ed-field-note">{note}</div>}
		</div>
	);
}
