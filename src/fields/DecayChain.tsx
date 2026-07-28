import { useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { getItem, type ItemInfo } from '../monster';
import { Field } from './Field';
import { ItemSprite } from './ItemPicker';

/** One resolved stage of a corpse's decay chain. */
interface Stage {
	item: ItemInfo;
	/** Seconds until this stage decays into the next; null when items.xml gives
	    a decayTo without a duration. */
	seconds: number | null;
}

interface Chain {
	stages: Stage[];
	/** True when the last stage has decayTo="0" — the corpse disappears. */
	vanishes: boolean;
}

/** A corrupt items.xml could chain forever; real cycles are 3–4 stages. */
const MAX_STAGES = 12;

function formatSeconds(total: number): string {
	const h = Math.floor(total / 3600);
	const m = Math.floor((total % 3600) / 60);
	const s = total % 60;
	const parts: string[] = [];
	if (h > 0) parts.push(`${h}h`);
	if (m > 0) parts.push(`${m}m`);
	if (s > 0 || parts.length === 0) parts.push(`${s}s`);
	return parts.join(' ');
}

/** Follows `decayTo` links through items.xml from a corpse id. */
async function walkChain(serverId: number): Promise<Chain> {
	const seen = new Set<number>();
	const stages: Stage[] = [];
	let id = serverId;
	let vanishes = false;
	while (id > 0 && !seen.has(id) && stages.length < MAX_STAGES) {
		seen.add(id);
		const item = await getItem(id).catch(() => null);
		if (!item) break;
		const rawTo = item.attributes.decayTo;
		const decayTo = rawTo !== undefined ? parseInt(rawTo, 10) : null;
		const rawDur = item.attributes.duration;
		const duration = rawDur !== undefined ? parseInt(rawDur, 10) : null;
		stages.push({ item, seconds: decayTo !== null ? duration : null });
		if (decayTo === null || Number.isNaN(decayTo)) break; // terminal — stays forever
		if (decayTo === 0) {
			vanishes = true;
			break;
		}
		id = decayTo;
	}
	return { stages, vanishes };
}

/** The corpse's full decay cycle: every stage from items.xml with its duration,
    and the total time until the corpse is gone (or stops decaying). */
export function DecayChain({ serverId }: { serverId: number | null }) {
	const [chain, setChain] = useState<Chain | null>(null);

	useEffect(() => {
		setChain(null);
		if (!serverId) return;
		let cancelled = false;
		walkChain(serverId).then(c => !cancelled && setChain(c));
		return () => {
			cancelled = true;
		};
	}, [serverId]);

	// Nothing to say about a corpse that never decays or one still loading.
	if (!chain || (chain.stages.length < 2 && !chain.vanishes)) return null;

	const total = chain.stages.reduce((sum, s) => sum + (s.seconds ?? 0), 0);
	const known = chain.stages.every(s => s.seconds !== null);

	return (
		<Field
			label="Decay cycle"
			hint={`${total > 0 ? formatSeconds(total) : '?'}${known ? '' : ' + ?'} total`}
			note={
				chain.vanishes
					? undefined
					: 'The last stage has no decayTo — it stays on the ground forever.'
			}
		>
			<div className="ss-ed-decay">
				{chain.stages.map((s, i) => (
					<span key={s.item.serverId}>
						{i > 0 && <ArrowRight size={12} className="ss-ed-decay-arrow" />}
						<span
							className="ss-ed-decay-stage"
							title={`${s.item.name} (${s.item.serverId})${
								s.seconds !== null ? ` — ${formatSeconds(s.seconds)}` : ''
							}`}
						>
							<ItemSprite serverId={s.item.serverId} size={32} />
							<span className="ss-ed-decay-time">
								{s.seconds !== null ? formatSeconds(s.seconds) : '∞'}
							</span>
						</span>
					</span>
				))}
				{chain.vanishes && (
					<>
						<ArrowRight size={12} className="ss-ed-decay-arrow" />
						<span className="ss-ed-decay-gone">gone</span>
					</>
				)}
			</div>
		</Field>
	);
}
