import type { Bestiary } from '../monster';
import { Field } from '../fields/Field';
import { NumberField } from '../fields/NumberField';
import { TextField } from '../fields/TextField';
import { EnumSelect } from '../fields/EnumSelect';
import { Section, type SectionId, type SectionProps } from './section';

interface Props extends SectionProps {
	collapsed: boolean;
	onToggle: (id: SectionId) => void;
}

const BLANK: Bestiary = {
	class: null,
	prowess: 0,
	expertise: 0,
	mastery: 0,
	charmPoints: 0,
	difficulty: null,
	occurrence: null,
	locations: null
};

/** The loader's own list; anything else is a warning and no difficulty at all. */
const DIFFICULTIES = ['harmless', 'trivial', 'easy', 'medium', 'hard', 'challenging'];

/**
 * TFS `<bestiary>`. The whole block is discarded when the loader's validity
 * check fails, so an incomplete one is worse than none — the lints say which
 * part is the problem.
 */
export function BestiarySection({ doc, patch, lintAt, readOnly, collapsed, onToggle }: Props) {
	const present = doc.bestiary !== null;
	const b = doc.bestiary ?? BLANK;
	const set = (p: Partial<Bestiary>) => patch({ bestiary: { ...b, ...p } });

	return (
		<Section
			id="bestiary"
			collapsed={collapsed}
			onToggle={() => onToggle('bestiary')}
			summary={present ? (b.class ?? 'no class') : 'not tracked'}
		>
			{!present ? (
				<div className="ss-ed-note">
					This monster has no bestiary entry.{' '}
					<button className="ss-btn ss-btn-small" disabled={readOnly} onClick={() => set({})}>
						Add one
					</button>
				</div>
			) : (
				<>
					<div className="ss-ed-card-grid">
						<Field label="Class" lints={lintAt('bestiary.class')}>
							<TextField
								value={b.class ?? ''}
								onChange={v => set({ class: v || null })}
								disabled={readOnly}
							/>
						</Field>
						<Field label="Difficulty" lints={lintAt('bestiary.difficulty')}>
							<EnumSelect
								value={b.difficulty ?? ''}
								options={DIFFICULTIES.map(d => ({ value: d, label: d }))}
								onChange={v => set({ difficulty: v || null })}
								disabled={readOnly}
							/>
						</Field>
						{/* Kept as text: the loader casts it to a number, and the
						    shipped corpus writes "common", which becomes 0. Storing
						    the number would rewrite the author's word on first save;
						    `bestiary.occurrence-not-numeric` reports it instead. */}
						<Field label="Occurrence" lints={lintAt('bestiary.occurrence')}>
							<TextField
								value={b.occurrence ?? ''}
								onChange={v => set({ occurrence: v || null })}
								disabled={readOnly}
							/>
						</Field>
					</div>

					<div className="ss-ed-card-grid">
						{(
							[
								['prowess', 'Prowess'],
								['expertise', 'Expertise'],
								['mastery', 'Mastery'],
								['charmPoints', 'Charm points']
							] as const
						).map(([key, label]) => (
							<Field key={key} label={label} lints={lintAt(`bestiary.${key}`)}>
								<NumberField
									value={b[key]}
									onChange={v => set({ [key]: v })}
									min={0}
									width={110}
									disabled={readOnly}
								/>
							</Field>
						))}
					</div>

					<Field label="Locations" lints={lintAt('bestiary.locations')}>
						<TextField
							value={b.locations ?? ''}
							onChange={v => set({ locations: v || null })}
							disabled={readOnly}
						/>
					</Field>
				</>
			)}
		</Section>
	);
}
