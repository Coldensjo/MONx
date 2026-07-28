import { useEffect, useRef, useState } from 'react';

/**
 * Hold F2 to name the UI. While held, whatever is under the cursor gets
 * outlined and labelled with its React component path, its tag + `ss-`/`mx-`
 * classes, and its accessible name. Clicking while held copies the label
 * instead of activating the control underneath.
 *
 * Names come from the React fiber attached to each DOM node, so nothing in the
 * app has to be annotated. `esbuild.keepNames` in vite.config.ts is what keeps
 * the component names readable in release builds.
 */

const HOTKEY = 'F2';

interface Info {
	rect: DOMRect;
	path: string;
	selector: string;
	label: string | null;
}

/** The React fiber React attaches to every host node it renders. */
function fiberOf(node: Element): any | null {
	for (const key in node) {
		if (key.startsWith('__reactFiber$')) return (node as any)[key];
	}
	return null;
}

/** Walk fiber parents collecting named function/class components, outermost last. */
function componentPath(node: Element): string[] {
	const names: string[] = [];
	let fiber = fiberOf(node);
	while (fiber && names.length < 4) {
		const type = fiber.type;
		if (typeof type === 'function') {
			// `const X = memo(function X(){})` puts two X bindings in one scope,
			// so esbuild renames the inner one to `X2`. Drop that suffix — no
			// component here legitimately ends in a digit.
			const name = (type.displayName || type.name || '').replace(/\d+$/, '');
			if (name && name !== 'Anonymous' && names[0] !== name) names.unshift(name);
		}
		fiber = fiber.return;
	}
	return names;
}

/** `button.ss-caption-button.ss-caption-close` — only our own class prefixes. */
function selectorOf(el: Element): string {
	const classes = Array.from(el.classList).filter(c => c.startsWith('ss-') || c.startsWith('mx-'));
	return el.tagName.toLowerCase() + classes.map(c => `.${c}`).join('');
}

function accessibleName(el: Element): string | null {
	const attr =
		el.getAttribute('aria-label') ??
		el.getAttribute('title') ??
		el.getAttribute('placeholder') ??
		(el as HTMLInputElement).name;
	if (attr) return attr;
	const text = (el.textContent ?? '').trim().replace(/\s+/g, ' ');
	return text && text.length <= 40 ? text : null;
}

function describe(x: number, y: number): Info | null {
	const el = document.elementFromPoint(x, y);
	if (!el || el === document.body || el === document.documentElement) return null;
	const path = componentPath(el);
	return {
		rect: el.getBoundingClientRect(),
		path: path.join(' › '),
		selector: selectorOf(el),
		label: accessibleName(el)
	};
}

export default function UiInspector() {
	const [info, setInfo] = useState<Info | null>(null);
	const [copied, setCopied] = useState(false);
	const active = useRef(false);
	const pointer = useRef({ x: -1, y: -1 });
	// Mirrored into a ref so the listeners below can stay mounted for the
	// component's whole life instead of re-binding on every mouse move.
	const current = useRef<Info | null>(null);

	useEffect(() => {
		const show = (next: Info | null) => {
			current.current = next;
			setInfo(next);
		};

		// Always tracked so the first frame after F2 already has a target —
		// waiting for a mousemove would leave the overlay blank until the user
		// jiggles the mouse.
		const onMove = (e: MouseEvent) => {
			pointer.current = { x: e.clientX, y: e.clientY };
			if (active.current) show(describe(e.clientX, e.clientY));
		};

		const onDown = (e: KeyboardEvent) => {
			if (e.key !== HOTKEY || e.repeat || active.current) return;
			e.preventDefault();
			active.current = true;
			setCopied(false);
			show(describe(pointer.current.x, pointer.current.y));
		};

		const stop = () => {
			if (!active.current) return;
			active.current = false;
			show(null);
			setCopied(false);
		};

		const onUp = (e: KeyboardEvent) => {
			if (e.key === HOTKEY) stop();
		};

		// Swallow the click so inspecting a Save button doesn't save.
		const onClick = (e: MouseEvent) => {
			const hit = current.current;
			if (!active.current || !hit) return;
			e.preventDefault();
			e.stopPropagation();
			const text = [hit.path, hit.selector].filter(Boolean).join('  ');
			void navigator.clipboard.writeText(text).then(() => setCopied(true)).catch(() => {});
		};

		window.addEventListener('mousemove', onMove, true);
		window.addEventListener('keydown', onDown);
		window.addEventListener('keyup', onUp);
		window.addEventListener('blur', stop);
		window.addEventListener('click', onClick, true);
		return () => {
			window.removeEventListener('mousemove', onMove, true);
			window.removeEventListener('keydown', onDown);
			window.removeEventListener('keyup', onUp);
			window.removeEventListener('blur', stop);
			window.removeEventListener('click', onClick, true);
		};
	}, []);

	if (!info) return null;

	const { rect } = info;
	// Flip the card below the element when it would run off the top edge.
	const below = rect.top < 64;
	const style = {
		left: Math.min(Math.max(rect.left, 8), window.innerWidth - 320),
		top: below ? rect.bottom + 6 : rect.top - 6,
		transform: below ? 'none' : 'translateY(-100%)'
	};

	return (
		<div className="mx-inspect">
			<div
				className="mx-inspect-box"
				style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }}
			/>
			<div className="mx-inspect-card" style={style}>
				<div className="mx-inspect-name">{info.path || info.selector}</div>
				{info.path && <div className="mx-inspect-sel">{info.selector}</div>}
				{info.label && <div className="mx-inspect-label">“{info.label}”</div>}
				<div className="mx-inspect-size">
					{Math.round(rect.width)} × {Math.round(rect.height)}
				</div>
			</div>
			<div className="mx-inspect-hint">
				{copied ? 'Copied' : `Hold ${HOTKEY} · click to copy`}
			</div>
		</div>
	);
}
