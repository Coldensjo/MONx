import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Filter, Plus, Search, X } from 'lucide-react';
import {
	createMonster,
	deleteMonster,
	duplicateMonster,
	monstersRowUrl,
	renameMonster,
	type MonsterSummary
} from './monster';
import type { Toast } from './App';
import { loadSetting, saveSetting } from './settings';
import { useDragSource } from './dnd';

// The sidebar monster list. Virtualized over `/monsters.png` row atlases so every
// row shows the monster's real outfit at one request per chunk, not per monster —
// the same batching ThingsView uses for the item grid.

const ROW_H = 38;
const SPRITE = 32;
// Atlases are cut on fixed index boundaries rather than on the scroll window, so
// the URLs stay stable (and cached) while scrolling instead of changing per frame.
const CHUNK = 32;
const OVERSCAN = 6;

const LAST_MONSTER_KEY = 'monx.lastMonster';

interface Props {
	monsters: MonsterSummary[];
	selectedFile: string | null;
	onSelect: (file: string) => void;
	/** Fired after the folder changes on disk, with the file that should take focus. */
	onMutated: (focusFile: string | null) => void;
	showToast: (kind: Toast['kind'], msg: string) => void;
	/** Comment groups from monsters.xml (`<!-- bosses -->`, …) for the new-monster dialog. */
	groups?: string[];
	/** Opens the monsters folder with the file highlighted. Omitted until the backend has it. */
	onReveal?: (file: string) => void;
}

interface MenuState {
	x: number;
	y: number;
	file: string;
}

interface ListFilter {
	key: string;
	label: string;
	section: string;
	test: (m: MonsterSummary) => boolean;
}

/** Search matches name, file, species and raceid (DESIGN §11.2). */
function matches(m: MonsterSummary, needle: string): boolean {
	return (
		m.name.toLowerCase().includes(needle) ||
		m.file.toLowerCase().includes(needle) ||
		(m.species?.toLowerCase().includes(needle) ?? false) ||
		(m.raceid !== null && String(m.raceid).includes(needle))
	);
}

const MonsterRow = memo(function MonsterRow({
	monster,
	index,
	top,
	selected,
	atlasUrl,
	atlasIndex,
	atlasLength,
	onSelect,
	onContextMenu
}: {
	monster: MonsterSummary;
	index: number;
	top: number;
	selected: boolean;
	atlasUrl: string;
	atlasIndex: number;
	atlasLength: number;
	onSelect: (file: string) => void;
	onContextMenu: (e: React.MouseEvent, file: string) => void;
}) {
	const drag = useDragSource(() => ({ kind: 'monster', file: monster.file, name: monster.name }), {
		ghostSize: SPRITE
	});
	const { error, warning, silent } = monster.lintCounts;
	return (
		<div
			className={`ss-mon-row${selected ? ' ss-mon-row-active' : ''}`}
			style={{ top, height: ROW_H }}
			title={`${monster.name} — ${monster.file}`}
			onMouseDown={() => onSelect(monster.file)}
			onContextMenu={e => onContextMenu(e, monster.file)}
			data-index={index}
			{...drag}
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
			<span className="ss-mon-name">{monster.name}</span>
			{!monster.registered && (
				<span className="ss-mon-badge ss-mon-badge-orphan" title="Not registered in monsters.xml">
					orphan
				</span>
			)}
			{error > 0 && (
				<span className="ss-mon-badge ss-mon-badge-error" title={`${error} errors`}>
					{error}
				</span>
			)}
			{warning > 0 && (
				<span className="ss-mon-badge ss-mon-badge-warn" title={`${warning} warnings`}>
					{warning}
				</span>
			)}
			{silent > 0 && (
				<span className="ss-mon-badge ss-mon-badge-silent" title={`${silent} silent-data-loss issues`}>
					{silent}
				</span>
			)}
		</div>
	);
});

