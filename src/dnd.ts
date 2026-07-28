import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

// Typed drag-and-drop over the HTML5 API. Drag is the primary interaction in MONx
// (DESIGN §13), not a shortcut, so the payloads are a closed union and every drop
// target declares exactly which kinds it accepts.

export type DragPayload =
	// `container` travels with the item because the loot editor decides whether a
	// dropped entry can nest children before it has resolved the id.
	| { kind: 'item'; serverId: number; name: string; container: boolean }
	| { kind: 'outfit'; type: number }
	| { kind: 'monster'; file: string; name: string }
	| { kind: 'reorder'; list: string; index: number };

export type DragKind = DragPayload['kind'];

// The kind is encoded in the MIME type, not just the payload, because
// `dataTransfer.getData` is blocked during `dragover` — only `types` is readable.
// Without this a target could not tell whether to accept the drag until the drop.
const MIME_PREFIX = 'application/x-monx+';

function mimeFor(kind: DragKind): string {
	return MIME_PREFIX + kind;
}

/** The payload kind carried by an in-flight drag, readable during `dragover`. */
function kindOf(dt: DataTransfer): DragKind | null {
	for (const type of Array.from(dt.types)) {
		if (type.startsWith(MIME_PREFIX)) return type.slice(MIME_PREFIX.length) as DragKind;
	}
	return null;
}

function readPayload(dt: DataTransfer): DragPayload | null {
	const kind = kindOf(dt);
	if (!kind) return null;
	try {
		return JSON.parse(dt.getData(mimeFor(kind))) as DragPayload;
	} catch {
		return null;
	}
}

// ---------- Sprite ghost ----------

// The browser needs the drag image attached and painted at `dragstart`, and it
// snapshots it synchronously — so the node is parked offscreen and removed on the
// next frame, once the snapshot has been taken.
function makeGhost(url: string, size: number): HTMLElement {
	const el = document.createElement('div');
	el.className = 'ss-drag-ghost';
	el.style.position = 'fixed';
	el.style.top = '-1000px';
	el.style.left = '-1000px';
	el.style.width = `${size}px`;
	el.style.height = `${size}px`;
	el.style.backgroundImage = `url("${url}")`;
	el.style.backgroundSize = 'contain';
	el.style.backgroundRepeat = 'no-repeat';
	el.style.backgroundPosition = 'center';
	document.body.appendChild(el);
	return el;
}

/**
 * Shows the actual sprite as the drag ghost (DESIGN §13 — every drag does this).
 * Call from a `dragstart` handler; the offscreen node cleans itself up.
 */
export function setDragGhost(e: React.DragEvent, url: string, size = 32): void {
	const ghost = makeGhost(url, size);
	e.dataTransfer.setDragImage(ghost, size / 2, size / 2);
	requestAnimationFrame(() => ghost.remove());
}

// ---------- Sources ----------

export interface DragSourceOptions {
	/** Sprite URL shown as the drag ghost. Falls back to the browser's element snapshot. */
	ghostUrl?: string;
	/** Ghost size in px; match the cell's zoom so the ghost reads as the thing itself. */
	ghostSize?: number;
	/** 'move' for reorders, 'copy' for everything else. */
	effect?: 'copy' | 'move';
}

export interface DragSourceProps {
	draggable: true;
	onDragStart: (e: React.DragEvent) => void;
	onDragEnd: (e: React.DragEvent) => void;
}

/**
 * Makes an element a typed drag source. `payload` is a function so the value is
 * read at `dragstart` — a cell's index or id can change between renders while the
 * memoized row holding it does not.
 *
 * Returning null from `payload` cancels the drag.
 */
export function useDragSource(payload: () => DragPayload | null, opts: DragSourceOptions = {}): DragSourceProps {
	const { ghostUrl, ghostSize = 32, effect } = opts;
	const payloadRef = useRef(payload);
	payloadRef.current = payload;

	const onDragStart = useCallback(
		(e: React.DragEvent) => {
			const p = payloadRef.current();
			if (!p) {
				e.preventDefault();
				return;
			}
			e.dataTransfer.setData(mimeFor(p.kind), JSON.stringify(p));
			e.dataTransfer.effectAllowed = effect ?? (p.kind === 'reorder' ? 'move' : 'copy');
			if (ghostUrl) setDragGhost(e, ghostUrl, ghostSize);
			// Stops a cell drag from also starting the grid's paint/marquee selection.
			e.stopPropagation();
		},
		[effect, ghostSize, ghostUrl]
	);

	const onDragEnd = useCallback((e: React.DragEvent) => {
		e.stopPropagation();
	}, []);

	return { draggable: true, onDragStart, onDragEnd };
}

