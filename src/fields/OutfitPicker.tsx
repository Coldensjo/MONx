import { lookUrl, type Look } from '../monster';
import { NumberField } from './NumberField';

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
	return (
		<div className="ss-ed-outfitpick">
			<div className="ss-ed-outfit-preview">
				<img
					src={lookUrl(look, { cell: 64 })}
					width={64}
					height={64}
					alt=""
					draggable={false}
					onError={e => (e.currentTarget.style.visibility = 'hidden')}
					onLoad={e => (e.currentTarget.style.visibility = 'visible')}
				/>
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
					Browse outfits…
				</button>
			</div>
		</div>
	);
}
