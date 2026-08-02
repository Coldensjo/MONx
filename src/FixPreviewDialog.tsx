import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import { getMonster, renderMonster, type Lint, type MonsterDoc } from './monster';
import { applyLintFix } from './lintfix';
import { diffHunks, diffLines, diffStat, type DiffHunk } from './diff';

// Preview-then-apply for the Fix buttons, in the shape PinLootDialog set: the
// preview is produced by the same code as the write, so what the list shows is
// exactly what lands on disk. What is new here is the diff — a fix that edits
// a value in place reads as one line, and a fix that turns out to rewrite
// twenty is the one worth catching before it is written rather than after.
//
// The document is the unit of work, not the file: fixes are applied to the
// `MonsterDoc` in order and the result is rendered through the writer, which is
// how two fixes touching the same field compose instead of racing.

/** One file's worth of work, once the caller's lints have been grouped. */
interface FilePlan {
	file: string;
	/** The document the fixes are applied to. For the open monster this is the
	 *  editor's buffer, unsaved edits and all — anything else would diff those
	 *  edits as though the fix had made them. */
	base: MonsterDoc;
	entries: { key: string; lint: Lint }[];
}

/** What applying the selected fixes to one file produces. */
interface FileResult {
	doc: MonsterDoc;
	applied: Lint[];
	/** Selected, but `applyLintFix` had no repair — the row says so. */
	manual: Lint[];
}

export interface FixTarget {
	file: string;
	doc: MonsterDoc;
	lints: Lint[];
}

interface Props {
	/** Fixable lints in scope, already filtered by the caller's severity and
	 *  ignore preferences. */
	lints: Lint[];
	/** The editor's current document, when its file is in scope. */
	openDoc: MonsterDoc | null;
	nextRaceid: number | null;
	/** Files whose buffers have unsaved changes. Only the open one can be fixed
	 *  through the editor; the rest are written directly, so they are blocked. */
	dirtyFiles: Set<string>;
	onClose: () => void;
	/** Ran on Apply, with one target per file that changed. */
	onApply: (targets: FixTarget[], applied: Lint[], manual: Lint[]) => void;
	onError: (message: string) => void;
}

function keyOf(lint: Lint, i: number): string {
	return `${lint.file ?? ''}:${lint.code}:${lint.path ?? ''}:${i}`;
}

/** Applies the selected fixes in order, so two touching one field compose. */
function runPlan(plan: FilePlan, selected: Set<string>, nextRaceid: number | null): FileResult {
	let doc = plan.base;
	const applied: Lint[] = [];
	const manual: Lint[] = [];
	for (const { key, lint } of plan.entries) {
		if (!selected.has(key)) continue;
		const next = applyLintFix(doc, lint, { nextRaceid });
		if (next) {
			doc = next;
			applied.push(lint);
		} else manual.push(lint);
	}
	return { doc, applied, manual };
}

function HunkView({ hunks }: { hunks: DiffHunk[] }) {
	const { t } = useTranslation();
	return (
		<div className="mx-diff mono">
			{hunks.map((hunk, h) => (
				<div key={h}>
					{hunk.skipped > 0 && (
						<div className="mx-diff-skip">{t('{{count}} unchanged line', { count: hunk.skipped })}</div>
					)}
					{hunk.lines.map((line, i) => (
						<div key={i} className={`mx-diff-line mx-diff-${line.kind}`}>
							<span className="mx-diff-no">{line.before ?? ''}</span>
							<span className="mx-diff-no">{line.after ?? ''}</span>
							<span className="mx-diff-sign">{line.kind === 'add' ? '+' : line.kind === 'remove' ? '−' : ' '}</span>
							<span className="mx-diff-text">{line.text || ' '}</span>
						</div>
					))}
				</div>
			))}
		</div>
	);
}

