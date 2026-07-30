import { useTranslation } from 'react-i18next';
import { useEffect, useMemo, useState } from 'react';
import { ArrowLeftRight } from 'lucide-react';
import { getMonster, lookUrl, type MonsterDoc, type MonsterSummary } from './monster';
import { compareDocs, countDifferences } from './compare';

interface Props {
	monsters: MonsterSummary[];
	/** The monster the dialog opens on the left, usually the one being edited. */
	initialFile: string | null;
	onClose: () => void;
	onError: (message: string) => void;
}

/** Picks one side of the comparison. */
function MonsterSelect({
	monsters,
	value,
	onChange
}: {
	monsters: MonsterSummary[];
	value: string;
	onChange: (file: string) => void;
}) {
	return (
		<select className="ss-ed-input mx-cmp-pick" value={value} onChange={e => onChange(e.target.value)}>
			{monsters.map(m => (
				<option key={m.file} value={m.file}>
					{m.name}
				</option>
			))}
		</select>
	);
}

/**
 * Two monsters side by side, field by field. Reads from disk rather than from
 * the open buffer: the question it answers is about the corpus as it stands, so
 * an unsaved edit is deliberately not part of it.
 */
export default function CompareDialog({ monsters, initialFile, onClose, onError }: Props) {
	const { t } = useTranslation();
	const sorted = useMemo(() => [...monsters].sort((a, b) => a.name.localeCompare(b.name)), [monsters]);
	const [fileA, setFileA] = useState(initialFile ?? sorted[0]?.file ?? '');
	const [fileB, setFileB] = useState(
		sorted.find(m => m.file !== (initialFile ?? sorted[0]?.file))?.file ?? ''
	);
	const [docA, setDocA] = useState<MonsterDoc | null>(null);
	const [docB, setDocB] = useState<MonsterDoc | null>(null);
	const [diffsOnly, setDiffsOnly] = useState(true);

	useEffect(() => {
		let live = true;
		setDocA(null);
		if (fileA) getMonster(fileA).then(d => live && setDocA(d)).catch(e => onError(String(e)));
		return () => {
			live = false;
		};
	}, [fileA, onError]);

	useEffect(() => {
		let live = true;
		setDocB(null);
		if (fileB) getMonster(fileB).then(d => live && setDocB(d)).catch(e => onError(String(e)));
		return () => {
			live = false;
		};
	}, [fileB, onError]);

	const groups = useMemo(() => (docA && docB ? compareDocs(docA, docB) : []), [docA, docB]);
	const differences = countDifferences(groups);

	const shown = diffsOnly
		? groups.map(g => ({ ...g, rows: g.rows.filter(r => !r.same) })).filter(g => g.rows.length > 0)
		: groups;

	return (
		<div className="ss-backdrop" onMouseDown={onClose}>
			<div className="ss-modal mx-cmp-modal" onMouseDown={e => e.stopPropagation()}>
				<div className="ss-modal-title">{t('Compare monsters')}</div>

				<div className="mx-cmp-heads">
					<div className="mx-cmp-head">
						{docA && <img className="mx-cmp-look" src={lookUrl(docA.look, { cell: 48 })} alt="" />}
						<MonsterSelect monsters={sorted} value={fileA} onChange={setFileA} />
					</div>
					<button
						type="button"
						className="ss-btn ss-btn-ghost ss-ed-mini"
						title={t('Swap sides')}
						onClick={() => {
							setFileA(fileB);
							setFileB(fileA);
						}}
					>
						<ArrowLeftRight size={14} />
					</button>
					<div className="mx-cmp-head">
						{docB && <img className="mx-cmp-look" src={lookUrl(docB.look, { cell: 48 })} alt="" />}
						<MonsterSelect monsters={sorted} value={fileB} onChange={setFileB} />
					</div>
				</div>

				{!docA || !docB ? (
					<div className="ss-modal-desc">{t('Reading both monsters…')}</div>
				) : (
					<>
						<div className="ss-modal-desc mx-cmp-bar">
							<span>
								{differences === 0
									? t('These two agree on every field MONx models.')
									: t('{{count}} field differs.', { count: differences })}
							</span>
							<label className="mx-scale-check">
								<input
									type="checkbox"
									checked={diffsOnly}
									onChange={e => setDiffsOnly(e.target.checked)}
								/>
								{t('Differences only')}
							</label>
						</div>

						<div className="mx-pin-list mx-cmp-list">
							{shown.map(g => (
								<div key={g.title}>
									{/* Group titles and row labels are i18n keys from compare.ts.
									    The raw English still keys the React list. */}
									<div className="mx-cmp-group">{t(g.title)}</div>
									{g.rows.map(r => (
										<div className={`mx-cmp-row${r.same ? '' : ' mx-cmp-diff'}`} key={r.label}>
											<span className="mx-cmp-label" title={t(r.label)}>
												{t(r.label)}
											</span>
											<span className="mx-cmp-a mono">{r.a}</span>
											<span className="mx-cmp-b mono">{r.b}</span>
											<span
												className={`mx-cmp-delta${
													r.delta && r.delta < 0 ? ' mx-cmp-down' : ''
												}`}
											>
												{r.delta === null || r.same
													? ''
													: `${r.delta > 0 ? '+' : ''}${
															Math.abs(r.delta) >= 10
																? r.delta.toFixed(0)
																: r.delta.toFixed(1)
														}%`}
											</span>
										</div>
									))}
								</div>
							))}
							{shown.length === 0 && <div className="ss-ed-empty">{t('Nothing differs.')}</div>}
						</div>
					</>
				)}

				<div className="ss-modal-buttons">
					<div className="ss-modal-buttons-spacer" />
					<button className="ss-btn ss-btn-primary" onClick={onClose}>
						{t('Done')}
					</button>
				</div>
			</div>
		</div>
	);
}
