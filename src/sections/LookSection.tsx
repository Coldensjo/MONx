import { useState } from 'react';
import { Link2, PackageSearch, Unlink, X } from 'lucide-react';
import type { Look } from '../monster';
import { Field } from '../fields/Field';
import { NumberField } from '../fields/NumberField';
import { ColorSwatchGrid } from '../fields/ColorSwatchGrid';
import { OutfitPicker } from '../fields/OutfitPicker';
import { ItemPicker, ItemSprite, useItemInfo } from '../fields/ItemPicker';
import { DecayChain } from '../fields/DecayChain';
import { Toggle, ToggleGroup } from '../fields/Toggle';
import { useDropTarget } from '../dnd';
import { Banner, Section, SubGroup, type SectionId, type SectionProps } from './section';

interface Props extends SectionProps {
	collapsed: boolean;
	onToggle: (id: SectionId) => void;
}

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
	onBrowseCorpses
}: Props) {
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
			summary={typeex ? `item ${look.typeex ?? 0}` : `type ${look.type ?? 0}`}
		>
			<div className="ss-ed-drop" {...outfitDrop}>
				<Field label="Mode" note="The parser takes type first; the two are mutually exclusive.">
					<ToggleGroup
						value={look.mode}
						onChange={mode => setLook({ mode })}
						options={[
							{ value: 'type', label: 'Outfit (type)', title: 'A client outfit with colours and addons' },
							{ value: 'typeex', label: 'Item (typeex)', title: 'An item used as the body — statues, fires, spinning swords' }
						]}
						disabled={readOnly}
					/>
				</Field>

				{typeex ? (
					<Field label="Item" lints={lintAt('look.typeex')}>
						<span className="ss-ed-drop" {...typeexDrop}>
							<ItemPicker
								index={items}
								value={look.typeex}
								onChange={item => setLook({ typeex: item.serverId })}
								onClear={() => setLook({ typeex: null })}
								disabled={readOnly}
								placeholder="Pick the item to appear as…"
							/>
						</span>
					</Field>
				) : (
					<Field label="Outfit" lints={lintAt('look.type')}>
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
						Under <code>typeex</code> the engine ignores head, body, legs, feet and addons entirely. They are kept
						in the file but have no effect.
					</Banner>
				)}

				<SubGroup title="Colours">
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

				<div className="ss-ed-card-grid">
					<Field label="Addons" ignored={typeex}>
						<div className="ss-ed-inline">
							<Toggle
								label="First"
								checked={(look.addons & 1) !== 0}
								disabled={readOnly || typeex}
								onChange={v => setLook({ addons: v ? look.addons | 1 : look.addons & ~1 })}
							/>
							<Toggle
								label="Second"
								checked={(look.addons & 2) !== 0}
								disabled={readOnly || typeex}
								onChange={v => setLook({ addons: v ? look.addons | 2 : look.addons & ~2 })}
							/>
						</div>
					</Field>

					<Field label="Mount" lints={lintAt('look.mount')} note="Read in both modes.">
						<NumberField value={look.mount} onChange={v => setLook({ mount: v })} min={0} width={110} disabled={readOnly} />
					</Field>
				</div>
			</div>

			<SubGroup title="Corpse">
				<Field label="Corpse item" lints={lintAt('look.corpse')} hint={look.corpse === 0 ? 'no corpse' : undefined}>
					<span className="ss-ed-drop ss-ed-inline" {...corpseDrop}>
						<ItemSprite serverId={look.corpse === 0 ? null : look.corpse} size={32} />
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
							title="Browse the Items grid filtered to corpses, then right-click one to set it"
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
								title="No corpse"
							>
								<X size={13} />
							</button>
						)}
					</span>
				</Field>

				<DecayChain serverId={look.corpse === 0 ? null : look.corpse} />

				<Field
					label="Corpse action id"
					lints={lintAt('look.corpseactionid')}
					note="Ironcore — stamped on the corpse so quest scripts can hook it. Only applied when non-zero."
				>
					<NumberField
						value={look.corpseactionid}
						onChange={v => setLook({ corpseactionid: v })}
						min={0}
						width={110}
						disabled={readOnly}
					/>
				</Field>
			</SubGroup>

			<SubGroup title="Health">
				<Field
					label="Max health"
					lints={lintAt('health.max')}
					hint={
						<button
							type="button"
							className="ss-btn ss-btn-ghost ss-ed-mini"
							disabled={readOnly}
							onClick={() => setHealthUnlocked(u => !u)}
							title={healthUnlocked ? 'Lock now to max' : 'Allow a damaged-on-spawn monster'}
						>
							{healthUnlocked ? <Unlink size={13} /> : <Link2 size={13} />}
							{healthUnlocked ? 'damaged on spawn' : 'locked'}
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
						label="Health on spawn"
						lints={lintAt('health.now')}
						note={
							doc.health.now > doc.health.max
								? 'Above max — the loader clamps it down and warns. Shown as written.'
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
