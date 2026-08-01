import { memo, useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Filter, Plus, Search, X } from 'lucide-react';
import {
	createMonster,
	deleteMonster,
	duplicateMonster,
	monstersRowUrl,
	renameMonster,
	type MonsterSummary
} from './monster';
import type { Toast } from './App';
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

/**
 * What the shell's hotkeys can ask of the list. The list owns the new / rename /
 * delete dialogs, the search box and the filtered order, so a binding for any of
 * them has to come back in here rather than be re-implemented outside.
 */
export interface ListActions {
	newMonster: () => void;
	renameSelected: () => void;
	duplicateSelected: () => void;
	deleteSelected: () => void;
	focusSearch: () => void;
	/** Moves the selection through the list as it is currently filtered. */
	step: (delta: number) => void;
}

interface Props {
	monsters: MonsterSummary[];
	selectedFile: string | null;
	/** Filled in by the list so the shell can drive it from a hotkey. */
	actionsRef?: MutableRefObject<ListActions | null>;
	onSelect: (file: string) => void;
	/** Fired after the folder changes on disk, with the file that should take focus. */
	onMutated: (focusFile: string | null) => void;
	showToast: (kind: Toast['kind'], msg: string) => void;
	/** Comment groups from monsters.xml (`<!-- bosses -->`, …) for the new-monster dialog. */
	groups?: string[];
	/** Opens the create wizard, which the shell owns — it needs the engine, the
	 *  client's outfits and the item index, none of which the list has. The list
	 *  still owns the *entry point*, because the context menu and
	 *  `ListActions.newMonster` both come through here. */
	onNewMonster?: () => void;
	/** Opens the monsters folder with the file highlighted. Omitted until the backend has it. */
	onReveal?: (file: string) => void;
	/** Double-click: jump to the editor for the row's monster. */
	onOpen?: (file: string) => void;
}

interface MenuState {
	x: number;
	y: number;
	file: string;
}

interface ListFilter {
	key: string;
	/** An i18n key, unless `raw` — the race and species filters are built from
	 *  whatever the corpus contains, and corpus data is never translated. */
	label: string;
	section: string;
	raw?: boolean;
	test: (m: MonsterSummary) => boolean;
}

/** Filters cycle off → include (✓) → exclude (✗) → off. Excluding is the whole
 *  point of the third state: "every monster that is not a boss" is not
 *  expressible by picking from the other filters. */
type FilterMode = 'include' | 'exclude';

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
	onContextMenu,
	onOpen
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
	onOpen?: (file: string) => void;
}) {
	// A memo boundary does not re-render when the language changes unless it
	// subscribes itself — every memo() in the app that renders prose needs this.
	const { t } = useTranslation();
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
			onDoubleClick={() => onOpen?.(monster.file)}
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
				<span className="ss-mon-badge ss-mon-badge-orphan" title={t('Not registered in monsters.xml')}>
					{t('orphan')}
				</span>
			)}
			{error > 0 && (
				<span className="ss-mon-badge ss-mon-badge-error" title={t('{{count}} error', { count: error })}>
					{error}
				</span>
			)}
			{warning > 0 && (
				<span className="ss-mon-badge ss-mon-badge-warn" title={t('{{count}} warning', { count: warning })}>
					{warning}
				</span>
			)}
			{silent > 0 && (
				<span
					className="ss-mon-badge ss-mon-badge-silent"
					title={t('{{count}} silent-data-loss issue', { count: silent })}
				>
					{silent}
				</span>
			)}
		</div>
	);
});

