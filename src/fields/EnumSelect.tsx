import { useTranslation } from 'react-i18next';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';

export interface EnumOption<T extends string | number> {
	value: T;
	label: string;
	group?: string;
	/** Corpus occurrences; drives frequency sort and the trailing count. */
	usage?: number;
	/** Leading swatch/sprite — the blood colour, an effect preview, an outfit. */
	preview?: ReactNode;
	note?: string;
	disabled?: boolean;
}

interface Props<T extends string | number> {
	value: T | null;
	onChange: (v: T) => void;
	options: EnumOption<T>[];
	/** Order groups explicitly; groups not listed keep their first-seen order. */
	groupOrder?: string[];
	/** Sort within each group by `usage` descending instead of the given order. */
	frequencySort?: boolean;
	placeholder?: string;
	disabled?: boolean;
	/** Above this many options the control becomes a searchable popover. */
	searchThreshold?: number;
	width?: number;
}

function groupOptions<T extends string | number>(
	options: EnumOption<T>[],
	groupOrder: string[] | undefined,
	frequencySort: boolean | undefined
): [string, EnumOption<T>[]][] {
	const groups = new Map<string, EnumOption<T>[]>();
	for (const o of options) {
		const key = o.group ?? '';
		const list = groups.get(key);
		if (list) list.push(o);
		else groups.set(key, [o]);
	}
	if (frequencySort) {
		for (const list of groups.values()) list.sort((a, b) => (b.usage ?? 0) - (a.usage ?? 0));
	}
	const entries = [...groups.entries()];
	if (groupOrder) {
		entries.sort((a, b) => {
			const ia = groupOrder.indexOf(a[0]);
			const ib = groupOrder.indexOf(b[0]);
			return (ia < 0 ? groupOrder.length : ia) - (ib < 0 ? groupOrder.length : ib);
		});
	}
	return entries;
}

export function EnumSelect<T extends string | number>({
	value,
	onChange,
	options,
	groupOrder,
	frequencySort,
	placeholder = 'Select…',
	disabled,
	searchThreshold = 14,
	width
}: Props<T>) {
	const { t } = useTranslation();
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState('');
	const wrapRef = useRef<HTMLDivElement>(null);

	const grouped = useMemo(
		() => groupOptions(options, groupOrder, frequencySort),
		[options, groupOrder, frequencySort]
	);
	const selected = options.find(o => o.value === value) ?? null;
	const searchable = options.length > searchThreshold;

	useEffect(() => {
		if (!open) return;
		const onDown = (e: MouseEvent) => {
			if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
		};
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') setOpen(false);
		};
		document.addEventListener('mousedown', onDown);
		document.addEventListener('keydown', onKey);
		return () => {
			document.removeEventListener('mousedown', onDown);
			document.removeEventListener('keydown', onKey);
		};
	}, [open]);

	// Short lists stay a plain select — it is faster to use and needs no popover.
	if (!searchable && !options.some(o => o.preview)) {
		return (
			<select
				className="ss-ed-input ss-ed-select"
				style={width ? { width } : undefined}
				value={value === null ? '' : String(value)}
				disabled={disabled}
				onChange={e => {
					const raw = e.target.value;
					const match = options.find(o => String(o.value) === raw);
					if (match) onChange(match.value);
				}}
			>
				{value === null && <option value="">{t(placeholder)}</option>}
				{grouped.map(([group, list]) =>
					group ? (
						<optgroup key={group} label={group}>
							{list.map(o => (
								<option key={String(o.value)} value={String(o.value)} disabled={o.disabled}>
									{o.label}
								</option>
							))}
						</optgroup>
					) : (
						list.map(o => (
							<option key={String(o.value)} value={String(o.value)} disabled={o.disabled}>
								{o.label}
							</option>
						))
					)
				)}
			</select>
		);
	}

	const q = query.trim().toLowerCase();
	const filtered = q
		? grouped
				.map(([g, list]) => [g, list.filter(o => o.label.toLowerCase().includes(q) || String(o.value).toLowerCase().includes(q))] as [string, EnumOption<T>[]])
				.filter(([, list]) => list.length > 0)
		: grouped;

	return (
		<div className="ss-ed-combo" ref={wrapRef} style={width ? { width } : undefined}>
			<button
				type="button"
				className="ss-ed-input ss-ed-combo-trigger"
				disabled={disabled}
				onClick={() => {
					setQuery('');
					setOpen(o => !o);
				}}
			>
				{selected?.preview}
				<span className="ss-ed-combo-value">{selected ? selected.label : t(placeholder)}</span>
				<ChevronDown size={14} />
			</button>
			{open && (
				<div className="ss-ed-popover">
					{searchable && (
						<div className="ss-ed-popover-search">
							<Search size={13} />
							<input
								autoFocus
								value={query}
								placeholder={t('Search…')}
								onChange={e => setQuery(e.target.value)}
							/>
						</div>
					)}
					<div className="ss-ed-popover-list">
						{filtered.length === 0 && <div className="ss-ed-popover-empty">{t('No match')}</div>}
						{filtered.map(([group, list]) => (
							<div key={group || '_'}>
								{group && <div className="ss-ed-popover-group">{group}</div>}
								{list.map(o => (
									<button
										key={String(o.value)}
										type="button"
										className={
											o.value === value ? 'ss-ed-popover-item ss-ed-popover-item-active' : 'ss-ed-popover-item'
										}
										disabled={o.disabled}
										title={o.note}
										onClick={() => {
											onChange(o.value);
											setOpen(false);
										}}
									>
										{o.preview}
										<span className="ss-ed-popover-label">{o.label}</span>
										{o.usage !== undefined && o.usage > 0 && (
											<span className="ss-ed-popover-usage">{o.usage}×</span>
										)}
										{o.value === value && <Check size={13} />}
									</button>
								))}
							</div>
						))}
					</div>
				</div>
			)}
		</div>
	);
}
