import { useEffect, useMemo, useRef, useState } from 'react';
import { batchEdit, type BatchChange, type BatchFilter, type BatchReport, type BatchTarget } from './monster';
import { NumberField } from './fields/NumberField';
import { TextField } from './fields/TextField';
import {
	BOOLEAN_FLAGS,
	CONDITION_IMMUNITIES,
	DAMAGE_TYPES,
	NUMERIC_FLAGS,
	RACES,
	SKULLS
} from './catalog';

interface Props {
	/** Species values present in the corpus, for the filter dropdown. */
	species: string[];
	onClose: () => void;
	/** Ran after a successful write, with the report, so the caller can refresh and toast. */
	onApplied: (report: BatchReport) => void;
	onError: (message: string) => void;
}

type Op = BatchTarget['op'];
type ValueKind = 'number' | 'text' | 'bool' | 'race' | 'skull';

interface TargetOption {
	id: string;
	kind: BatchTarget['kind'];
	key: string;
	label: string;
	group: string;
	value: ValueKind;
	ops: Op[];
	/** Percent-shaped, so the value field reads as one. */
	percent?: boolean;
}

const OP_LABEL: Record<Op, string> = { set: 'Set to', scale: 'Scale by', clear: 'Clear' };

/**
 * Everything a batch edit can address. Numeric document fields are always
 * written, so they cannot be cleared — only given a value or scaled. Flags,
 * elements and immunities are nodes that may or may not be there, so they can
 * be added and removed, and the preview says which of the two it is.
 */
const TARGETS: TargetOption[] = [
	...(
		[
			['experience', 'Experience'],
			['health', 'Health'],
			['speed', 'Speed'],
			['manacost', 'Mana cost'],
			['armor', 'Armor'],
			['defense', 'Defense'],
			['targetInterval', 'Target change interval'],
			['targetChance', 'Target change chance']
		] as [string, string][]
	).map(([key, label]) => ({
		id: `field:${key}`,
		kind: 'field' as const,
		key,
		label,
		group: 'Fields',
		value: 'number' as const,
		ops: ['set', 'scale'] as Op[]
	})),
	{ id: 'field:race', kind: 'field', key: 'race', label: 'Race (blood)', group: 'Fields', value: 'race', ops: ['set', 'clear'] },
	{ id: 'field:skull', kind: 'field', key: 'skull', label: 'Skull', group: 'Fields', value: 'skull', ops: ['set', 'clear'] },
	{ id: 'field:species', kind: 'field', key: 'species', label: 'Species', group: 'Fields', value: 'text', ops: ['set', 'clear'] },
	{ id: 'field:script', kind: 'field', key: 'script', label: 'Script', group: 'Fields', value: 'text', ops: ['set', 'clear'] },
	{
		id: 'field:nameDescription',
		kind: 'field',
		key: 'nameDescription',
		label: 'Name description',
		group: 'Fields',
		value: 'text',
		ops: ['set', 'clear']
	},

	...BOOLEAN_FLAGS.map(f => ({
		id: `flag:${f.key}`,
		kind: 'flag' as const,
		key: f.key,
		label: f.label,
		group: 'Flags',
		value: 'bool' as const,
		ops: ['set', 'clear'] as Op[]
	})),
	...NUMERIC_FLAGS.map(f => ({
		id: `flag:${f.key}`,
		kind: 'flag' as const,
		key: f.key,
		label: f.label,
		group: 'Flags',
		value: 'number' as const,
		ops: ['set', 'scale', 'clear'] as Op[]
	})),

	...DAMAGE_TYPES.map(d => ({
		id: `element:${d.elementKeys[0]}`,
		kind: 'element' as const,
		key: d.elementKeys[0],
		label: `${d.label} %`,
		group: 'Elements',
		value: 'number' as const,
		ops: ['set', 'scale', 'clear'] as Op[],
		percent: true
	})),

	...[...DAMAGE_TYPES.map(d => ({ key: d.immunityKeys[0], label: d.label })), ...CONDITION_IMMUNITIES].map(i => ({
		id: `immunity:${i.key}`,
		kind: 'immunity' as const,
		key: i.key,
		label: i.label,
		group: 'Immunities',
		value: 'bool' as const,
		ops: ['set', 'clear'] as Op[]
	}))
];

