import { RACES, SKULLS } from '../catalog';
import { Field } from '../fields/Field';
import { EnumSelect, type EnumOption } from '../fields/EnumSelect';
import { NumberField } from '../fields/NumberField';
import { TextField } from '../fields/TextField';
import { Section, type SectionId, type SectionProps } from './section';

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

export function Identity({ doc, patch, lintAt, scripts, nextRaceid, readOnly, collapsed, onToggle }: Props) {
	const raceidLints = lintAt('raceid');
	const duplicate = raceidLints.some(l => l.code === 'raceid.duplicate');

	const scriptOptions: EnumOption<string>[] = [
		{ value: '', label: '(none)' },
		...scripts.map(s => ({ value: s, label: s }))
	];

	return (
		<Section id="identity" collapsed={collapsed} onToggle={() => onToggle('identity')} summary={doc.file}>
			<Field label="Name" lints={lintAt('name')}>
				<TextField value={doc.name} onChange={v => patch({ name: v })} disabled={readOnly} />
			</Field>

			<Field
				label="Description"
				lints={lintAt('nameDescription')}
				hint={doc.nameDescription ? undefined : `defaults to "a ${doc.name.toLowerCase()}"`}
				note="Shown when a player looks at the monster. Include the article yourself."
			>
				<TextField
					value={doc.nameDescription ?? ''}
					onChange={v => patch({ nameDescription: v === '' ? null : v })}
					placeholder={`a ${doc.name.toLowerCase()}`}
					disabled={readOnly}
				/>
			</Field>

			<Field
				label="Species"
				lints={lintAt('species')}
				note="Editor metadata only — the server never reads it. Used here for grouping."
			>
				<TextField
					value={doc.species ?? ''}
					onChange={v => patch({ species: v === '' ? null : v })}
					placeholder="(none)"
					disabled={readOnly}
				/>
			</Field>

			<Field label="Race" lints={lintAt('race')} note="Controls blood splash, corpse decay and undead checks.">
				<EnumSelect
					value={doc.race ?? 'blood'}
					onChange={v => patch({ race: v })}
					options={RACE_OPTIONS}
					disabled={readOnly}
					width={200}
				/>
			</Field>

			<Field
				label="Experience"
				lints={lintAt('experience')}
				hint={`raw XP, before rateExp · ${Math.ceil(doc.experience / 200)} soul${Math.ceil(doc.experience / 200) === 1 ? '' : 's'}`}
			>
				<NumberField value={doc.experience} onChange={v => patch({ experience: v })} min={0} width={120} disabled={readOnly} />
			</Field>

			<Field label="Speed" lints={lintAt('speed')} hint={doc.speed === 0 ? 'immobile' : undefined}>
				<NumberField value={doc.speed} onChange={v => patch({ speed: v })} min={0} width={120} disabled={readOnly} />
			</Field>

			<Field
				label="Mana cost"
				lints={lintAt('manacost')}
				note={
					doc.manacost === 0 && (doc.flags.summonable === true || doc.flags.convinceable === true)
						? 'Summonable or convinceable with no mana cost — the loader warns about this.'
						: 'Mana to summon or convince this monster.'
				}
			>
				<NumberField value={doc.manacost} onChange={v => patch({ manacost: v })} min={0} width={120} disabled={readOnly} />
			</Field>

			<Field
				label="Race id"
				lints={raceidLints}
				hint={nextRaceid !== null ? `next free: ${nextRaceid}` : undefined}
				note={duplicate ? 'Another monster already uses this raceid.' : undefined}
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
						Use {nextRaceid}
					</button>
				)}
			</Field>

			<Field label="Skull" lints={lintAt('skull')}>
				<EnumSelect
					value={doc.skull === '' ? 'none' : doc.skull}
					onChange={v => patch({ skull: v === 'none' ? '' : v })}
					options={SKULL_OPTIONS}
					disabled={readOnly}
					width={200}
				/>
			</Field>

			<Field
				label="Script"
				lints={lintAt('script')}
				note="A .lua file in monster/scripts/ providing onThink, onCreatureAppear and friends."
			>
				<EnumSelect
					value={doc.script ?? ''}
					onChange={v => patch({ script: v === '' ? null : v })}
					options={scriptOptions}
					disabled={readOnly}
					width={260}
				/>
			</Field>
		</Section>
	);
}
