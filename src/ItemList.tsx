import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Filter, Search, X } from 'lucide-react';
import { itemsRowUrl, type ItemInfo } from './monster';
import { n } from './i18n';
import { buildItemFilters, type ItemAppearanceMeta } from './items';
import { parseIdSearch, type Filter as ItemFilter } from './ThingBrowser';

// The sidebar's Items list — the same virtualized-row-atlas technique
// MonsterList uses, over the item corpus instead (tens of thousands of rows
// rather than a few thousand, which is why the atlas batching matters here
// too). Read-only reference browsing: no create/rename/delete, no drag, no
// context menu — picking an item *for* something (loot, corpse, typeex) goes
// through ItemPickDialog instead. Selecting a row here only drives ItemDetail
// in the centre column.

const ROW_H = 38;
const SPRITE = 32;
const CHUNK = 32;
const OVERSCAN = 6;

/** Search matches name or server id. */
function matches(i: ItemInfo, needle: string): boolean {
	return i.name.toLowerCase().includes(needle) || String(i.serverId).includes(needle);
}

interface Props {
	items: ItemInfo[];
	selectedId: number | null;
	onSelect: (serverId: number) => void;
	favourites: Set<number>;
	dropped: Set<number>;
	itemAppearances: ReadonlyMap<number, ItemAppearanceMeta>;
}

