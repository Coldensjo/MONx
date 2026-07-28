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
					{ambiguousOnly ? 'Pin ambiguous loot ids' : 'Pin all loot ids'}
				</div>

				{!report ? (
					<div className="ss-modal-desc">Scanning the corpus…</div>
				) : (
					<>
						<div className="ss-modal-desc">
							{total === 0
								? ambiguousOnly
									? 'No loot entry names an ambiguous item. Nothing to pin.'
									: 'Every loot entry is already pinned to an id and named.'
								: `${total.toLocaleString()} loot ${total === 1 ? 'entry' : 'entries'} in ${report.files} ${
										report.files === 1 ? 'file' : 'files'
									} become id + a trailing comment naming the item.`}
							{!ambiguousOnly && count > 0 && (
								<>
									{' '}
									{report.pinned.filter(p => p.ambiguous).length} of them are ambiguous names the server
									drops today.
								</>
							)}
							{named.length > 0 && (
								<>
									{' '}
									{named.length.toLocaleString()} {named.length === 1 ? 'was' : 'were'} already an id
									with nothing saying what it is; {named.length === 1 ? 'it gains' : 'they gain'} only
									the comment.
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
										{p.ambiguous && <span className="mx-pin-flag">ambiguous</span>}
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
									<div className="mx-pin-more">and {(total - PREVIEW_ROWS).toLocaleString()} more</div>
								)}
							</div>
						)}

						{report.unresolved.length > 0 && (
							<div className="ss-modal-desc mx-pin-warn">
								{report.unresolved.length} {report.unresolved.length === 1 ? 'name' : 'names'} match no
								items.xml entry and are left untouched — MONx never invents an item id. First:{' '}
								{report.unresolved
									.slice(0, 3)
									.map(u => `${u.file}: "${u.name}"`)
									.join(', ')}
								.
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
						disabled={busy || !report || total === 0}
						onClick={() => void apply()}
					>
						{busy ? 'Pinning…' : total > 0 ? `Pin ${total.toLocaleString()}` : 'Pin'}
					</button>
				</div>
			</div>
		</div>
	);
}
