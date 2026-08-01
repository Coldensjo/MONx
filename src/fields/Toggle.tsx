import type { ReactNode } from 'react';
import { useCompact } from './Field';

interface ToggleProps {
	checked: boolean;
	onChange: (v: boolean) => void;
	label: ReactNode;
	disabled?: boolean;
	title?: string;
	/** Shown when the value differs from the loader's default for this flag. */
	changed?: boolean;
}

export function Toggle({ checked, onChange, label, disabled, title, changed }: ToggleProps) {
	return (
		<label className={changed ? 'ss-ed-toggle ss-ed-toggle-changed' : 'ss-ed-toggle'} title={title}>
			<input type="checkbox" checked={checked} disabled={disabled} onChange={e => onChange(e.target.checked)} />
			<span>{label}</span>
		</label>
	);
}

interface ToggleGroupProps<T extends string> {
	value: T;
	onChange: (v: T) => void;
	options: { value: T; label: string; title?: string; disabled?: boolean }[];
	disabled?: boolean;
}

/** Segmented single-choice control — used where the engine takes exactly one
    of several mutually exclusive settings (look mode, area shape).

    Compact makes it a select. Four segments are the clearest control there is
    when there is a line to spend on them and the worst when there is not: in a
    column half the editor's width they wrap, and the last one ends up somewhere
    nobody looks. One row either way, and the choice is still exclusive. */
export function ToggleGroup<T extends string>({ value, onChange, options, disabled }: ToggleGroupProps<T>) {
	const compact = useCompact();
	if (compact) {
		return (
			<select
				className="ss-ed-input ss-ed-select"
				value={value}
				disabled={disabled}
				onChange={e => onChange(e.target.value as T)}
				title={options.find(o => o.value === value)?.title}
			>
				{options.map(o => (
					<option key={o.value} value={o.value} disabled={o.disabled}>
						{o.label}
					</option>
				))}
			</select>
		);
	}
	return (
		<div className="ss-ed-toggle-group">
			{options.map(o => (
				<button
					key={o.value}
					type="button"
					className={o.value === value ? 'ss-ed-seg ss-ed-seg-active' : 'ss-ed-seg'}
					disabled={disabled || o.disabled}
					title={o.title}
					onClick={() => onChange(o.value)}
				>
					{o.label}
				</button>
			))}
		</div>
	);
}
