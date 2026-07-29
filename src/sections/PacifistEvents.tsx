import { Plus } from 'lucide-react';
import { Field } from '../fields/Field';
import { TextField } from '../fields/TextField';
import { SortableList } from '../fields/SortableList';
import { Section, SubGroup, type SectionId, type SectionProps } from './section';

interface Props extends SectionProps {
	collapsed: boolean;
	onToggle: (id: SectionId) => void;
	/** Event names registered in creaturescripts.xml, when that folder is reachable. */
	knownEvents?: string[];
}

/**
 * The two Ironcore pacifist strings and the creaturescript registrations — a
 * tab of its own because most monsters have neither, and it is hidden by
 * default (see prefs.ts). Both still write into `<voices>` / `<script>` where
 * the format puts them; only the UI is split.
 */
export function PacifistEvents({ doc, patch, lintAt, readOnly, collapsed, onToggle, knownEvents }: Props) {
	const voices = doc.voices;
	// The two pacifist strings do nothing on a monster that isn't one (§5.1).
	const pacifist = doc.flags.pacifist === true;
	const pacifistLines = (voices.pacifist ? 1 : 0) + (voices.leash ? 1 : 0);

	return (
		<Section
			id="events"
			collapsed={collapsed}
			onToggle={() => onToggle('events')}
			summary={`${pacifistLines} pacifist · ${doc.events.length} events`}
		>
			<SubGroup
				title="Pacifist lines (Ironcore)"
				note={
					pacifist
						? 'Said once when it wakes, and when it walks past its leash radius. Neither is part of the random voice pool.'
						: 'Only spoken by a pacifist monster — turn Pacifist on in Combat, or these never fire.'
				}
			>
				<Field label="On waking" lints={lintAt('voices.pacifist')}>
					<TextField
						value={voices.pacifist ?? ''}
						onChange={v => patch({ voices: { ...voices, pacifist: v === '' ? null : v } })}
						placeholder="Said when first attacked"
						disabled={readOnly}
					/>
				</Field>
				<Field label="On leashing" lints={lintAt('voices.leash')}>
					<TextField
						value={voices.leash ?? ''}
						onChange={v => patch({ voices: { ...voices, leash: v === '' ? null : v } })}
						placeholder="Said when it walks too far"
						disabled={readOnly}
					/>
				</Field>
			</SubGroup>

			<SubGroup
				title="Creature events"
				note="Registered from creaturescripts — onKill, onDeath, onPrepareDeath and friends. Not the same thing as the monster script in Identity."
			>
				<SortableList
					items={doc.events}
					onChange={events => patch({ events })}
					list="events"
					keyOf={(e, i) => `${e}-${i}`}
					disabled={readOnly}
					empty="No events registered."
					renderRow={(event, i) => {
						const unknown = knownEvents && knownEvents.length > 0 && !knownEvents.includes(event);
						return (
							<div className={unknown ? 'ss-ed-invalid' : undefined} title={unknown ? 'Not found in creaturescripts.xml' : undefined}>
								<TextField
									value={event}
									onChange={v => patch({ events: doc.events.map((e, j) => (j === i ? v : e)) })}
									placeholder="EventName"
									monospace
									disabled={readOnly}
								/>
							</div>
						);
					}}
				/>
				<button
					type="button"
					className="ss-btn"
					disabled={readOnly}
					onClick={() => patch({ events: [...doc.events, ''] })}
				>
					<Plus size={14} />
					Add event
				</button>
			</SubGroup>
		</Section>
	);
}
