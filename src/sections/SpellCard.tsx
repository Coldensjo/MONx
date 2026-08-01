import { useTranslation } from 'react-i18next';
import { useMemo } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import {
	BUILTIN_SPELLS,
	BUILTIN_SPELL_BY_NAME,
	CONDITION_TYPES,
	SPELL_GROUP_ORDER,
	type SpellFamily
} from '../catalog';
import type { AreaShape, Lint, Look, SpellBlock, SpellName } from '../monster';
import { SpellStage } from './SpellStage';
import { meleeBlockMax } from '../derive';
import { Field } from '../fields/Field';
import { EnumSelect, type EnumOption } from '../fields/EnumSelect';
import { EffectSelect } from '../fields/EffectSelect';
import { engineInfo } from '../engine';
import { NumberField } from '../fields/NumberField';
import { TextField } from '../fields/TextField';
import { Toggle, ToggleGroup } from '../fields/Toggle';
import { Banner, SubGroup, useMonsterState } from './section';

const REGISTERED_GROUP = 'Registered (###)';

function familyOf(block: SpellBlock): SpellFamily | 'registered' | 'script' {
	if (block.kind === 'script') return 'script';
	if (block.kind === 'registered') return 'registered';
	return BUILTIN_SPELL_BY_NAME.get(block.name ?? '')?.family ?? 'damage';
}

function emptyArea(shape: AreaShape) {
	return {
		shape,
		length: shape === 'beam' ? 8 : 0,
		spread: shape === 'beam' ? 3 : 0,
		radius: shape === 'radius' ? 4 : 0,
		ring: shape === 'ring' ? 4 : 0
	};
}

interface Props {
	block: SpellBlock;
	/** The monster this card belongs to — cards are keyed by position, so the
	 *  stage must be told to close when another monster is opened. */
	file: string;
	onChange: (b: SpellBlock) => void;
	spells: SpellName[];
	/** Already scoped to this block, so the card asks for `min`, not `attacks[2].min`. */
	lintAt: (suffix: string) => Lint[];
	readOnly: boolean;
	/** `<defenses>` cards default healing/haste; `<attacks>` default damage. */
	parent: 'attacks' | 'defenses';
	/** The monster's own look, so the re-enactment casts with the right sprite. */
	look: Look;
	/** Engine key, from the document. Decides which fields the loader reads at
	 *  all and how effect values are spelled. */
	engine: string;
	/** Opens the re-enactment straight away. The create wizard designs a spell
	 *  from nothing, where seeing the shape is the point; the editor opens on
	 *  spells that already work and keeps it folded away. */
	defaultStaged?: boolean;
}

/**
 * One spell block. The card shows only the fields the chosen spell family
 * actually reads — picking a different name reshapes it — because every other
 * field is silently ignored by the loader (§8.1, §9).
 */
