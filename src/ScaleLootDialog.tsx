import { useEffect, useState } from 'react';
import { scaleLootChances, type ScaleReport } from './monster';
import { NumberField } from './fields/NumberField';
import { percentText } from './sections/Loot';

interface Props {
	onClose: () => void;
	/** Ran after a successful write, with the report, so the caller can refresh and toast. */
	onApplied: (report: ScaleReport) => void;
	onError: (message: string) => void;
}

/**
 * Corpus-wide loot chance scaling, preview-then-apply like PinLootDialog: the
 * dry run and the write are the same backend walk, so the preview list is
 * exactly what the apply does.
 */
export default function ScaleLootDialog({ onClose, onApplied, onError }: Props) {
	const [percent, setPercent] = useState(100);
	const [report, setReport] = useState<ScaleReport | null>(null);
	const [busy, setBusy] = useState(false);

	// Re-preview (debounced) whenever the factor changes.
	useEffect(() => {
		if (percent === 100) {
			setReport(null);
			return;
		}
		let live = true;
		const t = setTimeout(() => {
			scaleLootChances(percent, false)
				.then(r => live && setReport(r))
				.catch(e => onError(String(e)));
		}, 300);
		return () => {
			live = false;
			clearTimeout(t);
		};
	}, [percent, onError]);

	const apply = async () => {
		setBusy(true);
		try {
			onApplied(await scaleLootChances(percent, true));
			onClose();
		} catch (e) {
			onError(String(e));
			setBusy(false);
		}
	};

	return (
		<div className="ss-backdrop" onMouseDown={onClose}>
			<div className="ss-modal mx-pin-modal" onMouseDown={e => e.stopPropagation()}>
				<div className="ss-modal-title">Scale all loot chances</div>

				<div className="ss-modal-desc">
					Every loot chance in the corpus becomes{' '}
					<NumberField value={percent} onChange={setPercent} min={0} max={10000} width={70} /> % of its current
					value, clamped to 0–100,000. Entries that would not change are left untouched.
				</div>

				{percent !== 100 && !report && <div className="ss-modal-desc">Previewing…</div>}
				{report && (
					<>
						<div className="ss-modal-desc">
							{report.entries === 0
								? 'Nothing changes at this factor.'
								: `${report.entries.toLocaleString()} ${report.entries === 1 ? 'entry' : 'entries'} across ${
										report.files
								  } ${report.files === 1 ? 'file' : 'files'} change.`}
						</div>
						{report.sample.length > 0 && (
							<div className="mx-pin-list mono">
								{report.sample.map((s, i) => (
									<div className="mx-pin-row" key={i}>
										<span className="mx-pin-file">{s.file}</span>
										<span>
											{s.label || 'entry'}: {percentText(s.from)} → {percentText(s.to)}
										</span>
									</div>
								))}
								{report.entries > report.sample.length && (
									<div className="mx-pin-more">
										and {(report.entries - report.sample.length).toLocaleString()} more
									</div>
								)}
							</div>
						)}
						<div className="ss-modal-desc">
							Every changed file is backed up to <span className="mono">.monx-backup/</span> before it is
							rewritten.
						</div>
					</>
				)}

				<div className="ss-modal-buttons">
					<button className="ss-btn ss-btn-ghost" onClick={onClose}>
						Cancel
					</button>
					<div className="ss-modal-buttons-spacer" />
					<button
						className="ss-btn ss-btn-primary"
						disabled={busy || !report || report.entries === 0 || percent === 100}
						onClick={() => void apply()}
					>
						{busy ? 'Scaling…' : report ? `Scale ${report.entries.toLocaleString()}` : 'Scale'}
					</button>
				</div>
			</div>
		</div>
	);
}
