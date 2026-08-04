import { memo, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { t } from 'i18next';
import { confirm } from '@tauri-apps/plugin-dialog';
import { ArrowDownWideNarrow, ChevronDown, ChevronRight, Dices, Package, Plus, Search, Trash2 } from 'lucide-react';
import { n } from '../i18n';
import LootSimDialog from '../LootSimDialog';
import { getMonster, type ItemIndex, type LootEntry, type MonsterSummary } from '../monster';
import { Field } from '../fields/Field';
import { FieldLint, type LintAt } from '../fields/Field';
import { NumberField } from '../fields/NumberField';
import { TextField } from '../fields/TextField';
import { cachedItemName, ItemSprite, useItemInfo } from '../fields/ItemPicker';
import { reorder, useDragSource, useDropTarget } from '../dnd';
import { Section, useMonsterState, type SectionId, type SectionProps } from './section';
import { useWorkspace } from '../workspacectx';

interface Props extends SectionProps {
	collapsed: boolean;
	onToggle: (id: SectionId) => void;
}

export const MAX_CHANCE = 100000;
/** §13 — above this the server drops the whole entry, so input is blocked. */
export const MAX_COUNTMAX = 100;

/**
 * Entries are written by id, which says nothing to anyone reading the file, so
 * the item's name rides along as a trailing comment — the same shape the corpus
 * already uses by hand: `<item id="2148" … /> <!-- gold coin -->`.
 */
export function newLootEntry(item: { serverId: number; name?: string }): LootEntry {
	return {
		id: item.serverId,
		name: null,
		chance: 1000,
		countmax: 1,
		subtype: null,
		actionId: null,
		text: null,
		comment: item.name?.trim() || null,
		children: []
	};
}

/** Namespaces the reorder payload so another list's rows cannot land here. */
const LOOT_LIST = 'loot';

export function percentText(chance: number): string {
	const pct = chance / 1000;
	if (pct >= 10) return `${pct.toFixed(0)}%`;
	if (pct >= 1) return `${pct.toFixed(1)}%`;
	return `${pct.toFixed(3).replace(/0+$/, '').replace(/\.$/, '')}%`;
}

/**
 * Odds the way anyone actually talks about a drop: 1% is "1 in 100". Below 2:1
 * the form needs a fraction to stay honest, so common drops read as a percent
 * instead — "3 in 4" is not how anyone says 75%.
 */
export function oddsText(chance: number): string {
	if (chance <= 0) return t('never');
	if (chance >= MAX_CHANCE) return t('always');
	const ratio = MAX_CHANCE / chance;
	if (ratio < 2) return percentText(chance);
	return t('1 in {{odds}}', { odds: n(Math.round(ratio)) });
}

/**
 * A percent as typed → chance out of 100,000, so the odds readout can follow the
 * field before the value commits. Null while the text is not yet a number ("",
 * "0.", "-"), where the caller keeps showing the committed odds rather than
 * flashing "never".
 */
function draftChance(raw: string): number | null {
	if (raw.trim() === '') return null;
	const n = Number(raw);
	if (!Number.isFinite(n)) return null;
	return Math.max(0, Math.min(MAX_CHANCE, Math.round(n * 1000)));
}

interface RowProps {
	entry: LootEntry;
	/** The monster this row belongs to. Rows are keyed by position, so opening
	 *  another monster reuses them — which is what keeps the sprites from
	 *  blinking — and this is how the row knows to drop its own open state. */
	file: string;
	path: string;
	index: ItemIndex;
	lintAt: LintAt;
	readOnly: boolean;
	depth: number;
	onChange: (e: LootEntry) => void;
	onRemove: () => void;
	/** Position in the list this row belongs to; null for nested children, which do not reorder. */
	rowIndex: number | null;
	onReorder: (from: number, to: number) => void;
	/** Top-level rows only: membership in the multi-selection. */
	checked?: boolean;
	onToggleCheck?: (index: number) => void;
}

const LootRow = memo(function LootRow({
	entry,
	file,
	path,
	index,
	lintAt,
	readOnly,
	depth,
	onChange,
	onRemove,
	rowIndex,
	onReorder,
	checked,
	onToggleCheck
}: RowProps) {
	// memo boundary — subscribes so a language change reaches these rows.
	const { t } = useTranslation();
	const [expanded, setExpanded] = useMonsterState(file, () => false);
	/** Percent being typed into the chance field; null when it is not focused. */
	const [chanceDraft, setChanceDraft] = useMonsterState<number | null>(file, () => null);
	const shownChance = chanceDraft ?? entry.chance;
	const info = useItemInfo(index, entry.id, entry.name);
	const serverId = entry.id ?? info?.serverId ?? null;
	const container = info?.container ?? entry.children.length > 0;

	const drag = useDragSource(() => (rowIndex === null || readOnly ? null : { kind: 'reorder', list: LOOT_LIST, index: rowIndex }));

	// One target for both gestures: an item nests into a container, a row
	// reorders. A non-container row does not accept items at all, so the drag
	// falls through to the list behind it and appends instead.
	const drop = useDropTarget(container && !readOnly ? ['item', 'reorder'] : ['reorder'], p => {
		if (readOnly) return;
		if (p.kind === 'item') onChange({ ...entry, children: [...entry.children, newLootEntry(p)] });
		else if (p.kind === 'reorder' && p.list === LOOT_LIST && rowIndex !== null) onReorder(p.index, rowIndex);
	});

	const countLints = lintAt(`${path}.countmax`);
	const chanceLints = lintAt(`${path}.chance`);

	return (
		<>
			<div
				className="ss-ed-loot-row"
				data-lint-path={path}
				style={depth ? { paddingLeft: 16 + depth * 20 } : undefined}
				{...drag}
				{...drop}
			>
				{rowIndex !== null && onToggleCheck && (
					// A nested control, so pressing it never starts the reorder drag.
					<input
						type="checkbox"
						className="ss-ed-loot-check"
						checked={checked ?? false}
						disabled={readOnly}
						onChange={() => onToggleCheck(rowIndex)}
						title={t('Select for delete / scale')}
					/>
				)}
				<button
					type="button"
					className="ss-ed-loot-expand"
					onClick={() => setExpanded(x => !x)}
					title={expanded ? t('Hide details') : t('Show subtype, action id and text')}
				>
					{expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
				</button>

				<ItemSprite serverId={serverId} size={32} />

				<span className="ss-ed-loot-id">{serverId ?? '—'}</span>

				<span className="ss-ed-loot-name">
					{info?.name ?? entry.name ?? (entry.id !== null ? t('id {{id}}', { id: entry.id }) : t('unresolved'))}
					{container && <Package size={12} className="ss-ed-loot-container-mark" />}
					{info?.ambiguousName && entry.id === null && (
						<button
							type="button"
							className="ss-ed-ambiguous"
							disabled={readOnly}
							title={t('This name belongs to more than one item, so the server drops the entry. Pin it to a single id.')}
							// The name is what made the row readable, so it moves into a
							// trailing comment — the file keeps saying what the id is.
							onClick={() => onChange({ ...entry, id: info.serverId, name: null, comment: entry.comment ?? info.name })}
						>
							{t('ambiguous — pin id')}
						</button>
					)}
					{entry.comment && <span className="ss-ed-loot-comment">{entry.comment}</span>}
				</span>

				<span className="ss-ed-loot-chance" title={`chance="${shownChance}" of ${MAX_CHANCE}`}>
					{/* Reads the draft, not the committed value, so "1 in X" tracks the
					    keystrokes — including text the field never commits ("0.", ""). */}
					<span className="ss-ed-odds">{oddsText(shownChance)}</span>
					<NumberField
						value={Number((entry.chance / 1000).toFixed(3))}
						onChange={v => onChange({ ...entry, chance: Math.min(MAX_CHANCE, Math.round(v * 1000)) })}
						onDraft={raw => setChanceDraft(raw === null ? null : draftChance(raw))}
						min={0}
						max={100}
						step={0.1}
						width={78}
						disabled={readOnly}
						title={percentText(shownChance)}
					/>
					{chanceLints.length > 0 && <FieldLint lints={chanceLints} />}
				</span>

				<span className="ss-ed-loot-count">
					×
					<NumberField
						value={entry.countmax}
						onChange={v => onChange({ ...entry, countmax: v })}
						min={1}
						max={MAX_COUNTMAX}
						hardMax={MAX_COUNTMAX}
						width={58}
						disabled={readOnly}
						title={t('Hard maximum 100 — a larger value makes the server drop the whole entry')}
					/>
					{countLints.length > 0 && <FieldLint lints={countLints} />}
				</span>

				<button type="button" className="ss-btn ss-btn-ghost ss-ed-mini" disabled={readOnly} title={t('Remove')} onClick={onRemove}>
					<Trash2 size={14} />
				</button>
			</div>

			{expanded && (
				<div className="ss-ed-loot-detail" style={{ paddingLeft: 48 + depth * 20 }}>
					<Field label={t('Subtype')} hint={t('fluid, charges')} lints={lintAt(`${path}.subtype`)}>
						<NumberField
							value={entry.subtype ?? -1}
							onChange={v => onChange({ ...entry, subtype: v })}
							width={90}
							disabled={readOnly}
						/>
					</Field>
					<Field
						label={t('Action id')}
						lints={lintAt(`${path}.actionId`)}
						note={t('Spelled actionId — the lower-case spelling is silently ignored by the server.')}
					>
						<NumberField
							value={entry.actionId ?? -1}
							onChange={v => onChange({ ...entry, actionId: v })}
							width={90}
							disabled={readOnly}
						/>
					</Field>
					<Field label={t('Text')} lints={lintAt(`${path}.text`)}>
						<TextField
							value={entry.text ?? ''}
							onChange={v => onChange({ ...entry, text: v === '' ? null : v })}
							disabled={readOnly}
						/>
					</Field>
					<Field
						label={t('Comment')}
						note={t('Written after the entry as an XML comment. Set to the item name when the entry is added by id.')}
					>
						<TextField
							value={entry.comment ?? ''}
							onChange={v => onChange({ ...entry, comment: v === '' ? null : v })}
							disabled={readOnly}
						/>
					</Field>
					{container && (
						<div className="ss-ed-field-note">
							{t('Drop an item onto this row to nest it inside the container.')}
						</div>
					)}
				</div>
			)}

			{entry.children.map((child, i) => (
				<LootRow
					key={i}
					entry={child}
					file={file}
					path={`${path}.children[${i}]`}
					index={index}
					lintAt={lintAt}
					readOnly={readOnly}
					depth={depth + 1}
					onChange={next => onChange({ ...entry, children: entry.children.map((c, j) => (j === i ? next : c)) })}
					onRemove={() => onChange({ ...entry, children: entry.children.filter((_, j) => j !== i) })}
					rowIndex={null}
					onReorder={() => undefined}
				/>
			))}
		</>
	);
});

type SortKey = 'chance' | 'name' | 'id' | 'count';

/** Labels are i18n keys. Each says its direction, because none of the four has
 *  an order that is obvious from the word alone. */
const SORTS: { key: SortKey; label: string }[] = [
	{ key: 'chance', label: 'Chance, rarest last' },
	{ key: 'name', label: 'Item name, A–Z' },
	{ key: 'id', label: 'Item id, lowest first' },
	{ key: 'count', label: 'Count, largest first' }
];

/** What a row shows, which is what sorting by name has to agree with — the
 *  resolved item name, then whatever the entry itself carries. */
function sortName(e: LootEntry): string {
	return (cachedItemName(e.id, e.name) ?? e.name ?? e.comment ?? '').toLowerCase();
}

/**
 * Orders a table, and every container inside it.
 *
 * Recursive because a sort that left a container's contents where they were
 * would be answering half the question, and because loot order means nothing to
 * the server — it is entirely a convenience for the person reading the file, so
 * the whole tree should read the same way.
 *
 * Entries with nothing to compare sort last rather than first: an unresolved
 * row is a row to come back to, and the top of the table is where the eye lands.
 */
function sortLoot(rows: LootEntry[], key: SortKey): LootEntry[] {
	const sorted = [...rows].sort((a, b) => {
		switch (key) {
			case 'chance':
				return b.chance - a.chance;
			case 'count':
				return b.countmax - a.countmax;
			case 'id':
				return (a.id ?? Number.MAX_SAFE_INTEGER) - (b.id ?? Number.MAX_SAFE_INTEGER);
			case 'name': {
				const [x, y] = [sortName(a), sortName(b)];
				if (x === y) return 0;
				if (x === '') return 1;
				if (y === '') return -1;
				return x.localeCompare(y);
			}
		}
	});
	return sorted.map(e => (e.children.length > 0 ? { ...e, children: sortLoot(e.children, key) } : e));
}

/** Every entry in the tree, containers and their contents alike. */
function mapLoot(rows: LootEntry[], f: (e: LootEntry) => LootEntry): LootEntry[] {
	return rows.map(e => {
		const next = f(e);
		return next.children.length > 0 ? { ...next, children: mapLoot(next.children, f) } : next;
	});
}

/**
 * What makes two rows the same drop.
 *
 * The item, and then everything that makes one instance of it different from
 * another: a potion with charges, a book with text, a key with an action id are
 * all the same id and none of them is a repeat of the others. Chance and count
 * are deliberately not in the key — two rows for one item at different odds are
 * exactly the duplicate this removes, and keeping the first keeps the one the
 * author wrote first.
 */
function dupeKey(e: LootEntry): string {
	const item = e.id !== null ? `#${e.id}` : (e.name ?? '').toLowerCase();
	return [item, e.subtype ?? '', e.actionId ?? '', e.text ?? ''].join(' ');
}

/** Drops later rows that repeat an earlier one, within each list of siblings. */
function withoutDupes(rows: LootEntry[]): LootEntry[] {
	const seen = new Set<string>();
	const kept: LootEntry[] = [];
	for (const e of rows) {
		const key = dupeKey(e);
		if (seen.has(key)) continue;
		seen.add(key);
		kept.push(e.children.length > 0 ? { ...e, children: withoutDupes(e.children) } : e);
	}
	return kept;
}

/** How many rows `withoutDupes` would drop. */
function countLoot(rows: LootEntry[]): number {
	return rows.reduce((n, e) => n + 1 + countLoot(e.children), 0);
}

/**
 * Picks a monster to copy a loot table from.
 *
 * Only monsters that have loot are listed, and never the one being edited: an
 * empty donor is a click that does nothing, and the open monster is a click
 * that doubles its own table. Both are reachable through the section's copy and
 * paste; neither is worth offering here, where the whole point is that you do
 * not have to go and look.
 */
function LootDonorPicker({
	corpus,
	exclude,
	onPick,
	onClose
}: {
	corpus: MonsterSummary[];
	exclude: string;
	onPick: (m: MonsterSummary) => void;
	onClose: () => void;
}) {
	const { t } = useTranslation();
	const [query, setQuery] = useState('');
	const wrapRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const onDown = (e: MouseEvent) => {
			if (!wrapRef.current?.contains(e.target as Node)) onClose();
		};
		document.addEventListener('mousedown', onDown);
		return () => document.removeEventListener('mousedown', onDown);
	}, [onClose]);

	const q = query.trim().toLowerCase();
	const rows = corpus
		.filter(m => m.hasLoot && m.file !== exclude && (q === '' || m.name.toLowerCase().includes(q)))
		.slice(0, 200);

	return (
		<div className="ss-ed-itempick" ref={wrapRef}>
			{/* Upwards: the button lives at the foot of the longest section in the
			    editor, so downwards is off the bottom of the pane. */}
			<div className="ss-ed-popover ss-ed-popover-up">
				<div className="ss-ed-popover-search">
					<Search size={13} />
					<input
						autoFocus
						value={query}
						onChange={e => setQuery(e.target.value)}
						placeholder={t('Search monsters')}
						onKeyDown={e => e.key === 'Escape' && onClose()}
					/>
				</div>
				<div className="ss-ed-popover-list">
					{rows.map(m => (
						<button key={m.file} type="button" className="ss-ed-popover-item" onClick={() => onPick(m)}>
							<span className="ss-ed-popover-label">{m.name}</span>
						</button>
					))}
					{rows.length === 0 && (
						<div className="ss-ed-popover-empty">{t('No monster here has loot to copy.')}</div>
					)}
				</div>
			</div>
		</div>
	);
}

