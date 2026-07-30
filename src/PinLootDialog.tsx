import { useTranslation } from 'react-i18next';
import { useEffect, useState } from 'react';
import { pinLootIds, type PinReport } from './monster';

/** How many rows of the preview are listed before it says "and N more". */
const PREVIEW_ROWS = 12;

export type PinScope = 'ambiguous' | 'all';

interface Props {
	scope: PinScope;
	onClose: () => void;
	/** Ran after a successful write, with the report, so the caller can refresh and toast. */
	onApplied: (report: PinReport) => void;
	onError: (message: string) => void;
}

/**
 * Preview-then-apply for the corpus-wide loot pin. The dry run is the preview:
 * the same backend call produces both, so what the list shows is exactly what
 * the write does — nothing is recomputed between the two.
 */
export default function PinLootDialog({ scope, onClose, onApplied, onError }: Props) {
	const { t } = useTranslation();
	const ambiguousOnly = scope === 'ambiguous';
	const [report, setReport] = useState<PinReport | null>(null);
	const [busy, setBusy] = useState(false);

	useEffect(() => {
		let live = true;
		pinLootIds(ambiguousOnly, false)
			.then(r => live && setReport(r))
			.catch(e => {
				onError(String(e));
				onClose();
			});
		return () => {
			live = false;
		};
	}, [ambiguousOnly, onClose, onError]);

	const apply = async () => {
		setBusy(true);
		try {
			onApplied(await pinLootIds(ambiguousOnly, true));
			onClose();
		} catch (e) {
			onError(String(e));
			setBusy(false);
		}
	};

	const count = report?.pinned.length ?? 0;
	// Bare ids that gain a naming comment. Only the full sweep produces them.
	const named = report?.named ?? [];
	const total = count + named.length;

	return (
		<div className="ss-backdrop" onMouseDown={onClose}>
			<div className="ss-modal mx-pin-modal" onMouseDown={e => e.stopPropagation()}>
				<div className="ss-modal-title">
					{ambiguousOnly ? t('Pin ambiguous loot ids') : t('Pin all loot ids')}
				</div>

				{!report ? (
					<div className="ss-modal-desc">{t('Scanning the corpus…')}</div>
				) : (
					<>
						<div className="ss-modal-desc">
							{total === 0
								? ambiguousOnly
									? t('No loot entry names an ambiguous item. Nothing to pin.')
									: t('Every loot entry is already pinned to an id and named.')
								: t('{{count}} loot entry in {{files}} becomes id + a trailing comment naming the item.', {
										count: total,
										files: t('{{count}} file', { count: report.files })
									})}
							{!ambiguousOnly && count > 0 && (
								<>
									{' '}
									{t('{{count}} of them are ambiguous names the server drops today.', {
										count: report.pinned.filter(p => p.ambiguous).length
									})}
								</>
							)}
							{/* Verb and pronoun both agree with the count, so the whole
							    sentence is one message per plural form. */}
							{named.length > 0 && (
								<>
									{' '}
									{t(
										'{{count}} was already an id with nothing saying what it is; it gains only the comment.',
										{ count: named.length }
									)}
								</>
							)}
						</div>

						{total > 0 && (
							<div className="mx-pin-list mono">
								{report.pinned.slice(0, PREVIEW_ROWS).map((p, i) => (
									<div className="mx-pin-row" key={`p${i}`}>
										<span className="mx-pin-file">{p.file}</span>
										<span>
											name="{p.name}" → id="{p.id}" &lt;!-- {p.name} --&gt;
										</span>
										{p.ambiguous && <span className="mx-pin-flag">{t('ambiguous')}</span>}
									</div>
								))}
								{named.slice(0, Math.max(0, PREVIEW_ROWS - count)).map((n, i) => (
									<div className="mx-pin-row" key={`n${i}`}>
										<span className="mx-pin-file">{n.file}</span>
										<span>
											id="{n.id}" → id="{n.id}" &lt;!-- {n.name} --&gt;
										</span>
									</div>
								))}
								{total > PREVIEW_ROWS && (
									<div className="mx-pin-more">
										{t('and {{count}} more', { count: total - PREVIEW_ROWS })}
									</div>
								)}
							</div>
						)}

						{report.unresolved.length > 0 && (
							<div className="ss-modal-desc mx-pin-warn">
								{t(
									'{{count}} name matches no items.xml entry and is left untouched — MONx never invents an item id. First: {{list}}.',
									{
										count: report.unresolved.length,
										list: report.unresolved
											.slice(0, 3)
											.map(u => `${u.file}: "${u.name}"`)
											.join(', ')
									}
								)}
							</div>
						)}

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
						disabled={busy || !report || total === 0}
						onClick={() => void apply()}
					>
						{busy ? t('Pinning…') : total > 0 ? t('Pin {{count}}', { count: total }) : t('Pin')}
					</button>
				</div>
			</div>
		</div>
	);
}
