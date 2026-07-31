import { useTranslation } from 'react-i18next';
import { FileWarning } from 'lucide-react';

interface Props {
	/** Files changed on disk that also hold unsaved edits here. */
	files: string[];
	/** Answered per file: the user may want one back and not the other. */
	onResolve: (file: string, action: 'keep' | 'load') => void;
	/** Dismissing answers "keep" for everything still listed — the safe reading
	 *  of a closed dialog is that nothing was thrown away. */
	onClose: () => void;
}

/**
 * The only case an external edit has to be asked about: the file moved on disk
 * *and* there are unsaved changes here, so one of the two versions is going to
 * be lost whatever happens.
 *
 * Everything else is adopted silently. A file MONx is not holding edits to costs
 * nothing to reload, and a dialog for it would be a confirmation with only one
 * sensible answer.
 */
export default function ExternalChangesDialog({ files, onResolve, onClose }: Props) {
	const { t } = useTranslation();
	return (
		<div className="ss-backdrop" onMouseDown={onClose}>
			<div className="ss-modal mx-ext-modal" onMouseDown={e => e.stopPropagation()}>
				<div className="ss-modal-title">
					<FileWarning size={15} />
					{t('Changed outside MONx')}
				</div>

				<p className="mx-ext-note">
					{t(
						'{{count}} file has been changed by another program and also has unsaved changes here. Loading discards your edits; keeping them means the next save overwrites what is on disk.',
						{ count: files.length }
					)}
				</p>

				<div className="mx-ext-list">
					{files.map(file => (
						<div key={file} className="mx-ext-row">
							<span className="mx-ext-file">{file}</span>
							<button type="button" className="ss-btn" onClick={() => onResolve(file, 'keep')}>
								{t('Keep mine')}
							</button>
							<button type="button" className="ss-btn ss-btn-primary" onClick={() => onResolve(file, 'load')}>
								{t('Load from disk')}
							</button>
						</div>
					))}
				</div>

				<div className="ss-modal-buttons">
					<div className="ss-modal-buttons-spacer" />
					<button type="button" className="ss-btn" onClick={onClose}>
						{t('Keep all mine')}
					</button>
				</div>
			</div>
		</div>
	);
}
