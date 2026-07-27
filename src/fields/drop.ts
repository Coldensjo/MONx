import { useCallback, useState } from 'react';

/**
 * Drop payloads the editor accepts (DESIGN §13). The editor owns the targets;
 * Agent 4's browsers and monster list own the matching sources, so these MIME
 * names are the contract between them. Payloads are also mirrored on
 * `text/plain` because dragging out of the app should still produce something
 * legible.
 */
export const DND_ITEM = 'application/x-monx-item';
export const DND_OUTFIT = 'application/x-monx-outfit';
export const DND_MONSTER = 'application/x-monx-monster';
/** Internal reorder within one list; the value is the source index. */
export const DND_ROW = 'application/x-monx-row';

export interface ItemDrag {
	serverId: number;
	name: string;
	container: boolean;
}

export interface OutfitDrag {
	type: number;
}

export interface MonsterDrag {
	file: string;
	name: string;
}

function read<T>(e: React.DragEvent, mime: string): T | null {
	const raw = e.dataTransfer.getData(mime);
	if (!raw) return null;
	try {
		return JSON.parse(raw) as T;
	} catch {
		return null;
	}
}

export const readItemDrag = (e: React.DragEvent) => read<ItemDrag>(e, DND_ITEM);
export const readOutfitDrag = (e: React.DragEvent) => read<OutfitDrag>(e, DND_OUTFIT);
export const readMonsterDrag = (e: React.DragEvent) => read<MonsterDrag>(e, DND_MONSTER);

export function hasType(e: React.DragEvent, mime: string): boolean {
	return e.dataTransfer.types.includes(mime);
}

/**
 * Drop target plumbing: accept only the MIMEs a target understands, and report
 * whether a matching drag is currently over it so the caller can paint the
 * `--accent-dim` highlight.
 */
export function useDropTarget(accepts: string[], onDrop: (e: React.DragEvent) => void, disabled?: boolean) {
	const [active, setActive] = useState(false);

	const matches = useCallback(
		(e: React.DragEvent) => !disabled && accepts.some(mime => e.dataTransfer.types.includes(mime)),
		[accepts, disabled]
	);

	return {
		active,
		props: {
			onDragOver: (e: React.DragEvent) => {
				if (!matches(e)) return;
				e.preventDefault();
				e.dataTransfer.dropEffect = 'copy';
				if (!active) setActive(true);
			},
			onDragLeave: (e: React.DragEvent) => {
				// Ignore the leave events fired while crossing child elements.
				if (e.currentTarget.contains(e.relatedTarget as Node)) return;
				setActive(false);
			},
			onDrop: (e: React.DragEvent) => {
				if (!matches(e)) return;
				e.preventDefault();
				e.stopPropagation();
				setActive(false);
				onDrop(e);
			}
		}
	};
}
