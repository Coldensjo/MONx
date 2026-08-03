import { useTranslation } from 'react-i18next';
import { Link2, Unlink } from 'lucide-react';
import { RACES, SKULLS } from '../catalog';
import { engineInfo } from '../engine';
import { Field } from '../fields/Field';
import { EnumSelect, type EnumOption } from '../fields/EnumSelect';
import { NumberField } from '../fields/NumberField';
import { TextField } from '../fields/TextField';
import { Section, useMonsterState, type SectionId, type SectionProps } from './section';
import { useWorkspace } from '../workspacectx';

interface Props extends SectionProps {
	collapsed: boolean;
	onToggle: (id: SectionId) => void;
}

const RACE_OPTIONS: EnumOption<string>[] = RACES.map(r => ({
	value: r.value,
	label: r.label,
	preview: <span className="ss-ed-blood" style={{ background: r.blood }} />
}));

const SKULL_OPTIONS: EnumOption<string>[] = SKULLS.map(s => ({
	value: s.value,
	label: s.label,
	preview: <span className="ss-ed-blood" style={{ background: s.color, borderColor: 'var(--border-strong)' }} />
}));

export function Identity({ doc, patch, lintAt, readOnly, collapsed, onToggle }: Props) {
	const { scripts, nextRaceid, raceidOwner } = useWorkspace();
	const { t } = useTranslation();
	const engine = engineInfo(doc.engine);
	const raceidLints = lintAt('raceid');
	// The corpus answers this, not the lint: `raceid.duplicate` is a cross-file
	// finding and is only recomputed at the next workspace lint, so on its own it
	// would let a taken id be typed and look fine until a reload. The lint stays
	// in the fallback because a section mounted without a provider has no corpus
	// to ask.
	const takenBy = doc.raceid !== null ? raceidOwner(doc.raceid, doc.file) : null;
	const duplicate = takenBy !== null || raceidLints.some(l => l.code === 'raceid.duplicate');

	// Health stays locked unless the author deliberately wants a monster that
	// spawns damaged; the loader clamps now > max and warns (§4).
	const [healthUnlocked, setHealthUnlocked] = useMonsterState(doc.file, () => doc.health.now !== doc.health.max);

	const scriptOptions: EnumOption<string>[] = [
		{ value: '', label: t('(none)') },
		...scripts.map(s => ({ value: s, label: s }))
	];

	return (
		<Section id="identity" collapsed={collapsed} onToggle={() => onToggle('identity')} summary={doc.file}>
			<div className="ss-ed-card-grid">
				<Field label={t('Name')} lints={lintAt('name')}>
					<TextField value={doc.name} onChange={v => patch({ name: v })} disabled={readOnly} />
				</Field>

				<Field
					label={t('Description')}
					lints={lintAt('nameDescription')}
					hint={doc.nameDescription ? undefined : t('defaults to “a {{name}}”', { name: doc.name.toLowerCase() })}
					note={t('Shown when a player looks at the monster. Include the article yourself.')}
				>
					<TextField
						value={doc.nameDescription ?? ''}
						onChange={v => patch({ nameDescription: v === '' ? null : v })}
						placeholder={`a ${doc.name.toLowerCase()}`}
						disabled={readOnly}
					/>
				</Field>

				{/* Ironcore-only editor metadata. Elsewhere it is an attribute no
				    loader reads, kept verbatim but not worth a field. */}
				{engine.species && (
				<Field
					label={t('Species')}
					lints={lintAt('species')}
					note={t('Editor metadata only — the server never reads it. Used here for grouping.')}
				>
					<TextField
						value={doc.species ?? ''}
						onChange={v => patch({ species: v === '' ? null : v })}
						placeholder={t('(none)')}
						disabled={readOnly}
					/>
				</Field>
				)}
			</div>

			<div className="ss-ed-card-grid">
				{/* Health leads the stat line rather than sitting under Look. It is
				    what a monster is worth reading first, and it is the number
				    Experience and the balance bands are judged against — the two
				    were a section apart for no reason other than that <health> and
				    <look> are adjacent in the file. */}
				{/* One field, two numbers. Unlocking used to add a second field to the
				    grid, which took a column and pushed Experience, Speed and mana
				    cost along one place each — a toggle that rearranges the row it
				    sits in reads as a mistake. The spawn value belongs to health
				    anyway: it is the same <health> node, and it is only ever set
				    against the max beside it. Growing downwards costs the row some
				    height, which `align-items: start` already absorbs, and moves
				    nothing sideways.

				    Both paths' lints ride on the field, health.now's included while
				    locked: locking does not itself write now = max, so a document
				    that arrived with the two apart must not fall silent when the
				    button is pressed. */}
				<Field
					label={t('Max health')}
					lints={[...lintAt('health.max'), ...lintAt('health.now')]}
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
					note={
						healthUnlocked && doc.health.now > doc.health.max
							? t('Above max — the loader clamps it down and warns. Shown as written.')
							: undefined
					}
				>
					<NumberField
						value={doc.health.max}
						onChange={v => patch({ health: { max: v, now: healthUnlocked ? doc.health.now : v } })}
						min={1}
						width={120}
						disabled={readOnly}
					/>
					{healthUnlocked && (
						<span className="ss-ed-inline ss-ed-subfield">
							<span className="ss-ed-field-hint">{t('on spawn')}</span>
							<NumberField
								value={doc.health.now}
								onChange={v => patch({ health: { ...doc.health, now: v } })}
								min={1}
								width={120}
								disabled={readOnly}
							/>
						</span>
					)}
				</Field>

				<Field
					label={t('Experience')}
					lints={lintAt('experience')}
					hint={t('raw XP, before rateExp · {{souls}}', { souls: t('{{count}} soul', { count: Math.ceil(doc.experience / 200) }) })}
				>
					<NumberField value={doc.experience} onChange={v => patch({ experience: v })} min={0} width={120} disabled={readOnly} />
				</Field>

				<Field label={t('Speed')} lints={lintAt('speed')} hint={doc.speed === 0 ? t('immobile') : undefined}>
					<NumberField value={doc.speed} onChange={v => patch({ speed: v })} min={0} width={120} disabled={readOnly} />
				</Field>

				<Field
					label={t('Mana cost')}
					lints={lintAt('manacost')}
					note={
						doc.manacost === 0 && (doc.flags.summonable === true || doc.flags.convinceable === true)
							? t('Summonable or convinceable with no mana cost — the loader warns about this.')
							: t('Mana to summon or convince this monster.')
					}
				>
					<NumberField value={doc.manacost} onChange={v => patch({ manacost: v })} min={0} width={120} disabled={readOnly} />
				</Field>

				{/* TVP and Nostalrius have no bestiary and no id for one. */}
				{engine.raceidAttr !== null && (
				<Field
					label={engine.raceidAttr === 'raceId' ? t('Race id (raceId)') : t('Race id')}
					lints={raceidLints}
					hint={nextRaceid !== null ? t('next free: {{id}}', { id: nextRaceid }) : undefined}
					note={
						takenBy
							? t('Already used by "{{name}}" — the bestiary counts both as one.', { name: takenBy })
							: duplicate
								? t('Another monster already uses this raceid.')
								: undefined
					}
				>
					<span className={duplicate ? 'ss-ed-invalid' : undefined}>
						<NumberField
							value={doc.raceid ?? 0}
							onChange={v => patch({ raceid: v })}
							min={0}
							width={120}
							disabled={readOnly}
						/>
					</span>
					{nextRaceid !== null && doc.raceid !== nextRaceid && (
						<button
							type="button"
							className="ss-btn ss-btn-ghost ss-ed-mini"
							disabled={readOnly}
							onClick={() => patch({ raceid: nextRaceid })}
						>
							{t('Use {{id}}', { id: nextRaceid })}
						</button>
					)}
				</Field>
				)}
			</div>

			<div className="ss-ed-card-grid">
				<Field
					label={t('Race')}
					lints={lintAt('race')}
					note={t('Controls blood splash, corpse decay and undead checks.')}
				>
					<EnumSelect
						value={doc.race ?? 'blood'}
						onChange={v => patch({ race: v })}
						options={RACE_OPTIONS.filter(o => engine.races.includes(o.value))}
						disabled={readOnly}
						width={200}
					/>
				</Field>

				<Field label={t('Skull')} lints={lintAt('skull')}>
					<EnumSelect
						value={doc.skull === '' ? 'none' : doc.skull}
						onChange={v => patch({ skull: v === 'none' ? '' : v })}
						options={SKULL_OPTIONS.filter(o => engine.skulls.includes(o.value))}
						disabled={readOnly}
						width={200}
					/>
				</Field>

				<Field
					label={t('Script')}
					lints={lintAt('script')}
					note={t('A .lua file in monster/scripts/ providing onThink, onCreatureAppear and friends.')}
				>
					<EnumSelect
						value={doc.script ?? ''}
						onChange={v => patch({ script: v === '' ? null : v })}
						options={scriptOptions}
						disabled={readOnly}
						width={260}
					/>
				</Field>
			</div>
		</Section>
	);
}
