import { useEffect, useMemo, useRef, useState } from 'react';
import { save as saveDialog } from '@tauri-apps/plugin-dialog';
import { writeTextFile } from './monster';
import {
	countLines,
	diffMarks,
	formatWhen,
	loadCutoff,
	patchMarks,
	relativeWhen,
	saveCutoff,
	toMarkdown,
	type PatchCutoff,
	type PatchMark
} from './patchnotes';

interface Props {
	/** Display name of the workspace, for the report heading. */
	label: string;
	/** Which workspace the cut-off point belongs to. */
	monstersPath: string;
	/** True when the open monster has unsaved edits — marks are read from disk. */
	dirty: boolean;
	onClose: () => void;
	onToast: (kind: 'ok' | 'error', message: string) => void;
}

/**
 * Patch notes against the user's cut-off point rather than against the moment
 * the workspace happened to open. The cut-off is stored per workspace, so the
 * span can be an afternoon or a fortnight of sessions, and moving it forward is
 * offered here — on export and, when nothing changed, on its own.
 */
export default function PatchNotesDialog({ label, monstersPath, dirty, onClose, onToast }: Props) {
	const [cutoff, setCutoff] = useState<PatchCutoff | null>(() => loadCutoff(monstersPath));
	const [now, setNow] = useState<PatchMark[] | null>(null);
	/** Move the cut-off point to now as part of exporting. */
	const [advance, setAdvance] = useState(true);
	const [busy, setBusy] = useState(false);

	// Read once, on mount: the corpus does not move while a modal is over it, and
	// depending on the parent's inline callbacks would re-read on every render.
	const handlers = useRef({ onClose, onToast });
	handlers.current = { onClose, onToast };
	useEffect(() => {
		let live = true;
		patchMarks()
			.then(m => live && setNow(m))
			.catch(e => {
				handlers.current.onToast('error', String(e));
				handlers.current.onClose();
			});
		return () => {
			live = false;
		};
	}, []);

	const changes = useMemo(
		() => (cutoff && now ? diffMarks(cutoff.marks, now) : []),
		[cutoff, now]
	);
	const lines = countLines(changes);

	const markNow = () => {
		if (!now) return;
		const next = saveCutoff(monstersPath, now);
		if (!next) {
			onToast('error', 'Could not store the cut-off point');
			return;
		}
		setCutoff(next);
		onToast('ok', `Cut-off point set — ${now.length} ${now.length === 1 ? 'monster' : 'monsters'} marked`);
	};

	const exportNotes = async () => {
		if (!cutoff || !now) return;
		setBusy(true);
		try {
			const path = await saveDialog({ defaultPath: 'monx-patch-notes.md' });
			if (!path) {
				setBusy(false);
				return;
			}
			await writeTextFile(path, toMarkdown(label, cutoff.at, changes));
			const moved = advance && saveCutoff(monstersPath, now) !== null;
			onToast(
				'ok',
				`Exported ${lines} ${lines === 1 ? 'change' : 'changes'}${moved ? ' — cut-off point moved to now' : ''}`
			);
			onClose();
		} catch (e) {
			onToast('error', String(e));
			setBusy(false);
		}
	};

	const copy = async () => {
		if (!cutoff) return;
		try {
			await navigator.clipboard.writeText(toMarkdown(label, cutoff.at, changes));
			onToast('ok', 'Patch notes copied');
		} catch (e) {
			onToast('error', String(e));
		}
	};

	return (
		<div className="ss-backdrop" onMouseDown={onClose}>
			<div className="ss-modal mx-pin-modal mx-patch-modal" onMouseDown={e => e.stopPropagation()}>
				<div className="ss-modal-title">Export patch notes</div>

				{!now ? (
					<div className="ss-modal-desc">Reading the corpus…</div>
				) : !cutoff ? (
					<>
						<div className="ss-modal-desc">
							No cut-off point is set for this workspace yet. Set one now, edit monsters as usual, and come
							back here — the notes will cover everything between the two.
						</div>
						<div className="ss-modal-buttons">
							<button className="ss-btn ss-btn-ghost" onClick={onClose}>
								Cancel
							</button>
							<div className="ss-modal-buttons-spacer" />
							<button className="ss-btn ss-btn-primary" onClick={markNow}>
								Set cut-off point
							</button>
						</div>
					</>
				) : (
					<>
						<div className="ss-modal-desc">
							Cut-off point: <span className="mono">{formatWhen(cutoff.at)}</span>{' '}
							<span className="mx-patch-ago">({relativeWhen(cutoff.at)})</span>
						</div>

						{dirty && (
							<div className="ss-modal-desc mx-pin-warn">
								The open monster has unsaved edits. Notes are read from disk, so those are not included
								yet.
							</div>
						)}

						{lines === 0 ? (
							<div className="ss-modal-desc">
								No monster has changed since the cut-off point. Move it to now if you are starting a new
								round of edits.
							</div>
						) : (
							<>
								<div className="ss-modal-desc">
									{lines.toLocaleString()} {lines === 1 ? 'change' : 'changes'} across {changes.length}{' '}
									{changes.length === 1 ? 'monster' : 'monsters'}.
								</div>
								<div className="mx-pin-list mx-patch-list">
									{changes.map(c => (
										<div className="mx-patch-group" key={c.file}>
											<div className="mx-patch-monster">
												{c.monster}
												<span className={`mx-patch-kind mx-patch-${c.kind}`}>{c.kind}</span>
											</div>
											{c.lines.map((l, i) => (
												<div className="mx-patch-line" key={i}>
													{l.replace(/^- /, '')}
												</div>
											))}
										</div>
									))}
								</div>
							</>
						)}

						<label className="mx-scale-check">
							<input type="checkbox" checked={advance} onChange={e => setAdvance(e.target.checked)} />
							Set a new cut-off point here after exporting
						</label>

						<div className="ss-modal-buttons">
							<button className="ss-btn ss-btn-ghost" onClick={onClose}>
								Cancel
							</button>
							<button className="ss-btn ss-btn-ghost" onClick={markNow} title="Start the next span from now">
								Set cut-off to now
							</button>
							<div className="ss-modal-buttons-spacer" />
							<button className="ss-btn ss-btn-ghost" disabled={lines === 0} onClick={() => void copy()}>
								Copy
							</button>
							<button
								className="ss-btn ss-btn-primary"
								disabled={busy || lines === 0}
								onClick={() => void exportNotes()}
							>
								{busy ? 'Exporting…' : 'Export…'}
							</button>
						</div>
					</>
				)}
			</div>
		</div>
	);
}
