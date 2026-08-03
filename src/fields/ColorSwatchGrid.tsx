import { useTranslation } from 'react-i18next';
import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { OUTFIT_PALETTE, OUTFIT_PALETTE_COLUMNS } from '../catalog';

interface Props {
	value: number;
	onChange: (v: number) => void;
	label: string;
	disabled?: boolean;
}

const Grid = memo(function Grid({ value, onChange }: { value: number; onChange: (v: number) => void }) {
	return (
		<div className="ss-ed-palette" style={{ gridTemplateColumns: `repeat(${OUTFIT_PALETTE_COLUMNS}, 14px)` }}>
			{OUTFIT_PALETTE.map((hex, i) => (
				<button
					key={i}
					type="button"
					className={i === value ? 'ss-ed-swatch ss-ed-swatch-active' : 'ss-ed-swatch'}
					style={{ background: hex }}
					title={`${i} — ${hex}`}
					onClick={() => onChange(i)}
				/>
			))}
		</div>
	);
});

/** The client's outfit palette as a grid. The XML stores an index; the designer
    picks a colour, which is the whole point of "show the thing, not the id". */
export function ColorSwatchGrid({ value, onChange, label, disabled }: Props) {
	const { t } = useTranslation();
	const [open, setOpen] = useState(false);
	const [alignRight, setAlignRight] = useState(false);
	const wrapRef = useRef<HTMLDivElement>(null);
	const popRef = useRef<HTMLDivElement>(null);
	const hex = OUTFIT_PALETTE[value] ?? '#000000';

	// The palette is nineteen swatches wide — wider than the column the trigger
	// sits in — so opened from feet, or from head on a narrow window, it ran past
	// the editor's right edge. `.ss-ed-scroll` scrolls vertically, which makes it
	// clip horizontally too, and the overhang vanished under the preview panel.
	// Measured against that box rather than the window: the panel is inside the
	// window and the editor is not the only thing in it.
	//
	// A layout effect, so the flip is decided before the popover is painted —
	// after paint it would open in the wrong place and jump.
	useLayoutEffect(() => {
		if (!open) return;
		const wrap = wrapRef.current;
		const pop = popRef.current;
		if (!wrap || !pop) return;
		const box = wrap.closest('.ss-ed-scroll') ?? document.documentElement;
		const room = box.getBoundingClientRect().right - wrap.getBoundingClientRect().left;
		setAlignRight(pop.offsetWidth > room);
	}, [open]);

	useEffect(() => {
		if (!open) return;
		const onDown = (e: MouseEvent) => {
			if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
		};
		document.addEventListener('mousedown', onDown);
		return () => document.removeEventListener('mousedown', onDown);
	}, [open]);

	return (
		<div className="ss-ed-colorpick" ref={wrapRef}>
			<button
				type="button"
				className="ss-ed-input ss-ed-color-trigger"
				disabled={disabled}
				onClick={() => setOpen(o => !o)}
				title={t('{{part}} colour {{value}}', { part: t(label), value })}
			>
				<span className="ss-ed-color-chip" style={{ background: hex }} />
				<span className="ss-ed-color-index">{value}</span>
			</button>
			{open && (
				<div
					ref={popRef}
					className={`ss-ed-popover ss-ed-popover-palette${alignRight ? ' ss-ed-popover-right' : ''}`}
				>
					<Grid
						value={value}
						onChange={v => {
							onChange(v);
							setOpen(false);
						}}
					/>
				</div>
			)}
		</div>
	);
}
