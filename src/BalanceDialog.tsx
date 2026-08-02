import { useTranslation } from 'react-i18next';
import { useEffect, useMemo, useState } from 'react';
import { Scale } from 'lucide-react';
import {
	balanceBands,
	bandExcludes,
	noBandFilter,
	MIN_BAND_N,
	type BalanceBand,
	type BandFilter,
	type MonsterSummary
} from './monster';
import { percentileIn } from './derive';
import { n as fmt } from './i18n';

interface Props {
	monsters: MonsterSummary[];
	/** Opens a monster and closes the dialog. */
	onOpen: (file: string) => void;
	onClose: () => void;
}

/** The four stats a band carries, and where to read each off a summary. */
const STATS = [
	{ key: 'health', label: 'HP', of: (m: MonsterSummary) => m.health },
	{ key: 'speed', label: 'Speed', of: (m: MonsterSummary) => m.speed },
	{ key: 'armor', label: 'Armor', of: (m: MonsterSummary) => m.armor },
	{ key: 'defense', label: 'Defense', of: (m: MonsterSummary) => m.defense }
] as const;

/** The four exclusions, each naming the flag or the table it reads — a box
 *  whose rule the user cannot see is one they cannot trust their corpus to. */
const FILTERS = [
	{ key: 'excludeBosses', label: 'Bosses', title: 'Monsters flagged isboss' },
	{
		key: 'excludePassive',
		label: 'Passive',
		title: 'Monsters that write hostile="0". A monster with no hostile flag at all is not counted as passive — most of TVP’s corpus omits it.'
	},
	{ key: 'excludeSummonable', label: 'Summonable', title: 'Monsters flagged summonable, which is what a summon is' },
	{
		key: 'excludeImmune',
		label: 'Immune to damage',
		title: 'Not attackable, or immune to every damage type this engine offers by immunity or by a 100% element — nothing can hurt it'
	}
] as const satisfies readonly { key: keyof BandFilter; label: string; title: string }[];

/** How far from the middle of its band a monster sits, over all four stats.
 *  The maximum rather than the mean: one stat far out is what makes a monster
 *  worth looking at, and averaging it against three ordinary ones hides it. */
function deviation(monster: MonsterSummary, band: BalanceBand): number {
	let worst = 0;
	for (const stat of STATS) {
		const d = Math.abs(percentileIn(band[stat.key].values, stat.of(monster)) - 50);
		if (d > worst) worst = d;
	}
	return worst;
}

/**
 * The whole corpus as its balance bands, and every monster's placement in one.
 *
 * The preview panel answers "is this monster ordinary" one monster at a time,
 * which is the wrong shape for the question that comes before it: where are the
 * bands, how thick is each, and which monsters are furthest from the middle of
 * their own. That was only ever available from `probe_monster --bands`, in a
 * terminal, without the outliers.
 */
