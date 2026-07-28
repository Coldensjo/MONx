import type { ReactNode } from 'react';
import type { Lint, LintSeverity } from '../monster';

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
	return (
		<div className={ignored ? 'ss-ed-field ss-ed-field-ignored' : 'ss-ed-field'}>
			<label className="ss-ed-field-label">
				{label}
				{lints && lints.length > 0 && <FieldLint lints={lints} />}
			</label>
			<div className="ss-ed-field-control">
				{children}
				{hint !== undefined && <span className="ss-ed-field-hint">{hint}</span>}
			</div>
			{note && <div className="ss-ed-field-note">{note}</div>}
		</div>
	);
}
