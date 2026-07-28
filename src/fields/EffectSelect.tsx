import { useMemo } from 'react';
import { MAGIC_EFFECTS, SHOOT_EFFECTS, type EffectEntry } from '../catalog';
import { EnumSelect, type EnumOption } from './EnumSelect';
import { EffectGrid } from './EffectGrid';
import { usePreviewUrl } from './preview';

interface Props {
	kind: 'area' | 'shoot';
	value: string | null;
	onChange: (v: string | null) => void;
	disabled?: boolean;
	/** Offered as the "no effect" choice; omitting the attribute is equivalent. */
	noneLabel?: string;
}

function EffectSprite({ entry, kind }: { entry: EffectEntry; kind: 'area' | 'shoot' }) {
	const previewUrl = usePreviewUrl();
	const url = entry.id > 0 ? previewUrl?.(kind === 'area' ? 'effect' : 'missile', entry.id) : null;
	if (!url) return <span className="ss-ed-effect-chip">{entry.id}</span>;
	return (
		<img
			className="ss-ed-effect-sprite"
			src={url}
			width={32}
			height={32}
			alt=""
			draggable={false}
			onError={e => (e.currentTarget.style.visibility = 'hidden')}
			onLoad={e => (e.currentTarget.style.visibility = 'visible')}
		/>
	);
}

/**
 * Effect picker that shows the animation, not the identifier — the user picks
 * the swirly red one. Names are emitted verbatim and matched case-sensitively
 * by the loader (§8.4), so the value is always the exact `CONST_*` spelling.
 */
export function EffectSelect({ kind, value, onChange, disabled, noneLabel = '(none)' }: Props) {
	const entries = kind === 'area' ? MAGIC_EFFECTS : SHOOT_EFFECTS;

	const options = useMemo<EnumOption<string>[]>(() => {
		const opts: EnumOption<string>[] = [{ value: '', label: noneLabel, group: 'None' }];
		if (kind === 'shoot') return opts; // the grid below renders these instead
		for (const e of entries) {
			if (e.id === 0) continue; // the NONE sentinel is the empty choice above
			opts.push({
				value: e.name,
				label: e.label,
				group: e.unreachable ? 'Unusable from XML' : e.ironcore ? 'Ironcore additions' : 'Standard',
				preview: <EffectSprite entry={e} kind={kind} />,
				// Unreachable names resolve to NONE and log an error, so they are
				// listed for recognition but never selectable (§21).
				disabled: !!e.unreachable,
				note: e.unreachable ?? e.mislabeled
			});
		}
		return opts;
	}, [entries, kind, noneLabel]);

	const current = entries.find(e => e.name === value);

	// A projectile is picked by looking at it, so the missile catalogue is a
	// sprite grid; area effects stay a list, where the names carry the meaning.
	if (kind === 'shoot') {
		return (
			<EffectGrid
				entries={entries}
				kind={kind}
				value={value}
				onChange={onChange}
				disabled={disabled}
				noneLabel={noneLabel}
			/>
		);
	}

	return (
		<div className="ss-ed-effect">
			<EnumSelect
				value={value ?? ''}
				onChange={v => onChange(v === '' ? null : v)}
				options={options}
				groupOrder={['None', 'Standard', 'Ironcore additions', 'Unusable from XML']}
				disabled={disabled}
				searchThreshold={0}
			/>
			{current?.mislabeled && <div className="ss-ed-field-note ss-ed-note-warn">{current.mislabeled}</div>}
			{current?.ironcore && (
				<div className="ss-ed-field-note">Ironcore-only effect — a stock client renders nothing.</div>
			)}
		</div>
	);
}
