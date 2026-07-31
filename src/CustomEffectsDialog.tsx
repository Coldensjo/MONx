import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { engineInfo } from './engine';
import type { CustomEffect, CustomEffects } from './customeffects';
import { Sprite } from './fields/EffectGrid';

interface Props {
	/** The engine in force. Declarations are per-engine: effect 105 on your
	 *  Ironcore fork says nothing about a Canary server. */
	engine: string;
	effects: CustomEffects;
	/** Applied live, so the picker behind the dialog updates as rows are typed. */
	onChange: (effects: CustomEffects) => void;
	onClose: () => void;
}

type Kind = 'magic' | 'shoot';

/**
 * Declares the effects a server adds on top of what its engine ships.
 *
 * MONx's effect tables are read out of each engine's own source, which is what
 * makes them worth trusting and also what makes them incomplete for anybody who
 * has modified their server. This is where that gap is closed: a name and a
 * client id, after which the effect is a normal entry — it appears in the
 * picker, previews its real sprite, and stops being reported as unknown.
 *
 * Nothing here changes what MONx writes. The value was always emitted verbatim;
 * declaring it only changes whether MONx can show it to you.
 */
export default function CustomEffectsDialog({ engine, effects, onChange, onClose }: Props) {
	const { t } = useTranslation();
	const [kind, setKind] = useState<Kind>('magic');
	const info = engineInfo(engine);
	const list = effects[kind];
	const stock = kind === 'magic' ? info.magicEffects : info.shootEffects;

	const setList = (next: CustomEffect[]) => onChange({ ...effects, [kind]: next });

	const add = () => setList([...list, { name: '', id: 0, label: '' }]);
	const remove = (i: number) => setList(list.filter((_, n) => n !== i));
	const edit = (i: number, patch: Partial<CustomEffect>) =>
		setList(list.map((e, n) => (n === i ? { ...e, ...patch } : e)));

	/** A row that repeats a shipped name is ignored on merge, so say so here
	 *  rather than letting it look declared and behave as though it were not. */
	const shadowed = (name: string) => !!name && stock.some(e => e.name === name);
	const duplicated = (name: string, i: number) =>
		!!name && list.some((e, n) => n !== i && e.name === name);

	return (
		<div className="ss-backdrop" onMouseDown={onClose}>
			<div className="ss-modal mx-customfx-modal" onMouseDown={e => e.stopPropagation()}>
				<div className="ss-modal-title">{t('Custom effects')}</div>

				<div className="ss-modal-desc">
					<div className="ss-ed-field-note">
						{t('MONx knows the effects {{engine}} ships, read from its own source. Anything your server adds on top is listed here, after which it appears in the picker like any other and stops being reported as unknown. Declarations are remembered per engine.', {
							engine: info.label
						})}
					</div>
				</div>

				<div className="mx-customfx-tabs">
					<button
						type="button"
						className={kind === 'magic' ? 'ss-btn ss-btn-primary' : 'ss-btn'}
						onClick={() => setKind('magic')}
					>
						{t('Magic effects')} ({effects.magic.length})
					</button>
					<button
						type="button"
						className={kind === 'shoot' ? 'ss-btn ss-btn-primary' : 'ss-btn'}
						onClick={() => setKind('shoot')}
					>
						{t('Shoot effects')} ({effects.shoot.length})
					</button>
				</div>

				<div className="mx-customfx-rows">
					<div className="mx-customfx-head">
						<span>{t('Value written to the file')}</span>
						<span>{t('Client id')}</span>
						<span>{t('Label')}</span>
						<span />
						<span />
					</div>
					{list.length === 0 && (
						<div className="ss-ed-field-note">
							{t('Nothing declared yet. {{engine}} ships {{count}} of these on its own.', {
								engine: info.label,
								count: stock.length
							})}
						</div>
					)}
					{list.map((e, i) => (
						<div key={i} className="mx-customfx-row">
							<input
								className="ss-ed-input"
								value={e.name}
								placeholder={info.effectNaming === 'constMe' ? 'CONST_ME_MYEFFECT' : 'myeffect'}
								onChange={ev => edit(i, { name: ev.target.value })}
							/>
							<input
								className="ss-ed-input"
								type="number"
								min={0}
								value={e.id}
								onChange={ev => edit(i, { id: Math.max(0, Number(ev.target.value) || 0) })}
							/>
							<input
								className="ss-ed-input"
								value={e.label}
								placeholder={e.name || t('(uses the value)')}
								onChange={ev => edit(i, { label: ev.target.value })}
							/>
							{/* The point of the id field is that you can see whether you
							    got it right, so the sprite sits next to it. */}
							<span className="mx-customfx-preview">
								<Sprite id={e.id} kind={kind === 'magic' ? 'area' : 'shoot'} />
							</span>
							<button
								type="button"
								className="ss-btn ss-btn-icon"
								title={t('Remove')}
								onClick={() => remove(i)}
							>
								<Trash2 size={14} />
							</button>
							{shadowed(e.name) && (
								<div className="ss-ed-field-note ss-ed-note-warn mx-customfx-note">
									{t('{{engine}} already ships this name — the shipped entry wins and this row does nothing.', {
										engine: info.label
									})}
								</div>
							)}
							{duplicated(e.name, i) && (
								<div className="ss-ed-field-note ss-ed-note-warn mx-customfx-note">
									{t('Declared twice — only the first is used.')}
								</div>
							)}
						</div>
					))}
				</div>

				<button type="button" className="ss-btn" onClick={add}>
					<Plus size={14} />
					{t('Declare an effect')}
				</button>

				<div className="ss-ed-field-note">
					{t('An id of 0 is allowed — the effect is named and lints clean, but has no sprite to preview. Nothing here changes what MONx writes: the value was always emitted exactly as typed.')}
				</div>

				<div className="ss-modal-buttons">
					<div className="ss-modal-buttons-spacer" />
					<button type="button" className="ss-btn ss-btn-primary" onClick={onClose}>
						{t('Close')}
					</button>
				</div>
			</div>
		</div>
	);
}
