import { useTranslation } from 'react-i18next';
import { itemUrl, type ItemInfo } from './monster';
import { itemSummaryLines } from './items';

// The centre column for the rail's Items view — read only, by design (see
// LINUX_PARITY.md's sibling plan doc: MONx has no write path for items.xml
// anywhere, so this shows what the database already knows rather than
// pretending to edit it). Reuses `itemSummaryLines` (the same gloss the grid's
// tooltip has always shown) for a human-readable summary, then lists every
// raw items.xml attribute underneath so nothing the file actually says is
// hidden behind a label this component didn't think to add.

const PREVIEW_SIZE = 96;

interface Props {
	item: ItemInfo | null;
}

export default function ItemDetail({ item }: Props) {
	const { t } = useTranslation();

	if (!item) {
		return <div className="mx-empty">{t('Select an item')}</div>;
	}

	const summary = itemSummaryLines(t, item).slice(1); // first line repeats the name/id already shown above
	const attrEntries = Object.entries(item.attributes).sort(([a], [b]) => a.localeCompare(b));

	return (
		<div className="mx-item-detail">
			<div className="ss-details-top">
				<div className="ss-details-preview">
					<img
						src={itemUrl(item.serverId, PREVIEW_SIZE)}
						width={PREVIEW_SIZE}
						height={PREVIEW_SIZE}
						alt=""
						draggable={false}
						style={{ imageRendering: 'pixelated' }}
					/>
				</div>
				<div className="ss-details-name">{item.name || `#${item.serverId}`}</div>
				<div className="ss-preview-caption">
					<span className="mono">
						{t('server id {{id}}', { id: item.serverId })} · {t('client id {{id}}', { id: item.clientId })}
					</span>
				</div>
			</div>

			<div className="ss-details-scroll">
				{summary.length > 0 && (
					<>
						<div className="ss-details-section">{t('Summary')}</div>
						<div className="mx-item-detail-summary">
							{summary.map((line, i) => (
								<div key={i}>{line}</div>
							))}
						</div>
					</>
				)}

				<div className="ss-details-section">{t('Flags')}</div>
				<dl className="ss-details-stats">
					<div className="ss-details-prop">
						<dt>{t('Article')}</dt>
						<dd>{item.article ?? '—'}</dd>
					</div>
					<div className="ss-details-prop">
						<dt>{t('Stackable')}</dt>
						<dd>{item.stackable ? t('Yes') : t('No')}</dd>
					</div>
					<div className="ss-details-prop">
						<dt>{t('Container')}</dt>
						<dd>{item.container ? t('Yes') : t('No')}</dd>
					</div>
					<div className="ss-details-prop">
						<dt>{t('Pickupable')}</dt>
						<dd>{item.pickupable ? t('Yes') : t('No')}</dd>
					</div>
					{item.ambiguousName && (
						<div className="ss-details-prop" title={t('More than one item in this corpus has this name (§13)')}>
							<dt>{t('Ambiguous name')}</dt>
							<dd>{t('Yes')}</dd>
						</div>
					)}
				</dl>

				{attrEntries.length > 0 && (
					<>
						<div className="ss-details-section">{t('Raw attributes')}</div>
						<dl className="ss-details-stats">
							{attrEntries.map(([key, value]) => (
								<div key={key} className="ss-details-prop">
									<dt className="mono">{key}</dt>
									<dd className="mono">{value}</dd>
								</div>
							))}
						</dl>
					</>
				)}
			</div>
		</div>
	);
}
