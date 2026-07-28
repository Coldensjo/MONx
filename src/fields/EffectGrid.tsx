import { useMemo, useState } from 'react';
import { Ban, Search } from 'lucide-react';
import type { EffectEntry } from '../catalog';
import { usePreviewUrl } from './preview';

interface Props {
	entries: EffectEntry[];
	kind: 'area' | 'shoot';
	value: string | null;
	onChange: (v: string | null) => void;
	disabled?: boolean;
	noneLabel?: string;
}

function Cell({
	entry,
	kind,
	active,
	disabled,
	onPick
}: {
	entry: EffectEntry;
	kind: 'area' | 'shoot';
	active: boolean;
	disabled?: boolean;
	onPick: () => void;
}) {
	const previewUrl = usePreviewUrl();
	const url = previewUrl?.(kind === 'area' ? 'effect' : 'missile', entry.id);
	const title = [entry.label, entry.name, entry.unreachable ?? entry.mislabeled].filter(Boolean).join(' — ');
	return (
		<button
			type="button"
			className={active ? 'ss-ed-effect-cell ss-ed-effect-cell-active' : 'ss-ed-effect-cell'}
			title={title}
			disabled={disabled}
			onClick={onPick}
		>
			{url ? (
				<img
					className="ss-ed-effect-sprite"
					src={url}
					width={32}
					height={32}
					alt=""
					draggable={false}
					onError={e => (e.currentTarget.style.visibility = 'hidden')}
				/>
			) : (
				<span className="ss-ed-effect-chip">{entry.id}</span>
			)}
		</button>
	);
}

/**
 * The effect catalogue laid out as sprites. Picking a projectile is a visual
 * choice — one glance at the grid beats reading eighty `CONST_ANI_*` names in a
 * list. Values are still the exact wire spelling (§20).
 */
export function EffectGrid({ entries, kind, value, onChange, disabled, noneLabel = '(none)' }: Props) {
	const [query, setQuery] = useState('');

	const shown = useMemo(() => {
		const q = query.trim().toLowerCase();
		return entries.filter(e => {
			if (e.id === 0) return false; // the NONE sentinel is the dedicated first cell
			// Unusable names resolve to NONE and log an error (§21) — hidden unless
			// this monster already carries one, where it must stay visible to fix.
			if (e.unreachable && e.name !== value) return false;
			if (!q) return true;
			return e.label.toLowerCase().includes(q) || e.name.toLowerCase().includes(q);
		});
	}, [entries, query, value]);

	const current = entries.find(e => e.name === value);

	return (
		<div className="ss-ed-effect">
			<div className="ss-ed-effect-gridbar">
				<Search size={12} />
				<input
					value={query}
					placeholder="Search"
					disabled={disabled}
					onChange={e => setQuery(e.target.value)}
				/>
				<span className="ss-ed-effect-current">{current ? current.label : noneLabel}</span>
			</div>
			<div className="ss-ed-effect-grid">
				<button
					type="button"
					className={value ? 'ss-ed-effect-cell' : 'ss-ed-effect-cell ss-ed-effect-cell-active'}
					title={noneLabel}
					disabled={disabled}
					onClick={() => onChange(null)}
				>
					<span className="ss-ed-effect-none">
						<Ban size={14} />
					</span>
				</button>
				{shown.map(e => (
					<Cell
						key={e.name}
						entry={e}
						kind={kind}
						active={e.name === value}
						disabled={disabled || !!e.unreachable}
						onPick={() => onChange(e.name)}
					/>
				))}
			</div>
			{current?.unreachable && <div className="ss-ed-field-note ss-ed-note-warn">{current.unreachable}</div>}
			{current?.mislabeled && <div className="ss-ed-field-note ss-ed-note-warn">{current.mislabeled}</div>}
			{current?.ironcore && (
				<div className="ss-ed-field-note">Ironcore-only effect — a stock client renders nothing.</div>
			)}
		</div>
	);
}
