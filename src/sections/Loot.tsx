import { memo, useState } from 'react';
import { ChevronDown, ChevronRight, Package, Plus, Trash2 } from 'lucide-react';
import type { LootEntry } from '../monster';
import { Field } from '../fields/Field';
import { FieldLint, type LintAt } from '../fields/Field';
import { NumberField } from '../fields/NumberField';
import { TextField } from '../fields/TextField';
import { ItemPicker, ItemSprite, useItemInfo, type ItemIndex } from '../fields/ItemPicker';
import { reorder, useDragSource, useDropTarget } from '../dnd';
import { Section, type SectionId, type SectionProps } from './section';

interface Props extends SectionProps {
	collapsed: boolean;
	onToggle: (id: SectionId) => void;
}

const MAX_CHANCE = 100000;
/** §13 — above this the server drops the whole entry, so input is blocked. */
const MAX_COUNTMAX = 100;

export function newLootEntry(item: { serverId: number }): LootEntry {
	return {
		id: item.serverId,
		name: null,
		chance: 1000,
		countmax: 1,
		subtype: null,
		actionId: null,
		text: null,
		comment: null,
		children: []
	};
}

/** Namespaces the reorder payload so another list's rows cannot land here. */
const LOOT_LIST = 'loot';

function percentText(chance: number): string {
	const pct = chance / 1000;
	if (pct >= 10) return `${pct.toFixed(0)}%`;
	if (pct >= 1) return `${pct.toFixed(1)}%`;
	return `${pct.toFixed(3).replace(/0+$/, '').replace(/\.$/, '')}%`;
}

/** Log-ish bar: rare drops would all render as an empty sliver on a linear scale. */
function rarityFill(chance: number): number {
	if (chance <= 0) return 0;
	const t = Math.log10(chance) / Math.log10(MAX_CHANCE);
	return Math.max(4, Math.min(100, t * 100));
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
	onReorder
}: RowProps) {
	const [expanded, setExpanded] = useState(false);
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
				<button
					type="button"
					className="ss-ed-loot-expand"
					onClick={() => setExpanded(x => !x)}
					title={expanded ? 'Hide details' : 'Show subtype, action id and text'}
				>
					{expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
				</button>

				<ItemSprite serverId={serverId} size={32} />

				<span className="ss-ed-loot-name">
					{info?.name ?? entry.name ?? (entry.id !== null ? `id ${entry.id}` : 'unresolved')}
					{container && <Package size={12} className="ss-ed-loot-container-mark" />}
					{info?.ambiguousName && entry.id === null && (
						<button
							type="button"
							className="ss-ed-ambiguous"
							disabled={readOnly}
							title="This name belongs to more than one item, so the server drops the entry. Pin it to a single id."
							onClick={() => onChange({ ...entry, id: info.serverId, name: null })}
						>
							ambiguous — pin id
						</button>
					)}
					{entry.comment && <span className="ss-ed-loot-comment">{entry.comment}</span>}
				</span>

				<span className="ss-ed-loot-chance" title={`chance="${entry.chance}" of ${MAX_CHANCE}`}>
					<span className="ss-ed-rarity">
						<span className="ss-ed-rarity-fill" style={{ width: `${rarityFill(entry.chance)}%` }} />
					</span>
					<NumberField
						value={Number((entry.chance / 1000).toFixed(3))}
						onChange={v => onChange({ ...entry, chance: Math.min(MAX_CHANCE, Math.round(v * 1000)) })}
						min={0}
						max={100}
						step={0.1}
						width={78}
						disabled={readOnly}
						title={percentText(entry.chance)}
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
						title="Hard maximum 100 — a larger value makes the server drop the whole entry"
					/>
					{countLints.length > 0 && <FieldLint lints={countLints} />}
				</span>

				<span className="ss-ed-loot-id">{serverId ?? '—'}</span>

				<button type="button" className="ss-btn ss-btn-ghost ss-ed-mini" disabled={readOnly} title="Remove" onClick={onRemove}>
					<Trash2 size={14} />
				</button>
			</div>

			{expanded && (
				<div className="ss-ed-loot-detail" style={{ paddingLeft: 48 + depth * 20 }}>
					<Field label="Subtype" hint="fluid, charges" lints={lintAt(`${path}.subtype`)}>
						<NumberField
							value={entry.subtype ?? -1}
							onChange={v => onChange({ ...entry, subtype: v })}
							width={90}
							disabled={readOnly}
						/>
					</Field>
					<Field
						label="Action id"
						lints={lintAt(`${path}.actionId`)}
						note="Spelled actionId — the lower-case spelling is silently ignored by the server."
					>
						<NumberField
							value={entry.actionId ?? -1}
							onChange={v => onChange({ ...entry, actionId: v })}
							width={90}
							disabled={readOnly}
						/>
					</Field>
					<Field label="Text" lints={lintAt(`${path}.text`)}>
						<TextField
							value={entry.text ?? ''}
							onChange={v => onChange({ ...entry, text: v === '' ? null : v })}
							disabled={readOnly}
						/>
					</Field>
					<Field label="Comment" note="Preserved from the file and written back untouched.">
						<TextField
							value={entry.comment ?? ''}
							onChange={v => onChange({ ...entry, comment: v === '' ? null : v })}
							disabled={readOnly}
						/>
					</Field>
					{container && <div className="ss-ed-field-note">Drop an item onto this row to nest it inside the container.</div>}
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
	const [adding, setAdding] = useState(false);

	const setLoot = (next: LootEntry[]) => patch({ loot: next });

	const listDrop = useDropTarget(['item'], p => {
		if (p.kind === 'item' && !readOnly) setLoot([...doc.loot, newLootEntry(p)]);
	});

	return (
		<Section
			id="loot"
			collapsed={collapsed}
			onToggle={() => onToggle('loot')}
			summary={doc.loot.length === 1 ? '1 drop' : `${doc.loot.length} drops`}
		>
			<div className="ss-ed-loot" {...listDrop}>
				{doc.loot.length === 0 && <div className="ss-ed-empty">No loot. Drop items here from the Items browser.</div>}
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
					/>
				))}
			</div>

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
						placeholder="Search items…"
					/>
				) : (
					<button type="button" className="ss-btn" disabled={readOnly} onClick={() => setAdding(true)}>
						<Plus size={14} />
						Add item
					</button>
				)}
				<button
					type="button"
					className="ss-btn ss-btn-ghost"
					disabled={readOnly || doc.loot.length < 2}
					title="Rarest last"
					onClick={() => setLoot([...doc.loot].sort((a, b) => b.chance - a.chance))}
				>
					Sort by chance
				</button>
				<span className="ss-ed-field-note">Chance is out of 100,000 in the file; shown here as a percent.</span>
			</div>
		</Section>
	);
}
