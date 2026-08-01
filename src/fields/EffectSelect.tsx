import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { engineInfo } from '../engine';
import { mergeEffects } from '../customeffects';
import { useCustomEffects } from './customctx';
import { EffectGrid, Sprite } from './EffectGrid';

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
	const custom = useCustomEffects();
	// The catalogue offered is the engine's table plus whatever this server was
	// declared to add — see `customeffects.ts` for why the two are kept apart.
	const entries = useMemo(
		() =>
			kind === 'area'
				? mergeEffects(info.magicEffects, custom.magic)
				: mergeEffects(info.shootEffects, custom.shoot),
		[kind, info, custom]
	);
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

/**
 * The same choice, made in the effects browser instead of in a popover.
 *
 * The create wizard hands its picture-shaped questions to the workspace's own
 * browsers — the outfit grid, the item grid, and these two — because they are
 * the real ones: every filter, the name search, the animation playing at the
 * client's own frame rate. This is the trigger and the read-out; the choosing
 * happens over there.
 */
export function EffectBrowse({
	kind,
	value,
	engine,
	onBrowse,
	onClear
}: {
	kind: 'area' | 'shoot';
	value: string | null;
	engine?: string;
	onBrowse: () => void;
	onClear: () => void;
}) {
	const { t } = useTranslation();
	const info = engineInfo(engine);
	const custom = useCustomEffects();
	const entries = useMemo(
		() => (kind === 'area' ? mergeEffects(info.magicEffects, custom.magic) : mergeEffects(info.shootEffects, custom.shoot)),
		[kind, info, custom]
	);
	// An effect the catalogue does not carry still shows as itself rather than as
	// "(none)": a value the editor renders as nothing is a value the next click
	// deletes.
	const entry = value ? entries.find(e => e.name === value) : null;

	return (
		<div className="ss-ed-effect-browse">
			<button type="button" className="ss-ed-input ss-ed-item-trigger" onClick={onBrowse}>
				{entry ? <Sprite id={entry.id} kind={kind} /> : <span className="ss-ed-effect-chip">—</span>}
				<span className="ss-ed-item-name">{value ?? t('(none)')}</span>
			</button>
			{value && (
				<button type="button" className="ss-btn ss-btn-ghost ss-ed-mini" title={t('Clear')} onClick={onClear}>
					<X size={13} />
				</button>
			)}
		</div>
	);
}
