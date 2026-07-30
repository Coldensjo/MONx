import { useEffect, useMemo, useState } from 'react';
import { scaleLootChances, tauriItemIndex, type ScaleOptions, type ScaleReport, type ScaledEntry } from './monster';
import { NumberField } from './fields/NumberField';
import { ItemPicker, ItemSprite } from './fields/ItemPicker';
import { oddsText, percentText } from './sections/Loot';

interface Props {
	/** Server id the dialog opens on — set when it is summoned from an item. */
	initialItemId?: number | null;
	onClose: () => void;
	/** Ran after a successful write, with the report, so the caller can refresh and toast. */
	onApplied: (report: ScaleReport) => void;
	onError: (message: string) => void;
}

/** Rows of one file, as the preview groups them. */
interface FileGroup {
	file: string;
	monster: string;
	entries: ScaledEntry[];
}

function group(sample: ScaledEntry[]): FileGroup[] {
	const byFile = new Map<string, FileGroup>();
	for (const e of sample) {
		const g = byFile.get(e.file);
		if (g) g.entries.push(e);
		else byFile.set(e.file, { file: e.file, monster: e.monster, entries: [e] });
	}
	return [...byFile.values()].sort((a, b) => a.monster.localeCompare(b.monster));
}

/**
 * Corpus-wide loot chance scaling, preview-then-apply like PinLootDialog: the
 * dry run and the write are the same backend walk, so the preview list is
 * exactly what the apply does.
 *
 * The preview is the review step, not a sample — every matched monster is
 * listed with its new chance, and each one can be unticked before applying.
 * Unticked files ride along as `excludeFiles`, so the write skips exactly what
 * the list said it would.
 */