export default function FixPreviewDialog({
	lints,
	openDoc,
	nextRaceid,
	dirtyFiles,
	onClose,
	onApply,
	onError
}: Props) {
	const { t } = useTranslation();
	const [plans, setPlans] = useState<FilePlan[] | null>(null);
	const [selected, setSelected] = useState<Set<string>>(new Set());
	const [expanded, setExpanded] = useState<string | null>(null);
	/** Rendered diffs, keyed by file. Fetched per expansion, not up front — a
	 *  corpus-wide Fix all can span hundreds of files and nobody reads them all. */
	const [hunks, setHunks] = useState<Map<string, DiffHunk[]>>(new Map());
	const [rendering, setRendering] = useState(false);
	const [busy, setBusy] = useState(false);

	// The shell passes these as inline arrows, so they are a new identity on
	// every one of its renders. Held in a ref rather than listed as effect
	// dependencies: the plan would otherwise be rebuilt — and every checkbox the
	// user had unticked reset — each time anything above this dialog re-rendered.
	const bail = useRef({ onClose, onError });
	bail.current = { onClose, onError };

	// A file with an unsaved buffer that is not the one on screen cannot be
	// written behind the user's back, so it never enters the plan.
	const blocked = useMemo(
		() => [...new Set(lints.map(l => l.file).filter((f): f is string => !!f && f !== openDoc?.file && dirtyFiles.has(f)))],
		[lints, openDoc, dirtyFiles]
	);

	useEffect(() => {
		let live = true;
		const grouped = new Map<string, { key: string; lint: Lint }[]>();
		lints.forEach((lint, i) => {
			const file = lint.file ?? openDoc?.file ?? null;
			if (!file || blocked.includes(file)) return;
			const list = grouped.get(file);
			if (list) list.push({ key: keyOf(lint, i), lint });
			else grouped.set(file, [{ key: keyOf(lint, i), lint }]);
		});

		Promise.all(
			[...grouped].map(async ([file, entries]) => ({
				file,
				base: file === openDoc?.file && openDoc ? openDoc : await getMonster(file),
				entries
			}))
		)
			.then(built => {
				if (!live) return;
				built.sort((a, b) => a.file.localeCompare(b.file));
				setPlans(built);
				// Everything is on by default — this is Fix all, and unticking is
				// the exception. The diff is what makes that safe to offer.
				setSelected(new Set(built.flatMap(p => p.entries.map(e => e.key))));
				if (built.length === 1) setExpanded(built[0].file);
			})
			.catch(e => {
				bail.current.onError(String(e));
				bail.current.onClose();
			});
		return () => {
			live = false;
		};
	}, [lints, openDoc, blocked]);

	const results = useMemo(() => {
		const out = new Map<string, FileResult>();
		for (const plan of plans ?? []) out.set(plan.file, runPlan(plan, selected, nextRaceid));
		return out;
	}, [plans, selected, nextRaceid]);

	// The expanded file's diff, re-rendered whenever its selection changes. Both
	// sides go through the writer: the left is the document as it stands, so an
	// unsaved buffer does not show up as part of the fix.
	const expandedPlan = plans?.find(p => p.file === expanded) ?? null;
	const expandedResult = expanded ? results.get(expanded) : undefined;
	const expandedDoc = expandedResult?.doc;
	useEffect(() => {
		if (!expandedPlan || !expandedDoc) return;
		let live = true;
		setRendering(true);
		Promise.all([renderMonster(expandedPlan.base), renderMonster(expandedDoc)])
			.then(([before, after]) => {
				if (!live) return;
				setHunks(prev => new Map(prev).set(expandedPlan.file, diffHunks(diffLines(before, after))));
				setRendering(false);
			})
			.catch(e => {
				if (!live) return;
				setRendering(false);
				bail.current.onError(String(e));
			});
		return () => {
			live = false;
		};
	}, [expandedPlan, expandedDoc]);

	const toggle = useCallback((key: string) => {
		setSelected(prev => {
			const next = new Set(prev);
			if (next.has(key)) next.delete(key);
			else next.add(key);
			return next;
		});
	}, []);

	const toggleFile = useCallback((plan: FilePlan, on: boolean) => {
		setSelected(prev => {
			const next = new Set(prev);
			for (const e of plan.entries) {
				if (on) next.add(e.key);
				else next.delete(e.key);
			}
			return next;
		});
	}, []);

	const applied = useMemo(() => [...results.values()].flatMap(r => r.applied), [results]);
	const manual = useMemo(() => [...results.values()].flatMap(r => r.manual), [results]);

	const apply = () => {
		setBusy(true);
		const targets: FixTarget[] = (plans ?? [])
			.map(plan => ({ plan, result: results.get(plan.file) }))
			.filter(({ result }) => result && result.applied.length > 0)
			.map(({ plan, result }) => ({ file: plan.file, doc: result!.doc, lints: result!.applied }));
		onApply(targets, applied, manual);
	};

	const stat = (file: string) => {
		const h = hunks.get(file);
		if (!h) return null;
		return diffStat(h.flatMap(x => x.lines));
	};

	return (
		<div className="ss-backdrop" onMouseDown={onClose}>
			<div className="ss-modal mx-fix-modal" onMouseDown={e => e.stopPropagation()}>
				<div className="ss-modal-title">{t('Review fixes')}</div>

				{!plans ? (
					<div className="ss-modal-desc">{t('Reading the corpus…')}</div>
				) : (
					<>
						<div className="ss-modal-desc">
							{applied.length === 0
								? t('Nothing here has an automatic fix')
								: t('{{count}} fix in {{files}} — expand a file to see exactly what changes.', {
										count: applied.length,
										files: t('{{count}} file', { count: [...results.values()].filter(r => r.applied.length > 0).length })
									})}
							{manual.length > 0 && (
								<>
									{' '}
									{t('{{count}} needs a manual fix and is left alone.', { count: manual.length })}
								</>
							)}
						</div>

						{blocked.length > 0 && (
							<div className="ss-modal-desc mx-pin-warn">
								{t('{{count}} file has unsaved changes and is left out — save it first. First: {{list}}.', {
									count: blocked.length,
									list: blocked.slice(0, 3).join(', ')
								})}
							</div>
						)}

						<div className="mx-fix-list">
							{plans.map(plan => {
								const result = results.get(plan.file);
								const open = expanded === plan.file;
								const on = plan.entries.filter(e => selected.has(e.key)).length;
								const counts = stat(plan.file);
								return (
									<div key={plan.file} className="mx-fix-file">
										<div className="mx-fix-file-head">
											<button
												type="button"
												className="mx-fix-toggle"
												onClick={() => setExpanded(open ? null : plan.file)}
												title={open ? t('Hide the diff') : t('Show the diff')}
											>
												{open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
												<span className="mx-fix-file-name mono">{plan.file}</span>
											</button>
											{open && counts && (counts.added > 0 || counts.removed > 0) && (
												<span className="mx-fix-stat mono">
													<span className="mx-diff-add-fg">+{counts.added}</span>{' '}
													<span className="mx-diff-remove-fg">−{counts.removed}</span>
												</span>
											)}
											<label className="mx-fix-all">
												<input
													type="checkbox"
													checked={on === plan.entries.length}
													ref={el => {
														if (el) el.indeterminate = on > 0 && on < plan.entries.length;
													}}
													onChange={e => toggleFile(plan, e.target.checked)}
												/>
												{t('{{count}} fix', { count: plan.entries.length })}
											</label>
										</div>

										<div className="mx-fix-lints">
											{plan.entries.map(({ key, lint }) => {
												const isManual = result?.manual.includes(lint) ?? false;
												return (
													<label key={key} className={`mx-fix-lint ss-lint-${lint.severity}`}>
														<input
															type="checkbox"
															checked={selected.has(key)}
															onChange={() => toggle(key)}
														/>
														<span className="mx-fix-lint-msg">{lint.message}</span>
														<span className="mx-fix-lint-code mono">
															{isManual ? t('manual') : lint.code}
														</span>
													</label>
												);
											})}
										</div>

										{open &&
											(rendering && !hunks.has(plan.file) ? (
												<div className="mx-fix-rendering">
													<Loader2 size={13} className="mx-spin" /> {t('Rendering…')}
												</div>
											) : (hunks.get(plan.file)?.length ?? 0) === 0 ? (
												<div className="mx-fix-rendering">{t('No change to the file.')}</div>
											) : (
												<HunkView hunks={hunks.get(plan.file) ?? []} />
											))}
									</div>
								);
							})}
						</div>

						<div className="ss-modal-desc">
							{t('Every changed file is backed up to {{folder}} before it is rewritten.', {
								folder: '.monx-backup/'
							})}
						</div>
					</>
				)}

				<div className="ss-modal-buttons">
					<button className="ss-btn ss-btn-ghost" onClick={onClose}>
						{t('Cancel')}
					</button>
					<div className="ss-modal-buttons-spacer" />
					<button
						className="ss-btn ss-btn-primary"
						disabled={busy || !plans || applied.length === 0}
						onClick={apply}
					>
						{busy ? t('Fixing…') : t('Apply {{count}} fix', { count: applied.length })}
					</button>
				</div>
			</div>
		</div>
	);
}
