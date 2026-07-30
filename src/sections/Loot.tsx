import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { t } from 'i18next';
import { ChevronDown, ChevronRight, Dices, Package, Plus, Trash2 } from 'lucide-react';
import { n } from '../i18n';
import LootSimDialog from '../LootSimDialog';
import type { ItemIndex, LootEntry } from '../monster';
import { Field } from '../fields/Field';
import { FieldLint, type LintAt } from '../fields/Field';
import { NumberField } from '../fields/NumberField';
import { TextField } from '../fields/TextField';
import { ItemPicker, ItemSprite, useItemInfo } from '../fields/ItemPicker';
import { reorder, useDragSource, useDropTarget } from '../dnd';
import { Section, type SectionId, type SectionProps } from './section';

interface Props extends SectionProps {
	collapsed: boolean;
	onToggle: (id: SectionId) => void;
}

const MAX_CHANCE = 100000;
/** §13 — above this the server drops the whole entry, so input is blocked. */
const MAX_COUNTMAX = 100;

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
	const [expanded, setExpanded] = useState(false);
	/** Percent being typed into the chance field; null when it is not focused. */
	const [chanceDraft, setChanceDraft] = useState<number | null>(null);
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

export function Loot({ doc, patch, lintAt, items, readOnly, collapsed, onToggle }: Props) {
	const { t } = useTranslation();
	const [adding, setAdding] = useState(false);
	const [simulating, setSimulating] = useState(false);
	/** Top-level row indices in the multi-selection. */
	const [checked, setChecked] = useState<Set<number>>(new Set());
	const [scalePct, setScalePct] = useState(100);

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
				{adding ? (
					<ItemPicker
						index={items}
						value={null}
						defaultOpen
						onChange={item => {
							setLoot([...doc.loot, newLootEntry(item)]);
							setAdding(false);
						}}
						disabled={readOnly}
						placeholder={t('Search items…')}
					/>
				) : (
					<button type="button" className="ss-btn" disabled={readOnly} onClick={() => setAdding(true)}>
						<Plus size={14} />
						{t('Add item')}
					</button>
				)}
				<button
					type="button"
					className="ss-btn ss-btn-ghost"
					disabled={readOnly || doc.loot.length < 2}
					title={t('Rarest last')}
					onClick={() => setLoot([...doc.loot].sort((a, b) => b.chance - a.chance))}
				>
					{t('Sort by chance')}
				</button>
				<span className="ss-ed-field-note">
					{t('Chance is out of 100,000 in the file; shown here as a percent.')}
				</span>
			</div>
		</Section>
	);
}
