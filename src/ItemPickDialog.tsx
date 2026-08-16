// The modal wrapper around `ItemPickPanel` — same grid/tray/menu, in a
// backdrop instead of the rail's centre column. Opened by the Loot and Look
// sections' "Select…" buttons (see `browseLootItems`/`browseCorpses`/
// `browseItems` in Workspace.tsx) so picking loot, a corpse or a typeex look
// no longer means leaving the monster you are editing.

import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import ItemPickPanel, { type ItemPickPanelProps } from './ItemPickPanel';

export interface ItemPickDialogProps extends ItemPickPanelProps {
	title: string;
	instructions?: string;
	onClose: () => void;
}

export default function ItemPickDialog({ title, instructions, onClose, ...panel }: ItemPickDialogProps) {
	const { t } = useTranslation();
	return (
		<div className="ss-backdrop" onMouseDown={onClose}>
			<div className="ss-modal mx-item-pick-modal" onMouseDown={e => e.stopPropagation()}>
				<div className="mx-item-pick-head">
					<div>
						<div className="ss-modal-title">{title}</div>
						{instructions && <div className="ss-modal-desc">{instructions}</div>}
					</div>
					<button className="ss-btn ss-btn-ghost ss-ed-mini" onClick={onClose} aria-label={t('Close')}>
						<X size={14} />
					</button>
				</div>
				<div className="mx-item-pick-body">
					{/* A direct commit and the tray's primary action both finish this
					    dialog session through the same close path. */}
					<ItemPickPanel {...panel} onPicked={onClose} />
				</div>
			</div>
		</div>
	);
}
