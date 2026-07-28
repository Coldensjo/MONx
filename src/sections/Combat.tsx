import { useState } from 'react';
import { BOOLEAN_FLAGS, FLAG_GROUP_LABEL, NUMERIC_FLAGS } from '../catalog';
import { Field } from '../fields/Field';
import { NumberField } from '../fields/NumberField';
import { Toggle } from '../fields/Toggle';
import { Banner, Section, SubGroup, type SectionId, type SectionProps } from './section';

interface Props extends SectionProps {
	collapsed: boolean;
	onToggle: (id: SectionId) => void;
}

const GROUPS = ['behaviour', 'push', 'terrain'] as const;

export function Combat({ doc, patch, lintAt, readOnly, collapsed, onToggle }: Props) {
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
			{GROUPS.map(group => (
				<SubGroup key={group} title={FLAG_GROUP_LABEL[group]}>
					<div className="ss-ed-flags">
						{BOOLEAN_FLAGS.filter(f => f.group === group).map(f => {
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
					{NUMERIC_FLAGS.filter(f => f.group === group).map(f => (
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
				</SubGroup>
			))}

			{boolFlag('canpushcreatures', false) && boolFlag('pushable', true) && (
				<Banner kind="warn">
					“Pushes creatures” forces “pushable by players” off at load — the value written here will not survive.
				</Banner>
			)}

			<SubGroup title="Target change">
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
			</SubGroup>

			<SubGroup
				title="Defense stats"
				note="Armor reduces melee and physical hits; defense is only consulted on hits that check it, i.e. melee."
			>
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
			</SubGroup>

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
					</SubGroup>
				)}
			</div>
		</Section>
	);
}