const ALL_FLAGS = [...BOOLEAN_FLAGS, ...NUMERIC_FLAGS];

/** Grouped rows of the preview, one entry per file. */
function group(sample: BatchChange[]): BatchChange[] {
	return [...sample].sort((a, b) => a.monster.localeCompare(b.monster));
}

/** A tri-state filter as a select: unset, yes, no. */
function TriSelect({
	value,
	onChange,
	yes,
	no
}: {
	value: boolean | null;
	onChange: (v: boolean | null) => void;
	yes: string;
	no: string;
}) {
	return (
		<select
			className="ss-ed-input"
			value={value === null ? '' : value ? 'y' : 'n'}
			onChange={e => onChange(e.target.value === '' ? null : e.target.value === 'y')}
		>
			<option value="">Any</option>
			<option value="y">{yes}</option>
			<option value="n">{no}</option>
		</select>
	);
}

/**
 * The loot scaler generalised: pick the monsters with a filter, then set, scale
 * or clear one field across them. Preview-then-apply, per-file opt-out, and the
 * count of changes that add a node rather than edit one in place — the writer
 * splices, so an insert is the only thing that moves the rest of the file.
 */
export default function BatchEditDialog({ species, onClose, onApplied, onError }: Props) {
	const [name, setName] = useState('');
	const [race, setRace] = useState('');
	const [speciesFilter, setSpeciesFilter] = useState('');
	const [minExp, setMinExp] = useState<number | null>(null);
	const [maxExp, setMaxExp] = useState<number | null>(null);
	const [minHp, setMinHp] = useState<number | null>(null);
	const [maxHp, setMaxHp] = useState<number | null>(null);
	const [flag, setFlag] = useState('');
	const [flagValue, setFlagValue] = useState('');
	const [registered, setRegistered] = useState<boolean | null>(null);
	const [hasLoot, setHasLoot] = useState<boolean | null>(null);

	const [targetId, setTargetId] = useState(TARGETS[0].id);
	const [op, setOp] = useState<Op>('set');
	const [value, setValue] = useState('1000');

	const [excluded, setExcluded] = useState<Set<string>>(new Set());
	const [report, setReport] = useState<BatchReport | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);

	const target = TARGETS.find(t => t.id === targetId) ?? TARGETS[0];

	// Switching target can strand an operation the new one does not offer, and a
	// value shaped for the old one. Both fall back to something valid.
	useEffect(() => {
		if (!target.ops.includes(op)) setOp(target.ops[0]);
		if (target.value === 'bool' && value !== 'true' && value !== 'false') setValue('true');
		if (target.value === 'race' && !RACES.some(r => r.value === value)) setValue(RACES[0].value);
		if (target.value === 'skull' && !SKULLS.some(s => s.value === value)) setValue(SKULLS[0].value);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [targetId]);

	const filter: BatchFilter = useMemo(
		() => ({
			name: name.trim() || null,
			race: race || null,
			species: speciesFilter || null,
			minExperience: minExp,
			maxExperience: maxExp,
			minHealth: minHp,
			maxHealth: maxHp,
			flag: flag || null,
			flagValue: flag ? flagValue || null : null,
			registered,
			hasLoot
		}),
		[name, race, speciesFilter, minExp, maxExp, minHp, maxHp, flag, flagValue, registered, hasLoot]
	);

	const wire: BatchTarget = useMemo(
		() => ({ kind: target.kind, key: target.key, op, value }),
		[target, op, value]
	);

	// Held in a ref so the preview does not re-run — and drop the ticks — every
	// time the parent re-renders.
	const onErrorRef = useRef(onError);
	onErrorRef.current = onError;

	// Re-preview (debounced) whenever the filter or the change moves.
	useEffect(() => {
		setExcluded(new Set());
		let live = true;
		const t = setTimeout(() => {
			batchEdit(filter, wire, [], false)
				.then(r => {
					if (!live) return;
					setReport(r);
					setError(null);
				})
				.catch(e => {
					if (!live) return;
					// A half-typed value is an error the dialog owns; it is not worth
					// a toast, and the preview says what is wrong instead.
					setReport(null);
					setError(String(e));
				});
		}, 300);
		return () => {
			live = false;
			clearTimeout(t);
		};
	}, [filter, wire]);

	const rows = useMemo(() => group(report?.sample ?? []), [report]);
	const excludedRows = rows.filter(r => excluded.has(r.file)).length;
	const changed = (report?.changed ?? 0) - excludedRows;

	const toggle = (file: string) =>
		setExcluded(prev => {
			const next = new Set(prev);
			if (next.has(file)) next.delete(file);
			else next.add(file);
			return next;
		});

	const apply = async () => {
		setBusy(true);
		try {
			onApplied(await batchEdit(filter, wire, [...excluded], true));
			onClose();
		} catch (e) {
			onError(String(e));
			setBusy(false);
		}
	};

	const valueField = () => {
		if (op === 'clear') return <span className="ss-ed-field-note">Removes the value entirely.</span>;
		switch (target.value) {
			case 'bool':
				return (
					<select className="ss-ed-input" value={value} onChange={e => setValue(e.target.value)}>
						<option value="true">true</option>
						<option value="false">false</option>
					</select>
				);
			case 'race':
				return (
					<select className="ss-ed-input" value={value} onChange={e => setValue(e.target.value)}>
						{RACES.map(r => (
							<option key={r.value} value={r.value}>
								{r.label}
							</option>
						))}
					</select>
				);
			case 'skull':
				return (
					<select className="ss-ed-input" value={value} onChange={e => setValue(e.target.value)}>
						{SKULLS.map(s => (
							<option key={s.value} value={s.value}>
								{s.label}
							</option>
						))}
					</select>
				);
			case 'text':
				return <TextField value={value} onChange={setValue} />;
			default:
				return (
					<>
						<NumberField
							value={Number(value) || 0}
							onChange={v => setValue(String(v))}
							min={0}
							width={110}
						/>
						{(op === 'scale' || target.percent) && <span className="ss-ed-field-note">%</span>}
					</>
				);
		}
	};

	const groups = [...new Set(TARGETS.map(t => t.group))];

	return (
		<div className="ss-backdrop" onMouseDown={onClose}>
			<div className="ss-modal mx-pin-modal mx-batch-modal" onMouseDown={e => e.stopPropagation()}>
				<div className="ss-modal-title">Batch edit</div>

				<div className="mx-batch-section">Which monsters</div>
				<div className="mx-batch-filters">
					<label className="mx-batch-row">
						<span className="mx-batch-label">Name contains</span>
						<TextField value={name} onChange={setName} />
					</label>
					<label className="mx-batch-row">
						<span className="mx-batch-label">Race</span>
						<select className="ss-ed-input" value={race} onChange={e => setRace(e.target.value)}>
							<option value="">Any</option>
							{RACES.map(r => (
								<option key={r.value} value={r.value}>
									{r.label}
								</option>
							))}
						</select>
					</label>
					<label className="mx-batch-row">
						<span className="mx-batch-label">Species</span>
						<select
							className="ss-ed-input"
							value={speciesFilter}
							onChange={e => setSpeciesFilter(e.target.value)}
						>
							<option value="">Any</option>
							{species.map(s => (
								<option key={s} value={s}>
									{s}
								</option>
							))}
						</select>
					</label>
					<div className="mx-batch-row">
						<span className="mx-batch-label">Experience</span>
						<NumberField value={minExp ?? 0} onChange={v => setMinExp(v || null)} min={0} width={92} />
						<span className="ss-ed-field-note">to</span>
						<NumberField value={maxExp ?? 0} onChange={v => setMaxExp(v || null)} min={0} width={92} />
						<span className="ss-ed-field-note">0 = no bound</span>
					</div>
					<div className="mx-batch-row">
						<span className="mx-batch-label">Health</span>
						<NumberField value={minHp ?? 0} onChange={v => setMinHp(v || null)} min={0} width={92} />
						<span className="ss-ed-field-note">to</span>
						<NumberField value={maxHp ?? 0} onChange={v => setMaxHp(v || null)} min={0} width={92} />
					</div>
					<div className="mx-batch-row">
						<span className="mx-batch-label">Has flag</span>
						<select className="ss-ed-input" value={flag} onChange={e => setFlag(e.target.value)}>
							<option value="">Any</option>
							{ALL_FLAGS.map(f => (
								<option key={f.key} value={f.key}>
									{f.label}
								</option>
							))}
						</select>
						{flag && (
							<>
								<span className="ss-ed-field-note">at value</span>
								<TextField value={flagValue} onChange={setFlagValue} placeholder="any" />
							</>
						)}
					</div>
					<div className="mx-batch-row">
						<span className="mx-batch-label">Registered</span>
						<TriSelect value={registered} onChange={setRegistered} yes="In monsters.xml" no="Orphan" />
						<span className="mx-batch-label">Loot</span>
						<TriSelect value={hasLoot} onChange={setHasLoot} yes="Has loot" no="No loot" />
					</div>
				</div>

				<div className="mx-batch-section">What to change</div>
				<div className="mx-batch-row">
					<select className="ss-ed-input" value={targetId} onChange={e => setTargetId(e.target.value)}>
						{groups.map(g => (
							<optgroup key={g} label={g}>
								{TARGETS.filter(t => t.group === g).map(t => (
									<option key={t.id} value={t.id}>
										{t.label}
									</option>
								))}
							</optgroup>
						))}
					</select>
					<select className="ss-ed-input" value={op} onChange={e => setOp(e.target.value as Op)}>
						{target.ops.map(o => (
							<option key={o} value={o}>
								{OP_LABEL[o]}
							</option>
						))}
					</select>
					{valueField()}
				</div>

				{error && <div className="ss-modal-desc mx-pin-warn">{error}</div>}
				{!error && !report && <div className="ss-modal-desc">Previewing…</div>}

				{report && (
					<>
						<div className="ss-modal-desc">
							{report.matched.toLocaleString()} {report.matched === 1 ? 'monster matches' : 'monsters match'}
							{report.changed === 0
								? ' — none of them change at these settings.'
								: `, ${changed.toLocaleString()} ${changed === 1 ? 'changes' : 'change'}.`}
							{report.structural > 0 && (
								<span className="mx-batch-insert">
									{' '}
									{report.structural} of them {report.structural === 1 ? 'adds' : 'add'} or{' '}
									{report.structural === 1 ? 'removes' : 'remove'} a node rather than changing one in
									place, so those files shift every line below the edit.
								</span>
							)}
						</div>

						{rows.length > 0 && (
							<>
								<div className="mx-scale-head">
									<button
										type="button"
										className="ss-btn ss-btn-ghost ss-ed-mini"
										disabled={excluded.size === 0}
										onClick={() => setExcluded(new Set())}
									>
										Select all
									</button>
									<button
										type="button"
										className="ss-btn ss-btn-ghost ss-ed-mini"
										disabled={excluded.size === rows.length}
										onClick={() => setExcluded(new Set(rows.map(r => r.file)))}
									>
										Select none
									</button>
								</div>
								<div className="mx-pin-list mx-scale-list">
									{rows.map(r => (
										<label
											key={r.file}
											className={`mx-scale-item${excluded.has(r.file) ? ' mx-scale-off' : ''}`}
										>
											<input
												type="checkbox"
												checked={!excluded.has(r.file)}
												onChange={() => toggle(r.file)}
											/>
											<span className="mx-scale-monster" title={r.file}>
												{r.monster}
											</span>
											<span className="mx-scale-entry">
												<span className="mono mx-scale-from">{r.from}</span>
												<span className="mx-scale-arrow">→</span>
												<span className="mono mx-scale-to">{r.to}</span>
												{r.structural && (
													<span className="mx-batch-new">
														{r.to === '(absent)' ? 'removed' : 'new'}
													</span>
												)}
											</span>
										</label>
									))}
									{report.truncated && (
										<div className="mx-pin-more">
											and {(report.changed - report.sample.length).toLocaleString()} more not listed —
											they change too
										</div>
									)}
								</div>
							</>
						)}

						<div className="ss-modal-desc">
							Every changed file is backed up to <span className="mono">.monx-backup/</span> before it is
							rewritten.
						</div>
					</>
				)}

				<div className="ss-modal-buttons">
					<button className="ss-btn ss-btn-ghost" onClick={onClose}>
						Cancel
					</button>
					<div className="ss-modal-buttons-spacer" />
					<button
						className="ss-btn ss-btn-primary"
						disabled={busy || !report || changed === 0}
						onClick={() => void apply()}
					>
						{busy ? 'Changing…' : changed > 0 ? `Change ${changed.toLocaleString()}` : 'Change'}
					</button>
				</div>
			</div>
		</div>
	);
}
