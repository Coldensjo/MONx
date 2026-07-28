interface Props {
	value: string;
	onChange: (v: string) => void;
	placeholder?: string;
	disabled?: boolean;
	monospace?: boolean;
}

export function TextField({ value, onChange, placeholder, disabled, monospace }: Props) {
	return (
		<input
			type="text"
			className={monospace ? 'ss-ed-input ss-ed-input-mono' : 'ss-ed-input'}
			value={value}
			placeholder={placeholder}
			disabled={disabled}
			onChange={e => onChange(e.target.value)}
		/>
	);
}
