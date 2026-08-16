import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Package, Pause, Play } from 'lucide-react';
import { ITEM_ANIM_INTERVAL_MS } from './ThingBrowser';
import { type ItemInfo } from './monster';
import { type ItemAppearanceMeta } from './items';

interface Props {
	item: ItemInfo | null;
	appearance: ItemAppearanceMeta | null;
	loading: boolean;
	frameUrl: (item: ItemInfo, frame: number, patternX: number, patternY: number, patternZ: number) => string;
}

const PREVIEW_SIZE = 128;

/** The right-hand preview for the Items rail. Kept separate from PreviewPanel:
 * that component is a monster analysis surface (combat, loot and balance),
 * while this one presents the selected client's item appearance. */
export default function ItemPreviewPanel({ item, appearance, loading, frameUrl }: Props) {
	const { t } = useTranslation();
	const [frameState, setFrameState] = useState({ itemId: -1, frame: 0 });
	const [playing, setPlaying] = useState(() => !window.matchMedia('(prefers-reduced-motion: reduce)').matches);
	const [variants, setVariants] = useState({ itemId: -1, x: 0, y: 0, z: 0 });
	const [failedAppearance, setFailedAppearance] = useState('');

	const frames = Math.max(1, appearance?.frames ?? 1);
	const patternX = variants.itemId === item?.clientId ? variants.x % Math.max(1, appearance?.patternX ?? 1) : 0;
	const patternY = variants.itemId === item?.clientId ? variants.y % Math.max(1, appearance?.patternY ?? 1) : 0;
	const patternZ = variants.itemId === item?.clientId ? variants.z % Math.max(1, appearance?.patternZ ?? 1) : 0;
	const appearanceKey = item ? `${item.clientId}:${patternX}:${patternY}:${patternZ}` : '';
	const spriteFailed = failedAppearance === appearanceKey;
	// The item id travels with the frame, so a render after selection changes
	// immediately shows frame zero instead of waiting for an effect to reset it.
	const frame = frameState.itemId === item?.clientId ? frameState.frame % frames : 0;

	// Item phases can carry their own duration in modern bundles. Legacy clients
	// state no duration, so they use the same slow 500 ms cadence as the item grid.
	useEffect(() => {
		if (!item || !appearance || spriteFailed || !playing || frames <= 1) {
			setFrameState({ itemId: item?.clientId ?? -1, frame: 0 });
			return;
		}
		let timer: ReturnType<typeof setTimeout>;
		const step = (current: number) => {
			const ms = appearance.frameDurations?.[current] || ITEM_ANIM_INTERVAL_MS;
			timer = setTimeout(() => {
				const next = current + 1 < frames ? current + 1 : 0;
				setFrameState({ itemId: item.clientId, frame: next });
				step(next);
			}, ms);
		};
		setFrameState({ itemId: item.clientId, frame: 0 });
		step(0);
		return () => clearTimeout(timer);
	}, [item, appearance, spriteFailed, playing, frames]);

	// Keep the next phase warm without mounting every frame at once. Some real
	// bundle objects have 80+ phases; eagerly requesting the whole cycle would
	// compose dozens of PNGs on selection and again for every variant change.
	const previewFrames = useMemo(() => {
		if (!item || !appearance) return [];
		const next = frame + 1 < frames ? frame + 1 : 0;
		const indices = next === frame ? [frame] : [frame, next];
		return indices.map(index => ({
			index,
			url: frameUrl(item, index, patternX, patternY, patternZ)
		}));
	}, [item, appearance, frame, frames, frameUrl, patternX, patternY, patternZ]);

	const setVariant = (axis: 'x' | 'y' | 'z', value: number) => {
		if (!item) return;
		setVariants(current => {
			const base = current.itemId === item.clientId ? current : { itemId: item.clientId, x: 0, y: 0, z: 0 };
			return { ...base, [axis]: value };
		});
	};

	if (!item) {
		return (
			<aside className="ss-details" aria-label={t('Appearance')}>
				<div className="ss-details-empty">{t('Select an item')}</div>
			</aside>
		);
	}

	const unavailable = !loading && (!appearance || spriteFailed);
	const headingId = `mx-item-preview-title-${item.serverId}`;
	const variantAxes = appearance
		? [
				{ axis: 'x' as const, label: t('Variant X'), count: appearance.patternX, value: patternX },
				{ axis: 'y' as const, label: t('Variant Y'), count: appearance.patternY, value: patternY },
				{ axis: 'z' as const, label: t('Variant Z'), count: appearance.patternZ, value: patternZ }
			].filter(axis => axis.count > 1)
		: [];

	return (
		<aside className="ss-details" aria-labelledby={headingId} aria-busy={loading}>
			<div className="ss-details-header">
				<h2 id={headingId} className="mx-item-preview-name" title={item.name || `#${item.serverId}`}>
					{item.name || `#${item.serverId}`}
				</h2>
				{appearance && !spriteFailed && frames > 1 && (
					<button
						type="button"
						className="ss-search-clear"
						onClick={() => setPlaying(p => !p)}
						aria-label={playing ? t('Pause animation') : t('Play animation')}
					>
						{playing ? <Pause size={13} /> : <Play size={13} />}
					</button>
				)}
			</div>

			<div className="ss-details-top">
				<div className="ss-details-preview mx-item-preview-stage">
					{loading ? (
						<div className="mx-item-preview-unavailable">
							<Package size={28} aria-hidden="true" />
							<span>{t('Loading client assets…')}</span>
						</div>
					) : unavailable ? (
						<div className="mx-item-preview-unavailable">
							<Package size={28} aria-hidden="true" />
							<span>{t('No client assets are available for this item.')}</span>
						</div>
					) : (
						<div className="mx-item-preview-stack" style={{ width: PREVIEW_SIZE, height: PREVIEW_SIZE }}>
							{previewFrames.map(({ index, url }) => (
								<img
									key={url}
									src={url}
									className="mx-item-preview-frame"
									style={{ display: index === frame ? 'block' : 'none' }}
									width={PREVIEW_SIZE}
									height={PREVIEW_SIZE}
									draggable={false}
									alt=""
									onError={() => setFailedAppearance(appearanceKey)}
								/>
							))}
						</div>
					)}
				</div>
				<div className="ss-preview-caption">
					<span className="mono">
						{t('server id {{id}}', { id: item.serverId })} · {t('client id {{id}}', { id: item.clientId })}
					</span>
				</div>
				{variantAxes.length > 0 && (
					<div className="mx-item-preview-variants">
						{variantAxes.map(axis => (
							<label key={axis.axis}>
								<span>{axis.label}</span>
								<select
									className="ss-ed-input"
									value={axis.value}
									onChange={e => setVariant(axis.axis, Number(e.target.value))}
								>
									{Array.from({ length: axis.count }, (_, index) => (
										<option key={index} value={index}>
											{index + 1}
										</option>
									))}
								</select>
							</label>
						))}
					</div>
				)}
			</div>

			<div className="ss-details-scroll">
				{appearance && (
					<>
						<div className="ss-details-section">{t('Appearance')}</div>
						<dl className="ss-details-stats">
							<div className="ss-details-prop">
								<dt>{t('Size')}</dt>
								<dd className="mono">{appearance.width} × {appearance.height}</dd>
							</div>
							<div className="ss-details-prop">
								<dt>{t('Frames')}</dt>
								<dd className="mono">{frames}</dd>
							</div>
							<div className="ss-details-prop">
								<dt>{t('Variants')}</dt>
								<dd className="mono">
									{appearance.patternX} × {appearance.patternY} × {appearance.patternZ}
								</dd>
							</div>
						</dl>
					</>
				)}
			</div>
		</aside>
	);
}
