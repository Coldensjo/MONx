import { MAGIC_EFFECTS, SHOOT_EFFECTS } from '../catalog';
import { EffectGrid } from './EffectGrid';

interface Props {
	kind: 'area' | 'shoot';
	value: string | null;
	onChange: (v: string | null) => void;
	disabled?: boolean;
	/** Offered as the "no effect" choice; omitting the attribute is equivalent. */
	noneLabel?: string;
}

/**
 * Effect picker that shows the animation, not the identifier — the user picks
 * the swirly red one. Names are emitted verbatim and matched case-sensitively
 * by the loader (§8.4), so the value is always the exact `CONST_*` spelling.
 *
 * Both catalogues are sprite grids: an impact is chosen by eye exactly like a
 * projectile is, and `CONST_ME_MORTAREA` says less than the animation does.
 */
export function EffectSelect({ kind, value, onChange, disabled, noneLabel = '(none)' }: Props) {
	return (
		<EffectGrid
			entries={kind === 'area' ? MAGIC_EFFECTS : SHOOT_EFFECTS}
			kind={kind}
			value={value}
			onChange={onChange}
			disabled={disabled}
			noneLabel={noneLabel}
		/>
	);
}
