import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, ChevronDown, Ghost, ShieldAlert, X } from 'lucide-react';
import type { Lint, LintSeverity } from './monster';
import { loadSetting, saveSetting } from './settings';

// The lint drawer (DESIGN §15). It expands from the status bar and is the reason
// MONx exists: the `silent` class of mistake produces no server output at all
// (reference §24), so this is the only place it can ever be caught.

const SEVERITIES: LintSeverity[] = ['error', 'warning', 'silent'];

const SEVERITY_LABEL: Record<LintSeverity, string> = {
	error: 'Errors',
	warning: 'Warnings',
	silent: 'Silent'
};

// `silent` deliberately gets its own icon and its own hue (--silent in shell.css),
// distinct from both error and warning. It is neither: the engine accepts the file
// and then quietly does the wrong thing.
const SEVERITY_ICON: Record<LintSeverity, typeof AlertTriangle> = {
	error: ShieldAlert,
	warning: AlertTriangle,
	silent: Ghost
};

const FILTER_KEY = 'monx.lintFilter';

// settings.ts handles the storage; the shape validation stays here because a
// stale or hand-edited key must never leave the drawer filtering on nothing.
function loadFilter(): Set<LintSeverity> {
	const raw = loadSetting(FILTER_KEY, null);
	if (!raw) return new Set(SEVERITIES);
	try {
		const parsed = JSON.parse(raw) as unknown;
		if (!Array.isArray(parsed)) return new Set(SEVERITIES);
		const valid = parsed.filter((s): s is LintSeverity => SEVERITIES.includes(s as LintSeverity));
		return valid.length > 0 ? new Set(valid) : new Set(SEVERITIES);
	} catch {
		return new Set(SEVERITIES);
	}
}

function saveFilter(set: Set<LintSeverity>): void {
	saveSetting(FILTER_KEY, JSON.stringify([...set]));
}

export type LintTab = 'monster' | 'workspace';

interface Props {
	open: boolean;
	onClose: () => void;
	/** Lints for the monster currently in the editor. */
	monsterLints: Lint[];
	/** Cross-file lints from `lint_workspace` — orphans, duplicate raceids, … */
	workspaceLints: Lint[];
	/** The file the editor has open, for the tab label. */
	file: string | null;
	/** Jumps the editor to `Lint.path` on the given file. */
	onJump: (lint: Lint) => void;
	/** Applies the one unambiguous fix for a `fixable` lint. */
	onFix?: (lint: Lint) => void;
}

/** Counts by severity, for the status-bar summary. */
export function countLints(lints: Lint[]): Record<LintSeverity, number> {
	const counts: Record<LintSeverity, number> = { error: 0, warning: 0, silent: 0 };
	for (const l of lints) counts[l.severity]++;
	return counts;
}