export default function MonsterList({
	monsters,
	selectedFile,
	onSelect,
	onMutated,
	showToast,
	groups = [],
	onReveal
}: Props) {
	const [search, setSearch] = useState('');
	const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set());
	const [showFilters, setShowFilters] = useState(false);
	const [filterSearch, setFilterSearch] = useState('');
	const [menu, setMenu] = useState<MenuState | null>(null);
	const [dialog, setDialog] = useState<'new' | 'rename' | 'delete' | null>(null);
	const [busy, setBusy] = useState(false);

	// New/rename dialog fields.
	const [formName, setFormName] = useState('');
	const [formFile, setFormFile] = useState('');
	const [formGroup, setFormGroup] = useState('');

	const scrollRef = useRef<HTMLDivElement>(null);
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

	// Restore the last selection once the list arrives, if the parent has none.
	const restoredRef = useRef(false);
	useEffect(() => {
		if (restoredRef.current || selectedFile !== null || monsters.length === 0) return;
		restoredRef.current = true;
		const last = loadSetting(LAST_MONSTER_KEY, null);
		if (last && monsters.some(m => m.file === last)) onSelect(last);
	}, [monsters, selectedFile, onSelect]);

	const select = useCallback(
		(file: string) => {
			saveSetting(LAST_MONSTER_KEY, file);
			onSelect(file);
		},
		[onSelect]
	);

	// Race and species values are whatever the corpus actually contains, so the
	// popover is built from the data rather than from a hardcoded enum.
	const filters = useMemo<ListFilter[]>(() => {
		const races = [...new Set(monsters.map(m => m.race).filter((r): r is string => !!r))].sort();
		const species = [...new Set(monsters.map(m => m.species).filter((s): s is string => !!s))].sort();
		return [
			{ key: 'boss', label: 'Boss', section: 'Kind', test: m => m.boss },
			{ key: 'summonable', label: 'Summonable', section: 'Kind', test: m => m.summonable },
			{ key: 'has-loot', label: 'Has loot', section: 'Kind', test: m => m.hasLoot },
			{ key: 'unregistered', label: 'Unregistered', section: 'Status', test: m => !m.registered },
			{
				key: 'has-lints',
				label: 'Has lints',
				section: 'Status',
				test: m => m.lintCounts.error + m.lintCounts.warning + m.lintCounts.silent > 0
			},
			{ key: 'has-errors', label: 'Has errors', section: 'Status', test: m => m.lintCounts.error > 0 },
			{ key: 'no-raceid', label: 'Missing raceid', section: 'Status', test: m => m.raceid === null },
			...races.map(r => ({ key: `race:${r}`, label: r, section: 'Race', test: (m: MonsterSummary) => m.race === r })),
			...species.map(s => ({
				key: `species:${s}`,
				label: s,
				section: 'Species',
				test: (m: MonsterSummary) => m.species === s
			}))
		];
	}, [monsters]);

	// Filters within one section are OR (pick any race), across sections AND.
	const shown = useMemo(() => {
		const needle = search.trim().toLowerCase();
		let list = needle ? monsters.filter(m => matches(m, needle)) : monsters;
		if (activeFilters.size > 0) {
			const active = filters.filter(f => activeFilters.has(f.key));
			const bySection = new Map<string, ListFilter[]>();
			for (const f of active) {
				const group = bySection.get(f.section);
				if (group) group.push(f);
				else bySection.set(f.section, [f]);
			}
			list = list.filter(m => [...bySection.values()].every(group => group.some(f => f.test(m))));
		}
		return list;
	}, [monsters, search, activeFilters, filters]);

	const filterListQuery = filterSearch.trim().toLowerCase();
	const visibleFilters = filterListQuery
		? filters.filter(f => f.label.toLowerCase().includes(filterListQuery))
		: filters;
	const filterSections = useMemo(() => {
		const groupsBySection = new Map<string, ListFilter[]>();
		for (const f of visibleFilters) {
			const list = groupsBySection.get(f.section);
			if (list) list.push(f);
			else groupsBySection.set(f.section, [f]);
		}
		return [...groupsBySection.entries()];
	}, [visibleFilters]);

	const first = Math.max(0, Math.floor(scrollTop / ROW_H) - OVERSCAN);
	const last = Math.min(shown.length - 1, Math.ceil((scrollTop + height) / ROW_H) + OVERSCAN);

	// One atlas per CHUNK-aligned block covering the visible window.
	const chunks = useMemo(() => {
		if (shown.length === 0 || last < first) return [];
		const out: { start: number; files: string[]; url: string }[] = [];
		for (let start = Math.floor(first / CHUNK) * CHUNK; start <= last; start += CHUNK) {
			const files = shown.slice(start, start + CHUNK).map(m => m.file);
			if (files.length === 0) continue;
			out.push({ start, files, url: monstersRowUrl(files, SPRITE) });
		}
		return out;
	}, [shown, first, last]);

	const chunkFor = useCallback(
		(index: number) => chunks.find(c => index >= c.start && index < c.start + c.files.length) ?? null,
		[chunks]
	);

	// Keep the selected row in view when the parent changes the selection.
	useEffect(() => {
		const el = scrollRef.current;
		if (!el || selectedFile === null) return;
		const idx = shown.findIndex(m => m.file === selectedFile);
		if (idx < 0) return;
		const top = idx * ROW_H;
		if (top < el.scrollTop || top + ROW_H > el.scrollTop + el.clientHeight) {
			el.scrollTop = Math.max(0, top - (el.clientHeight - ROW_H) / 2);
		}
	}, [selectedFile, shown]);

	const handleContextMenu = useCallback(
		(e: React.MouseEvent, file: string) => {
			e.preventDefault();
			select(file);
			setMenu({ x: e.clientX, y: e.clientY, file });
		},
		[select]
	);

	useEffect(() => {
		if (!menu) return;
		const onDown = () => setMenu(null);
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') setMenu(null);
		};
		window.addEventListener('mousedown', onDown);
		window.addEventListener('keydown', onKey);
		return () => {
			window.removeEventListener('mousedown', onDown);
			window.removeEventListener('keydown', onKey);
		};
	}, [menu]);

	useEffect(() => {
		if (!showFilters) return;
		const onDown = (e: MouseEvent) => {
			if (!(e.target as HTMLElement).closest('.ss-filter')) setShowFilters(false);
		};
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') setShowFilters(false);
		};
		window.addEventListener('mousedown', onDown);
		window.addEventListener('keydown', onKey);
		return () => {
			window.removeEventListener('mousedown', onDown);
			window.removeEventListener('keydown', onKey);
		};
	}, [showFilters]);

	const selected = useMemo(() => monsters.find(m => m.file === selectedFile) ?? null, [monsters, selectedFile]);

	const openNew = useCallback(() => {
		setFormName('');
		setFormFile('');
		setFormGroup(groups[0] ?? '');
		setDialog('new');
	}, [groups]);

	const openRename = useCallback(() => {
		if (!selected) return;
		setFormName(selected.name);
		setFormFile(selected.file);
		setDialog('rename');
	}, [selected]);

	// Suggest a filename from the name, matching the corpus convention
	// (lowercase, no spaces): "Demon Skeleton" → "demonskeleton.xml".
	const suggestFile = useCallback((name: string) => `${name.toLowerCase().replace(/[^a-z0-9]/g, '')}.xml`, []);

	const runCreate = useCallback(async () => {
		const name = formName.trim();
		if (!name) return;
		const file = formFile.trim() || suggestFile(name);
		setBusy(true);
		try {
			const doc = await createMonster(name, file, formGroup);
			setDialog(null);
			showToast('ok', `Created ${doc.file}`);
			onMutated(doc.file);
		} catch (e) {
			showToast('error', String(e));
		} finally {
			setBusy(false);
		}
	}, [formName, formFile, formGroup, suggestFile, showToast, onMutated]);

	const runRename = useCallback(async () => {
		if (!selected) return;
		const name = formName.trim();
		const file = formFile.trim();
		if (!name || !file) return;
		setBusy(true);
		try {
			const doc = await renameMonster(selected.file, name, file);
			setDialog(null);
			showToast('ok', `Renamed to ${doc.name}`);
			onMutated(doc.file);
		} catch (e) {
			showToast('error', String(e));
		} finally {
			setBusy(false);
		}
	}, [selected, formName, formFile, showToast, onMutated]);

	const runDuplicate = useCallback(async () => {
		if (!selected) return;
		try {
			const doc = await duplicateMonster(selected.file, `${selected.name} copy`);
			showToast('ok', `Duplicated to ${doc.file}`);
			onMutated(doc.file);
		} catch (e) {
			showToast('error', String(e));
		}
	}, [selected, showToast, onMutated]);

	const runDelete = useCallback(async () => {
		if (!selected) return;
		setBusy(true);
		try {
			await deleteMonster(selected.file);
			setDialog(null);
			showToast('ok', `Deleted ${selected.file}`);
			onMutated(null);
		} catch (e) {
			showToast('error', String(e));
		} finally {
			setBusy(false);
		}
	}, [selected, showToast, onMutated]);

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
		const monster = shown[i];
		if (!monster) continue;
		const chunk = chunkFor(i);
		if (!chunk) continue;
		rows.push(
			<MonsterRow
				key={monster.file}
				monster={monster}
				index={i}
				top={i * ROW_H}
				selected={monster.file === selectedFile}
				atlasUrl={chunk.url}
				atlasIndex={i - chunk.start}
				atlasLength={chunk.files.length}
				onSelect={select}
				onContextMenu={handleContextMenu}
			/>
		);
	}

	return (
		<div className="ss-mon-list">
			<div className="ss-mon-search">
				<div className="ss-search">
					<Search size={13} />
					<input
						placeholder="Search name, file, species, raceid"
						value={search}
						onChange={e => setSearch(e.target.value)}
						spellCheck={false}
					/>
					{search && (
						<button className="ss-search-clear" onClick={() => setSearch('')} aria-label="Clear search">
							<X size={12} />
						</button>
					)}
				</div>
				<div className="ss-filter">
					<button
						className={`ss-icon-btn${activeFilters.size > 0 ? ' ss-filter-btn-active' : ''}`}
						onClick={() => setShowFilters(s => !s)}
						title="Filter the list"
					>
						<Filter size={14} />
						{activeFilters.size > 0 && <span className="ss-filter-count">{activeFilters.size}</span>}
					</button>
					{showFilters && (
						<div className="ss-filter-popover" onMouseDown={e => e.stopPropagation()}>
							<div className="ss-filter-head">
								<span>Filters</span>
								{activeFilters.size > 0 && (
									<button className="ss-filter-reset" onClick={() => setActiveFilters(new Set())}>
										Clear all
									</button>
								)}
							</div>
							<div className="ss-filter-search">
								<Search size={13} />
								<input
									placeholder="Search filters"
									value={filterSearch}
									onChange={e => setFilterSearch(e.target.value)}
									spellCheck={false}
								/>
							</div>
							{filterSections.map(([section, list]) => (
								<div key={section}>
									<div className="ss-filter-section">{section}</div>
									<div className="ss-filter-list">
										{list.map(f => (
											<label key={f.key} className="ss-filter-item">
												<input
													type="checkbox"
													checked={activeFilters.has(f.key)}
													onChange={() => toggleFilter(f.key)}
												/>
												{f.label}
											</label>
										))}
									</div>
								</div>
							))}
							{filterSections.length === 0 && <div className="ss-filter-empty">No matching filters</div>}
						</div>
					)}
				</div>
			</div>

			<div className="ss-mon-scroll" ref={scrollRef} onScroll={e => setScrollTop(e.currentTarget.scrollTop)}>
				<div className="ss-mon-inner" style={{ height: shown.length * ROW_H }}>
					{shown.length === 0 && <div className="ss-grid-empty">No monsters match.</div>}
					{rows}
				</div>
			</div>

			<div className="ss-mon-foot">
				<button className="ss-btn" onClick={openNew}>
					<Plus size={14} />
					New
				</button>
				<span className="ss-mon-count">
					{shown.length === monsters.length ? `${monsters.length}` : `${shown.length} / ${monsters.length}`}
				</span>
			</div>

			{menu && (
				<div className="ss-context-menu" style={{ left: menu.x, top: menu.y }} onMouseDown={e => e.stopPropagation()}>
					<button
						className="ss-menu-item"
						onClick={() => {
							setMenu(null);
							void runDuplicate();
						}}
					>
						Duplicate
					</button>
					<button
						className="ss-menu-item"
						onClick={() => {
							setMenu(null);
							openRename();
						}}
					>
						Rename…
					</button>
					{onReveal && (
						<button
							className="ss-menu-item"
							onClick={() => {
								setMenu(null);
								onReveal(menu.file);
							}}
						>
							Reveal in folder
						</button>
					)}
					<div className="ss-menu-sep" />
					<button
						className="ss-menu-item"
						onClick={() => {
							setMenu(null);
							setDialog('delete');
						}}
					>
						Delete…
					</button>
				</div>
			)}

			{dialog === 'new' && (
				<div className="ss-backdrop" onMouseDown={() => setDialog(null)}>
					<div className="ss-modal" onMouseDown={e => e.stopPropagation()}>
						<div className="ss-modal-title">New monster</div>
						<div className="ss-field-row">
							<label className="ss-field-label">Name</label>
							<input
								className="ss-field"
								value={formName}
								autoFocus
								onChange={e => setFormName(e.target.value)}
								spellCheck={false}
							/>
						</div>
						<div className="ss-field-row">
							<label className="ss-field-label">File</label>
							<input
								className="ss-field"
								value={formFile}
								placeholder={formName ? suggestFile(formName) : 'name.xml'}
								onChange={e => setFormFile(e.target.value)}
								spellCheck={false}
							/>
						</div>
						<div className="ss-field-row">
							<label className="ss-field-label">Group</label>
							<select className="ss-field" value={formGroup} onChange={e => setFormGroup(e.target.value)}>
								<option value="">(none)</option>
								{groups.map(g => (
									<option key={g} value={g}>
										{g}
									</option>
								))}
							</select>
						</div>
						<div className="ss-modal-buttons">
							<button className="ss-btn ss-btn-ghost" onClick={() => setDialog(null)}>
								Cancel
							</button>
							<div className="ss-modal-buttons-spacer" />
							<button className="ss-btn ss-btn-primary" disabled={busy || !formName.trim()} onClick={runCreate}>
								Create
							</button>
						</div>
					</div>
				</div>
			)}

			{dialog === 'rename' && selected && (
				<div className="ss-backdrop" onMouseDown={() => setDialog(null)}>
					<div className="ss-modal" onMouseDown={e => e.stopPropagation()}>
						<div className="ss-modal-title">Rename {selected.name}</div>
						<div className="ss-field-row">
							<label className="ss-field-label">Name</label>
							<input
								className="ss-field"
								value={formName}
								autoFocus
								onChange={e => setFormName(e.target.value)}
								spellCheck={false}
							/>
						</div>
						<div className="ss-field-row">
							<label className="ss-field-label">File</label>
							<input
								className="ss-field"
								value={formFile}
								onChange={e => setFormFile(e.target.value)}
								spellCheck={false}
							/>
						</div>
						<div className="ss-modal-desc">
							Renaming rewrites the monsters.xml entry as well as the file on disk.
						</div>
						<div className="ss-modal-buttons">
							<button className="ss-btn ss-btn-ghost" onClick={() => setDialog(null)}>
								Cancel
							</button>
							<div className="ss-modal-buttons-spacer" />
							<button
								className="ss-btn ss-btn-primary"
								disabled={busy || !formName.trim() || !formFile.trim()}
								onClick={runRename}
							>
								Rename
							</button>
						</div>
					</div>
				</div>
			)}

			{dialog === 'delete' && selected && (
				<div className="ss-backdrop" onMouseDown={() => setDialog(null)}>
					<div className="ss-modal" onMouseDown={e => e.stopPropagation()}>
						<div className="ss-modal-title">Delete {selected.name}?</div>
						<div className="ss-modal-desc">
							{selected.file} is removed from disk and from monsters.xml. Anything summoning it, or referencing it
							from an outfit spell, will silently stop working.
						</div>
						<div className="ss-modal-buttons">
							<button className="ss-btn ss-btn-ghost" onClick={() => setDialog(null)}>
								Cancel
							</button>
							<div className="ss-modal-buttons-spacer" />
							<button className="ss-btn ss-btn-primary" disabled={busy} onClick={runDelete}>
								Delete
							</button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