export default function MonsterList({
	monsters,
	selectedFile,
	actionsRef,
	onSelect,
	onMutated,
	onOpen,
	showToast,
	groups = [],
	onReveal,
	onNewMonster
}: Props) {
	const { t } = useTranslation();
	const [search, setSearch] = useState('');
	const [activeFilters, setActiveFilters] = useState<Map<string, FilterMode>>(new Map());
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

	// The list deliberately does not restore a selection of its own. It used to,
	// guarded by a ref that never armed (the shell always had a selection by the
	// time the effect first ran), so the guard only came into play later — the
	// moment the selection went empty, which is what closing the last tab does.
	// Reopening the file that was just closed was the visible result. First-open
	// restoration belongs to the shell, which owns `monx.lastMonster.<path>` —
	// including the write, so the list only reports the selection upwards.

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
			...races.map(r => ({
				key: `race:${r}`,
				label: r,
				section: 'Race',
				raw: true,
				test: (m: MonsterSummary) => m.race === r
			})),
			...species.map(s => ({
				key: `species:${s}`,
				label: s,
				section: 'Species',
				raw: true,
				test: (m: MonsterSummary) => m.species === s
			}))
		];
	}, [monsters]);

	// Included filters within one section are OR (pick any race), across sections
	// AND. Exclusions are always AND, whatever section they came from: an X means
	// "none of these", so ORing two of them would cancel both out.
	const shown = useMemo(() => {
		const needle = search.trim().toLowerCase();
		let list = needle ? monsters.filter(m => matches(m, needle)) : monsters;
		if (activeFilters.size > 0) {
			const bySection = new Map<string, ListFilter[]>();
			const excluded: ListFilter[] = [];
			for (const f of filters) {
				const mode = activeFilters.get(f.key);
				if (!mode) continue;
				if (mode === 'exclude') {
					excluded.push(f);
					continue;
				}
				const group = bySection.get(f.section);
				if (group) group.push(f);
				else bySection.set(f.section, [f]);
			}
			list = list.filter(
				m =>
					[...bySection.values()].every(group => group.some(f => f.test(m))) &&
					excluded.every(f => !f.test(m))
			);
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
			onSelect(file);
			setMenu({ x: e.clientX, y: e.clientY, file });
		},
		[onSelect]
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

	// The wizard supersedes the two-field dialog this used to open — its first
	// step asks the same two things, and **Create blank** on it does exactly what
	// the old dialog did. The local `new` dialog stays reachable only if the shell
	// has not wired the wizard up, which is how the list keeps rendering against
	// fixtures.
	const openNew = useCallback(() => {
		if (onNewMonster) {
			onNewMonster();
			return;
		}
		setFormName('');
		setFormFile('');
		setFormGroup(groups[0] ?? '');
		setDialog('new');
	}, [groups, onNewMonster]);

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
			showToast('ok', t('Created {{file}}', { file: doc.file }));
			onMutated(doc.file);
		} catch (e) {
			showToast('error', String(e));
		} finally {
			setBusy(false);
		}
	}, [formName, formFile, formGroup, suggestFile, showToast, onMutated, t]);

	const runRename = useCallback(async () => {
		if (!selected) return;
		const name = formName.trim();
		const file = formFile.trim();
		if (!name || !file) return;
		setBusy(true);
		try {
			const doc = await renameMonster(selected.file, name, file);
			setDialog(null);
			showToast('ok', t('Renamed to {{name}}', { name: doc.name }));
			onMutated(doc.file);
		} catch (e) {
			showToast('error', String(e));
		} finally {
			setBusy(false);
		}
	}, [selected, formName, formFile, showToast, onMutated, t]);

	const runDuplicate = useCallback(async () => {
		if (!selected) return;
		try {
			const doc = await duplicateMonster(selected.file, `${selected.name} copy`);
			showToast('ok', t('Duplicated to {{file}}', { file: doc.file }));
			onMutated(doc.file);
		} catch (e) {
			showToast('error', String(e));
		}
	}, [selected, showToast, onMutated, t]);

	const runDelete = useCallback(async () => {
		if (!selected) return;
		setBusy(true);
		try {
			await deleteMonster(selected.file);
			setDialog(null);
			showToast('ok', t('Deleted {{file}}', { file: selected.file }));
			onMutated(null);
		} catch (e) {
			showToast('error', String(e));
		} finally {
			setBusy(false);
		}
	}, [selected, showToast, onMutated, t]);

	// The shell's hotkeys reach the list through here. Rebuilt whenever one of
	// the actions changes identity, so a binding never fires a stale closure —
	// `step` in particular has to see the current filtered order.
	const searchRef = useRef<HTMLInputElement>(null);
	useEffect(() => {
		if (!actionsRef) return;
		actionsRef.current = {
			newMonster: openNew,
			renameSelected: openRename,
			duplicateSelected: () => void runDuplicate(),
			deleteSelected: () => selected && setDialog('delete'),
			focusSearch: () => {
				searchRef.current?.focus();
				searchRef.current?.select();
			},
			step: delta => {
				if (shown.length === 0) return;
				const at = shown.findIndex(m => m.file === selectedFile);
				const next = shown[Math.min(shown.length - 1, Math.max(0, (at === -1 ? 0 : at) + delta))];
				if (next && next.file !== selectedFile) {
					onSelect(next.file);
					// The list is virtualized, so the row has to be scrolled to before
					// it can exist to be scrolled into view.
					const idx = shown.indexOf(next);
					const el = scrollRef.current;
					if (el) {
						const top = idx * ROW_H;
						if (top < el.scrollTop) el.scrollTop = top;
						else if (top + ROW_H > el.scrollTop + el.clientHeight) {
							el.scrollTop = top + ROW_H - el.clientHeight;
						}
					}
				}
			}
		};
		return () => {
			actionsRef.current = null;
		};
	}, [actionsRef, openNew, openRename, runDuplicate, selected, shown, selectedFile, onSelect]);

	const cycleFilter = useCallback((key: string) => {
		setActiveFilters(prev => {
			const next = new Map(prev);
			const mode = next.get(key);
			if (!mode) next.set(key, 'include');
			else if (mode === 'include') next.set(key, 'exclude');
			else next.delete(key);
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
				onSelect={onSelect}
				onContextMenu={handleContextMenu}
				onOpen={onOpen}
			/>
		);
	}

	return (
		<div className="ss-mon-list">
			<div className="ss-mon-search">
				<div className="ss-search">
					<Search size={13} />
					<input
						ref={searchRef}
						placeholder={t('Search name, file, species, raceid')}
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
						className={`ss-icon-btn${activeFilters.size > 0 ? ' ss-filter-btn-active' : ''}`}
						onClick={() => setShowFilters(s => !s)}
						title={t('Filter the list')}
					>
						<Filter size={14} />
						{activeFilters.size > 0 && <span className="ss-filter-count">{activeFilters.size}</span>}
					</button>
					{showFilters && (
						<div className="ss-filter-popover" onMouseDown={e => e.stopPropagation()}>
							<div className="ss-filter-head">
								<span>{t('Filters')}</span>
								{activeFilters.size > 0 && (
									<button className="ss-filter-reset" onClick={() => setActiveFilters(new Map())}>
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
										{list.map(f => {
											const mode = activeFilters.get(f.key);
											const name = f.raw ? f.label : t(f.label);
											return (
												<button
													key={f.key}
													type="button"
													className={`ss-filter-item mx-filter-tri${mode ? ` mx-filter-${mode}` : ''}`}
													onClick={() => cycleFilter(f.key)}
													title={
														mode === 'include'
															? t('Only {{filter}} — click to exclude instead', { filter: name })
															: mode === 'exclude'
																? t('Excluding {{filter}} — click to clear', { filter: name })
																: t('Only {{filter}}; click twice to exclude it', { filter: name })
													}
												>
													<span className="mx-filter-box">
														{mode === 'include' ? (
															<Check size={11} />
														) : mode === 'exclude' ? (
															<X size={11} />
														) : null}
													</span>
													{name}
												</button>
											);
										})}
									</div>
								</div>
							))}
							{filterSections.length === 0 && (
								<div className="ss-filter-empty">{t('No matching filters')}</div>
							)}
						</div>
					)}
				</div>
			</div>

			<div className="ss-mon-scroll" ref={scrollRef} onScroll={e => setScrollTop(e.currentTarget.scrollTop)}>
				<div className="ss-mon-inner" style={{ height: shown.length * ROW_H }}>
					{shown.length === 0 && <div className="ss-grid-empty">{t('No monsters match.')}</div>}
					{rows}
				</div>
			</div>

			<div className="ss-mon-foot">
				<button className="ss-btn" onClick={openNew}>
					<Plus size={14} />
					{t('New')}
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
						{t('Duplicate')}
					</button>
					<button
						className="ss-menu-item"
						onClick={() => {
							setMenu(null);
							openRename();
						}}
					>
						{t('Rename…')}
					</button>
					{onReveal && (
						<button
							className="ss-menu-item"
							onClick={() => {
								setMenu(null);
								onReveal(menu.file);
							}}
						>
							{t('Reveal in folder')}
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
						{t('Delete…')}
					</button>
				</div>
			)}

			{dialog === 'new' && (
				<div className="ss-backdrop" onMouseDown={() => setDialog(null)}>
					<div className="ss-modal" onMouseDown={e => e.stopPropagation()}>
						<div className="ss-modal-title">{t('New monster')}</div>
						<div className="ss-field-row">
							<label className="ss-field-label">{t('Name')}</label>
							<input
								className="ss-field"
								value={formName}
								autoFocus
								onChange={e => setFormName(e.target.value)}
								spellCheck={false}
							/>
						</div>
						<div className="ss-field-row">
							<label className="ss-field-label">{t('File')}</label>
							<input
								className="ss-field"
								value={formFile}
								placeholder={formName ? suggestFile(formName) : 'name.xml'}
								onChange={e => setFormFile(e.target.value)}
								spellCheck={false}
							/>
						</div>
						<div className="ss-field-row">
							<label className="ss-field-label">{t('Group')}</label>
							<select className="ss-field" value={formGroup} onChange={e => setFormGroup(e.target.value)}>
								<option value="">{t('(none)')}</option>
								{groups.map(g => (
									<option key={g} value={g}>
										{g}
									</option>
								))}
							</select>
						</div>
						<div className="ss-modal-buttons">
							<button className="ss-btn ss-btn-ghost" onClick={() => setDialog(null)}>
								{t('Cancel')}
							</button>
							<div className="ss-modal-buttons-spacer" />
							<button className="ss-btn ss-btn-primary" disabled={busy || !formName.trim()} onClick={runCreate}>
								{t('Create')}
							</button>
						</div>
					</div>
				</div>
			)}

			{dialog === 'rename' && selected && (
				<div className="ss-backdrop" onMouseDown={() => setDialog(null)}>
					<div className="ss-modal" onMouseDown={e => e.stopPropagation()}>
						<div className="ss-modal-title">{t('Rename {{name}}', { name: selected.name })}</div>
						<div className="ss-field-row">
							<label className="ss-field-label">{t('Name')}</label>
							<input
								className="ss-field"
								value={formName}
								autoFocus
								onChange={e => setFormName(e.target.value)}
								spellCheck={false}
							/>
						</div>
						<div className="ss-field-row">
							<label className="ss-field-label">{t('File')}</label>
							<input
								className="ss-field"
								value={formFile}
								onChange={e => setFormFile(e.target.value)}
								spellCheck={false}
							/>
						</div>
						<div className="ss-modal-desc">
							{t('Renaming rewrites the monsters.xml entry as well as the file on disk.')}
						</div>
						<div className="ss-modal-buttons">
							<button className="ss-btn ss-btn-ghost" onClick={() => setDialog(null)}>
								{t('Cancel')}
							</button>
							<div className="ss-modal-buttons-spacer" />
							<button
								className="ss-btn ss-btn-primary"
								disabled={busy || !formName.trim() || !formFile.trim()}
								onClick={runRename}
							>
								{t('Rename')}
							</button>
						</div>
					</div>
				</div>
			)}

			{dialog === 'delete' && selected && (
				<div className="ss-backdrop" onMouseDown={() => setDialog(null)}>
					<div className="ss-modal" onMouseDown={e => e.stopPropagation()}>
						<div className="ss-modal-title">{t('Delete {{name}}?', { name: selected.name })}</div>
						<div className="ss-modal-desc">
							{t('{{file}} is removed from disk and from monsters.xml. Anything summoning it, or referencing it from an outfit spell, will silently stop working.', {
								file: selected.file
							})}
						</div>
						<div className="ss-modal-buttons">
							<button className="ss-btn ss-btn-ghost" onClick={() => setDialog(null)}>
								{t('Cancel')}
							</button>
							<div className="ss-modal-buttons-spacer" />
							<button className="ss-btn ss-btn-primary" disabled={busy} onClick={runDelete}>
								{t('Delete')}
							</button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
