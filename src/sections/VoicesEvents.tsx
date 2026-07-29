import { Plus } from 'lucide-react';
import type { VoiceLine } from '../monster';
import { Field } from '../fields/Field';
import { NumberField } from '../fields/NumberField';
import { TextField } from '../fields/TextField';
import { Toggle } from '../fields/Toggle';
import { SortableList } from '../fields/SortableList';
import { Section, SubGroup, type SectionId, type SectionProps } from './section';

interface Props extends SectionProps {
	collapsed: boolean;
	onToggle: (id: SectionId) => void;
	/** Event names registered in creaturescripts.xml, when that folder is reachable. */
	knownEvents?: string[];
}

export function VoicesEvents({ doc, patch, lintAt, readOnly, collapsed, onToggle, knownEvents }: Props) {
	const voices = doc.voices;
	const setLines = (lines: VoiceLine[]) => patch({ voices: { ...voices, lines } });

	const silent = voices.chance === 0 || voices.lines.length === 0;
	// The two pacifist strings do nothing on a monster that isn't one (§5.1).
	const pacifist = doc.flags.pacifist === true;

	const intervalSeconds = voices.interval / 1000;
	const secondsText = `${Number.isInteger(intervalSeconds) ? intervalSeconds : intervalSeconds.toFixed(2)} s`;
	// A `chance`% roll every `interval` ms → the cadence a hunter actually hears.
	const perMinute = voices.interval > 0 ? (60000 / voices.interval) * (voices.chance / 100) : 0;

	return (
		<Section
			id="voices"
			collapsed={collapsed}
			onToggle={() => onToggle('voices')}
			summary={`${voices.lines.length} lines · ${doc.events.length} events`}
		>
			<div className="ss-ed-card-grid">
				<Field label="Interval" lints={lintAt('voices.interval')} hint="ms">
					<NumberField
						value={voices.interval}
						onChange={v => patch({ voices: { ...voices, interval: v } })}
						min={0}
						width={110}
						disabled={readOnly}
					/>
					<span className="ss-ed-field-note">= {secondsText}</span>
				</Field>
				<Field
					label="Chance"
					lints={lintAt('voices.chance')}
					hint="%"
					note={silent ? 'Silent monster — nothing will ever be said.' : undefined}
				>
					<NumberField
						value={voices.chance}
						onChange={v => patch({ voices: { ...voices, chance: v } })}
						min={0}
						max={100}
						width={110}
						disabled={readOnly}
					/>
				</Field>
			</div>

			{!silent && voices.interval > 0 && (
				<div className="ss-ed-field-note">
					≈ {perMinute >= 10 ? Math.round(perMinute) : perMinute.toFixed(1)} voices per minute — a {voices.chance}
					% roll every {secondsText}.
				</div>
			)}

			<SortableList
				items={voices.lines}
				onChange={setLines}
				list="voices"
				keyOf={(_, i) => String(i)}
				disabled={readOnly}
				empty="No voice lines."
				renderRow={(line, i) => (
					<div className="ss-ed-voice-row">
						<TextField
							value={line.sentence}
							onChange={v => setLines(voices.lines.map((l, j) => (j === i ? { ...l, sentence: v } : l)))}
							placeholder="What it says"
							disabled={readOnly}
						/>
						<Toggle
							label="Yell"
							title="Heard further away; conventionally written in upper case"
							checked={line.yell}
							disabled={readOnly}
							onChange={v => setLines(voices.lines.map((l, j) => (j === i ? { ...l, yell: v } : l)))}
						/>
					</div>
				)}
			/>

			<button
				type="button"
				className="ss-btn"
				disabled={readOnly}
				onClick={() => setLines([...voices.lines, { sentence: '', yell: false }])}
			>
				<Plus size={14} />
				Add line
			</button>

			<SubGroup
				title="Pacifist lines (Ironcore)"
				note={
					pacifist
						? 'Said once when it wakes, and when it walks past its leash radius. Neither is part of the random pool above.'
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
