import { engineInfo } from '../engine';
import { EffectGrid } from './EffectGrid';

interface Props {
	kind: 'area' | 'shoot';
	value: string | null;
	onChange: (v: string | null) => void;
	disabled?: boolean;
	/** Offered as the "no effect" choice; omitting the attribute is equivalent. */
	noneLabel?: string;
	/** Engine key from the document. The catalogues differ by more than length:
	 *  Ironcore writes `CONST_ME_FIREAREA` where the others write `firearea`,
	 *  and the wrong spelling is silently dropped by the loader. */
	engine?: string;
}

/**
 * Effect picker that shows the animation, not the identifier — the user picks
 * the swirly red one. Names are emitted verbatim, so the list offered is always
 * the active engine's own, in that engine's spelling.
 *
 * Both catalogues are sprite grids: an impact is chosen by eye exactly like a
 * projectile is, and `CONST_ME_MORTAREA` says less than the animation does.
 */
export function EffectSelect({ kind, value, onChange, disabled, noneLabel = '(none)', engine }: Props) {
	const info = engineInfo(engine);
	return (
		<EffectGrid
			entries={kind === 'area' ? info.magicEffects : info.shootEffects}
			kind={kind}
			value={value}
			onChange={onChange}
			disabled={disabled}
			noneLabel={noneLabel}
		/>
	);
}
