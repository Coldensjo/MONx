import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { COMMON_IMMUNITY_PRESET, CONDITION_IMMUNITIES, damageTypes, type DamageType } from '../catalog';
import { elementPercent, isImmune, type DamageType as CombatType } from '../derive';
import { FieldLint } from '../fields/Field';
import { PercentSlider } from '../fields/PercentSlider';
import { Toggle, ToggleGroup } from '../fields/Toggle';
import { Section, SubGroup, type SectionId, type SectionProps } from './section';

interface Props extends SectionProps {
	collapsed: boolean;
	onToggle: (id: SectionId) => void;
}

type Mode = 'normal' | 'immune' | 'percent';

// The catalog row carries the UI metadata (colour, both attribute spellings);
// derive.ts owns reading the document. The keys are the same ten §16 names.
const combatType = (d: DamageType) => d.key as CombatType;

/** The attribute a write goes to: whichever spelling the file already uses,
    else the canonical first one. Keeps `poisonPercent` files as they were. */
function elementKey(elements: Record<string, number>, d: DamageType): string {
	return d.elementKeys.find(k => k in elements) ?? d.elementKeys[0];
}

export function Resistances({ doc, patch, lintAt, readOnly, collapsed, onToggle }: Props) {
	const { t } = useTranslation();
	// Mode is otherwise derived from the value, so a slider dragged through 0
	// would flip the row to Normal and unmount the slider mid-gesture. Types
	// the user has put (or edited) in percent mode stay there until they pick
	// another mode, even at 0.
	const [pinnedPercent, setPinnedPercent] = useState<Set<string>>(new Set());
	const pinPercent = (d: DamageType, on: boolean) =>
		setPinnedPercent(prev => {
			if (prev.has(d.key) === on) return prev;
			const next = new Set(prev);
			if (on) next.add(d.key);
			else next.delete(d.key);
			return next;
		});

	const setMode = (d: DamageType, mode: Mode) => {
		const immunities = { ...doc.immunities };
		const elements = { ...doc.elements };
		pinPercent(d, mode === 'percent');
		if (mode === 'immune') {
			// Immunity and an element percent on the same type make the engine
			// warn, and the immunity wins anyway — so they are exclusive here.
			immunities[d.immunityKeys[0]] = true;
			for (const k of d.elementKeys) if (k in elements) elements[k] = 0;
		} else {
			for (const k of d.immunityKeys) if (immunities[k]) immunities[k] = false;
			if (mode === 'percent' && elementPercent(doc, combatType(d)) === 0) elements[elementKey(elements, d)] = 50;
			if (mode === 'normal') for (const k of d.elementKeys) if (k in elements) elements[k] = 0;
		}
		patch({ immunities, elements });
	};

	const setPercent = (d: DamageType, v: number) => {
		pinPercent(d, true);
		patch({ elements: { ...doc.elements, [elementKey(doc.elements, d)]: v } });
	};

	const applyPreset = () => {
		const immunities = { ...doc.immunities };
		for (const k of COMMON_IMMUNITY_PRESET) immunities[k] = true;
		patch({ immunities });
	};

	const presetApplied = COMMON_IMMUNITY_PRESET.every(k => doc.immunities[k] === true);
	// Agony is CrystalServer's alone; the rest are common to all six engines.
	const types = damageTypes(doc.engine);
	const immuneCount = types.filter(d => isImmune(doc, combatType(d))).length;

	return (
		<Section
			id="resistances"
			collapsed={collapsed}
			onToggle={() => onToggle('resistances')}
			summary={t('{{count}} immune', { count: immuneCount })}
		>
			<div className="ss-ed-resists">
				{types.map(d => {
					const immune = isImmune(doc, combatType(d));
					const percent = elementPercent(doc, combatType(d));
					const mode: Mode = immune ? 'immune' : percent !== 0 || pinnedPercent.has(d.key) ? 'percent' : 'normal';
					return (
						<div key={d.key} className="ss-ed-resist-row">
							<span className="ss-ed-resist-icon" style={{ background: d.color }} title={d.label} />
							<span className="ss-ed-resist-label">
								{d.label}
								<FieldLint lints={d.elementKeys.flatMap(k => lintAt(`elements.${k}`))} />
							</span>
							<ToggleGroup
								value={mode}
								onChange={m => setMode(d, m as Mode)}
								options={[
									{ value: 'normal', label: t('Normal') },
									{ value: 'immune', label: t('Immune'), title: t('Bundles the matching condition immunity too') },
									{ value: 'percent', label: t('Percent') }
								]}
								disabled={readOnly}
							/>
							{mode === 'percent' && (
								<PercentSlider value={percent} onChange={v => setPercent(d, v)} disabled={readOnly} />
							)}
							{mode === 'immune' && <span className="ss-ed-resist-note">{t('takes 0 — and the matching condition too')}</span>}
						</div>
					);
				})}
			</div>

			<SubGroup
				title={t('Condition immunities')}
				note={t('These have no element equivalent — the only way to grant them is here.')}
			>
				{!presetApplied && (
					<button type="button" className="ss-btn" disabled={readOnly} onClick={applyPreset}>
						{t('Apply the usual set')}
					</button>
				)}
				<div className="ss-ed-flags">
					{CONDITION_IMMUNITIES.map(c => (
						<Toggle
							key={c.key}
							label={c.key === 'invisible' ? t('Can see invisible creatures') : c.label}
							title={c.note}
							checked={doc.immunities[c.key] === true}
							disabled={readOnly}
							onChange={v => patch({ immunities: { ...doc.immunities, [c.key]: v } })}
						/>
					))}
				</div>
			</SubGroup>

			<div className="ss-ed-field-note">
				{t('Positive resists, negative takes extra. Element percent is applied after armour, and magic penetration eats into positive values for energy, fire, earth, ice, holy and death only.')}
			</div>
		</Section>
	);
}
