import { useTranslation } from 'react-i18next';
import type { ReactNode } from 'react';
import { GripVertical, Trash2 } from 'lucide-react';
import { reorder, useDragSource, useDropTarget } from '../dnd';

interface Props<T> {
	items: T[];
	onChange: (next: T[]) => void;
	renderRow: (item: T, index: number) => ReactNode;
	keyOf: (item: T, index: number) => string;
	/** Namespaces the reorder payload so one list cannot receive another's rows. */
	list: string;
	disabled?: boolean;
	empty?: ReactNode;
	/** Row-level extra controls, rendered before the delete button. */
	rowActions?: (item: T, index: number) => ReactNode;
}

function Row({
	index,
	list,
	disabled,
	onMove,
	onRemove,
	children,
	actions
}: {
	index: number;
	list: string;
	disabled?: boolean;
	onMove: (from: number, to: number) => void;
	onRemove: () => void;
	children: ReactNode;
	actions?: ReactNode;
}) {
	const { t } = useTranslation();
	const drag = useDragSource(() => ({ kind: 'reorder', list, index }));
	const drop = useDropTarget(['reorder'], p => {
		if (p.kind === 'reorder' && p.list === list) onMove(p.index, index);
	});

	return (
		<div className="ss-ed-row" {...drop}>
			<button type="button" className="ss-ed-grip" disabled={disabled} title={t('Drag to reorder')} {...drag}>
				<GripVertical size={14} />
			</button>
			<div className="ss-ed-row-body">{children}</div>
			<div className="ss-ed-row-actions">
				{actions}
				<button type="button" className="ss-btn ss-btn-ghost ss-ed-mini" disabled={disabled} title={t('Remove')} onClick={onRemove}>
					<Trash2 size={14} />
				</button>
			</div>
		</div>
	);
}

/** Reorderable rows for loot, attacks, summons and voices. Order is meaningful
    in the XML, so a reorder rewrites the array rather than sorting a view. */
export function SortableList<T>({ items, onChange, renderRow, keyOf, list, disabled, empty, rowActions }: Props<T>) {
	if (items.length === 0 && empty) return <div className="ss-ed-empty">{empty}</div>;

	return (
		<div className="ss-ed-list">
			{items.map((item, i) => (
				<Row
					key={keyOf(item, i)}
					index={i}
					list={list}
					disabled={disabled}
					onMove={(from, to) => onChange(reorder(items, from, to))}
					onRemove={() => onChange(items.filter((_, j) => j !== i))}
					actions={rowActions?.(item, i)}
				>
					{renderRow(item, i)}
				</Row>
			))}
		</div>
	);
}
