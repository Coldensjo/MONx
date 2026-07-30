import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import type { VoiceLine } from '../monster';
import { Field } from '../fields/Field';
import { NumberField } from '../fields/NumberField';
import { TextField } from '../fields/TextField';
import { Toggle } from '../fields/Toggle';
import { SortableList } from '../fields/SortableList';
import { engineInfo } from '../engine';
import { Section, type SectionId, type SectionProps } from './section';

interface Props extends SectionProps {
	collapsed: boolean;
	onToggle: (id: SectionId) => void;
}

/** The random voice pool. The two pacifist strings and the creature events live
 *  in Pacifist & Events — they are Ironcore extras most monsters never use. */
export function Voices({ doc, patch, lintAt, readOnly, collapsed, onToggle }: Props) {
	const { t } = useTranslation();
	const engine = engineInfo(doc.engine);
	const voices = doc.voices;
	const setLines = (lines: VoiceLine[]) => patch({ voices: { ...voices, lines } });

	const silent = voices.chance === 0 || voices.lines.length === 0;

	const intervalSeconds = voices.interval / 1000;
	const secondsText = t('{{seconds}} s', {
		seconds: Number.isInteger(intervalSeconds) ? intervalSeconds : intervalSeconds.toFixed(2)
	});
	// A `chance`% roll every `interval` ms → the cadence a hunter actually hears.
	const perMinute = voices.interval > 0 ? (60000 / voices.interval) * (voices.chance / 100) : 0;

	return (
		<Section
			id="voices"
			collapsed={collapsed}
			onToggle={() => onToggle('voices')}
			summary={t('{{count}} line', { count: voices.lines.length })}
		>
			{/* TVP has both attributes commented out in its loader and Nostalrius
			    never read them: on those engines every line is simply in the pool,
			    and showing a cadence would be showing one the server ignores. */}
			{engine.voicesCadence && (
			<div className="ss-ed-card-grid">
				<Field label={t('Interval')} lints={lintAt('voices.interval')} hint={t('ms')}>
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
					label={t('Chance')}
					lints={lintAt('voices.chance')}
					hint="%"
					note={silent ? t('Silent monster — nothing will ever be said.') : undefined}
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
			)}

			{engine.voicesCadence && !silent && voices.interval > 0 && (
				<div className="ss-ed-field-note">
					{/* One sentence: the "%" used to be split onto the next line by the
					    formatter, which no translator could have reassembled. */}
					{t('≈ {{rate}} voices per minute — a {{chance}}% roll every {{interval}}.', {
						rate: perMinute >= 10 ? Math.round(perMinute) : perMinute.toFixed(1),
						chance: voices.chance,
						interval: secondsText
					})}
				</div>
			)}

			<SortableList
				items={voices.lines}
				onChange={setLines}
				list="voices"
				keyOf={(_, i) => String(i)}
				disabled={readOnly}
				empty={t('No voice lines.')}
				renderRow={(line, i) => (
					<div className="ss-ed-voice-row">
						<TextField
							value={line.sentence}
							onChange={v => setLines(voices.lines.map((l, j) => (j === i ? { ...l, sentence: v } : l)))}
							placeholder={t('What it says')}
							disabled={readOnly}
						/>
						<Toggle
							label={t('Yell')}
							title={t('Heard further away; conventionally written in upper case')}
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
				{t('Add line')}
			</button>
		</Section>
	);
}
