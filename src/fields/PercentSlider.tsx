import { useTranslation } from 'react-i18next';
import { NumberField } from './NumberField';

interface Props {
	value: number;
	onChange: (v: number) => void;
	disabled?: boolean;
	min?: number;
	max?: number;
}

/**
 * −100…+100 element percent. Positive resists, negative takes extra damage
 * (§11) — the two directions read differently, so the track is split at zero
 * rather than filled from the left.
 */
export function PercentSlider({ value, onChange, disabled, min = -100, max = 100 }: Props) {
	const { t } = useTranslation();
	const span = max - min;
	const zeroPct = ((0 - min) / span) * 100;
	const valuePct = ((value - min) / span) * 100;
	const left = Math.min(zeroPct, valuePct);
	const width = Math.abs(valuePct - zeroPct);

	return (
		<div className="ss-ed-percent">
			<div className="ss-ed-percent-track">
				<div
					className={value < 0 ? 'ss-ed-percent-fill ss-ed-percent-weak' : 'ss-ed-percent-fill'}
					style={{ left: `${left}%`, width: `${width}%` }}
				/>
				<div className="ss-ed-percent-zero" style={{ left: `${zeroPct}%` }} />
				<input
					type="range"
					min={min}
					max={max}
					step={5}
					value={Math.max(min, Math.min(max, value))}
					disabled={disabled}
					onChange={e => onChange(Number(e.target.value))}
				/>
			</div>
			<NumberField value={value} onChange={onChange} disabled={disabled} width={64} />
			<span className="ss-ed-percent-tag">
				{value === 0 ? t('normal') : t('takes {{pct}}%', { pct: 100 - value })}
			</span>
		</div>
	);
}
