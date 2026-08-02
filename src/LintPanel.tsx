import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Ban, Check, ChevronDown, Ghost, ShieldAlert, X } from 'lucide-react';
import type { Lint, LintSeverity } from './monster';

// The lint drawer (DESIGN §15). It expands from the status bar and is the reason
// MONx exists: the `silent` class of mistake produces no server output at all
// (reference §24), so this is the only place it can ever be caught.

const SEVERITIES: LintSeverity[] = ['error', 'warning', 'silent'];

/** Values are i18n keys — translated at the render site with t(). */
const SEVERITY_LABEL: Record<LintSeverity, string> = {
	error: 'Errors',
	warning: 'Warnings',
	silent: 'Silent'
};

/** The chip tooltips, spelled out rather than lower-cased from SEVERITY_LABEL.
 *  Case is a property of the language, not something to do to a noun. */
const SEVERITY_TITLE: Record<LintSeverity, string> = {
	error: 'Show errors',
	warning: 'Show warnings',
	silent: 'Show silent findings'
};

// `silent` deliberately gets its own icon and its own hue (--silent in shell.css),
// distinct from both error and warning. It is neither: the engine accepts the file
// and then quietly does the wrong thing.
const SEVERITY_ICON: Record<LintSeverity, typeof AlertTriangle> = {
	error: ShieldAlert,
	warning: AlertTriangle,
	silent: Ghost
};

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
	/** Applies every automatic fix for the open monster in one press. */
	onFixAll?: () => void;
	/** The same, for every file in the workspace tab — writes those files directly. */
	onFixAllWorkspace?: () => void;
	/** Severities to show. Owned by the shell so the Linter menu and these chips
	 *  are the same setting seen twice. */
	severities: LintSeverity[];
	onToggleSeverity: (s: LintSeverity) => void;
	/** Ignores a lint code across the workspace (right-click a row). */
	onIgnoreCode?: (code: string) => void;
}

/** Counts by severity, for the status-bar summary. */
export function countLints(lints: Lint[]): Record<LintSeverity, number> {
	const counts: Record<LintSeverity, number> = { error: 0, warning: 0, silent: 0 };
	for (const l of lints) counts[l.severity]++;
	return counts;
}

