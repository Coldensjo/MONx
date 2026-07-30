import { useState } from 'react';
import { BOOLEAN_FLAGS, FLAG_GROUP_LABEL, NUMERIC_FLAGS } from '../catalog';
import { engineInfo } from '../engine';
import { maxMeleeDamage } from '../derive';
import type { AttacksStats } from '../monster';
import { Field } from '../fields/Field';
import { NumberField } from '../fields/NumberField';
import { Toggle } from '../fields/Toggle';
import { Banner, Section, SubGroup, type SectionId, type SectionProps } from './section';

interface Props extends SectionProps {
	collapsed: boolean;
	onToggle: (id: SectionId) => void;
}

const GROUPS = ['behaviour', 'push', 'terrain'] as const;

const blankAttacks = (s: AttacksStats | null): AttacksStats => s ?? { attack: 0, skill: 0, poison: null };

export function Combat({ doc, patch, lintAt, readOnly, collapsed, onToggle }: Props) {
	const engine = engineInfo(doc.engine);
	const [showPacifist, setShowPacifist] = useState(
		doc.flags.pacifist === true || doc.flags.deaggroonkill === true || doc.flags.singletarget === true
	);

	const setFlag = (key: string, value: boolean | number) => patch({ flags: { ...doc.flags, [key]: value } });

	const boolFlag = (key: string, fallback: boolean) => {
		const v = doc.flags[key];
		return typeof v === 'boolean' ? v : fallback;
	};
	const numFlag = (key: string, fallback: number) => {
		const v = doc.flags[key];
		return typeof v === 'number' ? v : fallback;
	};

	const pacifist = boolFlag('pacifist', false);

	return (
		<Section
			id="combat"
			collapsed={collapsed}
			onToggle={() => onToggle('combat')}
			summary={`armor ${doc.defenseStats.armor} · defense ${doc.defenseStats.defense}`}
		>
			{/* A group whose flags this engine all lacks renders nothing — an empty
			    "Terrain" heading reads as a missing feature rather than an absent one. */}
			{GROUPS.filter(
				group =>
					BOOLEAN_FLAGS.some(f => f.group === group && engine.boolFlags.includes(f.key)) ||
					NUMERIC_FLAGS.some(f => f.group === group && engine.numFlags.includes(f.key))
			).map(group => (
				<SubGroup key={group} title={FLAG_GROUP_LABEL[group]}>
					<div className="ss-ed-flags">
						{BOOLEAN_FLAGS.filter(f => f.group === group && engine.boolFlags.includes(f.key)).map(f => {
							const value = boolFlag(f.key, f.default);
							return (
								<Toggle
									key={f.key}
									label={f.ironcore ? `${f.label} ✦` : f.label}
									title={f.note ? `${f.note}${f.ironcore ? ' (Ironcore)' : ''}` : f.ironcore ? 'Ironcore' : undefined}
									checked={value}
									changed={value !== f.default}
									disabled={readOnly}
									onChange={v => setFlag(f.key, v)}
								/>
							);
						})}
					</div>
					<div className="ss-ed-card-grid">
						{NUMERIC_FLAGS.filter(f => f.group === group && engine.numFlags.includes(f.key)).map(f => (
							<Field key={f.key} label={f.label} lints={lintAt(`flags.${f.key}`)} note={f.note}>
								<NumberField
									value={numFlag(f.key, f.default)}
									onChange={v => setFlag(f.key, v)}
									min={f.min}
									max={f.max}
									width={110}
									corpusDefault={f.corpusDefault}
									disabled={readOnly}
								/>
							</Field>
						))}
					</div>
				</SubGroup>
			))}

			{boolFlag('canpushcreatures', false) && boolFlag('pushable', true) && (
				<Banner kind="warn">
					“Pushes creatures” forces “pushable by players” off at load — the value written here will not survive.
				</Banner>
			)}

			<SubGroup title="Target change">
				<div className="ss-ed-card-grid">
					<Field
						label="Interval"
						lints={lintAt('targetchange.interval')}
						hint="ms"
						note="Milliseconds between target-reselection rolls."
					>
						<NumberField
							value={doc.targetchange.interval}
							onChange={v => patch({ targetchange: { ...doc.targetchange, interval: v } })}
							min={0}
							width={110}
							disabled={readOnly}
						/>
					</Field>
					<Field
						label="Chance"
						lints={lintAt('targetchange.chance')}
						hint="%"
						note={
							doc.targetchange.chance === 0
								? 'Zero disables retargeting entirely, and also the step-aside behaviour in onWalk.'
								: undefined
						}
					>
						<NumberField
							value={doc.targetchange.chance}
							onChange={v => patch({ targetchange: { ...doc.targetchange, chance: v } })}
							min={0}
							max={100}
							width={110}
							disabled={readOnly}
						/>
					</Field>
				</div>
			</SubGroup>

			{/* Nostalrius has no melee spell: the monster's melee is `skill` and
			    `attack` on the `<attacks>` container itself, which makes it a
			    monster stat rather than one of its spells. */}
			{engine.meleeOnAttacks && (
				<SubGroup
					title="Melee"
					note="On this engine melee lives on <attacks>, not in a spell block. Both skill and attack are needed."
				>
					<div className="ss-ed-card-grid">
						<Field label="Skill" lints={lintAt('attacksStats')}>
							<NumberField
								value={doc.attacksStats?.skill ?? 0}
								onChange={v => patch({ attacksStats: { ...blankAttacks(doc.attacksStats), skill: v } })}
								min={0}
								width={110}
								disabled={readOnly}
							/>
						</Field>
						<Field label="Attack" lints={lintAt('attacksStats')}>
							<NumberField
								value={doc.attacksStats?.attack ?? 0}
								onChange={v => patch({ attacksStats: { ...blankAttacks(doc.attacksStats), attack: v } })}
								min={0}
								width={110}
								disabled={readOnly}
							/>
						</Field>
						<Field label="Max damage" hint="derived">
							<span className="ss-ed-derived">
								{doc.attacksStats
									? maxMeleeDamage(doc.attacksStats.skill, doc.attacksStats.attack)
									: '—'}
							</span>
						</Field>
						<Field label="Poison" hint="optional, on hit">
							<NumberField
								value={doc.attacksStats?.poison ?? 0}
								onChange={v =>
									patch({ attacksStats: { ...blankAttacks(doc.attacksStats), poison: v || null } })
								}
								min={0}
								width={110}
								disabled={readOnly}
							/>
						</Field>
					</div>
				</SubGroup>
			)}

			<SubGroup
				title="Defense stats"
				note="Armor reduces melee and physical hits; defense is only consulted on hits that check it, i.e. melee."
			>
				<div className="ss-ed-card-grid">
					<Field label="Armor" lints={lintAt('defenseStats.armor')}>
						<NumberField
							value={doc.defenseStats.armor}
							onChange={v => patch({ defenseStats: { ...doc.defenseStats, armor: v } })}
							min={0}
							width={110}
							disabled={readOnly}
						/>
					</Field>
					<Field label="Defense" lints={lintAt('defenseStats.defense')}>
						<NumberField
							value={doc.defenseStats.defense}
							onChange={v => patch({ defenseStats: { ...doc.defenseStats, defense: v } })}
							min={0}
							width={110}
							disabled={readOnly}
						/>
					</Field>
				</div>
			</SubGroup>

			{/* The pacifist system is Ironcore-only; every other loader reports its
			    flags as unknown and ignores them. */}
			{engine.pacifist && (
			<div className="ss-ed-advanced">
				<button type="button" className="ss-btn ss-btn-ghost" onClick={() => setShowPacifist(s => !s)}>
					{showPacifist ? 'Hide' : 'Show'} pacifist system (Ironcore)
				</button>
				{showPacifist && (
					<SubGroup
						title={FLAG_GROUP_LABEL.pacifist}
						note="A dormant monster that only fights back once struck. The sub-flags do nothing without Pacifist."
					>
						{pacifist && boolFlag('hostile', true) && (
							<Banner kind="warn">
								Pacifist forces <code>hostile</code> to 0 during load — writing both as 1 will not survive.
							</Banner>
						)}
						<div className="ss-ed-flags">
							{BOOLEAN_FLAGS.filter(f => f.group === 'pacifist').map(f => {
								const value = boolFlag(f.key, f.default);
								return (
									<Toggle
										key={f.key}
										label={f.label}
										title={f.note}
										checked={value}
										changed={value !== f.default}
										disabled={readOnly || (f.key !== 'pacifist' && !pacifist)}
										onChange={v => setFlag(f.key, v)}
									/>
								);
							})}
						</div>
						<div className="ss-ed-card-grid">
							{NUMERIC_FLAGS.filter(f => f.group === 'pacifist').map(f => (
								<Field key={f.key} label={f.label} lints={lintAt(`flags.${f.key}`)} note={f.note} ignored={!pacifist}>
									<NumberField
										value={numFlag(f.key, f.default)}
										onChange={v => setFlag(f.key, v)}
										min={f.min}
										max={f.max}
										width={110}
										disabled={readOnly || !pacifist}
									/>
								</Field>
							))}
						</div>
					</SubGroup>
				)}
			</div>
			)}
		</Section>
	);
}
