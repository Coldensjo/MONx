import { useCallback, useState } from 'react';
import { MIME_PREFIX, payloadFromEvent } from '../dnd';

/**
 * Drop-target adapter for the editor sections.
 *
 * The wire format is `dnd.ts`'s — that is the shared contract, and Agent 4's
 * browsers and monster list are already the sources for it. This file exists
 * only because the editor's targets were written against a different, briefly
 * parallel set of MIME names; it keeps their call shape (`{ active, props }`,
 * MIME strings rather than kinds) so the nine sections did not have to be
 * rewritten, and translates to the real payloads underneath.
 *
 * If the sections are ever touched again, use `dnd.ts` directly and delete this.
 */
export const DND_ITEM = `${MIME_PREFIX}item`;
export const DND_OUTFIT = `${MIME_PREFIX}outfit`;
export const DND_MONSTER = `${MIME_PREFIX}monster`;
/** Internal reorder within one list; the value is the source index. Deliberately
 *  outside `dnd.ts`'s payload union so its targets ignore it. */
export const DND_ROW = `${MIME_PREFIX}row`;

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

export function readItemDrag(e: React.DragEvent): ItemDrag | null {
	const p = payloadFromEvent(e);
	return p?.kind === 'item'
		? { serverId: p.serverId, name: p.name, container: p.container }
		: null;
}

export function readOutfitDrag(e: React.DragEvent): OutfitDrag | null {
	const p = payloadFromEvent(e);
	return p?.kind === 'outfit' ? { type: p.type } : null;
}

export function readMonsterDrag(e: React.DragEvent): MonsterDrag | null {
	const p = payloadFromEvent(e);
	return p?.kind === 'monster' ? { file: p.file, name: p.name } : null;
}

export function hasType(e: React.DragEvent, mime: string): boolean {
	return e.dataTransfer.types.includes(mime);
}

/**
 * Accept only the MIMEs a target understands, and report whether a matching drag
 * is currently over it so the caller can paint the `--accent-dim` highlight.
 */
export function useDropTarget(
	accepts: string[],
	onDrop: (e: React.DragEvent) => void,
	disabled?: boolean
) {
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