export function Loot({ doc, patch, lintAt, readOnly, collapsed, onToggle }: Props) {
	const { items, corpus, onToast, onBrowseLootItems } = useWorkspace();
	const { t } = useTranslation();
	const [donorOpen, setDonorOpen] = useMonsterState(doc.file, () => false);
	const [sortOpen, setSortOpen] = useMonsterState(doc.file, () => false);
	const [clearOpen, setClearOpen] = useMonsterState(doc.file, () => false);
	const [setOpen, setSetOpen] = useMonsterState(doc.file, () => false);
	/** Which "set all" is being asked about, and the answer being typed. */
	const [setMode, setSetMode] = useMonsterState<'chance' | 'count' | null>(doc.file, () => null);
	const [setValue, setSetValue] = useMonsterState(doc.file, () => 1);
	const [simulating, setSimulating] = useMonsterState(doc.file, () => false);
	/** Top-level row indices in the multi-selection. Indices only mean anything
	 *  within one monster, so this re-seeds when the file changes. */
	const [checked, setChecked] = useMonsterState(doc.file, () => new Set<number>());
	const [scalePct, setScalePct] = useMonsterState(doc.file, () => 100);

	const setLoot = (next: LootEntry[]) => {
		patch({ loot: next });
		// Indices shift on any structural change; a stale selection would point
		// at the wrong rows.
		if (next.length !== doc.loot.length) setChecked(new Set());
	};

	const toggleCheck = (i: number) =>
		setChecked(prev => {
			const next = new Set(prev);
			if (next.has(i)) next.delete(i);
			else next.add(i);
			return next;
		});

	const deleteChecked = () => {
		patch({ loot: doc.loot.filter((_, i) => !checked.has(i)) });
		setChecked(new Set());
	};

	const scaleChecked = () => {
		patch({
			loot: doc.loot.map((e, i) =>
				checked.has(i)
					? { ...e, chance: Math.max(0, Math.min(MAX_CHANCE, Math.round((e.chance * scalePct) / 100))) }
					: e
			)
		});
	};

	const listDrop = useDropTarget(['item'], p => {
		if (p.kind === 'item' && !readOnly) setLoot([...doc.loot, newLootEntry(p)]);
	});

	return (
		<Section
			id="loot"
			collapsed={collapsed}
			onToggle={() => onToggle('loot')}
			summary={
				<>
					{t('{{count}} drop', { count: doc.loot.length })}
					<button
						type="button"
						className="ss-btn ss-ed-mini ss-ed-sim"
						title={t('Simulate a hunting session over this loot — runs on the unsaved buffer')}
						onClick={() => setSimulating(true)}
					>
						<Dices size={13} />
						{t('Simulate…')}
					</button>
					{/* Lives in the header slot so it opens even while the section is collapsed. */}
					{simulating && (
						<LootSimDialog loot={doc.loot} monsterName={doc.name} items={items} onClose={() => setSimulating(false)} />
					)}
				</>
			}
		>
			<div className="ss-ed-loot" {...listDrop}>
				{doc.loot.length === 0 && (
					<div className="ss-ed-empty">{t('No loot. Drop items here from the Items browser.')}</div>
				)}
				{doc.loot.map((entry, i) => (
					<LootRow
						key={i}
						entry={entry}
						file={doc.file}
						path={`loot[${i}]`}
						index={items}
						lintAt={lintAt}
						readOnly={readOnly}
						depth={0}
						onChange={next => setLoot(doc.loot.map((e, j) => (j === i ? next : e)))}
						onRemove={() => setLoot(doc.loot.filter((_, j) => j !== i))}
						rowIndex={i}
						onReorder={(from, to) => setLoot(reorder(doc.loot, from, to))}
						checked={checked.has(i)}
						onToggleCheck={toggleCheck}
					/>
				))}
			</div>

			{checked.size > 0 && (
				<div className="ss-ed-loot-bulk">
					<span>{t('{{count}} selected', { count: checked.size })}</span>
					<button type="button" className="ss-btn ss-ed-mini" disabled={readOnly} onClick={deleteChecked}>
						<Trash2 size={13} />
						{t('Delete')}
					</button>
					<span className="ss-ed-loot-bulk-scale">
						{t('Scale chances to')}
						<NumberField value={scalePct} onChange={setScalePct} min={0} max={10000} width={64} disabled={readOnly} />
						%
						<button
							type="button"
							className="ss-btn ss-ed-mini"
							disabled={readOnly || scalePct === 100}
							onClick={scaleChecked}
						>
							{t('Apply')}
						</button>
					</span>
					<button type="button" className="ss-btn ss-btn-ghost ss-ed-mini" onClick={() => setChecked(new Set())}>
						{t('Clear selection')}
					</button>
				</div>
			)}

			<div className="ss-ed-loot-actions">
				{/* Off to the Items browser rather than a search box in the section.
				    The box could only match on name and show one line at a time; the
				    browser is the corpus with its sprites, its filters, multi-select
				    and the loot tray, and it can add several items in one visit —
				    which is what filling a table actually looks like. Right-click
				    there adds straight to this monster, and it opens on pickupable. */}
				<button type="button" className="ss-btn" disabled={readOnly} onClick={onBrowseLootItems}>
					<Plus size={14} />
					{t('Pick items…')}
				</button>
				{donorOpen ? (
					<LootDonorPicker
						corpus={corpus}
						exclude={doc.file}
						onClose={() => setDonorOpen(false)}
						onPick={m => {
							setDonorOpen(false);
							// Read the file rather than the summary: a summary knows only
							// that there is loot, and what is wanted is the table — ids,
							// chances, counts, subtypes, containers and their contents.
							getMonster(m.file)
								.then(from => {
									if (from.loot.length === 0) return;
									// Appended whole and unchanged, chances included. A donor's
									// table is a balance someone already struck; re-rolling any
									// part of it here would be this editor inventing numbers.
									// Duplicates of what is already here are left in, as the
									// section's own paste-merge leaves them: two rows for one
									// item is a legal table, and which one to drop is a
									// judgement the author is standing right there to make.
									setLoot([...doc.loot, ...from.loot]);
								})
								.catch(e => onToast?.('error', String(e)));
						}}
					/>
				) : (
					<button
						type="button"
						className="ss-btn ss-btn-ghost"
						disabled={readOnly}
						title={t('Append another monster’s loot table to this one, chances and all')}
						onClick={() => setDonorOpen(true)}
					>
						<Package size={14} />
						{t('Add loot from…')}
					</button>
				)}
				{/* Both destructive branches ask first, because this is the one control
				    here that throws work away rather than changing it, and the table it
				    empties can be an afternoon's balancing. Undo still covers it — the
				    prompts do not claim otherwise — but a misclick that silently blanks
				    the section is not something to find out about later. */}
				<div className="ss-ed-itempick">
					<button
						type="button"
						className="ss-btn ss-btn-ghost"
						disabled={readOnly || doc.loot.length === 0}
						onClick={() => setClearOpen(o => !o)}
					>
						<Trash2 size={14} />
						{t('Clear')}
						<ChevronDown size={13} />
					</button>
					{clearOpen && (
						<div className="ss-ed-popover ss-ed-popover-up" onMouseLeave={() => setClearOpen(false)}>
							<div className="ss-ed-popover-list">
								<button
									type="button"
									className="ss-ed-popover-item"
									onClick={() => {
										setClearOpen(false);
										void confirm(
											t('Remove all {{count}} loot entry from {{monster}}?', {
												count: countLoot(doc.loot),
												monster: doc.name
											}),
											{ title: t('Clear loot'), kind: 'warning' }
										).then(ok => ok && setLoot([]));
									}}
								>
									<span className="ss-ed-popover-label">{t('All')}</span>
								</button>
								<button
									type="button"
									className="ss-ed-popover-item"
									onClick={() => {
										setClearOpen(false);
										const pruned = withoutDupes(doc.loot);
										const gone = countLoot(doc.loot) - countLoot(pruned);
										// Nothing to ask about when there is nothing to remove, and
										// silence would read as a button that does not work.
										if (gone === 0) {
											onToast?.('ok', t('No repeated entries in this table.'));
											return;
										}
										void confirm(
											t('Remove {{count}} repeated loot entry, keeping the first of each?', {
												count: gone
											}),
											{ title: t('Clear loot'), kind: 'warning' }
										).then(ok => ok && setLoot(pruned));
									}}
								>
									<span className="ss-ed-popover-label">{t('Duplicates')}</span>
								</button>
							</div>
						</div>
					)}
				</div>

				{/* One value across the whole table. The prompt is inline rather than a
				    dialog because the native one cannot take a number, and because the
				    bulk bar above already asks for a percentage exactly this way. */}
				<div className="ss-ed-itempick">
					{setMode ? (
						<span className="ss-ed-inline">
							<span className="ss-ed-field-hint">
								{setMode === 'chance' ? t('All chances to') : t('All count to')}
							</span>
							<NumberField
								value={setValue}
								onChange={setSetValue}
								min={0}
								max={setMode === 'chance' ? 100 : MAX_COUNTMAX}
								width={72}
								disabled={readOnly}
							/>
							{setMode === 'chance' && '%'}
							<button
								type="button"
								className="ss-btn ss-ed-mini"
								disabled={readOnly}
								onClick={() => {
									const mode = setMode;
									setSetMode(null);
									setLoot(
										mapLoot(doc.loot, e =>
											mode === 'chance'
												? { ...e, chance: Math.max(0, Math.min(MAX_CHANCE, Math.round(setValue * 1000))) }
												: { ...e, countmax: Math.max(1, Math.min(MAX_COUNTMAX, Math.round(setValue))) }
										)
									);
								}}
							>
								{t('Apply')}
							</button>
							<button
								type="button"
								className="ss-btn ss-btn-ghost ss-ed-mini"
								onClick={() => setSetMode(null)}
							>
								{t('Cancel')}
							</button>
						</span>
					) : (
						<>
							<button
								type="button"
								className="ss-btn ss-btn-ghost"
								disabled={readOnly || doc.loot.length === 0}
								onClick={() => setSetOpen(o => !o)}
							>
								{t('Set')}
								<ChevronDown size={13} />
							</button>
							{setOpen && (
								<div className="ss-ed-popover ss-ed-popover-up" onMouseLeave={() => setSetOpen(false)}>
									<div className="ss-ed-popover-list">
										<button
											type="button"
											className="ss-ed-popover-item"
											onClick={() => {
												setSetOpen(false);
												setSetValue(1);
												setSetMode('chance');
											}}
										>
											<span className="ss-ed-popover-label">{t('All chances to')}</span>
										</button>
										<button
											type="button"
											className="ss-ed-popover-item"
											onClick={() => {
												setSetOpen(false);
												setSetValue(1);
												setSetMode('count');
											}}
										>
											<span className="ss-ed-popover-label">{t('All count to')}</span>
										</button>
									</div>
								</div>
							)}
						</>
					)}
				</div>

				<div className="ss-ed-itempick">
					<button
						type="button"
						className="ss-btn ss-btn-ghost"
						disabled={readOnly || doc.loot.length < 2}
						onClick={() => setSortOpen(o => !o)}
					>
						<ArrowDownWideNarrow size={14} />
						{t('Sort')}
						<ChevronDown size={13} />
					</button>
					{sortOpen && (
						<div className="ss-ed-popover ss-ed-popover-up" onMouseLeave={() => setSortOpen(false)}>
							<div className="ss-ed-popover-list">
								{SORTS.map(s => (
									<button
										key={s.key}
										type="button"
										className="ss-ed-popover-item"
										onClick={() => {
											setSortOpen(false);
											setLoot(sortLoot(doc.loot, s.key));
										}}
									>
										<span className="ss-ed-popover-label">{t(s.label)}</span>
									</button>
								))}
							</div>
						</div>
					)}
				</div>
				<span className="ss-ed-field-note">
					{t('Chance is out of 100,000 in the file; shown here as a percent.')}
				</span>
			</div>
		</Section>
	);
}