export default function BalanceDialog({ monsters, onOpen, onClose }: Props) {
	const { t } = useTranslation();
	const [openBand, setOpenBand] = useState<string | null>(null);
	// Fetched here rather than handed down: the preview panel holds its own copy
	// for one monster at a time, and this is the only other reader.
	const [bands, setBands] = useState<BalanceBand[]>([]);
	/** What is left out of the medians. Held here and sent to the backend rather
	 *  than applied to the rows on the way out: a median with the bosses still in
	 *  it is the thing the filter exists to get rid of, so the bands are
	 *  recomputed against what is left instead of being drawn once and sieved. */
	const [filter, setFilter] = useState<BandFilter>(noBandFilter);
	useEffect(() => {
		let live = true;
		balanceBands(filter)
			.then(b => live && setBands(b))
			.catch(() => undefined);
		return () => {
			live = false;
		};
	}, [filter]);

	// Bands with nothing in them are not rows — an engine whose corpus stops at
	// 10,000 experience should not be shown four empty tiers.
	const populated = useMemo(() => bands.filter(b => b.count > 0), [bands]);

	const members = useMemo(() => {
		const band = populated.find(b => b.label === openBand);
		if (!band) return [];
		return monsters
			.filter(m => m.experience > 0 && m.experience >= band.min && m.experience <= band.max && !bandExcludes(filter, m))
			.map(m => ({ monster: m, deviation: deviation(m, band), band }))
			.sort((a, b) => b.deviation - a.deviation || a.monster.name.localeCompare(b.monster.name));
	}, [populated, monsters, openBand, filter]);

	const scored = populated.reduce((sum, b) => sum + b.count, 0);

	// What the boxes cost, in monsters. A filter whose effect is invisible is one
	// nobody can tell they left ticked.
	const excluded = useMemo(
		() => monsters.filter(m => m.experience > 0 && bandExcludes(filter, m)).length,
		[monsters, filter]
	);

	return (
		<div className="ss-backdrop" onMouseDown={onClose}>
			<div className="ss-modal mx-bal-modal" onMouseDown={e => e.stopPropagation()}>
				<div className="ss-modal-title">
					<Scale size={15} />
					{t('Balance overview')}
				</div>

				<p className="mx-bal-note">
					{t('{{count}} monster with experience above zero, grouped by what a kill is worth. Medians are this corpus’s own — nothing here is compared against another server.', {
						count: scored
					})}
				</p>

				{/* Four boxes rather than a fixed rule, because each of them is
				    arguable: a corpus of nothing but bosses wants them counted, and a
				    server whose summons are ordinary monsters would lose half its
				    corpus to the third one. Ticking any of them recomputes the bands,
				    so the medians are the medians of the set the user says the
				    monster belongs to. */}
				<div className="mx-bal-filters">
					{FILTERS.map(f => (
						<label key={f.key} className="mx-bal-filter" title={t(f.title)}>
							<input type="checkbox" checked={filter[f.key]} onChange={e => setFilter({ ...filter, [f.key]: e.target.checked })} />
							{t(f.label)}
						</label>
					))}
					{excluded > 0 && <span className="mx-bal-excluded">{t('{{count}} monster left out', { count: excluded })}</span>}
				</div>

				<div className="mx-bal-table" role="table">
					<div className="mx-bal-head" role="row">
						<span>{t('Band')}</span>
						<span>{t('n')}</span>
						{STATS.map(s => (
							<span key={s.key}>{t(s.label)}</span>
						))}
					</div>
					{populated.map(band => {
						const thin = band.count < MIN_BAND_N;
						const open = band.label === openBand;
						return (
							<div key={band.label} className="mx-bal-group">
								<button
									type="button"
									className={open ? 'mx-bal-row mx-bal-row-open' : 'mx-bal-row'}
									onClick={() => setOpenBand(open ? null : band.label)}
									title={t('Show the monsters in this band, furthest from the middle first')}
								>
									<span className="mx-bal-band">{band.label}</span>
									<span className={thin ? 'mono mx-bal-thin' : 'mono'} title={thin ? t('Too few to draw a median from') : undefined}>
										{band.count}
									</span>
									{STATS.map(s => (
										<span key={s.key} className="mono">
											{fmt(band[s.key].median)}
										</span>
									))}
								</button>

								{open && (
									<div className="mx-bal-members">
										{members.length === 0 && <div className="mx-bal-empty">{t('No monsters in this band.')}</div>}
										{members.map(({ monster, band: b }) => (
											<button
												key={monster.file}
												type="button"
												className="mx-bal-member"
												onClick={() => onOpen(monster.file)}
											>
												<span className="mx-bal-member-name">{monster.name}</span>
												{STATS.map(s => {
													const pct = percentileIn(b[s.key].values, s.of(monster));
													const out = !thin && (pct <= 10 || pct >= 90);
													return (
														<span
															key={s.key}
															className={out ? 'mono mx-bal-cell mx-bal-cell-out' : 'mono mx-bal-cell'}
															title={t('{{label}} {{value}} — {{pct}}% of the band is at or below it', {
																label: t(s.label),
																value: fmt(s.of(monster)),
																pct
															})}
														>
															{fmt(s.of(monster))}
														</span>
													);
												})}
											</button>
										))}
									</div>
								)}
							</div>
						);
					})}
				</div>

				<div className="ss-modal-buttons">
					<div className="ss-modal-buttons-spacer" />
					<button type="button" className="ss-btn" onClick={onClose}>
						{t('Close')}
					</button>
				</div>
			</div>
		</div>
	);
}
