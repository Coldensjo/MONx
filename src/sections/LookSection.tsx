import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { Link2, PackageSearch, Unlink, X } from 'lucide-react';
import { itemUrl, type Look } from '../monster';
import { engineInfo } from '../engine';
import { Field } from '../fields/Field';
import { NumberField } from '../fields/NumberField';
import { ColorSwatchGrid } from '../fields/ColorSwatchGrid';
import { OutfitPicker } from '../fields/OutfitPicker';
import { ItemSprite, useItemInfo } from '../fields/ItemPicker';
import { DecayChain } from '../fields/DecayChain';
import { Toggle, ToggleGroup } from '../fields/Toggle';
import { useDropTarget } from '../dnd';
import { Banner, Section, SubGroup, type SectionId, type SectionProps } from './section';

interface Props extends SectionProps {
	collapsed: boolean;
	onToggle: (id: SectionId) => void;
}

/** `label` values are i18n keys; `key` is the wire attribute. */
const COLOUR_PARTS: { key: 'head' | 'body' | 'legs' | 'feet'; label: string }[] = [
	{ key: 'head', label: 'Head' },
	{ key: 'body', label: 'Body' },
	{ key: 'legs', label: 'Legs' },
	{ key: 'feet', label: 'Feet' }
];

export function LookSection({
	doc,
	patch,
	lintAt,
	items,
	readOnly,
	collapsed,
	onToggle,
	onBrowseOutfits,
	onBrowseCorpses,
	onBrowseItems
}: Props) {
	const { t } = useTranslation();
	const engine = engineInfo(doc.engine);
	// Health stays locked unless the author deliberately wants a monster that
	// spawns damaged; the loader clamps now > max and warns (§4).
	const [healthUnlocked, setHealthUnlocked] = useState(doc.health.now !== doc.health.max);

	const look = doc.look;
	const setLook = (p: Partial<Look>) => patch({ look: { ...look, ...p } });
	const typeex = look.mode === 'typeex';

	const outfitDrop = useDropTarget(['outfit'], p => {
		if (p.kind === 'outfit' && !readOnly) setLook({ mode: 'type', type: p.type });
	});

	const corpseDrop = useDropTarget(['item'], p => {
		if (p.kind === 'item' && !readOnly) setLook({ corpse: p.serverId });
	});

	// Resolves the corpse id to its items.xml name for the read-only display —
	// the picking itself happens in the Items browser (Select corpse).
	const corpseInfo = useItemInfo(items, look.corpse === 0 ? null : look.corpse, null);
	const typeexInfo = useItemInfo(items, look.typeex, null);

	const typeexDrop = useDropTarget(['item'], p => {
		// Dropping an item onto typeex also switches the mode — that is the only
		// way the value has any effect.
		if (p.kind === 'item' && !readOnly) setLook({ mode: 'typeex', typeex: p.serverId });
	});

	return (
		<Section
			id="look"
			collapsed={collapsed}
			onToggle={() => onToggle('look')}
			summary={typeex ? t('item {{id}}', { id: look.typeex ?? 0 }) : t('type {{id}}', { id: look.type ?? 0 })}
		>
			<div className="ss-ed-drop" {...outfitDrop}>
				<Field label={t('Mode')} note={t('The parser takes type first; the two are mutually exclusive.')}>
					<ToggleGroup
						value={look.mode}
						onChange={mode => setLook({ mode })}
						options={[
							{ value: 'type', label: t('Outfit (type)'), title: t('A client outfit with colours and addons') },
							{ value: 'typeex', label: t('Item (typeex)'), title: t('An item used as the body — statues, fires, spinning swords') }
						]}
						disabled={readOnly}
					/>
				</Field>

				{typeex ? (
					<Field label={t('Item')} lints={lintAt('look.typeex')}>
						<span className="ss-ed-drop ss-ed-inline" {...typeexDrop}>
							{look.typeex === null ? (
								<ItemSprite serverId={null} size={32} />
							) : (
								// No cell param — native composed size, as the corpse shows.
								<img
									className="ss-ed-item-sprite"
									src={itemUrl(look.typeex)}
									alt=""
									draggable={false}
									onError={e => (e.currentTarget.style.visibility = 'hidden')}
								/>
							)}
							{look.typeex !== null && (
								<span className="ss-ed-corpse-name">{typeexInfo?.name || `#${look.typeex}`}</span>
							)}
							<button
								type="button"
								className="ss-btn"
								disabled={readOnly}
								onClick={onBrowseItems}
								title={t('Browse the Items grid, then right-click one to set it as the outfit')}
							>
								<PackageSearch size={14} />
								Select item
							</button>
							{look.typeex !== null && (
								<button
									type="button"
									className="ss-btn ss-btn-ghost"
									disabled={readOnly}
									onClick={() => setLook({ typeex: null })}
									title={t('Clear')}
								>
									<X size={13} />
								</button>
							)}
						</span>
					</Field>
				) : (
					<Field label={t('Outfit')} lints={lintAt('look.type')}>
						<OutfitPicker
							look={look}
							onChangeType={type => setLook({ type })}
							onBrowse={onBrowseOutfits}
							disabled={readOnly}
						/>
					</Field>
				)}

				{typeex && (
					<Banner kind="info">
						{t('Under {{attr}} the engine ignores head, body, legs, feet and addons entirely. They are kept in the file but have no effect.', {
							attr: 'typeex'
						})}
					</Banner>
				)}

				<SubGroup title={t('Colours')}>
					<div className="ss-ed-colour-row">
						{COLOUR_PARTS.map(p => (
							<div key={p.key} className="ss-ed-colour-cell">
								<span className="ss-ed-colour-label">{p.label}</span>
								<ColorSwatchGrid
									label={p.label}
									value={look[p.key]}
									onChange={v => setLook({ [p.key]: v } as Partial<Look>)}
									disabled={readOnly || typeex}
								/>
							</div>
						))}
					</div>
				</SubGroup>

				{/* The 7.x engines read neither addons nor mount from <look>. */}
				{(engine.lookAddons || engine.lookMount) && (
				<div className="ss-ed-card-grid">
					{engine.lookAddons && (
					<Field label={t('Addons')} ignored={typeex}>
						<div className="ss-ed-inline">
							<Toggle
								label={t('First')}
								checked={(look.addons & 1) !== 0}
								disabled={readOnly || typeex}
								onChange={v => setLook({ addons: v ? look.addons | 1 : look.addons & ~1 })}
							/>
							<Toggle
								label={t('Second')}
								checked={(look.addons & 2) !== 0}
								disabled={readOnly || typeex}
								onChange={v => setLook({ addons: v ? look.addons | 2 : look.addons & ~2 })}
							/>
						</div>
					</Field>
					)}

					{engine.lookMount && (
					<Field label={t('Mount')} lints={lintAt('look.mount')} note={t('Read in both modes.')}>
						<NumberField value={look.mount} onChange={v => setLook({ mount: v })} min={0} width={110} disabled={readOnly} />
					</Field>
					)}
				</div>
				)}
			</div>

			<SubGroup title={t('Corpse')}>
				<Field
					label={t('Corpse item')}
					lints={lintAt('look.corpse')}
					hint={look.corpse === 0 ? t('no corpse') : undefined}
				>
					<span className="ss-ed-drop ss-ed-inline" {...corpseDrop}>
						{look.corpse === 0 ? (
							<ItemSprite serverId={null} size={32} />
						) : (
							// No cell param: /item.png returns the corpse at its native
							// composed size, so a 2×2-tile corpse reads as 64×64.
							<img
								className="ss-ed-item-sprite"
								src={itemUrl(look.corpse)}
								alt=""
								draggable={false}
								onError={e => (e.currentTarget.style.visibility = 'hidden')}
							/>
						)}
						{look.corpse !== 0 && (
							<span className="ss-ed-corpse-name">
								{corpseInfo?.name || `#${look.corpse}`}
							</span>
						)}
						<button
							type="button"
							className="ss-btn"
							disabled={readOnly}
							onClick={onBrowseCorpses}
							title={t('Browse the Items grid filtered to corpses, then right-click one to set it')}
						>
							<PackageSearch size={14} />
							Select corpse
						</button>
						{look.corpse !== 0 && (
							<button
								type="button"
								className="ss-btn ss-btn-ghost"
								disabled={readOnly}
								onClick={() => setLook({ corpse: 0 })}
								title={t('No corpse')}
							>
								<X size={13} />
							</button>
						)}
					</span>
				</Field>

				<DecayChain serverId={look.corpse === 0 ? null : look.corpse} />

				{engine.corpseactionid && (
				<Field
					label={t('Corpse action id')}
					lints={lintAt('look.corpseactionid')}
					note={t('Ironcore — stamped on the corpse so quest scripts can hook it. Only applied when non-zero.')}
				>
					<NumberField
						value={look.corpseactionid}
						onChange={v => setLook({ corpseactionid: v })}
						min={0}
						width={110}
						disabled={readOnly}
					/>
				</Field>
				)}
			</SubGroup>

			<SubGroup title={t('Health')}>
				<Field
					label={t('Max health')}
					lints={lintAt('health.max')}
					hint={
						<button
							type="button"
							className="ss-btn ss-btn-ghost ss-ed-mini"
							disabled={readOnly}
							onClick={() => setHealthUnlocked(u => !u)}
							title={healthUnlocked ? t('Lock now to max') : t('Allow a damaged-on-spawn monster')}
						>
							{healthUnlocked ? <Unlink size={13} /> : <Link2 size={13} />}
							{healthUnlocked ? t('damaged on spawn') : t('locked')}
						</button>
					}
				>
					<NumberField
						value={doc.health.max}
						onChange={v => patch({ health: { max: v, now: healthUnlocked ? doc.health.now : v } })}
						min={1}
						width={120}
						disabled={readOnly}
					/>
				</Field>

				{healthUnlocked && (
					<Field
						label={t('Health on spawn')}
						lints={lintAt('health.now')}
						note={
							doc.health.now > doc.health.max
								? t('Above max — the loader clamps it down and warns. Shown as written.')
								: undefined
						}
					>
						<NumberField
							value={doc.health.now}
							onChange={v => patch({ health: { ...doc.health, now: v } })}
							min={1}
							width={120}
							disabled={readOnly}
						/>
					</Field>
				)}
			</SubGroup>
		</Section>
	);
}