const ItemRow = memo(function ItemRow({
	item,
	index,
	top,
	selected,
	favourite,
	atlasUrl,
	atlasIndex,
	atlasLength,
	setSize,
	onSelect,
	onFocusList
}: {
	item: ItemInfo;
	index: number;
	top: number;
	selected: boolean;
	favourite: boolean;
	atlasUrl: string;
	atlasIndex: number;
	atlasLength: number;
	setSize: number;
	onSelect: (serverId: number) => void;
	onFocusList: () => void;
}) {
	// A memo boundary does not re-render when the language changes unless it
	// subscribes itself, same as MonsterList's own row.
	const { t } = useTranslation();
	return (
		<div
			id={`mx-item-option-${item.serverId}`}
			role="option"
			aria-selected={selected}
			aria-posinset={index + 1}
			aria-setsize={setSize}
			className={`ss-mon-row${selected ? ' ss-mon-row-active' : ''}`}
			style={{ top, height: ROW_H }}
			title={`${item.name || `#${item.serverId}`} (#${item.serverId})`}
			onClick={() => {
				onSelect(item.serverId);
				onFocusList();
			}}
			data-index={index}
		>
			<div
				className="ss-mon-sprite"
				style={{
					width: SPRITE,
					height: SPRITE,
					backgroundImage: `url("${atlasUrl}")`,
					backgroundSize: `${atlasLength * SPRITE}px ${SPRITE}px`,
					backgroundPosition: `-${atlasIndex * SPRITE}px 0`,
					backgroundRepeat: 'no-repeat'
				}}
			/>
			<span className="ss-mon-name">{item.name || `#${item.serverId}`}</span>
			{favourite && (
				<span className="mx-item-row-fav" title={t('Favourite')}>
					★
				</span>
			)}
		</div>
	);
});

/** Scroll offset per search+filter combination, surviving the unmount that
 *  switching the rail away from Items and back causes — the same trick
 *  `ThingBrowser`'s `lastScrollByList` uses, for the same reason. */
const lastScrollByList = new Map<string, number>();

export default function ItemList({ items, selectedId, onSelect, favourites, dropped, itemAppearances }: Props) {
	const { t } = useTranslation();
	const [search, setSearch] = useState('');
	const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set());
	const [showFilters, setShowFilters] = useState(false);
	const [filterSearch, setFilterSearch] = useState('');

	const scrollRef = useRef<HTMLDivElement>(null);
	const filterButtonRef = useRef<HTMLButtonElement>(null);
	const [scrollTop, setScrollTop] = useState(0);
	const [height, setHeight] = useState(0);

	useEffect(() => {
		const el = scrollRef.current;
		if (!el) return;
		const ro = new ResizeObserver(() => setHeight(el.clientHeight));
		ro.observe(el);
		setHeight(el.clientHeight);
		return () => ro.disconnect();
	}, []);

	const filters = useMemo(
		() => buildItemFilters(favourites, dropped, itemAppearances),
		[favourites, dropped, itemAppearances]
	);

	const shown = useMemo(() => {
		const needle = search.trim().toLowerCase();
		const byId = needle ? parseIdSearch(search.trim()) : null;
		let list = !needle ? items : byId ? items.filter(i => byId(i.serverId)) : items.filter(i => matches(i, needle));
		if (activeFilters.size > 0) {
			const active = filters.filter(f => activeFilters.has(f.key));
			if (active.length > 0) list = list.filter(i => active.every(f => f.test(i)));
		}
		return list;
	}, [items, search, activeFilters, filters]);

	const filterListQuery = filterSearch.trim().toLowerCase();
	const visibleFilters = filterListQuery
		? filters.filter(f => t(f.label).toLowerCase().includes(filterListQuery))
		: filters;
	const filterSections = useMemo(() => {
		const groups = new Map<string, ItemFilter<ItemInfo>[]>();
		for (const f of visibleFilters) {
			const section = f.section ?? 'Filters';
			const list = groups.get(section);
			if (list) list.push(f);
			else groups.set(section, [f]);
		}
		return [...groups.entries()];
	}, [visibleFilters]);

	const listKey = `${[...activeFilters].sort().join(',')}|${search}`;
	const restoredScroll = useRef(false);
	useLayoutEffect(() => {
		restoredScroll.current = false;
	}, [listKey]);
	useLayoutEffect(() => {
		if (restoredScroll.current || height === 0) return;
		restoredScroll.current = true;
		const top = lastScrollByList.get(listKey);
		if (top && scrollRef.current) scrollRef.current.scrollTop = top;
	}, [height, listKey]);

	const first = Math.max(0, Math.floor(scrollTop / ROW_H) - OVERSCAN);
	const last = Math.min(shown.length - 1, Math.ceil((scrollTop + height) / ROW_H) + OVERSCAN);

	const chunks = useMemo(() => {
		if (shown.length === 0 || last < first) return [];
		const out: { start: number; ids: number[]; url: string }[] = [];
		for (let start = Math.floor(first / CHUNK) * CHUNK; start <= last; start += CHUNK) {
			const ids = shown.slice(start, start + CHUNK).map(i => i.serverId);
			if (ids.length === 0) continue;
			out.push({ start, ids, url: itemsRowUrl(ids, SPRITE) });
		}
		return out;
	}, [shown, first, last]);

	const chunkFor = useCallback(
		(index: number) => chunks.find(c => index >= c.start && index < c.start + c.ids.length) ?? null,
		[chunks]
	);
	const focusList = useCallback(() => scrollRef.current?.focus({ preventScroll: true }), []);
	const selectedIndex = selectedId === null ? -1 : shown.findIndex(i => i.serverId === selectedId);
	const activeDescendant =
		selectedIndex >= first && selectedIndex <= last ? `mx-item-option-${selectedId}` : undefined;

	const moveSelection = useCallback(
		(key: string) => {
			if (shown.length === 0) return false;
			const current = selectedId === null ? -1 : shown.findIndex(i => i.serverId === selectedId);
			let next: number;
			switch (key) {
				case 'ArrowDown':
					next = Math.min(shown.length - 1, current + 1);
					break;
				case 'ArrowUp':
					next = Math.max(0, current < 0 ? shown.length - 1 : current - 1);
					break;
				case 'Home':
					next = 0;
					break;
				case 'End':
					next = shown.length - 1;
					break;
				default:
					return false;
			}
			onSelect(shown[next].serverId);
			return true;
		},
		[shown, selectedId, onSelect]
	);

	// Keep the selected row in view when the parent changes the selection.
	useEffect(() => {
		const el = scrollRef.current;
		if (!el || selectedId === null) return;
		const idx = shown.findIndex(i => i.serverId === selectedId);
		if (idx < 0) return;
		const top = idx * ROW_H;
		if (top < el.scrollTop || top + ROW_H > el.scrollTop + el.clientHeight) {
			el.scrollTop = Math.max(0, top - (el.clientHeight - ROW_H) / 2);
		}
	}, [selectedId, shown]);

	useEffect(() => {
		if (!showFilters) return;
		const onDown = (e: MouseEvent) => {
			if (!(e.target as HTMLElement).closest('.ss-filter')) setShowFilters(false);
		};
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				setShowFilters(false);
				filterButtonRef.current?.focus();
			}
		};
		window.addEventListener('mousedown', onDown);
		window.addEventListener('keydown', onKey);
		return () => {
			window.removeEventListener('mousedown', onDown);
			window.removeEventListener('keydown', onKey);
		};
	}, [showFilters]);

	const toggleFilter = useCallback((key: string) => {
		setActiveFilters(prev => {
			const next = new Set(prev);
			if (next.has(key)) next.delete(key);
			else next.add(key);
			return next;
		});
	}, []);

	const rows = [];
	for (let i = first; i <= last; i++) {
		const item = shown[i];
		if (!item) continue;
		const chunk = chunkFor(i);
		if (!chunk) continue;
		rows.push(
			<ItemRow
				key={item.serverId}
				item={item}
				index={i}
				top={i * ROW_H}
				selected={item.serverId === selectedId}
				favourite={favourites.has(item.serverId)}
				atlasUrl={chunk.url}
				atlasIndex={i - chunk.start}
				atlasLength={chunk.ids.length}
				setSize={shown.length}
				onSelect={onSelect}
				onFocusList={focusList}
			/>
		);
	}

	return (
		<div className="ss-mon-list">
			<div className="ss-mon-search">
				<div className="ss-search">
					<Search size={13} />
					<input
						placeholder={t('Search server id or name')}
						value={search}
						onChange={e => setSearch(e.target.value)}
						spellCheck={false}
					/>
					{search && (
						<button className="ss-search-clear" onClick={() => setSearch('')} aria-label={t('Clear search')}>
							<X size={12} />
						</button>
					)}
				</div>
				<div className="ss-filter">
					<button
						ref={filterButtonRef}
						className={`ss-icon-btn${activeFilters.size > 0 ? ' ss-filter-btn-active' : ''}`}
						onClick={() => setShowFilters(s => !s)}
						title={t('Filter the list')}
						aria-label={t('Filter the list')}
						aria-expanded={showFilters}
						aria-controls="mx-item-filters"
						aria-haspopup="dialog"
					>
						<Filter size={14} />
						{activeFilters.size > 0 && <span className="ss-filter-count">{activeFilters.size}</span>}
					</button>
					{showFilters && (
						<div
							id="mx-item-filters"
							className="ss-filter-popover"
							role="dialog"
							aria-label={t('Filters')}
							onMouseDown={e => e.stopPropagation()}
						>
							<div className="ss-filter-head">
								<span>{t('Filters')}</span>
								{activeFilters.size > 0 && (
									<button className="ss-filter-reset" onClick={() => setActiveFilters(new Set())}>
										{t('Clear all')}
									</button>
								)}
							</div>
							<div className="ss-filter-search">
								<Search size={13} />
								<input
									placeholder={t('Search filters')}
									value={filterSearch}
									onChange={e => setFilterSearch(e.target.value)}
									spellCheck={false}
								/>
							</div>
							{filterSections.map(([section, list]) => (
								<div key={section}>
									<div className="ss-filter-section">{t(section)}</div>
									<div className="ss-filter-list">
										{list.map(f => (
											<label key={f.key} className="ss-filter-item">
												<input type="checkbox" checked={activeFilters.has(f.key)} onChange={() => toggleFilter(f.key)} />
												{t(f.label)}
											</label>
										))}
									</div>
								</div>
							))}
							{filterSections.length === 0 && <div className="ss-filter-empty">{t('No matching filters')}</div>}
						</div>
					)}
				</div>
			</div>

			<div
				className="ss-mon-scroll mx-item-listbox"
				ref={scrollRef}
				role="listbox"
				tabIndex={0}
				aria-label={t('Items')}
				aria-activedescendant={activeDescendant}
				onKeyDown={e => {
					if (moveSelection(e.key)) e.preventDefault();
				}}
				onScroll={e => {
					const top = e.currentTarget.scrollTop;
					setScrollTop(top);
					lastScrollByList.set(listKey, top);
				}}
			>
				<div className="ss-mon-inner" style={{ height: shown.length * ROW_H }}>
					{shown.length === 0 && <div className="ss-grid-empty">{t('No items match.')}</div>}
					{rows}
				</div>
			</div>

			<div className="ss-mon-foot">
				<span className="ss-mon-count">
					{shown.length === items.length ? n(items.length) : `${n(shown.length)} / ${n(items.length)}`}
				</span>
			</div>
		</div>
	);
}
