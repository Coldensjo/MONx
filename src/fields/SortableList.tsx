import { useState, type ReactNode } from 'react';
import { GripVertical, Trash2 } from 'lucide-react';
import { DND_ROW } from './drop';

interface Props<T> {
	items: T[];
	onChange: (next: T[]) => void;
	renderRow: (item: T, index: number) => ReactNode;
	keyOf: (item: T, index: number) => string;
	disabled?: boolean;
	empty?: ReactNode;
	/** Row-level extra controls, rendered after the delete button. */
	rowActions?: (item: T, index: number) => ReactNode;
}

export function moveItem<T>(list: T[], from: number, to: number): T[] {
	if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list;
	const next = list.slice();
	const [row] = next.splice(from, 1);
	next.splice(to, 0, row);
	return next;
}

/** Reorderable rows for loot, attacks, summons and voices. Order is meaningful
    in the XML, so a reorder rewrites the array rather than sorting a view. */
export function SortableList<T>({ items, onChange, renderRow, keyOf, disabled, empty, rowActions }: Props<T>) {
	const [dragIndex, setDragIndex] = useState<number | null>(null);
	const [overIndex, setOverIndex] = useState<number | null>(null);

	if (items.length === 0 && empty) return <div className="ss-ed-empty">{empty}</div>;

	return (
		<div className="ss-ed-list">
			{items.map((item, i) => (
				<div
					key={keyOf(item, i)}
					className={overIndex === i && dragIndex !== null && dragIndex !== i ? 'ss-ed-row ss-ed-row-over' : 'ss-ed-row'}
					onDragOver={e => {
						if (dragIndex === null) return;
						e.preventDefault();
						setOverIndex(i);
					}}
					onDrop={e => {
						if (dragIndex === null) return;
						e.preventDefault();
						e.stopPropagation();
						onChange(moveItem(items, dragIndex, i));
						setDragIndex(null);
						setOverIndex(null);
					}}
				>
					<button
						type="button"
						className="ss-ed-grip"
						draggable={!disabled}
						disabled={disabled}
						title="Drag to reorder"
						onDragStart={e => {
							e.dataTransfer.setData(DND_ROW, String(i));
							e.dataTransfer.effectAllowed = 'move';
							setDragIndex(i);
						}}
						onDragEnd={() => {
							setDragIndex(null);
							setOverIndex(null);
						}}
					>
						<GripVertical size={14} />
					</button>
					<div className="ss-ed-row-body">{renderRow(item, i)}</div>
					<div className="ss-ed-row-actions">
						{rowActions?.(item, i)}
						<button
							type="button"
							className="ss-btn ss-btn-ghost ss-ed-mini"
							disabled={disabled}
							title="Remove"
							onClick={() => onChange(items.filter((_, j) => j !== i))}
						>
							<Trash2 size={14} />
						</button>
					</div>
				</div>
			))}
		</div>
	);
}
