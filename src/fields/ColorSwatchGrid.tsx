import { memo, useEffect, useRef, useState } from 'react';
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
	const [open, setOpen] = useState(false);
	const wrapRef = useRef<HTMLDivElement>(null);
	const hex = OUTFIT_PALETTE[value] ?? '#000000';

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
				title={`${label} colour ${value}`}
			>
				<span className="ss-ed-color-chip" style={{ background: hex }} />
				<span className="ss-ed-color-index">{value}</span>
			</button>
			{open && (
				<div className="ss-ed-popover ss-ed-popover-palette">
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
