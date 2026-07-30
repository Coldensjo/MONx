import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import { Field } from '../fields/Field';
import { TextField } from '../fields/TextField';
import { SortableList } from '../fields/SortableList';
import { Section, SubGroup, type SectionId, type SectionProps } from './section';

interface Props extends SectionProps {
	collapsed: boolean;
	onToggle: (id: SectionId) => void;
}

/**
 * The two Ironcore pacifist strings and the creaturescript registrations — a
 * tab of its own because most monsters have neither, and it is hidden by
 * default (see prefs.ts). Both still write into `<voices>` / `<script>` where
 * the format puts them; only the UI is split.
 */
export function PacifistEvents({ doc, patch, lintAt, readOnly, collapsed, onToggle }: Props) {
	const { t } = useTranslation();
	const voices = doc.voices;
	// The two pacifist strings do nothing on a monster that isn't one (§5.1).
	const pacifist = doc.flags.pacifist === true;
	const pacifistLines = (voices.pacifist ? 1 : 0) + (voices.leash ? 1 : 0);

	return (
		<Section
			id="events"
			collapsed={collapsed}
			onToggle={() => onToggle('events')}
			summary={t('{{pacifist}} pacifist · {{events}} events', { pacifist: pacifistLines, events: doc.events.length })}
		>
			<SubGroup
				title={t('Pacifist lines (Ironcore)')}
				note={
					pacifist
						? t('Said once when it wakes, and when it walks past its leash radius. Neither is part of the random voice pool.')
						: t('Only spoken by a pacifist monster — turn Pacifist on in Combat, or these never fire.')
				}
			>
				<Field label={t('On waking')} lints={lintAt('voices.pacifist')}>
					<TextField
						value={voices.pacifist ?? ''}
						onChange={v => patch({ voices: { ...voices, pacifist: v === '' ? null : v } })}
						placeholder={t('Said when first attacked')}
						disabled={readOnly}
					/>
				</Field>
				<Field label={t('On leashing')} lints={lintAt('voices.leash')}>
					<TextField
						value={voices.leash ?? ''}
						onChange={v => patch({ voices: { ...voices, leash: v === '' ? null : v } })}
						placeholder={t('Said when it walks too far')}
						disabled={readOnly}
					/>
				</Field>
			</SubGroup>

			<SubGroup
				title={t('Creature events')}
				note={t('Registered from creaturescripts — onKill, onDeath, onPrepareDeath and friends. Not the same thing as the monster script in Identity. Names are not checked: what registers them is Lua, which MONx cannot see.')}
			>
				<SortableList
					items={doc.events}
					onChange={events => patch({ events })}
					list="events"
					keyOf={(e, i) => `${e}-${i}`}
					disabled={readOnly}
					empty={t('No events registered.')}
					renderRow={(event, i) => (
						<TextField
							value={event}
							onChange={v => patch({ events: doc.events.map((e, j) => (j === i ? v : e)) })}
							placeholder={t('EventName')}
							monospace
							disabled={readOnly}
						/>
					)}
				/>
				<button
					type="button"
					className="ss-btn"
					disabled={readOnly}
					onClick={() => patch({ events: [...doc.events, ''] })}
				>
					<Plus size={14} />
					{t('Add event')}
				</button>
			</SubGroup>
		</Section>
	);
}