export default function ScaleLootDialog({ initialItemId = null, onClose, onApplied, onError }: Props) {
	const [itemId, setItemId] = useState<number | null>(initialItemId);
	/** False multiplies the existing chance; true sets a flat chance. */
	const [set, setSet] = useState(false);
	const [percent, setPercent] = useState(100);
	const [keepNonzero, setKeepNonzero] = useState(true);
	/** Files unticked in the preview. Cleared whenever the preview changes. */
	const [excluded, setExcluded] = useState<Set<string>>(new Set());
	const [report, setReport] = useState<ScaleReport | null>(null);
	const [busy, setBusy] = useState(false);

	// In multiply mode 100% is a no-op; in set mode it is a real target (every
	// matched entry always drops), so only the former short-circuits.
	const noop = !set && percent === 100;

	const opts: ScaleOptions = useMemo(
		() => ({ set, percent, itemId, keepNonzero, excludeFiles: [] }),
		[set, percent, itemId, keepNonzero]
	);

	// Re-preview (debounced) whenever anything the walk reads changes.
	useEffect(() => {
		setExcluded(new Set());
		if (noop) {
			setReport(null);
			return;
		}
		let live = true;
		const t = setTimeout(() => {
			scaleLootChances(opts, false)
				.then(r => live && setReport(r))
				.catch(e => onError(String(e)));
		}, 300);
		return () => {
			live = false;
			clearTimeout(t);
		};
	}, [opts, noop, onError]);

	const groups = useMemo(() => group(report?.sample ?? []), [report]);

	// What actually gets written: the report minus whatever is unticked. Rows
	// past the preview cap are never unticked, so subtracting the listed ones is
	// exact either way.
	const excludedEntries = groups
		.filter(g => excluded.has(g.file))
		.reduce((n, g) => n + g.entries.length, 0);
	const entries = (report?.entries ?? 0) - excludedEntries;
	const files = (report?.files ?? 0) - excluded.size;

	const toggle = (file: string) =>
		setExcluded(prev => {
			const next = new Set(prev);
			if (next.has(file)) next.delete(file);
			else next.add(file);
			return next;
		});

	const apply = async () => {
		setBusy(true);
		try {
			onApplied(await scaleLootChances({ ...opts, excludeFiles: [...excluded] }, true));
			onClose();
		} catch (e) {
			onError(String(e));
			setBusy(false);
		}
	};

	return (
		<div className="ss-backdrop" onMouseDown={onClose}>
			<div className="ss-modal mx-pin-modal mx-scale-modal" onMouseDown={e => e.stopPropagation()}>
				<div className="ss-modal-title">Scale loot chances</div>

				<div className="mx-scale-controls">
					<label className="mx-scale-row">
						<span className="mx-scale-label">Item</span>
						<ItemPicker
							index={tauriItemIndex}
							value={itemId}
							onChange={item => setItemId(item.serverId)}
							onClear={() => setItemId(null)}
							placeholder="Every item in the corpus"
						/>
					</label>

					<div className="mx-scale-row">
						<span className="mx-scale-label">Change</span>
						<div className="mx-scale-modes">
							<label className="mx-scale-mode">
								<input type="radio" checked={!set} onChange={() => setSet(false)} />
								Multiply by
							</label>
							<label className="mx-scale-mode">
								<input type="radio" checked={set} onChange={() => setSet(true)} />
								Set to
							</label>
							<NumberField
								value={percent}
								onChange={setPercent}
								min={0}
								max={set ? 100 : 10000}
								hardMax={set ? 100 : 10000}
								step={set ? 0.1 : 5}
								width={80}
							/>
							%
						</div>
					</div>

					<label className="mx-scale-check">
						<input type="checkbox" checked={keepNonzero} onChange={e => setKeepNonzero(e.target.checked)} />
						Never scale a drop down to never — floor it at 0.001% instead
					</label>
				</div>

				<div className="ss-modal-desc">
					{itemId === null
						? 'Every loot chance in the corpus is matched. Pick an item to scale just that drop.'
						: 'Every monster dropping this item is matched, nested container entries included.'}{' '}
					{set
						? `Matched entries become a flat ${percent}% drop.`
						: 'Matched chances are multiplied, then clamped to 0–100%.'}{' '}
					Entries that would not change are left untouched.
				</div>

				{noop && <div className="ss-modal-desc">Pick a factor other than 100% to see what changes.</div>}
				{!noop && !report && <div className="ss-modal-desc">Previewing…</div>}

				{report && (
					<>
						<div className="ss-modal-desc mx-scale-summary">
							{report.entries === 0 ? (
								'Nothing changes at these settings.'
							) : (
								<>
									{entries.toLocaleString()} {entries === 1 ? 'entry' : 'entries'} across {files}{' '}
									{files === 1 ? 'file' : 'files'} change.
									{excluded.size > 0 && ` ${excluded.size} unticked.`}
								</>
							)}
							{report.zeroed > 0 && (
								<span className="mx-pin-warn">
									{' '}
									{report.zeroed} {report.zeroed === 1 ? 'entry stops' : 'entries stop'} dropping
									entirely.
								</span>
							)}
						</div>

						{groups.length > 0 && (
							<>
								<div className="mx-scale-head">
									<button
										type="button"
										className="ss-btn ss-btn-ghost ss-ed-mini"
										onClick={() => setExcluded(new Set())}
										disabled={excluded.size === 0}
									>
										Select all
									</button>
									<button
										type="button"
										className="ss-btn ss-btn-ghost ss-ed-mini"
										onClick={() => setExcluded(new Set(groups.map(g => g.file)))}
										disabled={excluded.size === groups.length}
									>
										Select none
									</button>
								</div>

								<div className="mx-pin-list mx-scale-list">
									{groups.map(g => (
										<label
											key={g.file}
											className={`mx-scale-item${excluded.has(g.file) ? ' mx-scale-off' : ''}`}
										>
											<input
												type="checkbox"
												checked={!excluded.has(g.file)}
												onChange={() => toggle(g.file)}
											/>
											<span className="mx-scale-monster" title={g.file}>
												{g.monster}
											</span>
											<span className="mx-scale-entries">
												{g.entries.map((e, i) => (
													<span className="mx-scale-entry" key={i}>
														<ItemSprite serverId={e.itemId} size={20} />
														<span className="mx-scale-name">{e.label || 'entry'}</span>
														<span className="mono mx-scale-from">{percentText(e.from)}</span>
														<span className="mx-scale-arrow">→</span>
														<span className="mono mx-scale-to">{percentText(e.to)}</span>
														<span className="mx-scale-odds">{oddsText(e.to)}</span>
													</span>
												))}
											</span>
										</label>
									))}
									{report.truncated && (
										<div className="mx-pin-more">
											and {(report.entries - report.sample.length).toLocaleString()} more entries not
											listed — they are scaled too
										</div>
									)}
								</div>
							</>
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
						disabled={busy || !report || entries === 0 || noop}
						onClick={() => void apply()}
					>
						{busy ? 'Scaling…' : report && entries > 0 ? `Scale ${entries.toLocaleString()}` : 'Scale'}
					</button>
				</div>
			</div>
		</div>
	);
}
