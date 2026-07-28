import { useMemo, useState } from 'react';
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
import { maxMeleeDamage } from '../derive';
import { Field } from '../fields/Field';
import { EnumSelect, type EnumOption } from '../fields/EnumSelect';
import { EffectSelect } from '../fields/EffectSelect';
import { NumberField } from '../fields/NumberField';
import { TextField } from '../fields/TextField';
import { Toggle, ToggleGroup } from '../fields/Toggle';
import { Banner, SubGroup } from './section';

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
	onChange: (b: SpellBlock) => void;
	spells: SpellName[];
	/** Already scoped to this block, so the card asks for `min`, not `attacks[2].min`. */
	lintAt: (suffix: string) => Lint[];
	readOnly: boolean;
	/** `<defenses>` cards default healing/haste; `<attacks>` default damage. */
	parent: 'attacks' | 'defenses';
	/** The monster's own look, so the re-enactment casts with the right sprite. */
	look: Look;
}

/**
 * One spell block. The card shows only the fields the chosen spell family
 * actually reads — picking a different name reshapes it — because every other
 * field is silently ignored by the loader (§8.1, §9).
 */
export function SpellCard({ block, onChange, spells, lintAt, readOnly, parent, look }: Props) {
	const [staged, setStaged] = useState(false);
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
					label: shadowed ? `${s.label} — shadowed` : s.label,
					group: s.group,
					usage: s.usage,
					note: shadowed
						? `A registered spell named "${s.name}" exists and wins the lookup — this no longer means ${s.label}.`
						: s.note
				};
			}),
			...registeredNames.map(s => ({
				value: s.name,
				label: s.words ? `${s.name} — ${s.words}` : s.name,
				group: REGISTERED_GROUP,
				usage: s.usage,
				note: s.shadows ? 'This name also exists as a built-in; the registered spell wins.' : undefined
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
			melee: nextFamily === 'melee' ? block.melee ?? { skill: 0, attack: 0, condition: null } : null,
			condition: nextFamily === 'condition' ? block.condition ?? { tick: 0, start: 0 } : null,
			status:
				nextFamily === 'status'
					? block.status ?? {
							duration: 10000,
							speedchange: null,
							minspeedchange: null,
							maxspeedchange: null,
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
	const showGeometry = !registered && !scripted && (family === 'damage' || family === 'condition' || family === 'field' || family === 'noop');
	const showEffects = !registered;
	const healing = block.name === 'healing';

	return (
		<div className="ss-ed-card">
			<div className="ss-ed-card-head">
				{scripted ? (
					<Field label="Script">
						<TextField
							value={block.script ?? ''}
							onChange={v => set({ script: v })}
							placeholder="monsterspells/example.lua"
							monospace
							disabled={readOnly}
						/>
					</Field>
				) : (
					<Field label="Spell" lints={lintAt('name')}>
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
					title="Watch this spell play out"
				>
					{staged ? <EyeOff size={13} /> : <Eye size={13} />}
					Visualize
				</button>
			</div>

			{staged && <SpellStage block={block} look={look} parent={parent} />}

			{builtin?.note &&<div className="ss-ed-field-note">{builtin.note}</div>}
			{builtin?.aliasOf && (
				<div className="ss-ed-field-note">
					Identical to <code>{builtin.aliasOf}</code> — two spellings of one spell.
				</div>
			)}

			{registered && (
				<Banner kind="info">
					Registered spell — the loader takes it from <code>spells.xml</code> and ignores geometry and effects. Only
					interval, chance, range, min and max still apply.
				</Banner>
			)}
			{scripted && (
				<Banner kind="info">
					Scripted spell — <code>name</code> is ignored and the Lua file decides the behaviour.
				</Banner>
			)}

			<div className="ss-ed-card-grid">
				<Field label="Interval" lints={lintAt('interval')} hint="ms" note="Ironcore tracks the cooldown per spell, so a long ultimate does not block the other attacks.">
					<NumberField value={block.interval} onChange={v => set({ interval: v })} min={1} width={100} disabled={readOnly} />
				</Field>
				<Field
					label="Chance"
					lints={lintAt('chance')}
					hint="%"
					note={block.name !== 'melee' && block.chance === 0 ? 'A non-melee spell without a chance logs a warning.' : undefined}
				>
					<NumberField value={block.chance} onChange={v => set({ chance: v })} min={0} max={100} width={100} disabled={readOnly} />
				</Field>
				<Field
					label="Range"
					lints={lintAt('range')}
					hint="tiles"
					ignored={block.name === 'melee'}
					note={block.name === 'melee' ? 'Forced to 1 for melee.' : block.range === 0 ? 'Zero means line of sight only. Clamped to 22.' : undefined}
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
			</div>

			{family === 'melee' && block.melee && (
				<SubGroup
					title="Melee damage"
					note="Skill and attack replace min/max: max = ceil(skill × attack × 0.05 + attack × 0.5)."
				>
					<div className="ss-ed-card-grid">
						<Field label="Skill" lints={lintAt('melee.skill')}>
							<NumberField
								value={block.melee.skill}
								onChange={v => set({ melee: { ...block.melee!, skill: v } })}
								min={0}
								width={100}
								disabled={readOnly}
							/>
						</Field>
						<Field label="Attack" lints={lintAt('melee.attack')}>
							<NumberField
								value={block.melee.attack}
								onChange={v => set({ melee: { ...block.melee!, attack: v } })}
								min={0}
								width={100}
								disabled={readOnly}
							/>
						</Field>
						<Field label="Max damage" hint="derived">
							<span className="ss-ed-derived">{maxMeleeDamage(block.melee.skill, block.melee.attack)}</span>
						</Field>
					</div>

					<Field
						label="Condition on hit"
						note="One condition per melee block — the loader takes the first it finds, in the order fire, poison, energy, drown, freeze, dazzle, curse, bleed."
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
								label="Damage per tick"
								note={
									block.melee.condition.type === 'bleed' || block.melee.condition.type === 'physical'
										? 'Bleed ignores the value — the loader never reads it, so this produces a zero-damage bleed.'
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
							<Field label="Tick" hint="ms">
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

			{showDamage && family !== 'melee' && (
				<div className="ss-ed-card-grid">
					<Field
						label={healing ? 'Min healed' : 'Min damage'}
						lints={lintAt('min')}
						note={healing ? 'Healing takes positive values.' : 'Damage is negative.'}
					>
						<NumberField value={block.min} onChange={v => set({ min: v })} width={100} disabled={readOnly} />
					</Field>
					<Field
						label={healing ? 'Max healed' : 'Max damage'}
						lints={lintAt('max')}
						note={
							Math.abs(block.min) > Math.abs(block.max)
								? 'The loader swaps min and max when |min| > |max|. Write them in canonical order.'
								: undefined
						}
					>
						<NumberField value={block.max} onChange={v => set({ max: v })} width={100} disabled={readOnly} />
					</Field>
					{family === 'condition' && block.condition && (
						<>
							<Field label="Tick" hint="ms" note="Per-tick damage above; this is the interval between ticks.">
								<NumberField
									value={block.condition.tick}
									onChange={v => set({ condition: { ...block.condition!, tick: v } })}
									min={0}
									width={100}
									disabled={readOnly}
								/>
							</Field>
							<Field
								label="First tick"
								lints={lintAt('condition.start')}
								note={
									block.condition.start > Math.abs(block.min)
										? 'Larger than the per-tick damage — the engine silently ignores it.'
										: 'Immediate damage on application.'
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
				<SubGroup title="Status">
					<Field label="Duration" hint="ms">
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
								Positive hastes and turns the spell non-aggressive — a self-buff that belongs in Defenses. Negative
								paralyses, and is clamped at −1000 (−100% speed).
								{parent === 'attacks' && (block.status.speedchange ?? block.status.minspeedchange ?? 0) > 0
									? ' This one is positive but sits in Attacks.'
									: ''}
							</Banner>
							<div className="ss-ed-card-grid">
								<Field label="Speed change" lints={lintAt('status.speedchange')} note="Leave blank to use a random min–max range instead.">
									<NumberField
										value={block.status.speedchange ?? 0}
										onChange={v => set({ status: { ...block.status!, speedchange: v, minspeedchange: null, maxspeedchange: null } })}
										width={110}
										disabled={readOnly}
									/>
								</Field>
								<Field label="Min" lints={lintAt('status.minspeedchange')} note="A min of 0 with no speedchange is a hard error — the block fails to load.">
									<NumberField
										value={block.status.minspeedchange ?? 0}
										onChange={v => set({ status: { ...block.status!, minspeedchange: v, speedchange: null } })}
										width={110}
										disabled={readOnly}
									/>
								</Field>
								<Field label="Max" lints={lintAt('status.maxspeedchange')} note="Defaults to min when absent.">
									<NumberField
										value={block.status.maxspeedchange ?? 0}
										onChange={v => set({ status: { ...block.status!, maxspeedchange: v, speedchange: null } })}
										width={110}
										disabled={readOnly}
									/>
								</Field>
							</div>
						</>
					)}

					{block.name === 'drunk' && (
						<Field label="Drunkenness" note="Default 25.">
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
								The monster name is resolved at load time — an unknown name silently produces no condition at all.
							</Banner>
							<Field label="Look like monster">
								<TextField
									value={block.status.outfitMonster ?? ''}
									onChange={v => set({ status: { ...block.status!, outfitMonster: v === '' ? null : v, outfitItem: null } })}
									placeholder="monster name"
									disabled={readOnly}
								/>
							</Field>
							<Field label="…or item id">
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
					title="Area"
					note="One shape only — if several are present the last one silently wins."
				>
					<ToggleGroup
						value={block.area?.shape ?? 'none'}
						onChange={v => set({ area: v === 'none' ? null : emptyArea(v as AreaShape) })}
						options={[
							{ value: 'none', label: 'Single target' },
							{ value: 'beam', label: 'Beam', title: 'Fires along the monster’s facing' },
							{ value: 'radius', label: 'Radius', title: 'Filled circle' },
							{ value: 'ring', label: 'Ring', title: 'Hollow ring' }
						]}
						disabled={readOnly}
					/>
					{block.area?.shape === 'beam' && (
						<div className="ss-ed-card-grid">
							<Field label="Length" hint="tiles" note="A beam forces the spell to fire in the facing direction.">
								<NumberField
									value={block.area.length}
									onChange={v => set({ area: { ...block.area!, length: v } })}
									min={1}
									width={100}
									disabled={readOnly}
								/>
							</Field>
							<Field label="Spread" note="0 is a straight beam, 3 the classic wave.">
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
						<Field label="Radius" hint="tiles">
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
						<Field label="Ring" hint="tiles">
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
							label="Centre on the target"
							checked={block.target}
							disabled={readOnly}
							onChange={v => set({ target: v })}
						/>
					)}
				</SubGroup>
			)}

			{showEffects && (
				<SubGroup title="Effects">
					<Field label="Projectile" lints={lintAt('effects.shootEffect')}>
						<EffectSelect
							kind="shoot"
							value={block.effects.shootEffect}
							onChange={v => set({ effects: { ...block.effects, shootEffect: v } })}
							disabled={readOnly}
						/>
					</Field>
					<Field label="Impact" lints={lintAt('effects.areaEffect')}>
						<EffectSelect
							kind="area"
							value={block.effects.areaEffect}
							onChange={v => set({ effects: { ...block.effects, areaEffect: v } })}
							disabled={readOnly}
						/>
					</Field>
					<Toggle
						label="Draw the projectile to every tile of the area"
						checked={block.effects.aoeShootEffect}
						disabled={readOnly}
						onChange={v => set({ effects: { ...block.effects, aoeShootEffect: v } })}
					/>
				</SubGroup>
			)}

			{scripted && (
				<Toggle
					label="Cast in the facing direction"
					checked={block.direction}
					disabled={readOnly}
					onChange={v => set({ direction: v })}
				/>
			)}
		</div>
	);
}
