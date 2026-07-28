import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import { itemUrl, searchItems, getItem, type ItemInfo } from '../monster';

/**
 * How the editor reaches the item database. Injected rather than imported so a
 * section can be rendered against fixtures without a backend.
 */
export interface ItemIndex {
	search(query: string, limit: number): Promise<ItemInfo[]>;
	get(serverId: number): Promise<ItemInfo | null>;
}

export const tauriItemIndex: ItemIndex = {
	search: (query, limit) => searchItems(query, limit),
	get: async serverId => {
		try {
			return await getItem(serverId);
		} catch {
			return null;
		}
	}
};

// Resolutions are stable for the life of a workspace and every loot row wants
// one, so they are cached per key rather than refetched per render.
const byIdCache = new Map<number, ItemInfo | null>();
const byNameCache = new Map<string, ItemInfo | null>();

export function useItemInfo(index: ItemIndex, id: number | null, name: string | null): ItemInfo | null {
	const [info, setInfo] = useState<ItemInfo | null>(() => {
		if (id !== null) return byIdCache.get(id) ?? null;
		if (name) return byNameCache.get(name.toLowerCase()) ?? null;
		return null;
	});

	useEffect(() => {
		let live = true;
		if (id !== null) {
			if (byIdCache.has(id)) {
				setInfo(byIdCache.get(id) ?? null);
				return;
			}
			index.get(id).then(r => {
				byIdCache.set(id, r);
				if (live) setInfo(r);
			});
		} else if (name) {
			const key = name.toLowerCase();
			if (byNameCache.has(key)) {
				setInfo(byNameCache.get(key) ?? null);
				return;
			}
			index.search(name, 25).then(rows => {
				const exact = rows.filter(r => r.name.toLowerCase() === key);
				// More than one id owning the name is the §13 hazard: the server
				// drops the entry. Report the first match but keep the flag.
				const r = exact.length === 0 ? null : { ...exact[0], ambiguousName: exact.length > 1 || exact[0].ambiguousName };
				byNameCache.set(key, r);
				if (live) setInfo(r);
			});
		} else {
			setInfo(null);
		}
		return () => {
			live = false;
		};
	}, [index, id, name]);

	return info;
}

export function ItemSprite({ serverId, size = 32 }: { serverId: number | null; size?: number }) {
	if (serverId === null) return <span className="ss-ed-item-sprite ss-ed-item-sprite-empty" style={{ width: size, height: size }} />;
	return (
		<img
			className="ss-ed-item-sprite"
			src={itemUrl(serverId, size)}
			width={size}
			height={size}
			alt=""
			draggable={false}
			// An unresolvable sprite should read as an empty tile, not as the
			// browser's broken-image glyph.
			onError={e => (e.currentTarget.style.visibility = 'hidden')}
			onLoad={e => (e.currentTarget.style.visibility = 'visible')}
		/>
	);
}

interface Props {
	index: ItemIndex;
	/** Server id, or null when nothing is set. */
	value: number | null;
	onChange: (item: ItemInfo) => void;
	onClear?: () => void;
	disabled?: boolean;
	placeholder?: string;
	/** Restricts results to containers — used when nesting loot. */
	containersOnly?: boolean;
	/** Opens the search straight away, for pickers summoned by an "Add" button. */
	defaultOpen?: boolean;
}

/** Search over the item index with a sprite on every row. Entries can only be
    created from here, which is what keeps unknown ids out of the document. */
export function ItemPicker({
	index,
	value,
	onChange,
	onClear,
	disabled,
	placeholder = 'Pick an item…',
	containersOnly,
	defaultOpen
}: Props) {
	const [open, setOpen] = useState(!!defaultOpen);
	const [query, setQuery] = useState('');
	const [rows, setRows] = useState<ItemInfo[]>([]);
	const [busy, setBusy] = useState(false);
	const wrapRef = useRef<HTMLDivElement>(null);
	const current = useItemInfo(index, value, null);

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

	useEffect(() => {
		if (!open) return;
		let live = true;
		setBusy(true);
		const t = setTimeout(() => {
			index
				.search(query, 60)
				.then(r => {
					if (!live) return;
					setRows(containersOnly ? r.filter(i => i.container) : r);
					setBusy(false);
				})
				.catch(() => live && setBusy(false));
		}, 120);
		return () => {
			live = false;
			clearTimeout(t);
		};
	}, [open, query, index, containersOnly]);

	return (
		<div className="ss-ed-itempick" ref={wrapRef}>
			<button
				type="button"
				className="ss-ed-input ss-ed-item-trigger"
				disabled={disabled}
				onClick={() => setOpen(o => !o)}
			>
				<ItemSprite serverId={value} size={24} />
				<span className="ss-ed-item-name">
					{value === null ? placeholder : current ? current.name : `id ${value}`}
				</span>
				{value !== null && <span className="ss-ed-item-id">{value}</span>}
				<ChevronDown size={14} />
			</button>
			{value !== null && onClear && (
				<button type="button" className="ss-btn ss-btn-ghost ss-ed-mini" disabled={disabled} onClick={onClear}>
					Clear
				</button>
			)}
			{open && (
				<div className="ss-ed-popover ss-ed-popover-items">
					<div className="ss-ed-popover-search">
						<Search size={13} />
						<input autoFocus value={query} placeholder="Search items…" onChange={e => setQuery(e.target.value)} />
					</div>
					<div className="ss-ed-popover-list">
						{busy && rows.length === 0 && <div className="ss-ed-popover-empty">Searching…</div>}
						{!busy && rows.length === 0 && <div className="ss-ed-popover-empty">No match</div>}
						{rows.map(item => (
							<button
								key={item.serverId}
								type="button"
								className="ss-ed-popover-item"
								onClick={() => {
									onChange(item);
									setOpen(false);
								}}
							>
								<ItemSprite serverId={item.serverId} size={24} />
								<span className="ss-ed-popover-label">{item.name}</span>
								{item.ambiguousName && <span className="ss-ed-ambiguous" title="More than one item owns this name — the entry must be pinned to an id">ambiguous</span>}
								<span className="ss-ed-popover-usage">{item.serverId}</span>
							</button>
						))}
					</div>
				</div>
			)}
		</div>
	);
}