export default function LintPanel({
	open,
	onClose,
	monsterLints,
	workspaceLints,
	file,
	onJump,
	onFix,
	onFixAll,
	onFixAllWorkspace,
	severities: shownSeverities,
	onToggleSeverity,
	onIgnoreCode
}: Props) {
	const { t } = useTranslation();
	const [tab, setTab] = useState<LintTab>('monster');
	const [fixing, setFixing] = useState<string | null>(null);
	/** Right-clicked row: the code is what an ignore applies to. */
	const [rowMenu, setRowMenu] = useState<{ x: number; y: number; code: string } | null>(null);
	const severities = useMemo(() => new Set(shownSeverities), [shownSeverities]);

	// Any press elsewhere dismisses the row menu, as the other context menus do.
	useEffect(() => {
		if (!rowMenu) return;
		const away = () => setRowMenu(null);
		window.addEventListener('mousedown', away);
		return () => window.removeEventListener('mousedown', away);
	}, [rowMenu]);

	// The drawer lives at the bottom of the window, so a menu dropped at the
	// cursor lands off-screen. Measured once and clamped into the viewport, which
	// puts it above the click when there is no room below; hidden until then, so
	// the uncorrected position is never painted.
	const menuRef = useRef<HTMLDivElement>(null);
	const [menuPos, setMenuPos] = useState<{ left: number; top: number } | null>(null);
	useLayoutEffect(() => {
		if (!rowMenu) {
			setMenuPos(null);
			return;
		}
		const el = menuRef.current;
		if (!el) return;
		const { width, height } = el.getBoundingClientRect();
		setMenuPos({
			left: Math.max(4, Math.min(rowMenu.x, window.innerWidth - width - 4)),
			top: Math.max(4, Math.min(rowMenu.y, window.innerHeight - height - 4))
		});
	}, [rowMenu]);

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
						{file ?? t('Monster')}
						<span className="ss-filter-tab-meta">{monsterLints.length}</span>
					</button>
					<button
						className={`ss-filter-tab${tab === 'workspace' ? ' ss-filter-tab-active' : ''}`}
						onClick={() => setTab('workspace')}
					>
						{t('Workspace')}
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
								onClick={() => onToggleSeverity(s)}
								title={t(SEVERITY_TITLE[s])}
							>
								<Icon size={12} />
								{t(SEVERITY_LABEL[s])}
								<span className="ss-lint-chip-count">{counts[s]}</span>
							</button>
						);
					})}
				</div>

				{onFixAll && tab === 'monster' && monsterLints.some(l => l.fixable) && (
					<button
						className="ss-lint-fix"
						onClick={onFixAll}
						title={t('Review every automatic fix for this monster')}
					>
						{t('Fix all ({{count}})', { count: monsterLints.filter(l => l.fixable).length })}
					</button>
				)}
				{onFixAllWorkspace && tab === 'workspace' && workspaceLints.some(l => l.fixable && l.file) && (
					<button
						className="ss-lint-fix"
						onClick={onFixAllWorkspace}
						title={t('Review every automatic fix across the corpus before it is written')}
					>
						{t('Fix all ({{count}})', {
							count: workspaceLints.filter(l => l.fixable && l.file).length
						})}
					</button>
				)}

				<button className="ss-icon-btn" onClick={onClose} aria-label={t('Close lints')}>
					<ChevronDown size={14} />
				</button>
			</div>

			<div className="ss-lint-body">
				{shownCount === 0 && (
					<div className="ss-lint-clean">
						<Check size={14} />
						{source.length === 0 ? t('No problems found.') : t('Nothing matches the current filter.')}
					</div>
				)}
				{groups.map(({ severity, lints }) =>
					lints.length === 0 ? null : (
						<div key={severity} className="ss-lint-group">
							<div className={`ss-lint-group-head ss-lint-${severity}`}>
								{t(SEVERITY_LABEL[severity])}
								<span className="ss-lint-chip-count">{lints.length}</span>
							</div>
							{lints.map((lint, i) => {
								const Icon = SEVERITY_ICON[lint.severity];
								const key = `${lint.code}:${lint.file ?? ''}:${lint.path ?? ''}:${i}`;
								return (
									<div
										key={key}
										className={`ss-lint-row ss-lint-${lint.severity}`}
										onContextMenu={e => {
											if (!onIgnoreCode) return;
											e.preventDefault();
											setRowMenu({ x: e.clientX, y: e.clientY, code: lint.code });
										}}
									>
										<Icon size={13} className="ss-lint-row-icon" />
										<button
											className="ss-lint-row-main"
											onClick={() => onJump(lint)}
											title={lint.path ? t('Jump to {{path}}', { path: lint.path }) : lint.code}
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
												title={t('Apply the fix')}
											>
												<Check size={12} />
												{t('Fix')}
											</button>
										)}
									</div>
								);
							})}
						</div>
					)
				)}
			</div>

			{rowMenu && onIgnoreCode && (
				<div
					ref={menuRef}
					className="ss-context-menu"
					style={{
						left: menuPos?.left ?? rowMenu.x,
						top: menuPos?.top ?? rowMenu.y,
						visibility: menuPos ? 'visible' : 'hidden'
					}}
					onMouseDown={e => e.stopPropagation()}
				>
					<button
						className="ss-menu-item"
						onClick={() => {
							setRowMenu(null);
							onIgnoreCode(rowMenu.code);
						}}
					>
						<Ban size={14} />
						{t('Ignore {{code}} everywhere', { code: rowMenu.code })}
					</button>
					<button
						className="ss-menu-item"
						onClick={() => {
							setRowMenu(null);
							void navigator.clipboard.writeText(rowMenu.code);
						}}
					>
						{t('Copy code')}
					</button>
				</div>
			)}
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
	const { t } = useTranslation();
	const counts = countLints(lints);
	const total = counts.error + counts.warning + counts.silent;
	return (
		<button className="ss-lint-status" onClick={onOpen} title={open ? t('Hide lints') : t('Show lints')}>
			{total === 0 ? (
				<>
					<Check size={12} /> {t('No lints')}
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
