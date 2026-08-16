import { Package } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { type ReactNode } from 'react';
import { type ItemInfo } from './monster';
import { itemSummaryLines } from './items';
import { n } from './i18n';

// The centre column for the rail's Items view — read only, by design. MONx
// has no write path for items.xml, so this presents the database faithfully
// instead of pretending to edit it. The right-hand ItemPreviewPanel owns the
// sprite; this pane follows MonsterEditor's visual language and owns the data.

interface Props {
	item: ItemInfo | null;
}

function DetailSection({ title, summary, children }: { title: string; summary?: ReactNode; children: ReactNode }) {
	return (
		<section className="ss-ed-section">
			<header className="ss-ed-section-head">
				<h2 className="mx-item-section-title">{title}</h2>
				{summary !== undefined && <span className="ss-ed-section-summary">{summary}</span>}
			</header>
			<div className="ss-ed-section-body">{children}</div>
		</section>
	);
}

function Fact({ label, children, mono = false }: { label: string; children: ReactNode; mono?: boolean }) {
	return (
		<div className="mx-item-fact">
			<dt>{label}</dt>
			<dd className={mono ? 'mono' : undefined}>{children}</dd>
		</div>
	);
}

function FlagFact({ label, value, title }: { label: string; value: boolean; title?: string }) {
	const { t } = useTranslation();
	return (
		<Fact label={label}>
			<span className="mx-item-flag" data-active={value} title={title}>
				{value ? t('Yes') : t('No')}
			</span>
		</Fact>
	);
}

export default function ItemDetail({ item }: Props) {
	const { t } = useTranslation();

	if (!item) {
		return <div className="mx-empty">{t('Select an item')}</div>;
	}

	const summary = itemSummaryLines(t, item).slice(1); // first line repeats the name/id in the header
	const attrEntries = Object.entries(item.attributes).sort(([a], [b]) => a.localeCompare(b));

	return (
		<div className="mx-item-detail">
			<header className="mx-item-detail-bar">
				<Package size={19} aria-hidden="true" />
				<div className="mx-item-detail-heading">
					<h1 title={item.name || `#${item.serverId}`}>{item.name || `#${item.serverId}`}</h1>
				</div>
				<span className="mx-item-detail-id mono">#{item.serverId}</span>
			</header>

			<div className="ss-ed-scroll">
				<div className="ss-ed-column mx-item-detail-column">
					<DetailSection title={t('Identity')}>
						<dl className="mx-item-facts">
							<Fact label={t('Article')}>{item.article ?? '—'}</Fact>
							<Fact label={t('Client id')} mono>{item.clientId}</Fact>
						</dl>
					</DetailSection>

					{summary.length > 0 && (
						<DetailSection title={t('Summary')}>
							<div className="mx-item-detail-summary">
								{summary.map((line, i) => (
									<div key={i}>{line}</div>
								))}
							</div>
						</DetailSection>
					)}

					<DetailSection title={t('Properties')}>
						<dl className="mx-item-facts">
							<FlagFact label={t('Stackable')} value={item.stackable} />
							<FlagFact label={t('Container')} value={item.container} />
							<FlagFact label={t('Pickupable')} value={item.pickupable} />
							<FlagFact
								label={t('Ambiguous name')}
								value={item.ambiguousName}
								title={item.ambiguousName ? t('More than one item in this corpus has this name (§13)') : undefined}
							/>
						</dl>
					</DetailSection>

					{attrEntries.length > 0 && (
						<DetailSection title={t('Raw attributes')} summary={n(attrEntries.length)}>
							<dl className="mx-item-facts mx-item-attributes">
								{attrEntries.map(([key, value]) => (
									<Fact key={key} label={key} mono>{value}</Fact>
								))}
							</dl>
						</DetailSection>
					)}
				</div>
			</div>
		</div>
	);
}
