import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import type { SummonEntry } from '../monster';
import { Field } from '../fields/Field';
import { NumberField } from '../fields/NumberField';
import { TextField } from '../fields/TextField';
import { EffectSelect } from '../fields/EffectSelect';
import { engineInfo } from '../engine';
import { Toggle } from '../fields/Toggle';
import { SortableList } from '../fields/SortableList';
import { useDropTarget } from '../dnd';
import { Banner, Section, type SectionId, type SectionProps } from './section';

interface Props extends SectionProps {
	collapsed: boolean;
	onToggle: (id: SectionId) => void;
}

function blankSummon(name: string): SummonEntry {
	return { name, interval: 2000, chance: 30, delay: null, max: 1, force: false, effect: null, masterEffect: null };
}

export function Summons({ doc, patch, lintAt, monsterNames, readOnly, collapsed, onToggle }: Props) {
	const { t } = useTranslation();
	const engine = engineInfo(doc.engine);
	const summons = doc.summons;
	const setEntries = (entries: SummonEntry[]) => patch({ summons: { ...summons, entries } });

	const known = new Set(monsterNames.map(n => n.toLowerCase()));

	const drop = useDropTarget(['monster'], p => {
		if (p.kind === 'monster' && !readOnly) setEntries([...summons.entries, blankSummon(p.name)]);
	});

	return (
		<Section
			id="summons"
			collapsed={collapsed}
			onToggle={() => onToggle('summons')}
			summary={t('{{count}} of max {{max}}', { count: summons.entries.length, max: summons.maxSummons })}
		>
			<Banner kind="info">{t('Summons never drop loot and never grant experience.')}</Banner>

			<Field
				label={t('Max live summons')}
				lints={lintAt('summons.maxSummons')}
				note={
					summons.maxSummons === 0 && summons.entries.length > 0
						? t('Zero means the monster can never summon, whatever the entries below say.')
						: t('Total across all entries, clamped to 100.')
				}
			>
				<NumberField
					value={summons.maxSummons}
					onChange={v => patch({ summons: { ...summons, maxSummons: v } })}
					min={0}
					max={100}
					width={100}
					disabled={readOnly}
				/>
			</Field>

			<div className="ss-ed-drop" {...drop}>
				<SortableList
					items={summons.entries}
					onChange={setEntries}
					list="summons"
					keyOf={(_, i) => String(i)}
					disabled={readOnly}
					empty={t('No summons. Drag a monster here from the list.')}
					renderRow={(entry, i) => {
						const update = (p: Partial<SummonEntry>) =>
							setEntries(summons.entries.map((e, j) => (j === i ? { ...e, ...p } : e)));
						const unknown = monsterNames.length > 0 && !known.has(entry.name.toLowerCase());
						return (
							<div className="ss-ed-card">
								<Field
									label={t('Monster')}
									lints={lintAt(`summons.entries[${i}].name`)}
									note={
										unknown
											? t('No monster with this name is registered — the server does not check this, so at runtime it silently summons nothing.')
											: undefined
									}
								>
									<span className={unknown ? 'ss-ed-invalid' : undefined}>
										<TextField value={entry.name} onChange={v => update({ name: v })} disabled={readOnly} />
									</span>
								</Field>
								<div className="ss-ed-card-grid">
									{/* Nostalrius summons take only name, chance, max and
									    force — there is no interval to set. */}
									{engine.summonInterval && (
										<Field label={t('Interval')} hint={t('ms')}>
											<NumberField value={entry.interval} onChange={v => update({ interval: v })} min={1} width={100} disabled={readOnly} />
										</Field>
									)}
									<Field label={t('Chance')} hint="%">
										<NumberField value={entry.chance} onChange={v => update({ chance: v })} min={0} max={100} width={100} disabled={readOnly} />
									</Field>
									<Field label={t('Max')} note={t('Per-entry cap; inherits the section maximum when absent.')}>
										<NumberField value={entry.max} onChange={v => update({ max: v })} min={0} width={100} disabled={readOnly} />
									</Field>
								</div>
								<Toggle
									label={t('Force placement')}
									title={t('Ironcore — places the summon even on an occupied or blocked tile')}
									checked={entry.force}
									disabled={readOnly}
									onChange={v => update({ force: v })}
								/>
								{/* Only Ironcore and TFS iterate a summon's children; on the
								    7.x engines an <attribute> there is never read. */}
								{engine.summonEffects && (
								<>
								<Field label={t('Effect at the summon')} note={t('Defaults to a teleport effect.')}>
									<EffectSelect
										kind="area"
										engine={doc.engine}
										value={entry.effect}
										onChange={v => update({ effect: v })}
										disabled={readOnly}
										noneLabel={t('(default teleport)')}
									/>
								</Field>
								<Field label={t('Effect at the summoner')} note={t('A casting telegraph on the summoner’s own tile.')}>
									<EffectSelect kind="area" engine={doc.engine} value={entry.masterEffect} onChange={v => update({ masterEffect: v })} disabled={readOnly} />
								</Field>
								</>
								)}
							</div>
						);
					}}
				/>
			</div>

			<button
				type="button"
				className="ss-btn"
				disabled={readOnly}
				onClick={() => setEntries([...summons.entries, blankSummon('')])}
			>
				<Plus size={14} />
				{t('Add summon')}
			</button>
		</Section>
	);
}