export function SpellCard({ block, file, onChange, spells, lintAt, readOnly, parent, look, engine, defaultStaged }: Props) {
	const { t } = useTranslation();
	const info = engineInfo(engine);
	const [staged, setStaged] = useMonsterState(file, () => !!defaultStaged);
	const family = familyOf(block);
	const registered = family === 'registered';
	const scripted = family === 'script';
	const builtin = !registered && !scripted ? BUILTIN_SPELL_BY_NAME.get(block.name ?? '') : undefined;

	const nameOptions = useMemo<EnumOption<string>[]>(() => {
		const registeredNames = spells.filter(s => s.kind === 'registered');
		return [
			...BUILTIN_SPELLS.map(s => {
				const shadowed = registeredNames.some(r => r.name.toLowerCase() === s.name.toLowerCase());
				return {
					value: s.name,
					label: shadowed ? t('{{spell}} — shadowed', { spell: s.label }) : s.label,
					group: s.group,
					usage: s.usage,
					note: shadowed
						? t('A registered spell named “{{name}}” exists and wins the lookup — this no longer means {{spell}}.', {
								name: s.name,
								spell: s.label
							})
						: s.note
				};
			}),
			...registeredNames.map(s => ({
				value: s.name,
				label: s.words ? `${s.name} — ${s.words}` : s.name,
				group: REGISTERED_GROUP,
				usage: s.usage,
				note: s.shadows ? t('This name also exists as a built-in; the registered spell wins.') : undefined
			}))
		];
	}, [spells]);

	const set = (p: Partial<SpellBlock>) => onChange({ ...block, ...p });

	const pickName = (name: string) => {
		const isRegistered = spells.some(s => s.kind === 'registered' && s.name === name);
		const nextFamily = isRegistered ? 'registered' : BUILTIN_SPELL_BY_NAME.get(name)?.family ?? 'damage';
		set({
			kind: isRegistered ? 'registered' : 'builtin',
			name,
			script: null,
			// Melee is forced to range 1 by the loader; say so in the document.
			range: name === 'melee' ? 1 : block.range,
			melee:
				nextFamily === 'melee'
					? block.melee ?? {
							skill: 0,
							attack: 0,
							condition: null,
							skillfactor: null,
							skillnextlevel: null,
							skilladdcount: null,
							poisoncycles: null
						}
					: null,
			condition:
				nextFamily === 'condition'
					? block.condition ?? { tick: 0, start: 0, cycle: null, mincycle: null, count: null }
					: null,
			status:
				nextFamily === 'status'
					? block.status ?? {
							duration: 10000,
							speedchange: null,
							minspeedchange: null,
							maxspeedchange: null,
							speedvariation: null,
							variation: null,
							drunkenness: null,
							outfitMonster: null,
							outfitItem: null
					  }
					: null,
			// A registered spell ignores geometry and effects entirely (§8.1).
			area: isRegistered ? null : block.area,
			effects: isRegistered
				? { shootEffect: null, areaEffect: null, aoeShootEffect: false }
				: block.effects
		});
	};

	const showDamage = family === 'damage' || family === 'condition' || family === 'melee';
	/** Whether the card has a second grid for what the spell does. Range belongs
	 *  with min and max where there is one — how far it reaches is a fact about
	 *  the hit, not about the cadence — and with the cadence where there is not. */
	const damageGrid = showDamage && family !== 'melee';
	const rangeField = (
		<Field
			label={t('Range')}
			lints={lintAt('range')}
			hint={t('tiles')}
			ignored={block.name === 'melee'}
			note={block.name === 'melee' ? t('Forced to 1 for melee.') : block.range === 0 ? t('Zero means line of sight only. Clamped to 22.') : undefined}
		>
			<NumberField
				value={block.range}
				onChange={v => set({ range: v })}
				min={0}
				max={22}
				width={100}
				disabled={readOnly || block.name === 'melee'}
			/>
		</Field>
	);
	const showGeometry = !registered && !scripted && (family === 'damage' || family === 'condition' || family === 'field' || family === 'noop');
	const showEffects = !registered;
	const healing = block.name === 'healing';

	return (
		<div className="ss-ed-card">
			<div className="ss-ed-card-head">
				{scripted ? (
					<Field label={t('Script')}>
						<TextField
							value={block.script ?? ''}
							onChange={v => set({ script: v })}
							placeholder="monsterspells/example.lua"
							monospace
							disabled={readOnly}
						/>
					</Field>
				) : (
					<Field label={t('Spell')} lints={lintAt('name')}>
						<EnumSelect
							value={block.name ?? ''}
							onChange={pickName}
							options={nameOptions}
							groupOrder={SPELL_GROUP_ORDER}
							frequencySort
							disabled={readOnly}
							width={280}
						/>
					</Field>
				)}
				<button
					type="button"
					className={staged ? 'ss-btn mx-stage-open mx-stage-open-on' : 'ss-btn mx-stage-open'}
					onClick={() => setStaged(s => !s)}
					title={t('Watch this spell play out')}
				>
					{staged ? <EyeOff size={13} /> : <Eye size={13} />}
					{t('Visualize')}
				</button>
			</div>

			{staged && <SpellStage block={block} look={look} parent={parent} />}

			{builtin?.note &&<div className="ss-ed-field-note">{builtin.note}</div>}
			{builtin?.aliasOf && (
				<div className="ss-ed-field-note">
					{t('Identical to {{spell}} — two spellings of one spell.', { spell: builtin.aliasOf })}
				</div>
			)}

			{registered && (
				<Banner kind="info">
					{t('Registered spell — the loader takes it from {{file}} and ignores geometry and effects. Only interval, chance, range, min and max still apply.', {
						file: 'spells.xml'
					})}
				</Banner>
			)}
			{scripted && (
				<Banner kind="info">
					{t('Scripted spell — {{attr}} is ignored and the Lua file decides the behaviour.', {
						attr: 'name'
					})}
				</Banner>
			)}

			<div className="ss-ed-card-grid ss-ed-card-cadence">
				{/* Nostalrius spells carry no cadence attribute at all — chance
				    alone gates a cast — so an interval box there would be a field
				    the server never reads. */}
				{info.spellInterval && (
					<Field label={t('Interval')} lints={lintAt('interval')} hint={t('ms')} note={info.key === 'ironcore' ? t('Ironcore tracks the cooldown per spell, so a long ultimate does not block the other attacks.') : undefined}>
						<NumberField value={block.interval} onChange={v => set({ interval: v })} min={1} width={100} disabled={readOnly} />
					</Field>
				)}
				{/* TVP reads `delay` only when `chance` is absent. Offering it as a
				    second box beside chance would invite writing both, which
				    silently discards this one. */}
				{info.spellDelay && block.delay !== null && (
					<Field label={t('Delay')} lints={lintAt('delay')} note={t('Read in place of chance — writing both means this one is ignored.')}>
						<NumberField value={block.delay} onChange={v => set({ delay: v })} min={0} width={100} disabled={readOnly} />
					</Field>
				)}
				<Field
					label={t('Chance')}
					lints={lintAt('chance')}
					hint="%"
					note={block.name !== 'melee' && block.chance === 0 ? t('A non-melee spell without a chance logs a warning.') : undefined}
				>
					<NumberField value={block.chance} onChange={v => set({ chance: v })} min={0} max={100} width={100} disabled={readOnly} />
				</Field>
				{!damageGrid && rangeField}
			</div>

			{family === 'melee' && block.melee && (
				<SubGroup
					title={t('Melee damage')}
					className="ss-ed-damagegroup"
					note={t('Skill and attack replace min/max: max = ceil(skill × attack × 0.05 + attack × 0.5).')}
				>
					<div className="ss-ed-card-grid">
						<Field label={t('Skill')} lints={lintAt('melee.skill')}>
							<NumberField
								value={block.melee.skill ?? 0}
								onChange={v => set({ melee: { ...block.melee!, skill: v } })}
								min={0}
								width={100}
								disabled={readOnly}
							/>
						</Field>
						<Field label={t('Attack')} lints={lintAt('melee.attack')}>
							<NumberField
								value={block.melee.attack ?? 0}
								onChange={v => set({ melee: { ...block.melee!, attack: v } })}
								min={0}
								width={100}
								disabled={readOnly}
							/>
						</Field>
						<Field
							label={t('Max damage')}
							hint={block.melee.skill === null || block.melee.attack === null ? t('as written') : t('derived')}
						>
							{/* The loader only derives damage when both are written; with
							    either missing it reads the block's own min/max instead — so
							    the hint says which of the two this number came from. */}
							<span className="ss-ed-derived">{meleeBlockMax(block) ?? '—'}</span>
						</Field>
					</div>

					{/* TVP grows a monster's melee skill as it fights. The three
					    attributes sit on this node but are written to the monster, so
					    they apply to it as a whole rather than to this block. */}
					{info.meleeSkillProgression && (
						<div className="ss-ed-card-grid">
							{([
								['skillfactor', 'Skill factor', 'Per-level multiplier, in thousandths. Clamped up to 1000.'],
								['skillnextlevel', 'Next level at', 'Hits needed for the next skill level.'],
								['skilladdcount', 'Level step', 'Skill gained per level.'],
								['poisoncycles', 'Poison cycles', 'Adds a poison condition alongside any other.']
							] as const).map(([key, label, note]) => (
								<Field key={key} label={t(label)} note={t(note)}>
									<NumberField
										value={block.melee![key] ?? 0}
										onChange={v => set({ melee: { ...block.melee!, [key]: v || null } })}
										min={0}
										width={110}
										disabled={readOnly}
									/>
								</Field>
							))}
						</div>
					)}

					<Field
						label={t('Condition on hit')}
						note={t('One condition per melee block — the loader takes the first it finds, in the order fire, poison, energy, drown, freeze, dazzle, curse, bleed.')}
					>
						<EnumSelect
							value={block.melee.condition?.type ?? ''}
							onChange={v =>
								set({
									melee: {
										...block.melee!,
										condition:
											v === ''
												? null
												: {
														type: v,
														value: block.melee!.condition?.value ?? 0,
														tick: CONDITION_TYPES.find(c => c.meleeAttr === v)?.meleeTick ?? 0
												  }
									}
								})
							}
							options={[
								{ value: '', label: '(none)' },
								...CONDITION_TYPES.filter(c => c.meleeAttr).map(c => ({
									value: c.meleeAttr as string,
									label: c.label
								}))
							]}
							disabled={readOnly}
							width={180}
						/>
					</Field>
					{block.melee.condition && (
						<div className="ss-ed-card-grid">
							<Field
								label={t('Damage per tick')}
								note={
									block.melee.condition.type === 'bleed' || block.melee.condition.type === 'physical'
										? t('Bleed ignores the value — the loader never reads it, so this produces a zero-damage bleed.')
										: undefined
								}
							>
								<NumberField
									value={block.melee.condition.value}
									onChange={v => set({ melee: { ...block.melee!, condition: { ...block.melee!.condition!, value: v } } })}
									width={100}
									disabled={readOnly}
								/>
							</Field>
							<Field label={t('Tick')} hint={t('ms')}>
								<NumberField
									value={block.melee.condition.tick}
									onChange={v => set({ melee: { ...block.melee!, condition: { ...block.melee!.condition!, tick: v } } })}
									min={0}
									width={100}
									disabled={readOnly}
								/>
							</Field>
						</div>
					)}
				</SubGroup>
			)}

			{damageGrid && (
				<div className="ss-ed-card-grid ss-ed-card-damage">
					{rangeField}
					<Field
						label={healing ? t('Min healed') : t('Min damage')}
						lints={lintAt('min')}
						note={healing ? t('Healing takes positive values.') : t('Damage is negative.')}
					>
						<NumberField value={block.min} onChange={v => set({ min: v })} width={100} disabled={readOnly} />
					</Field>
					<Field
						label={healing ? t('Max healed') : t('Max damage')}
						lints={lintAt('max')}
						note={
							Math.abs(block.min) > Math.abs(block.max)
								? t('The loader swaps min and max when |min| > |max|. Write them in canonical order.')
								: undefined
						}
					>
						<NumberField value={block.max} onChange={v => set({ max: v })} width={100} disabled={readOnly} />
					</Field>
					{/* Nostalrius states a condition as a required `count` and has no
					    tick or start at all — without it the loader drops the spell. */}
					{family === 'condition' && block.condition && info.conditionStyle === 'count' && (
						<Field
							label={t('Count')}
							lints={lintAt('condition.count')}
							note={t('Required — a condition spell without it is rejected and never loads.')}
						>
							<NumberField
								value={block.condition.count ?? 0}
								onChange={v => set({ condition: { ...block.condition!, count: v } })}
								min={0}
								width={100}
								disabled={readOnly}
							/>
						</Field>
					)}
					{family === 'condition' && block.condition && info.conditionStyle !== 'count' && (
						<>
							<Field label={t('Tick')} hint={t('ms')} note={t('Per-tick damage above; this is the interval between ticks.')}>
								<NumberField
									value={block.condition.tick}
									onChange={v => set({ condition: { ...block.condition!, tick: v } })}
									min={0}
									width={100}
									disabled={readOnly}
								/>
							</Field>
							<Field
								label={t('First tick')}
								lints={lintAt('condition.start')}
								note={
									block.condition.start > Math.abs(block.min)
										? t('Larger than the per-tick damage — the engine silently ignores it.')
										: t('Immediate damage on application.')
								}
							>
								<NumberField
									value={block.condition.start}
									onChange={v => set({ condition: { ...block.condition!, start: v } })}
									min={0}
									width={100}
									disabled={readOnly}
								/>
							</Field>
						</>
					)}
				</div>
			)}

			{family === 'status' && block.status && (
				<SubGroup title={t('Status')} className="ss-ed-damagegroup">
					<Field label={t('Duration')} hint={t('ms')}>
						<NumberField
							value={block.status.duration}
							onChange={v => set({ status: { ...block.status!, duration: v } })}
							min={0}
							width={110}
							disabled={readOnly}
						/>
					</Field>

					{block.name === 'speed' && (
						<>
							<Banner kind="info">
								{/* The trailing caveat is its own sentence rather than a
								    fragment concatenated onto the first. */}
								{t('Positive hastes and turns the spell non-aggressive — a self-buff that belongs in Defenses. Negative paralyses, and is clamped at −1000 (−100% speed).')}
								{parent === 'attacks' &&
									(block.status.speedchange ?? block.status.minspeedchange ?? 0) > 0 && (
										<> {t('This one is positive but sits in Attacks.')}</>
									)}
							</Banner>
							<div className="ss-ed-card-grid">
								<Field label={t('Speed change')} lints={lintAt('status.speedchange')} note={t('Leave blank to use a random min–max range instead.')}>
									<NumberField
										value={block.status.speedchange ?? 0}
										onChange={v => set({ status: { ...block.status!, speedchange: v, minspeedchange: null, maxspeedchange: null } })}
										width={110}
										disabled={readOnly}
									/>
								</Field>
								{/* Only Ironcore and TFS take a random min–max range. The
								    7.x engines spread the delta with a single variation
								    figure instead, under two different attribute names. */}
								{info.speedSpell === 'speedChange' && (
									<>
										<Field label={t('Min')} lints={lintAt('status.minspeedchange')} note={t('A min of 0 with no speedchange is a hard error — the block fails to load.')}>
											<NumberField
												value={block.status.minspeedchange ?? 0}
												onChange={v => set({ status: { ...block.status!, minspeedchange: v, speedchange: null } })}
												width={110}
												disabled={readOnly}
											/>
										</Field>
										<Field label={t('Max')} lints={lintAt('status.maxspeedchange')} note={t('Defaults to min when absent.')}>
											<NumberField
												value={block.status.maxspeedchange ?? 0}
												onChange={v => set({ status: { ...block.status!, maxspeedchange: v, speedchange: null } })}
												width={110}
												disabled={readOnly}
											/>
										</Field>
									</>
								)}
								{info.speedSpell === 'speedVariation' && (
									<Field label={t('Variation')} lints={lintAt('status.speedvariation')} note={t('Spread around the delta above.')}>
										<NumberField
											value={block.status.speedvariation ?? 0}
											onChange={v => set({ status: { ...block.status!, speedvariation: v } })}
											width={110}
											disabled={readOnly}
										/>
									</Field>
								)}
								{info.speedSpell === 'changeVariation' && (
									<Field label={t('Variation')} lints={lintAt('status.variation')} note={t('Spread around the delta above.')}>
										<NumberField
											value={block.status.variation ?? 0}
											onChange={v => set({ status: { ...block.status!, variation: v } })}
											width={110}
											disabled={readOnly}
										/>
									</Field>
								)}
							</div>
						</>
					)}

					{block.name === 'drunk' && (
						<Field label={t('Drunkenness')} note={t('Default 25.')}>
							<NumberField
								value={block.status.drunkenness ?? 25}
								onChange={v => set({ status: { ...block.status!, drunkenness: v } })}
								min={0}
								max={255}
								width={110}
								disabled={readOnly}
							/>
						</Field>
					)}

					{block.name === 'outfit' && (
						<>
							<Banner kind="warn">
								{t('The monster name is resolved at load time — an unknown name silently produces no condition at all.')}
							</Banner>
							<Field label={t('Look like monster')}>
								<TextField
									value={block.status.outfitMonster ?? ''}
									onChange={v => set({ status: { ...block.status!, outfitMonster: v === '' ? null : v, outfitItem: null } })}
									placeholder={t('monster name')}
									disabled={readOnly}
								/>
							</Field>
							<Field label={t('…or item id')}>
								<NumberField
									value={block.status.outfitItem ?? 0}
									onChange={v => set({ status: { ...block.status!, outfitItem: v, outfitMonster: null } })}
									min={0}
									width={110}
									disabled={readOnly}
								/>
							</Field>
						</>
					)}
				</SubGroup>
			)}

			{showGeometry && (
				<SubGroup
					title={t('Area')}
					className="ss-ed-area"
					note={t('One shape only — if several are present the last one silently wins.')}
				>
					<ToggleGroup
						value={block.area?.shape ?? 'none'}
						onChange={v => set({ area: v === 'none' ? null : emptyArea(v as AreaShape) })}
						options={[
							{ value: 'none', label: t('Single target') },
							{ value: 'beam', label: t('Beam'), title: t('Fires along the monster’s facing') },
							{ value: 'radius', label: t('Radius'), title: t('Filled circle') },
							// The 7.x loaders never read `ring`; offering it would
							// produce a spell that quietly hits one tile.
							...(info.geometryRing
								? [{ value: 'ring', label: t('Ring'), title: t('Hollow ring') }]
								: [])
						]}
						disabled={readOnly}
					/>
					{block.area?.shape === 'beam' && (
						<div className="ss-ed-card-grid">
							<Field label={t('Length')} hint={t('tiles')} note={t('A beam forces the spell to fire in the facing direction.')}>
								<NumberField
									value={block.area.length}
									onChange={v => set({ area: { ...block.area!, length: v } })}
									min={1}
									width={100}
									disabled={readOnly}
								/>
							</Field>
							<Field label={t('Spread')} note={t('0 is a straight beam, 3 the classic wave.')}>
								<NumberField
									value={block.area.spread}
									onChange={v => set({ area: { ...block.area!, spread: v } })}
									min={0}
									width={100}
									disabled={readOnly}
								/>
							</Field>
						</div>
					)}
					{block.area?.shape === 'radius' && (
						<Field label={t('Radius')} hint={t('tiles')}>
							<NumberField
								value={block.area.radius}
								onChange={v => set({ area: { ...block.area!, radius: v } })}
								min={1}
								width={100}
								disabled={readOnly}
							/>
						</Field>
					)}
					{block.area?.shape === 'ring' && (
						<Field label={t('Ring')} hint={t('tiles')}>
							<NumberField
								value={block.area.ring}
								onChange={v => set({ area: { ...block.area!, ring: v } })}
								min={1}
								width={100}
								disabled={readOnly}
							/>
						</Field>
					)}
					{block.area && (block.area.shape === 'radius' || block.area.shape === 'ring') && (
						<Toggle
							label={t('Centre on the target')}
							checked={block.target}
							disabled={readOnly}
							onChange={v => set({ target: v })}
						/>
					)}
				</SubGroup>
			)}

			{showEffects && (
				<SubGroup title={t('Effects')} className="ss-ed-effects">
					<div className="ss-ed-card-grid">
						<Field label={t('Projectile')} lints={lintAt('effects.shootEffect')}>
							<EffectSelect
								kind="shoot"
								engine={engine}
								value={block.effects.shootEffect}
								onChange={v => set({ effects: { ...block.effects, shootEffect: v } })}
								disabled={readOnly}
							/>
						</Field>
						<Field label={t('Magic effect')} lints={lintAt('effects.areaEffect')}>
							<EffectSelect
								kind="area"
								engine={engine}
								value={block.effects.areaEffect}
								onChange={v => set({ effects: { ...block.effects, areaEffect: v } })}
								disabled={readOnly}
							/>
						</Field>
					</div>
					{/* Only Ironcore implements this key; the others log "Effect type
					    does not exist" and carry on without it. */}
					{info.aoeShootEffect && (
						<Toggle
							label={t('Draw the projectile to every tile of the area')}
							checked={block.effects.aoeShootEffect}
							disabled={readOnly}
							onChange={v => set({ effects: { ...block.effects, aoeShootEffect: v } })}
						/>
					)}
				</SubGroup>
			)}

			{scripted && (
				<Toggle
					label={t('Cast in the facing direction')}
					checked={block.direction}
					disabled={readOnly}
					onChange={v => set({ direction: v })}
				/>
			)}
		</div>
	);
}
