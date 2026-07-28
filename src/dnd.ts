import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

// Typed drag-and-drop. Drag is the primary interaction in MONx (DESIGN §13), not
// a shortcut, so the payloads are a closed union and every drop target declares
// exactly which kinds it accepts.
//
// This is built on pointer events rather than the HTML5 drag-and-drop API. It has
// to be: the window runs with Tauri's `dragDropEnabled`, which is what delivers
// the workspace folder drops on the landing screen (App.tsx), and on Windows that
// OS-level drop handler swallows HTML5 dragstart/dragover/drop inside the webview
// entirely. The two are mutually exclusive and there is no runtime toggle — only
// `WebviewWindowBuilder::disable_drag_drop_handler` at window creation. Owning the
// gesture ourselves keeps both working.

export type DragPayload =
	// `container` travels with the item because the loot editor decides whether a
	// dropped entry can nest children before it has resolved the id.
	| { kind: 'item'; serverId: number; name: string; container: boolean }
	| { kind: 'outfit'; type: number }
	| { kind: 'monster'; file: string; name: string }
	| { kind: 'reorder'; list: string; index: number };

export type DragKind = DragPayload['kind'];

/** Pointer travel before a press becomes a drag. Below this it stays a click, so
 *  selecting a grid cell and dragging one out are the same opening gesture. */
const DRAG_THRESHOLD = 4;

// ---------- Target registry ----------

interface Target {
	el: HTMLElement | null;
	accepts: (kind: DragKind) => boolean;
	drop: (p: DragPayload) => void;
	setActive: (v: boolean) => void;
}

// Keyed by element so a hit test can walk up the DOM from `elementFromPoint`.
const targets = new Map<HTMLElement, Target>();

let activeTarget: Target | null = null;

function setActiveTarget(t: Target | null): void {
	if (activeTarget === t) return;
	activeTarget?.setActive(false);
	activeTarget = t;
	activeTarget?.setActive(true);
}

/**
 * The innermost registered target under the pointer that accepts this kind.
 * Walking past targets that decline is what makes fall-through work — a plain
 * loot row ignores an item drag, so the drop lands on the list behind it and
 * appends instead of nesting.
 */
function targetAt(x: number, y: number, kind: DragKind): Target | null {
	let node = document.elementFromPoint(x, y) as HTMLElement | null;
	while (node) {
		const t = targets.get(node);
		if (t && t.accepts(kind)) return t;
		node = node.parentElement;
	}
	return null;
}

// ---------- Drag engine ----------

interface Ghost {
	el: HTMLElement;
	dx: number;
	dy: number;
}

let ghost: Ghost | null = null;

/** The sprite (or a copy of the row) that follows the cursor — every drag shows
 *  one, per DESIGN §13. `pointer-events: none` keeps it out of the hit test. */
function makeGhost(source: HTMLElement, url: string | undefined, size: number): Ghost {
	const el = document.createElement('div');
	el.className = 'ss-drag-ghost';
	el.style.position = 'fixed';
	el.style.left = '0';
	el.style.top = '0';
	el.style.zIndex = '9999';
	el.style.pointerEvents = 'none';
	el.style.opacity = '0.85';

	if (url) {
		el.style.width = `${size}px`;
		el.style.height = `${size}px`;
		el.style.backgroundImage = `url("${url}")`;
		el.style.backgroundSize = 'contain';
		el.style.backgroundRepeat = 'no-repeat';
		el.style.backgroundPosition = 'center';
		el.style.imageRendering = 'pixelated';
		document.body.appendChild(el);
		return { el, dx: size / 2, dy: size / 2 };
	}

	// No sprite for this source (reorder grips, mostly) — carry a copy of the row
	// itself, which is what the browser's own snapshot used to give us.
	const rect = source.getBoundingClientRect();
	const clone = source.cloneNode(true) as HTMLElement;
	clone.style.margin = '0';
	el.style.width = `${rect.width}px`;
	el.style.height = `${rect.height}px`;
	el.appendChild(clone);
	document.body.appendChild(el);
	return { el, dx: rect.width / 2, dy: rect.height / 2 };
}

function moveGhost(x: number, y: number): void {
	if (ghost) ghost.el.style.transform = `translate(${x - ghost.dx}px, ${y - ghost.dy}px)`;
}

interface Session {
	payload: () => DragPayload | null;
	source: HTMLElement;
	ghostUrl?: string;
	ghostSize: number;
	x0: number;
	y0: number;
	/** Null until the pointer passes the threshold and the drag actually begins. */
	live: DragPayload | null;
}

let session: Session | null = null;

// Images and text inside a drag source would otherwise start a native HTML5 drag
// on top of ours — which on Windows is exactly the broken path we are avoiding.
function blockNativeDrag(e: Event): void {
	e.preventDefault();
}

function endSession(): void {
	if (!session) return;
	session = null;
	ghost?.el.remove();
	ghost = null;
	setActiveTarget(null);
	document.body.classList.remove('ss-dragging');
	window.removeEventListener('pointermove', onPointerMove);
	window.removeEventListener('pointerup', onPointerUp);
	window.removeEventListener('pointercancel', endSession);
	window.removeEventListener('keydown', onKeyDown, true);
	window.removeEventListener('dragstart', blockNativeDrag, true);
}

function onKeyDown(e: KeyboardEvent): void {
	if (e.key === 'Escape') {
		e.preventDefault();
		endSession();
	}
}

