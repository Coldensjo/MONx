import type { ReactNode } from 'react';

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
    of several mutually exclusive settings (look mode, area shape). */
export function ToggleGroup<T extends string>({ value, onChange, options, disabled }: ToggleGroupProps<T>) {
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