export default function LintPanel({ open, onClose, monsterLints, workspaceLints, file, onJump, onFix }: Props) {
	const [tab, setTab] = useState<LintTab>('monster');
	const [severities, setSeverities] = useState<Set<LintSeverity>>(loadFilter);
	const [fixing, setFixing] = useState<string | null>(null);

	useEffect(() => saveFilter(severities), [severities]);

	useEffect(() => {
		if (!open) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') onClose();
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, [open, onClose]);

	const source = tab === 'monster' ? monsterLints : workspaceLints;
	const counts = useMemo(() => countLints(source), [source]);

	// Grouped by severity in fixed order, so the eye always finds errors first and
	// the silent group always sits in the same place.
	const groups = useMemo(
		() => SEVERITIES.filter(s => severities.has(s)).map(s => ({ severity: s, lints: source.filter(l => l.severity === s) })),
		[source, severities]
	);

	const toggleSeverity = useCallback((s: LintSeverity) => {
		setSeverities(prev => {
			const next = new Set(prev);
			if (next.has(s)) next.delete(s);
			else next.add(s);
			// Never leave every filter off — an empty drawer reads as "no problems".
			return next.size === 0 ? new Set(SEVERITIES) : next;
		});
	}, []);

	const runFix = useCallback(
		(lint: Lint) => {
			if (!onFix) return;
			setFixing(lint.code + (lint.path ?? ''));
			onFix(lint);
			setFixing(null);
		},
		[onFix]
	);

	if (!open) return null;

	const shownCount = groups.reduce((n, g) => n + g.lints.length, 0);

	return (
		<div className="ss-lint-drawer">
			<div className="ss-lint-head">
				<div className="ss-filter-tabs">
					<button
						className={`ss-filter-tab${tab === 'monster' ? ' ss-filter-tab-active' : ''}`}
						onClick={() => setTab('monster')}
					>
						{file ?? 'Monster'}
						<span className="ss-filter-tab-meta">{monsterLints.length}</span>
					</button>
					<button
						className={`ss-filter-tab${tab === 'workspace' ? ' ss-filter-tab-active' : ''}`}
						onClick={() => setTab('workspace')}
					>
						Workspace
						<span className="ss-filter-tab-meta">{workspaceLints.length}</span>
					</button>
				</div>

				<div className="ss-lint-filters">
					{SEVERITIES.map(s => {
						const Icon = SEVERITY_ICON[s];
						return (
							<button
								key={s}
								className={`ss-lint-chip ss-lint-${s}${severities.has(s) ? ' ss-lint-chip-on' : ''}`}
								onClick={() => toggleSeverity(s)}
								title={`Show ${SEVERITY_LABEL[s].toLowerCase()}`}
							>
								<Icon size={12} />
								{SEVERITY_LABEL[s]}
								<span className="ss-lint-chip-count">{counts[s]}</span>
							</button>
						);
					})}
				</div>

				<button className="ss-icon-btn" onClick={onClose} aria-label="Close lints">
					<ChevronDown size={14} />
				</button>
			</div>

			<div className="ss-lint-body">
				{shownCount === 0 && (
					<div className="ss-lint-clean">
						<Check size={14} />
						{source.length === 0 ? 'No problems found.' : 'Nothing matches the current filter.'}
					</div>
				)}
				{groups.map(({ severity, lints }) =>
					lints.length === 0 ? null : (
						<div key={severity} className="ss-lint-group">
							<div className={`ss-lint-group-head ss-lint-${severity}`}>
								{SEVERITY_LABEL[severity]}
								<span className="ss-lint-chip-count">{lints.length}</span>
							</div>
							{lints.map((lint, i) => {
								const Icon = SEVERITY_ICON[lint.severity];
								const key = `${lint.code}:${lint.file ?? ''}:${lint.path ?? ''}:${i}`;
								return (
									<div key={key} className={`ss-lint-row ss-lint-${lint.severity}`}>
										<Icon size={13} className="ss-lint-row-icon" />
										<button
											className="ss-lint-row-main"
											onClick={() => onJump(lint)}
											title={lint.path ? `Jump to ${lint.path}` : lint.code}
										>
											<span className="ss-lint-msg">{lint.message}</span>
											<span className="ss-lint-meta mono">
												{lint.file && tab === 'workspace' ? `${lint.file} · ` : ''}
												{lint.code}
											</span>
										</button>
										{/* A fixable lint has exactly one correct repair. A duplicate raceid
										    does not — it needs a human to decide which monster keeps it, so
										    that row navigates and explains instead (§15). */}
										{lint.fixable && onFix && (
											<button
												className="ss-lint-fix"
												onClick={() => runFix(lint)}
												disabled={fixing === lint.code + (lint.path ?? '')}
												title="Apply the fix"
											>
												<Check size={12} />
												Fix
											</button>
										)}
									</div>
								);
							})}
						</div>
					)
				)}
			</div>
		</div>
	);
}

interface StatusProps {
	lints: Lint[];
	onOpen: () => void;
	open: boolean;
}

/** The status-bar summary that doubles as the drawer's toggle (DESIGN §11.2). */
export function LintStatus({ lints, onOpen, open }: StatusProps) {
	const counts = countLints(lints);
	const total = counts.error + counts.warning + counts.silent;
	return (
		<button className="ss-lint-status" onClick={onOpen} title={open ? 'Hide lints' : 'Show lints'}>
			{total === 0 ? (
				<>
					<Check size={12} /> No lints
				</>
			) : (
				<>
					{counts.error > 0 && (
						<span className="ss-lint-error">
							<ShieldAlert size={12} /> {counts.error}
						</span>
					)}
					{counts.warning > 0 && (
						<span className="ss-lint-warning">
							<AlertTriangle size={12} /> {counts.warning}
						</span>
					)}
					{counts.silent > 0 && (
						<span className="ss-lint-silent">
							<Ghost size={12} /> {counts.silent}
						</span>
					)}
				</>
			)}
			{open ? <X size={12} /> : null}
		</button>
	);
}
