import { useTranslation } from 'react-i18next';
import { lookUrl, type Look } from '../monster';
import { NumberField } from './NumberField';

/** Outfit pattern_x order in the dat: 0=N, 1=E, 2=S, 3=W.
 *
 *  `label` is an i18n key, not the letter itself — compass initials differ by
 *  language (Polish ends on Z for zachód, Portuguese on O for oeste), and a bare
 *  "W" would be the wrong letter in both. */
const DIRECTIONS = [
	{ dir: 0, label: 'compass-N' },
	{ dir: 1, label: 'compass-E' },
	{ dir: 2, label: 'compass-S' },
	{ dir: 3, label: 'compass-W' }
];

interface Props {
	look: Look;
	onChangeType: (type: number) => void;
	/** Opens Agent 4's ThingBrowser in outfit mode. Absent until it is wired. */
	onBrowse?: () => void;
	disabled?: boolean;
}

/** The outfit as a picture plus its id. Browsing is delegated to the shared
    thing browser so the editor never grows a second sprite grid. */
export function OutfitPicker({ look, onChangeType, onBrowse, disabled }: Props) {
	const { t } = useTranslation();
	return (
		<div className="ss-ed-outfitpick">
			<div className="ss-ed-outfit-dirs">
				{DIRECTIONS.map(d => (
					<div key={d.dir} className="ss-ed-outfit-dir">
						<div className="ss-ed-outfit-preview">
							<img
								src={lookUrl(look, { dir: d.dir, cell: 64 })}
								width={64}
								height={64}
								alt=""
								draggable={false}
								onError={e => (e.currentTarget.style.visibility = 'hidden')}
								onLoad={e => (e.currentTarget.style.visibility = 'visible')}
							/>
						</div>
						<span className="ss-ed-outfit-dir-label">{t(d.label)}</span>
					</div>
				))}
			</div>
			<div className="ss-ed-outfit-controls">
				<NumberField
					value={look.type ?? 0}
					onChange={onChangeType}
					min={0}
					max={65535}
					width={90}
					disabled={disabled}
				/>
				<button type="button" className="ss-btn" disabled={disabled || !onBrowse} onClick={onBrowse}>
					{t('Browse outfits…')}
				</button>
			</div>
		</div>
	);
}
