import { useEffect, useState } from 'react';

interface Props {
	value: number;
	onChange: (v: number) => void;
	min?: number;
	max?: number;
	/** Blocks the keystroke instead of clamping — for limits where the engine
	    drops the whole entry rather than correcting it (loot countmax, §13). */
	hardMax?: number;
	step?: number;
	disabled?: boolean;
	placeholder?: string;
	width?: number;
	/** Marked next to the input when the value differs from the corpus norm. */
	corpusDefault?: number | null;
	title?: string;
	/** Every keystroke as typed, including text that does not commit ("0.", ""),
	    and null on blur. For readouts that must track the field live. */
	onDraft?: (raw: string | null) => void;
}

/**
 * Numeric input that keeps the typed text while it is being edited, so a value
 * cleared to retype does not snap to 0 mid-keystroke. Out-of-range values are
 * shown as written and left to the lint engine — silent correction would break
 * round-trip (DESIGN §10).
 */
export function NumberField({
	value,
	onChange,
	min,
	max,
	hardMax,
	step,
	disabled,
	placeholder,
	width,
	corpusDefault,
	title,
	onDraft
}: Props) {
	const [text, setText] = useState(String(value));
	const [editing, setEditing] = useState(false);

	useEffect(() => {
		if (!editing) setText(String(value));
	}, [value, editing]);

	const commit = (raw: string) => {
		setText(raw);
		onDraft?.(raw);
		if (raw === '' || raw === '-') return;
		const n = Number(raw);
		if (!Number.isFinite(n)) return;
		if (hardMax !== undefined && n > hardMax) return;
		onChange(n);
	};

	const showDefault = corpusDefault !== undefined && corpusDefault !== null && value !== corpusDefault;

	return (
		<span className="ss-ed-number">
			<input
				type="number"
				className="ss-ed-input ss-ed-input-num"
				style={width ? { width } : undefined}
				value={text}
				min={min}
				max={max}
				step={step}
				disabled={disabled}
				placeholder={placeholder}
				title={title}
				onFocus={() => setEditing(true)}
				onBlur={() => {
					setEditing(false);
					setText(String(value));
					onDraft?.(null);
				}}
				onChange={e => commit(e.target.value)}
			/>
			{showDefault && (
				<button
					type="button"
					className="ss-ed-default-mark"
					title={`Corpus default is ${corpusDefault} — click to use it`}
					disabled={disabled}
					onClick={() => onChange(corpusDefault)}
				>
					{corpusDefault}
				</button>
			)}
		</span>
	);
}