function onPointerMove(e: PointerEvent): void {
	if (!session) return;
	if (!session.live) {
		if (Math.abs(e.clientX - session.x0) < DRAG_THRESHOLD && Math.abs(e.clientY - session.y0) < DRAG_THRESHOLD) {
			return;
		}
		// Read the payload here, not at pointerdown: a cell's index or id can change
		// between renders while the memoized row holding it does not.
		const p = session.payload();
		if (!p) {
			endSession();
			return;
		}
		session.live = p;
		ghost = makeGhost(session.source, session.ghostUrl, session.ghostSize);
		document.body.classList.add('ss-dragging');
	}
	// Suppresses text selection now that the press is unambiguously a drag.
	e.preventDefault();
	moveGhost(e.clientX, e.clientY);
	setActiveTarget(targetAt(e.clientX, e.clientY, session.live.kind));
}

function onPointerUp(e: PointerEvent): void {
	if (!session) return;
	const p = session.live;
	// Resolved from the release point rather than the last hover, so a drop always
	// lands where the cursor is even if the final move event was coalesced away.
	const target = p ? targetAt(e.clientX, e.clientY, p.kind) : null;
	endSession();
	if (p && target) target.drop(p);
}

// ---------- Sources ----------

export interface DragSourceOptions {
	/** Sprite URL shown as the drag ghost. Falls back to a copy of the element. */
	ghostUrl?: string;
	/** Ghost size in px; match the cell's zoom so the ghost reads as the thing itself. */
	ghostSize?: number;
}

export interface DragSourceProps {
	onPointerDown: (e: React.PointerEvent) => void;
}

// A loot row is both a drag source and a form: pressing inside one of its fields
// has to stay a caret placement / text selection, not the start of a reorder. The
// grip in SortableList is itself a button, so only *nested* controls are excluded.
const INTERACTIVE = 'input, textarea, select, button, a, [contenteditable=""], [contenteditable="true"]';

function fromNestedControl(e: React.PointerEvent): boolean {
	const target = e.target as HTMLElement | null;
	const control = target?.closest(INTERACTIVE);
	return !!control && control !== e.currentTarget;
}

/**
 * Makes an element a typed drag source. `payload` is a function so the value is
 * read when the drag begins, not when the element rendered.
 *
 * Returning null from `payload` cancels the drag.
 */
export function useDragSource(payload: () => DragPayload | null, opts: DragSourceOptions = {}): DragSourceProps {
	const { ghostUrl, ghostSize = 32 } = opts;
	const payloadRef = useRef(payload);
	payloadRef.current = payload;
	const optsRef = useRef({ ghostUrl, ghostSize });
	optsRef.current = { ghostUrl, ghostSize };

	const onPointerDown = useCallback((e: React.PointerEvent) => {
		if (e.button !== 0 || fromNestedControl(e)) return;
		// No preventDefault: the press must still reach the element's own mousedown
		// so a grid cell selects itself on the way into a drag.
		endSession();
		session = {
			payload: () => payloadRef.current(),
			source: e.currentTarget as HTMLElement,
			ghostUrl: optsRef.current.ghostUrl,
			ghostSize: optsRef.current.ghostSize,
			x0: e.clientX,
			y0: e.clientY,
			live: null
		};
		window.addEventListener('pointermove', onPointerMove);
		window.addEventListener('pointerup', onPointerUp);
		window.addEventListener('pointercancel', endSession);
		window.addEventListener('keydown', onKeyDown, true);
		window.addEventListener('dragstart', blockNativeDrag, true);
	}, []);

	return { onPointerDown };
}

// ---------- Targets ----------

export interface DropTargetProps {
	ref: (el: HTMLElement | null) => void;
	/** Rendered as `data-drop-active="true"` while a matching drag is over the target,
	 *  which the stylesheets hang the `--accent-dim` highlight off. */
	'data-drop-active': true | undefined;
}

/**
 * Makes an element a drop target for the given payload kinds. Spread the result
 * onto the element; it highlights itself while a matching drag is over it and
 * ignores drags it cannot accept, so an unrelated drag passes through to whatever
 * is underneath.
 */
export function useDropTarget(accept: DragKind[], onDrop: (p: DragPayload) => void): DropTargetProps {
	const [active, setActive] = useState(false);

	const acceptRef = useRef(accept);
	acceptRef.current = accept;
	const onDropRef = useRef(onDrop);
	onDropRef.current = onDrop;

	// One stable object per target for the lifetime of the hook: it is the registry
	// key's value and the engine holds on to it across renders.
	const targetRef = useRef<Target>();
	if (!targetRef.current) {
		targetRef.current = {
			el: null,
			accepts: kind => acceptRef.current.includes(kind),
			drop: p => onDropRef.current(p),
			setActive
		};
	}

	const ref = useCallback((el: HTMLElement | null) => {
		const t = targetRef.current!;
		if (t.el) targets.delete(t.el);
		t.el = el;
		if (el) targets.set(el, t);
		// A target can unmount mid-drag (a virtualized row scrolling away); leaving
		// it as the active one would strand the highlight and the drop.
		else if (activeTarget === t) activeTarget = null;
	}, []);

	useEffect(
		() => () => {
			const t = targetRef.current!;
			if (t.el) targets.delete(t.el);
			if (activeTarget === t) activeTarget = null;
		},
		[]
	);

	return useMemo(() => ({ ref, 'data-drop-active': active || undefined }), [ref, active]);
}

/** Moves an item within a list, for `reorder` drops. Returns a new array. */
export function reorder<T>(list: T[], from: number, to: number): T[] {
	if (from === to || from < 0 || from >= list.length) return list;
	const next = list.slice();
	const [moved] = next.splice(from, 1);
	next.splice(Math.max(0, Math.min(next.length, to)), 0, moved);
	return next;
}