// ---------- Targets ----------

export interface DropTargetProps {
	/** Rendered as `data-drop-active="true"` while a matching drag is over the target,
	 *  which the stylesheets hang the `--accent-dim` highlight off. */
	'data-drop-active': true | undefined;
	onDragEnter: (e: React.DragEvent) => void;
	onDragOver: (e: React.DragEvent) => void;
	onDragLeave: (e: React.DragEvent) => void;
	onDrop: (e: React.DragEvent) => void;
}

/**
 * Makes an element a drop target for the given payload kinds. Spread the result
 * onto the element; it highlights itself while a matching drag is over it and
 * ignores drags it cannot accept, so an unrelated drag passes through to whatever
 * is underneath.
 */
export function useDropTarget(accept: DragKind[], onDrop: (p: DragPayload) => void): DropTargetProps {
	const [active, setActive] = useState(false);
	// dragenter/dragleave also fire for every child element, so leaves are counted
	// against enters rather than clearing the highlight on the first one.
	const depth = useRef(0);

	const acceptRef = useRef(accept);
	acceptRef.current = accept;
	const onDropRef = useRef(onDrop);
	onDropRef.current = onDrop;

	const accepts = useCallback((e: React.DragEvent) => {
		const kind = kindOf(e.dataTransfer);
		return kind !== null && acceptRef.current.includes(kind);
	}, []);

	// A drop on a nested target stops propagation, and a cancelled drag fires
	// dragend on the source — in both cases the ancestors under the pointer never
	// see dragleave, so their highlight would stick. A capture-phase listener
	// sees every drop/dragend first and clears the state unconditionally.
	useEffect(() => {
		const reset = () => {
			depth.current = 0;
			setActive(false);
		};
		window.addEventListener('drop', reset, true);
		window.addEventListener('dragend', reset, true);
		return () => {
			window.removeEventListener('drop', reset, true);
			window.removeEventListener('dragend', reset, true);
		};
	}, []);

	const handlers = useMemo(
		() => ({
			onDragEnter: (e: React.DragEvent) => {
				if (!accepts(e)) return;
				e.preventDefault();
				depth.current++;
				setActive(true);
			},
			onDragOver: (e: React.DragEvent) => {
				if (!accepts(e)) return;
				// Only a prevented dragover marks the element as a valid drop point.
				e.preventDefault();
				e.dataTransfer.dropEffect = kindOf(e.dataTransfer) === 'reorder' ? 'move' : 'copy';
			},
			onDragLeave: (e: React.DragEvent) => {
				if (!accepts(e)) return;
				depth.current = Math.max(0, depth.current - 1);
				if (depth.current === 0) setActive(false);
			},
			onDrop: (e: React.DragEvent) => {
				if (!accepts(e)) return;
				e.preventDefault();
				e.stopPropagation();
				depth.current = 0;
				setActive(false);
				const p = readPayload(e.dataTransfer);
				if (p) onDropRef.current(p);
			}
		}),
		[accepts]
	);

	return { 'data-drop-active': active || undefined, ...handlers };
}

/** Reads a payload outside the hooks — for `App.tsx`-level handlers that own their own wiring. */
export function payloadFromEvent(e: React.DragEvent): DragPayload | null {
	return readPayload(e.dataTransfer);
}

/** Moves an item within a list, for `reorder` drops. Returns a new array. */
export function reorder<T>(list: T[], from: number, to: number): T[] {
	if (from === to || from < 0 || from >= list.length) return list;
	const next = list.slice();
	const [moved] = next.splice(from, 1);
	next.splice(Math.max(0, Math.min(next.length, to)), 0, moved);
	return next;
}
